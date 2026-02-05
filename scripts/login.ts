import readline from "node:readline";
import { spawn, execSync } from "node:child_process";
import { createConfig } from "../src/config.js";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9222;
const USER_DATA_DIR = "/tmp/chrome-debug-profile";

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

function isPortListening(port: number): boolean {
  try {
    const result = execSync(`lsof -i :${port} 2>/dev/null`, { encoding: "utf-8" });
    return result.length > 0;
  } catch {
    return false;
  }
}

function killChrome(): void {
  try {
    execSync('pkill -9 -f "Google Chrome" 2>/dev/null');
    console.log("已关闭现有的 Chrome 进程");
  } catch {
    // Chrome 可能没有在运行
  }
}

async function waitForPort(port: number, timeoutMs: number = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isPortListening(port)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const config = createConfig();

  console.log("========================================");
  console.log("Flow Auto 登录助手");
  console.log("========================================");
  console.log("");

  // 检查是否已有 Chrome 调试端口在运行
  if (isPortListening(DEBUG_PORT)) {
    console.log(`检测到 Chrome 调试端口 ${DEBUG_PORT} 已在运行`);
    const answer = await prompt("是否关闭并重新启动？(y/N) ");
    if (answer.toLowerCase() !== "y") {
      console.log("保持现有 Chrome 实例，请确保已登录 Google 账号");
      console.log("然后运行: npm run run -- \"你的提示词\"");
      return;
    }
  }

  // 关闭现有 Chrome
  killChrome();
  await new Promise((r) => setTimeout(r, 2000));

  // 启动 Chrome 调试模式
  console.log("");
  console.log("正在启动 Chrome 调试模式...");

  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    config.url,
  ], {
    detached: true,
    stdio: "ignore",
  });

  chrome.unref();

  // 等待端口启动
  const started = await waitForPort(DEBUG_PORT);
  if (!started) {
    console.error("Chrome 启动失败，请检查 Chrome 是否已安装");
    process.exit(1);
  }

  console.log("");
  console.log("✓ Chrome 已启动（调试端口: " + DEBUG_PORT + "）");
  console.log("✓ 已打开 Flow 页面");
  console.log("");
  console.log("请在浏览器中完成以下操作：");
  console.log("1. 登录你的 Google 账号");
  console.log("2. 确认可以正常访问 Flow");
  console.log("");

  await prompt("登录完成后，按 Enter 键继续...");

  console.log("");
  console.log("========================================");
  console.log("登录完成！Chrome 保持运行中。");
  console.log("");
  console.log("现在可以运行：");
  console.log('  npm run run -- "你的提示词"');
  console.log('  npm run frames -- --first=./first.png "提示词"');
  console.log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
