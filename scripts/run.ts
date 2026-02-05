import { launchBrowser, closeBrowser, HEADLESS } from "../src/browser.js";
import { createConfig } from "../src/config.js";
import { log, logStep, resetStepCounter } from "../src/utils/logger.js";
import { pause } from "../src/utils/random.js";
import { clickSafe } from "../src/utils/interaction.js";
import { dismissPopups } from "../src/actions/popups.js";
import { openSettings, applySettings } from "../src/actions/settings.js";
import { selectMode } from "../src/actions/mode.js";
import { fillPrompt } from "../src/actions/prompt.js";
import { clickCreate, checkError } from "../src/actions/create.js";
import {
  getTopRowVideoUrls,
  waitForNewTopRow,
  clearBrowserCacheAndReload,
} from "../src/video/detect.js";
import { downloadVideos } from "../src/video/download.js";
import type { Config, Page, BrowserContext } from "../src/types.js";

const MAX_CACHE_RETRIES = 3;

async function runGeneration(
  page: Page,
  context: BrowserContext,
  config: Config
): Promise<string[]> {
  let cacheRetryCount = 0;

  while (cacheRetryCount < MAX_CACHE_RETRIES) {
    // Dismiss any popups before starting
    await dismissPopups(page);

    logStep("输入提示词");
    await fillPrompt(page, config);
    log("  提示词已填入");

    logStep("开始生成");
    const baseline = await getTopRowVideoUrls(page);
    await clickCreate(page, config);
    await pause(page, 500, 800);

    // Check for immediate errors after clicking Create
    const errorText = await checkError(page);
    if (errorText) {
      log(`  警告: 页面显示错误信息 - ${errorText}`);

      // If it's "Something went wrong", trigger retry immediately
      if (/something went wrong/i.test(errorText)) {
        cacheRetryCount++;
        if (cacheRetryCount >= MAX_CACHE_RETRIES) {
          throw new Error(
            `多次尝试后仍然遇到 '${errorText}' 错误，已达到最大重试次数 (${MAX_CACHE_RETRIES})`
          );
        }

        log(`  准备清理缓存并重试 (${cacheRetryCount}/${MAX_CACHE_RETRIES})...`);
        await clearBrowserCacheAndReload(page, context);
        await page.waitForLoadState("networkidle");
        await pause(page, 1500, 2000);
        await dismissPopups(page);
        log("  重新开始生成流程...");
        continue;
      }
    }

    log("  已点击创建按钮，等待生成...");

    const expected =
      Number.parseInt(config.settings.outputsPerPrompt || "1", 10) || 1;
    const result = await waitForNewTopRow(
      page,
      context,
      config,
      expected,
      baseline,
      config.maxWaitMs
    );

    if (result.needsRetry) {
      cacheRetryCount++;
      if (cacheRetryCount >= MAX_CACHE_RETRIES) {
        throw new Error(
          `多次尝试后仍然遇到 '${result.error}' 错误，已达到最大重试次数 (${MAX_CACHE_RETRIES})`
        );
      }

      log(`  准备清理缓存并重试 (${cacheRetryCount}/${MAX_CACHE_RETRIES})...`);
      await clearBrowserCacheAndReload(page, context);

      // Wait for page to stabilize after reload
      await page.waitForLoadState("networkidle");
      await pause(page, 1500, 2000);

      // Close any popups that might appear after refresh
      await dismissPopups(page);

      log("  重新开始生成流程...");
      continue;
    }

    if (result.urls.length < config.minOutputs) {
      throw new Error("未检测到新生成的视频链接。");
    }

    return result.urls;
  }

  throw new Error("生成失败，已达到最大重试次数");
}

async function main() {
  const promptArg = process.argv.slice(2).join(" ").trim();
  if (!promptArg) {
    console.error('用法: npm run run -- "你的提示词"');
    process.exit(1);
  }

  const config = createConfig({ prompt: promptArg });
  resetStepCounter();

  log("========================================");
  log("Flow Auto 开始运行");
  log(`模式: ${HEADLESS ? "无头" : "有头"}`);
  log(`提示词: ${config.prompt}`);
  log("========================================");

  logStep("启动浏览器");
  const { browser, context, page } = await launchBrowser({
    headless: HEADLESS,
    storageStatePath: config.storageStatePath,
  });
  log("  浏览器已启动");

  logStep("打开 Flow 页面");
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await pause(page, 500, 900);
  log("  页面加载完成");

  logStep("创建新项目");
  const newProjectBtn = page.getByRole("button", {
    name: config.selectors.newProjectButton,
  });
  await clickSafe(newProjectBtn);
  await page.waitForURL(/\/project\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await pause(page, 1000, 1500);
  log("  已进入项目页面");

  const popupCount = await dismissPopups(page);
  if (popupCount > 0) {
    log(`  已关闭 ${popupCount} 个弹窗`);
  }
  await pause(page, 500, 800);

  logStep("配置设置");
  await openSettings(page, config);
  await applySettings(page, config);
  log(`  宽高比: ${config.settings.aspectRatio}`);
  log(`  生成数量: ${config.settings.outputsPerPrompt}`);
  log(`  模型: ${config.settings.model}`);

  logStep("选择生成模式");
  await selectMode(page, config);
  log(`  模式: ${config.modeOptionLabel}`);

  // Run generation with retry logic
  const urls = await runGeneration(page, context, config);

  logStep("下载视频");
  await downloadVideos(page, urls, "flow");

  logStep("清理并退出");
  await closeBrowser({ browser, context, page });

  log("========================================");
  log("运行完成");
  log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
