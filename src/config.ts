import path from "node:path";
import type { Config, FramesConfig, Settings, Selectors, HumanDelayConfig } from "./types.js";

export const DEFAULT_SELECTORS: Selectors = {
  newProjectButton: "New project",
  settingsButton: "Settings",
  promptTextareaId: "#PINHOLE_TEXT_AREA_ELEMENT_ID",
  promptPlaceholder: /Generate a video with text/i,
  modeButton: /Text to Video/i,
  createButton: "Create",
  tileContainer: "[data-virtuoso-scroller] [data-index]",
};

export const DEFAULT_SETTINGS: Settings = {
  aspectRatio: "Portrait (9:16)",
  outputsPerPrompt: "4",
  model: "Veo 3.1 - Fast",
};

export const DEFAULT_HUMAN_DELAY: HumanDelayConfig = {
  minDelayMs: 120,
  maxDelayMs: 320,
  typeDelayMs: 60,
};

export function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    url: "https://labs.google/fx/tools/flow",
    storageStatePath: path.resolve("storageState.json"),
    prompt: "",
    settings: { ...DEFAULT_SETTINGS, ...overrides.settings },
    minOutputs: 1,
    maxWaitMs: 300_000,
    stableChecks: 3,
    maxRetries: 5,
    modeOptionLabel: "Text to Video",
    selectors: { ...DEFAULT_SELECTORS, ...overrides.selectors },
    human: { ...DEFAULT_HUMAN_DELAY, ...overrides.human },
    ...overrides,
  };
}

export function createFramesConfig(overrides: Partial<FramesConfig> = {}): FramesConfig {
  const base = createConfig(overrides);
  return {
    ...base,
    modeOptionLabel: "Frames to Video",
    selectors: {
      ...base.selectors,
      modeButton: /Frames to Video/i,
    },
    firstFramePath: "",
    lastFramePath: "",
    ...overrides,
  };
}

export const HEADLESS = process.env.HEADLESS === "true";
