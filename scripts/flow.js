import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const HEADLESS = process.env.HEADLESS === "true";

const CONFIG = {
  url: "https://labs.google/fx/tools/flow",
  prompt: "请在这里填入你的提示词",
  // 根据截图可选：
  // "Animated GIF (270p)" / "Original size (720p)" / "Upscaled (1080p)" / "Upscaled (4K - 50 credits)"
  downloadOptionLabel: "Original size (720p)",
  // 生成模式下拉菜单
  modeOptionLabel: "Text to Video", // 可选: "Text to Video" / "Frames to Video" / "Ingredients to Video" / "Create Image"
  // Settings 里要选择的值（可选，留空则跳过）
  settings: {
    aspectRatio: "Portrait (9:16)", // 或 "Landscape (16:9)"
    outputsPerPrompt: "4", // 1/2/3/4
    model: "Veo 3.1 - Fast" // 例如: "Veo 3.1 - Quality"
  },
  // 使用 Playwright 登录态
  useExistingChromeProfile: false,
  storageStatePath: path.resolve("storageState.json"),
  // 如果页面元素名称不同，请在这里调整
  selectors: {
    newProjectButton: "New project",
    settingsButton: "Settings",
    promptTextareaId: "#PINHOLE_TEXT_AREA_ELEMENT_ID",
    promptPlaceholder: /Generate a video with text/i,
    modeButton: /Text to Video/i,
    createButton: "Create",
    progressPercent: /\\d{1,3}%/,
    firstFrameImage: "img[alt=\"Video thumbnail\"], img[alt=\"Generated image\"]",
    downloadButton: /download/i,
    moreOptionsButton: /more options/i
  },
  human: {
    minDelayMs: 120,
    maxDelayMs: 320,
    typeDelayMs: 60,
    mouseSteps: 18
  }
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toNameMatcher(value) {
  if (value instanceof RegExp) return value;
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

async function humanPause(page, min = CONFIG.human.minDelayMs, max = CONFIG.human.maxDelayMs) {
  await page.waitForTimeout(randInt(min, max));
}

async function humanType(locator, text) {
  await locator.click({ delay: randInt(60, 120) });
  for (const ch of text) {
    await locator.type(ch, { delay: randInt(40, CONFIG.human.typeDelayMs) });
  }
}

async function safeClick(locator, opts = {}) {
  await locator.waitFor({ state: "visible" });
  await locator.click({ delay: randInt(80, 160), ...opts });
}

async function openSettings(page) {
  const settingsBtn = page.getByRole("button", { name: CONFIG.selectors.settingsButton });
  await safeClick(settingsBtn);
  await humanPause(page, 400, 700);
}

async function selectMode(page) {
  if (!CONFIG.modeOptionLabel) return;
  let modeBtn = page.getByRole("button", { name: CONFIG.selectors.modeButton }).first();
  if (!(await modeBtn.count())) {
    modeBtn = page.getByRole("combobox").first();
  }
  if (!(await modeBtn.count())) return;
  await safeClick(modeBtn);
  const modeName = toNameMatcher(CONFIG.modeOptionLabel);
  let modeItem = page.getByRole("menuitem", { name: modeName }).first();
  if (!(await modeItem.count())) {
    modeItem = page.getByRole("menuitemradio", { name: modeName }).first();
  }
  if (!(await modeItem.count())) {
    modeItem = page.getByRole("option", { name: modeName }).first();
  }
  await safeClick(modeItem);
  await humanPause(page, 300, 600);
}

async function getSettingsRoot(page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Aspect Ratio" });
  if (await dialog.count()) return dialog.first();
  return page;
}

async function selectFromLabeledDropdown(page, root, labelText, optionText) {
  if (!optionText) return;
  const labelMatcher = toNameMatcher(labelText);

  // 1) 常见情况：按钮/combobox 的可访问名称包含标签文本
  let dropdown = root.getByRole("button", { name: labelMatcher }).first();
  if (!(await dropdown.count())) {
    dropdown = root.getByRole("combobox", { name: labelMatcher }).first();
  }

  // 2) 退化：从标签文本附近找按钮
  if (!(await dropdown.count())) {
    const label = root.getByText(labelText, { exact: true });
    const container = label.locator("..");
    dropdown = container.getByRole("button").first();
  }

  if (!(await dropdown.count())) {
    const textNode = root.getByText(labelMatcher).first();
    if (await textNode.count()) {
      const ancestorButton = textNode.locator(
        "xpath=ancestor-or-self::*[self::button or @role='button' or @role='combobox'][1]"
      );
      if (await ancestorButton.count()) {
        dropdown = ancestorButton.first();
      } else {
        dropdown = textNode;
      }
    } else {
      throw new Error(`未找到下拉框: ${labelText}`);
    }
  }

  await safeClick(dropdown);
  const optionName = toNameMatcher(optionText);
  let option = page.getByRole("menuitem", { name: optionName }).first();
  if (!(await option.count())) {
    option = page.getByRole("menuitemradio", { name: optionName }).first();
  }
  if (!(await option.count())) {
    option = page.getByRole("option", { name: optionName }).first();
  }
  await safeClick(option);
  await humanPause(page, 300, 600);
}

async function applySettings(page) {
  const { aspectRatio, outputsPerPrompt, model } = CONFIG.settings;
  const root = await getSettingsRoot(page);
  await root.getByText("Aspect Ratio").first().waitFor({ timeout: 10_000 });
  await selectFromLabeledDropdown(page, root, "Aspect Ratio", aspectRatio);
  await selectFromLabeledDropdown(page, root, "Outputs per prompt", outputsPerPrompt);
  await selectFromLabeledDropdown(page, root, "Model", model);
}

async function fillPrompt(page) {
  const byId = page.locator(CONFIG.selectors.promptTextareaId);
  const byPlaceholder = page.getByPlaceholder(CONFIG.selectors.promptPlaceholder);
  const promptBox = (await byId.count()) > 0 ? byId : byPlaceholder;
  await humanType(promptBox, CONFIG.prompt);
  await humanPause(page, 300, 600);
}

async function clickCreate(page) {
  const createBtn = page.getByRole("button", { name: CONFIG.selectors.createButton });
  await createBtn.waitFor({ state: "visible" });
  // 等按钮变为可点击
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (await createBtn.isEnabled()) break;
    await page.waitForTimeout(300);
  }
  await safeClick(createBtn);
}

async function waitForFirstFrame(page) {
  const progress = page.getByText(CONFIG.selectors.progressPercent);
  const frames = page.locator(CONFIG.selectors.firstFrameImage);

  // 进度百分比不一定稳定，先等出现，再等首帧
  try {
    await progress.first().waitFor({ timeout: 300_000 });
  } catch {
    // 忽略进度不存在的情况，直接等待首帧
  }

  await frames.first().waitFor({ timeout: 300_000 });

  const expected = Number.parseInt(CONFIG.settings.outputsPerPrompt || "1", 10);
  if (!Number.isNaN(expected) && expected > 1) {
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const count = await frames.count();
      if (count >= expected) break;
      await page.waitForTimeout(500);
    }
  }
  return frames;
}

