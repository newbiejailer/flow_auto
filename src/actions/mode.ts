import type { Page, Config } from "../types.js";
import { toNameMatcher, pause } from "../utils/random.js";
import { clickSafe } from "../utils/interaction.js";

export async function selectMode(page: Page, config: Config): Promise<void> {
  if (!config.modeOptionLabel) return;

  let modeBtn = page
    .getByRole("button", { name: config.selectors.modeButton })
    .first();

  if (!(await modeBtn.count())) {
    modeBtn = page.getByRole("combobox").first();
  }

  if (!(await modeBtn.count())) return;

  await clickSafe(modeBtn);

  const modeName = toNameMatcher(config.modeOptionLabel);
  let modeItem = page.getByRole("menuitem", { name: modeName }).first();

  if (!(await modeItem.count())) {
    modeItem = page.getByRole("menuitemradio", { name: modeName }).first();
  }

  if (!(await modeItem.count())) {
    modeItem = page.getByRole("option", { name: modeName }).first();
  }

  await clickSafe(modeItem);
  await pause(page, 300, 600);
}
