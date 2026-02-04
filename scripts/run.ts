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
import { getTopRowVideoUrls, waitForNewTopRow } from "../src/video/detect.js";
import { downloadVideos } from "../src/video/download.js";

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

  logStep("输入提示词");
  await fillPrompt(page, config);
  log("  提示词已填入");

  logStep("开始生成");
  const baseline = await getTopRowVideoUrls(page);
  await clickCreate(page, config);
  await pause(page, 500, 800);

  const errorText = await checkError(page);
  if (errorText) {
    log(`  警告: 页面显示错误信息 - ${errorText}`);
  }

  log("  已点击创建按钮，等待生成...");

  const expected =
    Number.parseInt(config.settings.outputsPerPrompt || "1", 10) || 1;
  const urls = await waitForNewTopRow(
    page,
    config,
    expected,
    baseline,
    config.maxWaitMs
  );

  if (urls.length < config.minOutputs) {
    throw new Error("未检测到新生成的视频链接。");
  }

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
