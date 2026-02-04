import path from "node:path";
import type { Page, Config } from "../types.js";
import { toNameMatcher, pause } from "../utils/random.js";
import { clickSafe } from "../utils/interaction.js";
import { log } from "../utils/logger.js";

export async function openSettings(page: Page, config: Config): Promise<void> {
  const settingsBtn = page.getByRole("button", {
    name: config.selectors.settingsButton,
  });

  try {
    await settingsBtn.waitFor({ state: "visible", timeout: 15000 });
  } catch (err) {
    const screenshotPath = path.resolve(process.cwd(), "debug_settings_btn.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(
      `找不到 Settings 按钮: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await clickSafe(settingsBtn);
  await pause(page, 800, 1200);

  const dialog = page.getByRole("dialog");
  try {
    await dialog.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // Dialog might not be role="dialog", continue
  }
  await pause(page, 300, 500);
}

async function getSettingsRoot(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Aspect Ratio" });
  if (await dialog.count()) return dialog.first();
  return page;
}

async function selectFromLabeledDropdown(
  page: Page,
  root: ReturnType<typeof page.getByRole> | Page,
  labelText: string,
  optionText: string
): Promise<void> {
  if (!optionText) return;

  const labelMatcher = toNameMatcher(labelText);
  let dropdown = root.getByRole("button", { name: labelMatcher }).first();

  if (!(await dropdown.count())) {
    dropdown = root.getByRole("combobox", { name: labelMatcher }).first();
  }

  if (!(await dropdown.count())) {
    const label = root.getByText(labelText, { exact: true });
    const container = label.locator("..");
    dropdown = container.getByRole("button").first();
  }

  if (!(await dropdown.count())) {
    const textNode = root.getByText(labelMatcher).first();
    const ancestorButton = textNode.locator(
      "xpath=ancestor-or-self::*[self::button or @role='button' or @role='combobox'][1]"
    );
    dropdown = (await ancestorButton.count()) ? ancestorButton.first() : textNode;
  }

  await clickSafe(dropdown);

  const optionName = toNameMatcher(optionText);
  let option = page.getByRole("menuitem", { name: optionName }).first();
  if (!(await option.count())) {
    option = page.getByRole("menuitemradio", { name: optionName }).first();
  }
  if (!(await option.count())) {
    option = page.getByRole("option", { name: optionName }).first();
  }
  await clickSafe(option);
  await pause(page, 300, 600);
}

export async function applySettings(page: Page, config: Config): Promise<void> {
  const { aspectRatio, outputsPerPrompt, model } = config.settings;
  const root = await getSettingsRoot(page);

  try {
    await root.getByText("Aspect Ratio").first().waitFor({ timeout: 15_000 });
  } catch (err) {
    const screenshotPath = path.resolve(
      process.cwd(),
      "debug_settings_dialog.png"
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(
      `Settings 对话框未正常打开: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await selectFromLabeledDropdown(page, root, "Aspect Ratio", aspectRatio);
  await selectFromLabeledDropdown(page, root, "Outputs per prompt", outputsPerPrompt);
  await selectFromLabeledDropdown(page, root, "Model", model);
}
