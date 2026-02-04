import type { Locator } from "../types.js";
import { randInt } from "./random.js";

export async function typeHumanLike(
  locator: Locator,
  text: string,
  typeDelayMs: number = 60
): Promise<void> {
  await locator.click({ delay: randInt(60, 120) });
  for (const ch of text) {
    await locator.type(ch, { delay: randInt(40, typeDelayMs) });
  }
}

export async function clickSafe(
  locator: Locator,
  opts: Parameters<Locator["click"]>[0] = {}
): Promise<void> {
  await locator.waitFor({ state: "visible" });
  await locator.click({ delay: randInt(80, 160), ...opts });
}
