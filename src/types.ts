import type { Page, Locator, Browser, BrowserContext } from "playwright";

export interface HumanDelayConfig {
  minDelayMs: number;
  maxDelayMs: number;
  typeDelayMs: number;
}

export interface Selectors {
  newProjectButton: string;
  settingsButton: string;
  promptTextareaId: string;
  promptPlaceholder: RegExp;
  modeButton: RegExp;
  createButton: string;
  tileContainer: string;
}

export interface Settings {
  aspectRatio: string;
  outputsPerPrompt: string;
  model: string;
}

export interface Config {
  url: string;
  storageStatePath: string;
  prompt: string;
  settings: Settings;
  minOutputs: number;
  maxWaitMs: number;
  stableChecks: number;
  maxRetries: number;
  modeOptionLabel: string;
  selectors: Selectors;
  human: HumanDelayConfig;
}

export interface FramesConfig extends Config {
  firstFramePath: string;
  lastFramePath: string;
}

export interface BrowserLaunchOptions {
  headless: boolean;
  storageStatePath: string;
}

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface GenerationResult {
  urls: string[];
  needsRetry: boolean;
  error?: string;
}

export type { Page, Locator, Browser, BrowserContext };
