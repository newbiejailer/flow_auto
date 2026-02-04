import { chromium } from "playwright";
import fs from "node:fs";
import type { BrowserInstance, BrowserLaunchOptions } from "./types.js";
import { HEADLESS } from "./config.js";

export async function launchBrowser(
  options: BrowserLaunchOptions
): Promise<BrowserInstance> {
  const headless = options.headless;

  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 80 : 120,
    args: headless
      ? [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--no-sandbox",
        ]
      : [],
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    storageState: fs.existsSync(options.storageStatePath)
      ? options.storageStatePath
      : undefined,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { browser, context, page };
}

export async function launchLoginBrowser(
  storageStatePath: string
): Promise<BrowserInstance> {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  return { browser, context, page };
}

export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  await instance.context.close();
  await instance.browser.close();
}

export { HEADLESS };
