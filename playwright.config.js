// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 120_000,
  use: {
    headless: false,
    viewport: { width: 1440, height: 900 },
    // Slight slowMo makes the run more human-like and reliable.
    launchOptions: { slowMo: 150 }
  }
});
