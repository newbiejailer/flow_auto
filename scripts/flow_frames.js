import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HEADLESS = process.env.HEADLESS === "true";

const CONFIG = {
  url: "https://labs.google/fx/tools/flow/project/bfbe3491-8255-4e3a-ba4d-b169b19b12b2",
  storageStatePath: path.resolve("storageState.json"),
  prompt: "",
  firstFramePath: "",
  lastFramePath: "",
  settings: {
    aspectRatio: "Portrait (9:16)",
    outputsPerPrompt: "4",
    model: "Veo 3.1 - Fast"
  },
  minOutputs: 1,
  maxWaitMs: 300_000,
  stableChecks: 3,
  maxRetries: 5,
  modeOptionLabel: "Frames to Video",
  selectors: {
    newProjectButton: "New project",
    settingsButton: "Settings",
    promptTextareaId: "#PINHOLE_TEXT_AREA_ELEMENT_ID",
    promptPlaceholder: /Generate a video with text/i,
    modeButton: /Frames to Video/i,
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
  const dismissSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button[aria-label="关闭"]',
    '[role="dialog"] button[aria-label*="close" i]',
    '[role="dialog"] button[aria-label*="dismiss" i]',
    '[role="dialog"] button:has-text("Got it")',
    '[role="dialog"] button:has-text("OK")',
    '[role="dialog"] button:has-text("Close")',
    '[role="dialog"] button:has-text("Dismiss")',
    '[role="dialog"] button:has-text("Skip")',
    '[role="dialog"] button:has-text("Not now")',
    '[role="dialog"] button.close-button',
    '[role="dialog"] [class*="close"]',
    '[role="dialog"] [class*="dismiss"]',
    // 常见的通知/提示弹窗
    'button:has-text("Dismiss")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("I understand")',
    'button:has-text("Continue")',
    '[class*="snackbar"] button',
    '[class*="toast"] button',
    '[class*="notification"] button',
    '[class*="banner"] button:has-text("Dismiss")',
    '[class*="banner"] button:has-text("Close")'
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

    if (!dismissed) break;
  }

  return totalDismissed;
}