async function findDownloadButton(page) {
  const roleBtn = page.getByRole("button", { name: CONFIG.selectors.downloadButton }).first();
  if (await roleBtn.count()) return roleBtn;
  const ariaBtn = page
    .locator(
      "button[aria-label*='Download'],button[aria-label*='download'],button[title*='Download'],button[title*='download']"
    )
    .first();
  if (await ariaBtn.count()) return ariaBtn;
  const iconBtn = page.locator("button:has(i:has-text('download'))").first();
  if (await iconBtn.count()) return iconBtn;
  return null;
}

async function openViewerFromFrame(page, frames) {
  const count = await frames.count();
  if (count === 0) return false;
  const frame = frames.first();
  await safeClick(frame);
  await humanPause(page, 400, 700);
  return true;
}

async function openDownloadMenuFromViewer(page) {
  // 顶部工具栏的下载按钮（可能只有图标）
  const downloadBtn = await findDownloadButton(page);
  if (downloadBtn) {
    await safeClick(downloadBtn);
    return true;
  }

  // 兜底：更多选项 -> Download
  const moreBtn = page.getByRole("button", { name: CONFIG.selectors.moreOptionsButton }).first();
  if (await moreBtn.count()) {
    await safeClick(moreBtn);
    const downloadMenu = page.getByRole("menuitem", { name: /download/i });
    if (await downloadMenu.count()) {
      await safeClick(downloadMenu.first());
      return true;
    }
  }
  return false;
}

async function main() {
  let context;
  const executablePath = findChromiumExecutablePath();
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 80 : 120,
    executablePath: executablePath || undefined
  });
  context = await browser.newContext({
    acceptDownloads: true,
    storageState: fs.existsSync(CONFIG.storageStatePath) ? CONFIG.storageStatePath : undefined
  });
  const page = await context.newPage();

  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await humanPause(page, 500, 900);

  // 1) New project
  const newProjectBtn = page.getByRole("button", { name: CONFIG.selectors.newProjectButton });
  await safeClick(newProjectBtn);
  await page.waitForURL(/\/project\//, { timeout: 60_000 });
  await humanPause(page, 500, 900);

  // 2) Settings
  await openSettings(page);
  await applySettings(page);

  // 3) 生成模式
  await selectMode(page);

  // 4) 输入提示词
  await fillPrompt(page);

  // 5) 生成
  await clickCreate(page);

  // 6) 等待进度百分比完成（直到出现首帧图）
  const frames = await waitForFirstFrame(page);

  // 7) 悬停显示下载按钮并点击
  const viewerOpened = await openViewerFromFrame(page, frames);
  if (!viewerOpened) {
    throw new Error("未找到首帧图，无法打开查看器。");
  }

  const opened = await openDownloadMenuFromViewer(page);
  if (!opened) {
    throw new Error("未找到下载入口，请确认下载按钮或菜单名称。");
  }

  // 8) 选择下载选项
  const downloadName = toNameMatcher(CONFIG.downloadOptionLabel);
  let downloadItem = page.getByRole("menuitem", { name: downloadName }).first();
  if (!(await downloadItem.count())) {
    downloadItem = page.getByRole("option", { name: downloadName }).first();
  }
  const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });
  await downloadItem.click({ delay: randInt(80, 160) });

  const download = await downloadPromise;
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  const suggested = download.suggestedFilename();
  const savePath = path.join(downloadsDir, suggested);
  await download.saveAs(savePath);

  await context.close();
}

function findChromiumExecutablePath() {
  const cacheDir = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (!fs.existsSync(cacheDir)) return null;
  const chromiumDirs = fs
    .readdirSync(cacheDir)
    .filter((name) => name.startsWith("chromium-"));
  for (const dir of chromiumDirs) {
    const base = path.join(cacheDir, dir);
    const candidates = [
      path.join(
        base,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      ),
      path.join(
        base,
        "chrome-mac",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
