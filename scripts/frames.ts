import { launchBrowser, closeBrowser, HEADLESS } from "../src/browser.js";
import { createFramesConfig } from "../src/config.js";
import { log, logStep, resetStepCounter } from "../src/utils/logger.js";
import { pause } from "../src/utils/random.js";
import { dismissPopups } from "../src/actions/popups.js";
import { openSettings, applySettings } from "../src/actions/settings.js";
import { selectMode } from "../src/actions/mode.js";
import { fillPrompt } from "../src/actions/prompt.js";
import { clickCreate, checkError } from "../src/actions/create.js";
import { getTopRowVideoUrls, waitForNewTopRow } from "../src/video/detect.js";
import { downloadVideos } from "../src/video/download.js";
import { uploadFrames } from "../src/frames/upload.js";

interface ParsedArgs {
  first: string;
  last: string;
  prompt: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = { first: "", last: "", prompt: "" };
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--first" && args[i + 1]) {
      result.first = args[++i];
    } else if (args[i] === "--last" && args[i + 1]) {
      result.last = args[++i];
    } else if (args[i].startsWith("--first=")) {
      result.first = args[i].slice(8);
    } else if (args[i].startsWith("--last=")) {
      result.last = args[i].slice(7);
    } else {
      promptParts.push(args[i]);
    }
  }
  result.prompt = promptParts.join(" ").trim();

  if (!result.first) {
    console.error("错误: 必须提供首帧图 --first=<path>");
    console.error(
      '用法: npm run frames -- --first=./first.png [--last=./last.png] "提示词"'
    );
    process.exit(1);
  }
  if (!result.prompt) {
    console.error("错误: 必须提供提示词");
    console.error(
      '用法: npm run frames -- --first=./first.png [--last=./last.png] "提示词"'
    );
    process.exit(1);
  }
  return result;
}

async function main() {
  const args = parseArgs();
  const config = createFramesConfig({
    prompt: args.prompt,
    firstFramePath: args.first,
    lastFramePath: args.last || "",
    url: "https://labs.google/fx/tools/flow/project/bfbe3491-8255-4e3a-ba4d-b169b19b12b2",
  });

  resetStepCounter();

  log("========================================");
  log("Flow Auto (Frames to Video) 开始运行");
  log(`模式: ${HEADLESS ? "无头" : "有头"}`);
  log(`首帧图: ${config.firstFramePath}`);
  if (config.lastFramePath) {
    log(`尾帧图: ${config.lastFramePath}`);
  }
  log(`提示词: ${config.prompt}`);
  log("========================================");

  logStep("启动浏览器");
  const { browser, context, page } = await launchBrowser({
    headless: HEADLESS,
    storageStatePath: config.storageStatePath,
  });
  log("  浏览器已启动");

  logStep("打开项目页面");
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await pause(page, 1500, 2000);
  log("  页面加载完成");

  const popupCount = await dismissPopups(page);
  if (popupCount > 0) {
    log(`  已关闭 ${popupCount} 个弹窗`);
  }
  await pause(page, 500, 800);

  logStep("选择生成模式");
  await dismissPopups(page);
  await selectMode(page, config);
  log(`  模式: ${config.modeOptionLabel}`);
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  logStep("配置设置");
  await dismissPopups(page);
  await openSettings(page, config);
  await applySettings(page, config);
  log(`  宽高比: ${config.settings.aspectRatio}`);
  log(`  生成数量: ${config.settings.outputsPerPrompt}`);
  log(`  模型: ${config.settings.model}`);
  await dismissPopups(page);

  logStep("上传帧图片");
  await dismissPopups(page);
  await uploadFrames(page, config);
  await dismissPopups(page);

  logStep("输入提示词");
  await dismissPopups(page);
  await fillPrompt(page, config);
  log("  提示词已填入");
  await dismissPopups(page);

  logStep("开始生成");
  await dismissPopups(page);
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
  await downloadVideos(page, urls, "flow_frames");

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
