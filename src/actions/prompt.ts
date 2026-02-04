import type { Page, Config } from "../types.js";
import { pause } from "../utils/random.js";

export async function fillPrompt(page: Page, config: Config): Promise<void> {
  const byId = page.locator(config.selectors.promptTextareaId);
  const byPlaceholder = page.getByPlaceholder(config.selectors.promptPlaceholder);
  const promptBox = (await byId.count()) > 0 ? byId : byPlaceholder;

  await promptBox.click();
  await promptBox.fill(config.prompt);
  await pause(page, 300, 600);
}
