import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HEADLESS = process.env.HEADLESS === "true";

const CONFIG = {
  url: "https://labs.google/fx/tools/flow",
  storageStatePath: path.resolve("storageState.json"),
  prompt: "",
  settings: {
    aspectRatio: "Portrait (9:16)",
    outputsPerPrompt: "4",
    model: "Veo 3.1 - Fast"
  },
  minOutputs: 1,
  maxWaitMs: 300_000,
  stableChecks: 3,
  modeOptionLabel: "Text to Video",
  selectors: {
    newProjectButton: "New project",
    settingsButton: "Settings",
    promptTextareaId: "#PINHOLE_TEXT_AREA_ELEMENT_ID",
    promptPlaceholder: /Generate a video with text/i,
    modeButton: /Text to Video/i,
    createButton: "Create",
    tileContainer: "[data-virtuoso-scroller] [data-index]"
  },
  human: {
    minDelayMs: 120,
    maxDelayMs: 320,
    typeDelayMs: 60
  }
};

let currentStep = 0;
function log(message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${timestamp}] ${message}`);
}

function logStep(message) {
  currentStep++;
  log(`[步骤 ${currentStep}] ${message}`);
}

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

async function dismissPopups(page, maxAttempts = 3) {
  // 尝试关闭可能出现的弹窗
  const dismissSelectors = [
    // 常见关闭按钮
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button[aria-label="关闭"]',
    '[role="dialog"] button[aria-label*="close" i]',
    '[role="dialog"] button[aria-label*="dismiss" i]',
    // 常见文字按钮
    '[role="dialog"] button:has-text("Got it")',
    '[role="dialog"] button:has-text("OK")',
    '[role="dialog"] button:has-text("Close")',
    '[role="dialog"] button:has-text("Dismiss")',
    '[role="dialog"] button:has-text("Skip")',
    '[role="dialog"] button:has-text("Not now")',
    // Material Design 风格关闭按钮
    '[role="dialog"] button.close-button',
    '[role="dialog"] [class*="close"]',
    '[role="dialog"] [class*="dismiss"]'
  ];

  let totalDismissed = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let dismissed = false;

    for (const selector of dismissSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click({ delay: randInt(80, 160) });
          dismissed = true;
          totalDismissed++;
          await humanPause(page, 300, 500);
          break;
        }
      } catch {
        // 忽略找不到元素的错误
      }
    }

    // 如果没找到按钮，尝试按 Escape 关闭
    if (!dismissed) {
      const dialog = page.locator('[role="dialog"]').first();
      try {
        if (await dialog.isVisible({ timeout: 500 })) {
          await page.keyboard.press("Escape");
          await humanPause(page, 300, 500);
          dismissed = true;
          totalDismissed++;
        }
      } catch {
        // 忽略
      }
    }

    // 如果这次没有关闭任何弹窗，说明没有更多弹窗了
    if (!dismissed) break;
  }

  return totalDismissed;
}

async function openSettings(page) {
  const settingsBtn = page.getByRole("button", { name: CONFIG.selectors.settingsButton });

  // 等待按钮出现
  try {
    await settingsBtn.waitFor({ state: "visible", timeout: 15000 });
  } catch (err) {
    const screenshotPath = path.resolve(process.cwd(), "debug_settings_btn.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(`找不到 Settings 按钮: ${err.message}`);
  }

  await safeClick(settingsBtn);
  await humanPause(page, 800, 1200);

  // 等待设置对话框出现
  const dialog = page.getByRole("dialog");
  try {
    await dialog.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // 对话框可能不是 role="dialog"，继续尝试
  }
  await humanPause(page, 300, 500);
}

async function getSettingsRoot(page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Aspect Ratio" });
  if (await dialog.count()) return dialog.first();
  return page;
}

async function selectFromLabeledDropdown(page, root, labelText, optionText) {
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

  try {
    await root.getByText("Aspect Ratio").first().waitFor({ timeout: 15_000 });
  } catch (err) {
    const screenshotPath = path.resolve(process.cwd(), "debug_settings_dialog.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(`Settings 对话框未正常打开: ${err.message}`);
  }

  await selectFromLabeledDropdown(page, root, "Aspect Ratio", aspectRatio);
  await selectFromLabeledDropdown(page, root, "Outputs per prompt", outputsPerPrompt);
  await selectFromLabeledDropdown(page, root, "Model", model);
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

async function fillPrompt(page) {
  const byId = page.locator(CONFIG.selectors.promptTextareaId);
  const byPlaceholder = page.getByPlaceholder(CONFIG.selectors.promptPlaceholder);
  const promptBox = (await byId.count()) > 0 ? byId : byPlaceholder;
  await promptBox.click();
  await promptBox.fill(CONFIG.prompt);
  await humanPause(page, 300, 600);
}

async function clickCreate(page) {
  const createBtn = page.getByRole("button", { name: CONFIG.selectors.createButton });
  await createBtn.waitFor({ state: "visible" });
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (await createBtn.isEnabled()) break;
    await page.waitForTimeout(300);
  }
  await safeClick(createBtn);
}

async function getTopRowVideoUrls(page) {
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-virtuoso-scroller] [data-index]"));
    if (rows.length === 0) return [];
    const rowWithVideos = rows.find((row) => row.querySelectorAll("video").length > 0) || null;
    if (!rowWithVideos) return [];
    const videos = Array.from(rowWithVideos.querySelectorAll("video"));
    const urls = [];
    for (const video of videos) {
      const src = video.getAttribute("src") || video.currentSrc || "";
      if (src) urls.push(src);
    }
    return urls;
  });
}

async function waitForNewTopRow(page, expectedCount, baseline, timeoutMs) {
  const start = Date.now();
  let lastUrls = [];
  let stableCount = 0;
  let lastNonBaseline = [];
  let lastLoggedCount = -1;

  while (Date.now() - start < timeoutMs) {
    const urls = await getTopRowVideoUrls(page);
    const elapsedSec = Math.floor((Date.now() - start) / 1000);

    const sameAsLast =
      urls.length === lastUrls.length && urls.every((u, i) => u === lastUrls[i]);
    if (sameAsLast && urls.length > 0) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastUrls = urls;
    }

    const sameAsBaseline =
      baseline.length === urls.length && baseline.every((u, i) => u === urls[i]);

    if (!sameAsBaseline && urls.length > 0) {
      lastNonBaseline = urls;
    }

    // 只在数量变化时打印日志
    if (urls.length !== lastLoggedCount) {
      log(`  等待生成中... 已生成 ${urls.length}/${expectedCount} 个视频 (${elapsedSec}s)`);
      lastLoggedCount = urls.length;
    }

    // 数量达到期望值且稳定后结束
    if (
      !sameAsBaseline &&
      urls.length >= expectedCount &&
      stableCount >= CONFIG.stableChecks
    ) {
      log(`  生成完成，共 ${urls.length} 个视频`);
      return urls;
    }

    await page.waitForTimeout(1000);
  }

  log(`  等待超时，已获取 ${lastNonBaseline.length} 个视频`);

  // 保存截图用于调试
  if (lastNonBaseline.length === 0) {
    const screenshotPath = path.resolve(process.cwd(), "debug_timeout.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  已保存调试截图: ${screenshotPath}`);
  }

  return lastNonBaseline;
}