async function openSettings(page) {
  const settingsBtn = page.getByRole("button", { name: CONFIG.selectors.settingsButton });

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

async function uploadFrame(page, filePath, label, isFirstFrame = true) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label}文件不存在: ${absolutePath}`);
  }

  // 上传前检查并关闭可能的弹窗
  await dismissPopups(page);

  // 查找底部输入框区域的帧上传按钮
  // 这些按钮在页面底部，输入框下方，文字是 "add"
  const frameUploadButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const candidates = buttons.filter(btn => {
      const rect = btn.getBoundingClientRect();
      const text = btn.textContent?.trim() || '';
      return (
        rect.top > window.innerHeight * 0.75 &&
        text === 'add' &&
        rect.width > 40 &&
        rect.width < 100
      );
    });
    candidates.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
    return candidates.map((btn, i) => ({
      index: i,
      x: btn.getBoundingClientRect().x,
      y: btn.getBoundingClientRect().y
    }));
  });

  if (frameUploadButtons.length < 1) {
    const screenshotPath = path.resolve(process.cwd(), `debug_upload_${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error(`找不到帧上传按钮`);
  }

  // 使用坐标定位按钮
  // 注意：首帧上传后，左边变成图片预览，只剩右边的尾帧 "add" 按钮
  // 所以尾帧上传时 frameUploadButtons 只有一个元素，用索引 0
  const targetBtnInfo = frameUploadButtons[0];
  const addButtons = page.locator('button:has-text("add")');

  // 根据位置筛选正确的按钮
  let targetBtn = null;
  const allAddBtns = await addButtons.all();
  for (const btn of allAddBtns) {
    const box = await btn.boundingBox();
    if (box && Math.abs(box.x - targetBtnInfo.x) < 10 && Math.abs(box.y - targetBtnInfo.y) < 10) {
      targetBtn = btn;
      break;
    }
  }

  if (targetBtn) {
    await targetBtn.click({ delay: randInt(80, 160) });
  } else {
    await page.mouse.click(targetBtnInfo.x + 32, targetBtnInfo.y + 20);
  }
  await page.waitForTimeout(1000);

  // 检查是否有阻断性弹窗（非图片库弹窗）
  // 图片库弹窗应该会显示 "Upload" 按钮
  const uploadBtnVisible = await page.locator('text=Upload').first().isVisible({ timeout: 1000 }).catch(() => false);
  if (!uploadBtnVisible) {
    // 没有看到图片库弹窗，可能有其他弹窗阻断了
    const dismissed = await dismissPopups(page);
    if (dismissed > 0) {
      log(`  已关闭 ${dismissed} 个阻断弹窗，重新点击上传按钮...`);
      await page.waitForTimeout(1000);
      // 使用坐标重新点击（因为按钮引用可能失效）
      await page.mouse.click(targetBtnInfo.x + 32, targetBtnInfo.y + 20);
      await page.waitForTimeout(1000);
    }
  }

  // 截图查看弹窗状态
  const afterAddClickScreenshot = path.resolve(process.cwd(), `debug_after_add_click_${label}.png`);
  await page.screenshot({ path: afterAddClickScreenshot, fullPage: true });
  log(`  调试截图: ${afterAddClickScreenshot}`);

  // 点击弹窗中的 "Upload" 按钮触发文件选择器
  const uploadBtn = page.locator('text=Upload').first();
  await uploadBtn.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(1000);

  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
  await uploadBtn.click({ delay: randInt(80, 160) });

  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(absolutePath);

  // 等待裁剪界面出现
  await page.waitForTimeout(2000);

  // 只在首帧时选择裁剪比例（Crop and Save 按钮左边的下拉菜单）
  if (isFirstFrame) {
    try {
      const aspectBtn = page.locator('button:has-text("Landscape"), button:has-text("Portrait"), button:has-text("Square")').first();
      if (await aspectBtn.isVisible({ timeout: 3000 })) {
        await page.waitForTimeout(1000);
        await aspectBtn.click({ delay: randInt(80, 160) });
        await page.waitForTimeout(1500);

        const targetAspect = CONFIG.settings.aspectRatio.includes("9:16") ? "Portrait" :
                            CONFIG.settings.aspectRatio.includes("16:9") ? "Landscape" : "Portrait";
        const aspectOption = page.locator(`text=${targetAspect}`).first();
        if (await aspectOption.isVisible({ timeout: 3000 })) {
          await aspectOption.click({ delay: randInt(80, 160) });
          log(`  已选择裁剪比例: ${targetAspect}`);
          await page.waitForTimeout(2000);
        }
      }
    } catch (err) {
      log(`  选择裁剪比例时出错: ${err.message}`);
    }
  }

  // 点击 "Crop and Save" 按钮确认上传
  const cropSaveBtn = page.locator('button:has-text("Crop and Save")');
  try {
    await cropSaveBtn.waitFor({ state: "visible", timeout: 10000 });
    await cropSaveBtn.click({ delay: randInt(80, 160) });
    log(`  已点击 Crop and Save`);
    await page.waitForTimeout(3000);
  } catch (err) {
    log(`  未找到 Crop and Save 按钮: ${err.message}`);
  }

  // 关闭图片库弹窗（按 Escape）
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);

  log(`  ${label}已上传: ${path.basename(filePath)}`);
}

