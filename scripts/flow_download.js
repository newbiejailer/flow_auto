import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HEADLESS = process.env.HEADLESS === "true";

const CONFIG = {
  url: "https://labs.google/fx/tools/flow/project/adcc2264-309a-422c-acb6-b251879d88c8",
  storageStatePath: path.resolve("storageState.json"),
  selectors: {
    tileContainer: "[data-virtuoso-scroller] [data-index]"
  },
  human: {
    minDelayMs: 120,
    maxDelayMs: 320
  }
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanPause(page, min = CONFIG.human.minDelayMs, max = CONFIG.human.maxDelayMs) {
  await page.waitForTimeout(randInt(min, max));
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 80 : 120 });
  const context = await browser.newContext({
    acceptDownloads: true,
    storageState: fs.existsSync(CONFIG.storageStatePath) ? CONFIG.storageStatePath : undefined
  });
  const page = await context.newPage();

  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await humanPause(page, 500, 900);
  await page.evaluate(() => window.scrollTo(0, 0));

  const tiles = page.locator(CONFIG.selectors.tileContainer);
  await tiles.first().waitFor({ timeout: 300_000 });

  const videoUrls = await waitForTopRowVideoUrls(page, 30_000);
  if (videoUrls.length === 0) {
    throw new Error("未找到顶部一排的视频链接。");
  }

  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  let idx = 1;
  for (const url of videoUrls) {
    const filename = `flow_${Date.now()}_${idx}.mp4`;
    const savePath = path.join(downloadsDir, filename);
    console.log("Downloading", url);
    await downloadFile(url, savePath);
    idx += 1;
    await humanPause(page, 300, 600);
  }

  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function getTopRowVideoUrls(page) {
  return await page.evaluate(() => {
    const allRows = Array.from(document.querySelectorAll("[data-virtuoso-scroller] [data-index]"));
    if (allRows.length === 0) return [];

    // 跳过日期标题，优先取第一个包含 video 的 row
    const rowWithVideos =
      allRows.find((row) => row.querySelectorAll("video").length > 0) || null;
    if (!rowWithVideos) return [];

    const videos = Array.from(rowWithVideos.querySelectorAll("video"));
    const urls = [];
    for (const video of videos) {
      const src = video.getAttribute("src") || video.currentSrc || "";
      if (src) urls.push(src);
    }
    return urls;
  });
}

async function waitForTopRowVideoUrls(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const urls = await getTopRowVideoUrls(page);
    if (urls.length > 0) return urls;
    await page.waitForTimeout(500);
  }
  return [];
}

async function downloadFile(url, savePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.promises.writeFile(savePath, Buffer.from(arrayBuffer));
}
