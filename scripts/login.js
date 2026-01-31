import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const CONFIG = {
  url: "https://labs.google/fx/tools/flow",
  storageStatePath: path.resolve("storageState.json")
};

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("正在启动浏览器...");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  console.log("已打开 Flow 页面，请在浏览器中完成登录。");
  console.log("");

  await prompt("登录完成后，按 Enter 键保存登录态...");

  // 保存登录态
  await context.storageState({ path: CONFIG.storageStatePath });
  console.log(`登录态已保存到: ${CONFIG.storageStatePath}`);

  await browser.close();
  console.log("浏览器已关闭。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