async function uploadFrames(page) {
  // 上传首帧（必需）
  log("  上传首帧图...");
  await uploadFrame(page, CONFIG.firstFramePath, "首帧图", true);
  await page.waitForTimeout(2000);

  // 上传尾帧（可选）
  if (CONFIG.lastFramePath) {
    log("  上传尾帧图...");
    await uploadFrame(page, CONFIG.lastFramePath, "尾帧图", false);
    await page.waitForTimeout(1000);
  }
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
  let lastLogTime = 0;
  while (Date.now() - start < 120_000) {
    if (await createBtn.isEnabled()) break;
    // 每 10 秒打印一次状态
    if (Date.now() - lastLogTime > 10000) {
      log(`  等待 Create 按钮启用... (${Math.floor((Date.now() - start) / 1000)}s)`);
      lastLogTime = Date.now();
    }
    await page.waitForTimeout(500);
  }
  if (!(await createBtn.isEnabled())) {
    const screenshotPath = path.resolve(process.cwd(), "debug_create_disabled.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`  调试截图已保存: ${screenshotPath}`);
    throw new Error("Create 按钮始终处于禁用状态");
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

async function checkGenerationFailed(page) {
  // 检测页面是否显示 "Failed Generation"
  const failedText = page.locator('text=Failed Generation').first();
  try {
    return await failedText.isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function retryGeneration(page) {
  // 点击 "reuse prompt" 按钮重试
  const reuseBtn = page.locator('button:has-text("reuse prompt"), button:has-text("Reuse prompt"), button:has-text("Reuse Prompt")').first();
  try {
    await reuseBtn.waitFor({ state: "visible", timeout: 5000 });
    await reuseBtn.click({ delay: randInt(80, 160) });
    await page.waitForTimeout(2000);

    // 点击生成按钮
    const createBtn = page.getByRole("button", { name: CONFIG.selectors.createButton });
    await createBtn.waitFor({ state: "visible", timeout: 5000 });
    if (await createBtn.isEnabled()) {
      await safeClick(createBtn);
      return true;
    }
  } catch (err) {
    log(`  重试操作失败: ${err.message}`);
  }
  return false;
}

async function waitForNewTopRow(page, expectedCount, baseline, timeoutMs) {
  const start = Date.now();
  let lastUrls = [];
  let stableCount = 0;
  let lastNonBaseline = [];
  let lastLoggedCount = -1;
  let retryCount = 0;
  let lastPopupCheck = 0;

  while (Date.now() - start < timeoutMs) {
    // 每 30 秒检查一次是否有弹窗
    if (Date.now() - lastPopupCheck > 30000) {
      await dismissPopups(page);
      lastPopupCheck = Date.now();
    }

    // 检测是否生成失败
    if (await checkGenerationFailed(page)) {
      retryCount++;
      if (retryCount > CONFIG.maxRetries) {
        log(`  生成失败，已达到最大重试次数 (${CONFIG.maxRetries})`);
        break;
      }
      log(`  检测到生成失败，等待1分钟后重试 (${retryCount}/${CONFIG.maxRetries})...`);
      await page.waitForTimeout(60000);

      if (await retryGeneration(page)) {
        log(`  已点击重试，继续等待生成...`);
        // 重置状态
        lastUrls = [];
        stableCount = 0;
        lastLoggedCount = -1;
      }
      continue;
    }

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

    if (urls.length !== lastLoggedCount) {
      log(`  等待生成中... 已生成 ${urls.length}/${expectedCount} 个视频 (${elapsedSec}s)`);
      lastLoggedCount = urls.length;
    }

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

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { first: "", last: "", prompt: "" };
  const promptParts = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--first" && args[i + 1]) {
      result.first = args[++i];
    } else if (args[i] === "--last" && args[i + 1]) {
      result.last = args[++i];
    } else if (args[i].startsWith("--first=")) {
      result.first = args[i].slice(8);
    } else if (args[i].startsWith("--last=")) {
      result.last = args[i].slice(7);
    } else {
      promptParts.push(args[i]);
    }
  }
  result.prompt = promptParts.join(" ").trim();

  if (!result.first) {
    console.error("错误: 必须提供首帧图 --first=<path>");
    console.error('用法: npm run flow:frames -- --first=./first.png [--last=./last.png] "提示词"');
    process.exit(1);
  }
  if (!result.prompt) {
    console.error("错误: 必须提供提示词");
    console.error('用法: npm run flow:frames -- --first=./first.png [--last=./last.png] "提示词"');
    process.exit(1);
  }
  return result;
}

async function main() {
  const args = parseArgs();
  CONFIG.firstFramePath = args.first;
  CONFIG.lastFramePath = args.last || "";
  CONFIG.prompt = args.prompt;

  log("========================================");
  log("Flow Auto (Frames to Video) 开始运行");
  log(`模式: ${HEADLESS ? "无头" : "有头"}`);
  log(`首帧图: ${CONFIG.firstFramePath}`);
  if (CONFIG.lastFramePath) {
    log(`尾帧图: ${CONFIG.lastFramePath}`);
  }
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

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  log("  浏览器已启动");

  logStep("打开项目页面");
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await humanPause(page, 1500, 2000);
  log("  页面加载完成");

  const popupCount = await dismissPopups(page);
  if (popupCount > 0) {
    log(`  已关闭 ${popupCount} 个弹窗`);
  }
  await humanPause(page, 500, 800);

  logStep("选择生成模式");
  await dismissPopups(page);
  await selectMode(page);
  log(`  模式: ${CONFIG.modeOptionLabel}`);
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  logStep("配置设置");
  await dismissPopups(page);
  await openSettings(page);
  await applySettings(page);
  log(`  宽高比: ${CONFIG.settings.aspectRatio}`);
  log(`  生成数量: ${CONFIG.settings.outputsPerPrompt}`);
  log(`  模型: ${CONFIG.settings.model}`);
  await dismissPopups(page);

  logStep("上传帧图片");
  await dismissPopups(page);
  await uploadFrames(page);
  await dismissPopups(page);

  logStep("输入提示词");
  await dismissPopups(page);
  await fillPrompt(page);
  log("  提示词已填入");
  await dismissPopups(page);

  logStep("开始生成");
  await dismissPopups(page);
  const baseline = await getTopRowVideoUrls(page);
  await clickCreate(page);
  await humanPause(page, 500, 800);

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
    const filename = `flow_frames_${Date.now()}_${idx}.mp4`;
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
