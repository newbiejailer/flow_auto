import type { Page, Config, GenerationResult, BrowserContext } from "../types.js";
import { log } from "../utils/logger.js";
import { dismissPopups } from "../actions/popups.js";
import path from "node:path";

export async function getTopRowVideoUrls(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll("[data-virtuoso-scroller] [data-index]")
    );
    if (rows.length === 0) return [];

    const rowWithVideos =
      rows.find((row) => row.querySelectorAll("video").length > 0) || null;
    if (!rowWithVideos) return [];

    const videos = Array.from(rowWithVideos.querySelectorAll("video"));
    const urls: string[] = [];

    for (const video of videos) {
      const src = video.getAttribute("src") || video.currentSrc || "";
      if (src) urls.push(src);
    }

    return urls;
  });
}

async function checkGenerationFailed(page: Page): Promise<boolean> {
  const failedText = page.locator("text=Failed Generation").first();
  try {
    return await failedText.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function checkSomethingWentWrong(page: Page): Promise<boolean> {
  // Method 1: Use page.evaluate to search all text content
  const foundInPage = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    // Case-insensitive search for various error patterns
    const patterns = [
      /something went wrong/i,
      /something's wrong/i,
      /went wrong/i,
      /出错了/i,
      /发生错误/i,
    ];
    return patterns.some((p) => p.test(bodyText));
  });

  if (foundInPage) {
    log("  [DEBUG] 在页面文本中检测到错误关键词");
    return true;
  }

  // Method 2: Check specific locators as fallback
  const locatorPatterns = [
    "text=/something went wrong/i",
    "text=/went wrong/i",
    '[role="alert"]:has-text("wrong")',
    '[class*="error"]:has-text("wrong")',
    '[class*="Error"]:has-text("wrong")',
  ];

  for (const pattern of locatorPatterns) {
    try {
      const errorElement = page.locator(pattern).first();
      if (await errorElement.isVisible({ timeout: 300 })) {
        log(`  [DEBUG] 通过选择器检测到错误: ${pattern}`);
        return true;
      }
    } catch {
      // Continue checking other patterns
    }
  }

  return false;
}

export async function clearBrowserCacheAndReload(
  page: Page,
  context: BrowserContext
): Promise<void> {
  log("  检测到 'Something went wrong' 错误，正在清理缓存（保留登录状态）...");

  // NOTE: 不清理 cookies，因为登录状态存储在 cookies 中
  // await context.clearCookies();

  // Clear localStorage and sessionStorage
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore errors if storage is not accessible
    }
  });

  // Clear browser cache via CDP (not cookies)
  try {
    const client = await page.context().newCDPSession(page);
    await client.send("Network.clearBrowserCache");
    await client.detach();
    log("  浏览器缓存已清理");
  } catch {
    // CDP not available, skip
  }

  log("  localStorage/sessionStorage 已清理，正在刷新页面...");

  // Reload the page
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  log("  页面已刷新");
}

async function retryGeneration(page: Page, config: Config): Promise<boolean> {
  const reuseBtn = page
    .locator(
      'button:has-text("reuse prompt"), button:has-text("Reuse prompt"), button:has-text("Reuse Prompt")'
    )
    .first();

  try {
    await reuseBtn.waitFor({ state: "visible", timeout: 5000 });
    await reuseBtn.click({ delay: 100 });
    await page.waitForTimeout(2000);

    const createBtn = page.getByRole("button", {
      name: config.selectors.createButton,
    });
    await createBtn.waitFor({ state: "visible", timeout: 5000 });

    if (await createBtn.isEnabled()) {
      await createBtn.click({ delay: 100 });
      return true;
    }
  } catch (err) {
    log(
      `  重试操作失败: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return false;
}

export async function waitForNewTopRow(
  page: Page,
  context: BrowserContext,
  config: Config,
  expectedCount: number,
  baseline: string[],
  timeoutMs: number
): Promise<GenerationResult> {
  const start = Date.now();
  let lastUrls: string[] = [];
  let stableCount = 0;
  let lastNonBaseline: string[] = [];
  let lastLoggedCount = -1;
  let retryCount = 0;
  let lastPopupCheck = 0;
  let lastErrorCheck = 0;

  while (Date.now() - start < timeoutMs) {
    // Check for popups every 30s
    if (Date.now() - lastPopupCheck > 30000) {
      await dismissPopups(page);
      lastPopupCheck = Date.now();
    }

    // Check for "Something went wrong" error every 2s
    if (Date.now() - lastErrorCheck > 2000) {
      const hasError = await checkSomethingWentWrong(page);
      if (hasError) {
        log("  检测到 'Something went wrong' 错误，需要清理缓存后重试...");
        const screenshotPath = path.resolve(
          process.cwd(),
          `debug_something_went_wrong_${Date.now()}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log(`  已保存调试截图: ${screenshotPath}`);

        return {
          urls: [],
          needsRetry: true,
          error: "Something went wrong",
        };
      }
      lastErrorCheck = Date.now();
    }

    // Check for generation failure
    if (await checkGenerationFailed(page)) {
      retryCount++;
      if (retryCount > config.maxRetries) {
        log(`  生成失败，已达到最大重试次数 (${config.maxRetries})`);
        break;
      }
      log(
        `  检测到生成失败，等待1分钟后重试 (${retryCount}/${config.maxRetries})...`
      );
      await page.waitForTimeout(60000);

      if (await retryGeneration(page, config)) {
        log(`  已点击重试，继续等待生成...`);
        lastUrls = [];
        stableCount = 0;
        lastLoggedCount = -1;
      }
      continue;
    }

    const urls = await getTopRowVideoUrls(page);
    const elapsedSec = Math.floor((Date.now() - start) / 1000);

    const sameAsLast =
      urls.length === lastUrls.length && urls.every((u, i) => u === lastUrls[i]);

    if (sameAsLast && urls.length > 0) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastUrls = urls;
    }

    const sameAsBaseline =
      baseline.length === urls.length &&
      baseline.every((u, i) => u === urls[i]);

    if (!sameAsBaseline && urls.length > 0) {
      lastNonBaseline = urls;
    }

    if (urls.length !== lastLoggedCount) {
      log(
        `  等待生成中... 已生成 ${urls.length}/${expectedCount} 个视频 (${elapsedSec}s)`
      );
      lastLoggedCount = urls.length;
    }

    if (
      !sameAsBaseline &&
      urls.length >= expectedCount &&
      stableCount >= config.stableChecks
    ) {
      log(`  生成完成，共 ${urls.length} 个视频`);
      return { urls, needsRetry: false };
    }

    await page.waitForTimeout(1000);
  }

  log(`  等待超时，已获取 ${lastNonBaseline.length} 个视频`);

  if (lastNonBaseline.length === 0) {
    const screenshotPath = path.resolve(process.cwd(), "debug_timeout.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  已保存调试截图: ${screenshotPath}`);
  }

  return { urls: lastNonBaseline, needsRetry: false };
}
