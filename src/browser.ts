import { chromium } from "playwright";
import fs from "node:fs";
import type { BrowserInstance, BrowserLaunchOptions } from "./types.js";
import { HEADLESS } from "./config.js";

// 获取 Chrome DevTools WebSocket URL
async function getChromeWsEndpoint(): Promise<string> {
  const response = await fetch("http://127.0.0.1:9222/json/version");
  const data = await response.json();
  return data.webSocketDebuggerUrl;
}

export async function launchBrowser(
  options: BrowserLaunchOptions
): Promise<BrowserInstance> {
  // 获取 WebSocket 端点并连接
  const wsEndpoint = await getChromeWsEndpoint();
  const browser = await chromium.connectOverCDP(wsEndpoint);

  // 获取已有的 context
  const contexts = browser.contexts();
  const context = contexts[0];

  if (!context) {
    throw new Error("没有找到已有的浏览器上下文，请先在 Chrome 中打开一个页面");
  }

  // 尝试复用已有的 Flow 页面，或者创建新标签页
  const pages = context.pages();
  let page = pages.find(p => p.url().includes("labs.google/fx/tools/flow"));

  if (!page) {
    page = pages.find(p => p.url() === "about:blank" || p.url() === "chrome://newtab/");
    if (!page) {
      page = await context.newPage();
    }
  }

  return { browser, context, page };
}

export async function launchLoginBrowser(
  storageStatePath: string
): Promise<BrowserInstance> {
  const wsEndpoint = await getChromeWsEndpoint();
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const contexts = browser.contexts();
  let context = contexts[0];

  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
  }

  const page = await context.newPage();

  return { browser, context, page };
}

export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  // 只关闭页面，不关闭整个浏览器
  for (const page of instance.context.pages()) {
    if (page.url().includes("labs.google/fx/tools/flow")) {
      // 保留 Flow 页面
      continue;
    }
  }
  await instance.browser.close();
}

export { HEADLESS };
