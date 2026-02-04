import path from "node:path";
import type { Page, Config } from "../types.js";
import { clickSafe } from "../utils/interaction.js";
import { log } from "../utils/logger.js";

export async function clickCreate(page: Page, config: Config): Promise<void> {
  const createBtn = page.getByRole("button", {
    name: config.selectors.createButton,
  });

  await createBtn.waitFor({ state: "visible" });

  const start = Date.now();
  let lastLogTime = 0;

  while (Date.now() - start < 120_000) {
    if (await createBtn.isEnabled()) break;

    if (Date.now() - lastLogTime > 10000) {
      log(`  等待 Create 按钮启用... (${Math.floor((Date.now() - start) / 1000)}s)`);
      lastLogTime = Date.now();
    }

    await page.waitForTimeout(500);
  }

  if (!(await createBtn.isEnabled())) {
    const screenshotPath = path.resolve(process.cwd(), "debug_create_disabled.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error("Create 按钮始终处于禁用状态");
  }

  await clickSafe(createBtn);
}

export async function checkError(page: Page): Promise<string | null> {
  const errorMsg = page.locator('[role="alert"], .error-message').first();
  try {
    if (await errorMsg.isVisible({ timeout: 1000 })) {
      const text = await errorMsg.textContent();
      if (text && text.length > 5 && !/^flow$/i.test(text.trim())) {
        return text;
      }
    }
  } catch {
    // No error message
  }
  return null;
}
