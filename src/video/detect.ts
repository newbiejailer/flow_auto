import type { Page, Config } from "../types.js";
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
  config: Config,
  expectedCount: number,
  baseline: string[],
  timeoutMs: number
): Promise<string[]> {
  const start = Date.now();
  let lastUrls: string[] = [];
  let stableCount = 0;
  let lastNonBaseline: string[] = [];
  let lastLoggedCount = -1;
  let retryCount = 0;
  let lastPopupCheck = 0;

  while (Date.now() - start < timeoutMs) {
    // Check for popups every 30s
    if (Date.now() - lastPopupCheck > 30000) {
      await dismissPopups(page);
      lastPopupCheck = Date.now();
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
      return urls;
    }

    await page.waitForTimeout(1000);
  }

  log(`  等待超时，已获取 ${lastNonBaseline.length} 个视频`);

  if (lastNonBaseline.length === 0) {
    const screenshotPath = path.resolve(process.cwd(), "debug_timeout.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  已保存调试截图: ${screenshotPath}`);
  }

  return lastNonBaseline;
}
