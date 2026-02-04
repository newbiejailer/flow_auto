import { launchBrowser, closeBrowser, HEADLESS } from "../src/browser.js";
import { createConfig } from "../src/config.js";
import { log, logStep, resetStepCounter } from "../src/utils/logger.js";
import { pause } from "../src/utils/random.js";
import { getTopRowVideoUrls } from "../src/video/detect.js";
import { downloadVideos } from "../src/video/download.js";

// Default project URL - modify as needed
const DEFAULT_PROJECT_URL =
  "https://labs.google/fx/tools/flow/project/adcc2264-309a-422c-acb6-b251879d88c8";

async function waitForTopRowVideoUrls(
  page: Awaited<ReturnType<typeof launchBrowser>>["page"],
  timeoutMs: number
): Promise<string[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const urls = await getTopRowVideoUrls(page);
    if (urls.length > 0) return urls;
    await page.waitForTimeout(500);
  }
  return [];
}

async function main() {
  const urlArg = process.argv[2] || DEFAULT_PROJECT_URL;
  const config = createConfig({ url: urlArg });

  resetStepCounter();

  log("========================================");
  log("Flow Auto 下载模式");
  log(`模式: ${HEADLESS ? "无头" : "有头"}`);
  log(`项目 URL: ${config.url}`);
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
  await pause(page, 500, 900);
  await page.evaluate(() => window.scrollTo(0, 0));
  log("  页面加载完成");

  logStep("查找视频");
  const tiles = page.locator(config.selectors.tileContainer);
  await tiles.first().waitFor({ timeout: 300_000 });

  const videoUrls = await waitForTopRowVideoUrls(page, 30_000);
  if (videoUrls.length === 0) {
    throw new Error("未找到顶部一排的视频链接。");
  }
  log(`  找到 ${videoUrls.length} 个视频`);

  logStep("下载视频");
  await downloadVideos(page, videoUrls, "flow");

  logStep("清理并退出");
  await closeBrowser({ browser, context, page });

  log("========================================");
  log("下载完成");
  log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