async function downloadFile(url, savePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  await fs.promises.writeFile(savePath, Buffer.from(arrayBuffer));
}

async function main() {
  const promptArg = process.argv.slice(2).join(" ").trim();
  if (!promptArg) {
    console.error("用法: npm run flow:run -- \"你的提示词\"");
    process.exit(1);
  }
  CONFIG.prompt = promptArg;

  log("========================================");
  log("Flow Auto 开始运行");
  log(`模式: ${HEADLESS ? "无头" : "有头"}`);
  log(`提示词: ${CONFIG.prompt}`);
  log("========================================");

  logStep("启动浏览器");
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 80 : 120,
    args: HEADLESS
      ? [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--no-sandbox"
        ]
      : []
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    storageState: fs.existsSync(CONFIG.storageStatePath) ? CONFIG.storageStatePath : undefined,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 隐藏 webdriver 特征
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  log("  浏览器已启动");

  logStep("打开 Flow 页面");
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await humanPause(page, 500, 900);
  log("  页面加载完成");

  logStep("创建新项目");
  const newProjectBtn = page.getByRole("button", { name: CONFIG.selectors.newProjectButton });
  await safeClick(newProjectBtn);
  await page.waitForURL(/\/project\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await humanPause(page, 1000, 1500);
  log("  已进入项目页面");

  // 关闭可能出现的弹窗
  const popupCount = await dismissPopups(page);
  if (popupCount > 0) {
    log(`  已关闭 ${popupCount} 个弹窗`);
  }
  await humanPause(page, 500, 800);

  logStep("配置设置");
  await openSettings(page);
  await applySettings(page);
  log(`  宽高比: ${CONFIG.settings.aspectRatio}`);
  log(`  生成数量: ${CONFIG.settings.outputsPerPrompt}`);
  log(`  模型: ${CONFIG.settings.model}`);

  logStep("选择生成模式");
  await selectMode(page);
  log(`  模式: ${CONFIG.modeOptionLabel}`);

  logStep("输入提示词");
  await fillPrompt(page);
  log("  提示词已填入");

  logStep("开始生成");
  const baseline = await getTopRowVideoUrls(page);
  await clickCreate(page);
  await humanPause(page, 500, 800);

  // 检查是否有错误提示
  const errorMsg = page.locator('[role="alert"], .error-message').first();
  try {
    if (await errorMsg.isVisible({ timeout: 1000 })) {
      const text = await errorMsg.textContent();
      if (text && text.length > 5 && !/^flow$/i.test(text.trim())) {
        log(`  警告: 页面显示错误信息 - ${text}`);
      }
    }
  } catch {
    // 没有错误信息，继续
  }

  log("  已点击创建按钮，等待生成...");

  const expected = Number.parseInt(CONFIG.settings.outputsPerPrompt || "1", 10) || 1;
  const urls = await waitForNewTopRow(page, expected, baseline, CONFIG.maxWaitMs);
  if (urls.length < CONFIG.minOutputs) {
    throw new Error("未检测到新生成的视频链接。");
  }

  logStep("下载视频");
  const downloadsDir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  let idx = 1;
  for (const url of urls) {
    const filename = `flow_${Date.now()}_${idx}.mp4`;
    const savePath = path.join(downloadsDir, filename);
    log(`  下载中 (${idx}/${urls.length}): ${filename}`);
    await downloadFile(url, savePath);
    idx += 1;
    await humanPause(page, 300, 600);
  }
  log(`  全部下载完成，保存到: ${downloadsDir}`);

  logStep("清理并退出");
  await context.close();
  await browser.close();

  log("========================================");
  log("运行完成");
  log("========================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
