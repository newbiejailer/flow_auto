import readline from "node:readline";
import { launchLoginBrowser, closeBrowser } from "../src/browser.js";
import { createConfig } from "../src/config.js";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const config = createConfig();

  console.log("正在启动浏览器...");

  const { browser, context, page } = await launchLoginBrowser(
    config.storageStatePath
  );

  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  console.log("已打开 Flow 页面，请在浏览器中完成登录。");
  console.log("");

  await prompt("登录完成后，按 Enter 键保存登录态...");

  await context.storageState({ path: config.storageStatePath });
  console.log(`登录态已保存到: ${config.storageStatePath}`);

  await browser.close();
  console.log("浏览器已关闭。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
