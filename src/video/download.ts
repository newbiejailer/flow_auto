import fs from "node:fs";
import path from "node:path";
import type { Page } from "../types.js";
import { pause } from "../utils/random.js";
import { log } from "../utils/logger.js";

export async function downloadFile(url: string, savePath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.promises.writeFile(savePath, Buffer.from(arrayBuffer));
}

export async function downloadVideos(
  page: Page,
  urls: string[],
  prefix: string = "flow"
): Promise<string[]> {
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const savedPaths: string[] = [];
  let idx = 1;

  for (const url of urls) {
    const filename = `${prefix}_${Date.now()}_${idx}.mp4`;
    const savePath = path.join(downloadsDir, filename);
    log(`  下载中 (${idx}/${urls.length}): ${filename}`);
    await downloadFile(url, savePath);
    savedPaths.push(savePath);
    idx += 1;
    await pause(page, 300, 600);
  }

  log(`  全部下载完成，保存到: ${downloadsDir}`);
  return savedPaths;
}
