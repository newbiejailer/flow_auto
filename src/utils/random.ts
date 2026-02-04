import type { Page } from "../types.js";

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function pause(
  page: Page,
  min: number = 120,
  max: number = 320
): Promise<void> {
  await page.waitForTimeout(randInt(min, max));
}

export function toNameMatcher(value: string | RegExp): RegExp {
  if (value instanceof RegExp) return value;
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}
