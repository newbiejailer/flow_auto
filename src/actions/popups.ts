import type { Page } from "../types.js";
import { randInt, pause } from "../utils/random.js";

const DISMISS_SELECTORS = [
  'button[aria-label="Close"]',
  'button[aria-label="Dismiss"]',
  'button[aria-label="关闭"]',
  '[role="dialog"] button[aria-label*="close" i]',
  '[role="dialog"] button[aria-label*="dismiss" i]',
  '[role="dialog"] button:has-text("Got it")',
  '[role="dialog"] button:has-text("OK")',
  '[role="dialog"] button:has-text("Close")',
  '[role="dialog"] button:has-text("Dismiss")',
  '[role="dialog"] button:has-text("Skip")',
  '[role="dialog"] button:has-text("Not now")',
  '[role="dialog"] button.close-button',
  '[role="dialog"] [class*="close"]',
  '[role="dialog"] [class*="dismiss"]',
  'button:has-text("Dismiss")',
  'button:has-text("Got it")',
  'button:has-text("OK")',
  'button:has-text("I understand")',
  'button:has-text("Continue")',
  '[class*="snackbar"] button',
  '[class*="toast"] button',
  '[class*="notification"] button',
  '[class*="banner"] button:has-text("Dismiss")',
  '[class*="banner"] button:has-text("Close")',
];

export async function dismissPopups(
  page: Page,
  maxAttempts: number = 3
): Promise<number> {
  let totalDismissed = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let dismissed = false;

    for (const selector of DISMISS_SELECTORS) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click({ delay: randInt(80, 160) });
          dismissed = true;
          totalDismissed++;
          await pause(page, 300, 500);
          break;
        }
      } catch {
        // Ignore element not found errors
      }
    }

    if (!dismissed) {
      const dialog = page.locator('[role="dialog"]').first();
      try {
        if (await dialog.isVisible({ timeout: 500 })) {
          await page.keyboard.press("Escape");
          await pause(page, 300, 500);
          dismissed = true;
          totalDismissed++;
        }
      } catch {
        // Ignore
      }
    }

    if (!dismissed) break;
  }

  return totalDismissed;
}
