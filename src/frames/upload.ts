import fs from "node:fs";
import path from "node:path";
import type { Page, FramesConfig } from "../types.js";
import { randInt } from "../utils/random.js";
import { dismissPopups } from "../actions/popups.js";
import { log } from "../utils/logger.js";

async function uploadFrame(
  page: Page,
  config: FramesConfig,
  filePath: string,
  label: string,
  isFirstFrame: boolean = true
): Promise<void> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label}文件不存在: ${absolutePath}`);
  }

  await dismissPopups(page);

  // Find frame upload buttons at bottom of page
  const frameUploadButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const candidates = buttons.filter((btn) => {
      const rect = btn.getBoundingClientRect();
      const text = btn.textContent?.trim() || "";
      return (
        rect.top > window.innerHeight * 0.75 &&
        text === "add" &&
        rect.width > 40 &&
        rect.width < 100
      );
    });
    candidates.sort(
      (a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x
    );
    return candidates.map((btn, i) => ({
      index: i,
      x: btn.getBoundingClientRect().x,
      y: btn.getBoundingClientRect().y,
    }));
  });

  if (frameUploadButtons.length < 1) {
    const screenshotPath = path.resolve(
      process.cwd(),
      `debug_upload_${label}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(`找不到帧上传按钮`);
  }

  const targetBtnInfo = frameUploadButtons[0];
  const addButtons = page.locator('button:has-text("add")');

  let targetBtn = null;
  const allAddBtns = await addButtons.all();
  for (const btn of allAddBtns) {
    const box = await btn.boundingBox();
    if (
      box &&
      Math.abs(box.x - targetBtnInfo.x) < 10 &&
      Math.abs(box.y - targetBtnInfo.y) < 10
    ) {
      targetBtn = btn;
      break;
    }
  }

  if (targetBtn) {
    await targetBtn.click({ delay: randInt(80, 160) });
  } else {
    await page.mouse.click(targetBtnInfo.x + 32, targetBtnInfo.y + 20);
  }
  await page.waitForTimeout(1000);

  // Check for blocking popups
  const uploadBtnVisible = await page
    .locator("text=Upload")
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);

  if (!uploadBtnVisible) {
    const dismissed = await dismissPopups(page);
    if (dismissed > 0) {
      log(`  已关闭 ${dismissed} 个阻断弹窗，重新点击上传按钮...`);
      await page.waitForTimeout(1000);
      await page.mouse.click(targetBtnInfo.x + 32, targetBtnInfo.y + 20);
      await page.waitForTimeout(1000);
    }
  }

  // Debug screenshot
  const afterAddClickScreenshot = path.resolve(
    process.cwd(),
    `debug_after_add_click_${label}.png`
  );
  await page.screenshot({ path: afterAddClickScreenshot, fullPage: true });
  log(`  调试截图: ${afterAddClickScreenshot}`);

  // Click Upload button in popup
  const uploadBtn = page.locator("text=Upload").first();
  await uploadBtn.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(1000);

  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
  await uploadBtn.click({ delay: randInt(80, 160) });

  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(absolutePath);

  // Wait for crop interface
  await page.waitForTimeout(2000);

  // Select crop aspect ratio only for first frame
  if (isFirstFrame) {
    try {
      const aspectBtn = page
        .locator(
          'button:has-text("Landscape"), button:has-text("Portrait"), button:has-text("Square")'
        )
        .first();
      if (await aspectBtn.isVisible({ timeout: 3000 })) {
        await page.waitForTimeout(1000);
        await aspectBtn.click({ delay: randInt(80, 160) });
        await page.waitForTimeout(1500);

        const targetAspect = config.settings.aspectRatio.includes("9:16")
          ? "Portrait"
          : config.settings.aspectRatio.includes("16:9")
            ? "Landscape"
            : "Portrait";

        const aspectOption = page.locator(`text=${targetAspect}`).first();
        if (await aspectOption.isVisible({ timeout: 3000 })) {
          await aspectOption.click({ delay: randInt(80, 160) });
          log(`  已选择裁剪比例: ${targetAspect}`);
          await page.waitForTimeout(2000);
        }
      }
    } catch (err) {
      log(
        `  选择裁剪比例时出错: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Click Crop and Save
  const cropSaveBtn = page.locator('button:has-text("Crop and Save")');
  try {
    await cropSaveBtn.waitFor({ state: "visible", timeout: 10000 });
    await cropSaveBtn.click({ delay: randInt(80, 160) });
    log(`  已点击 Crop and Save`);
    await page.waitForTimeout(3000);
  } catch (err) {
    log(
      `  未找到 Crop and Save 按钮: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Close image library popup
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);

  log(`  ${label}已上传: ${path.basename(filePath)}`);
}

export async function uploadFrames(
  page: Page,
  config: FramesConfig
): Promise<void> {
  // Upload first frame (required)
  log("  上传首帧图...");
  await uploadFrame(page, config, config.firstFramePath, "首帧图", true);
  await page.waitForTimeout(2000);

  // Upload last frame (optional)
  if (config.lastFramePath) {
    log("  上传尾帧图...");
    await uploadFrame(page, config, config.lastFramePath, "尾帧图", false);
    await page.waitForTimeout(1000);
  }
}
