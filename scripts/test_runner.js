import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TARGET_SUCCESS = 20;
const TEST_DIR = path.resolve(process.cwd(), "test");

// 确保 test 目录存在
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

let successCount = 0;
let failCount = 0;
const results = [];

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString("zh-CN", { hour12: false });
}

function getDateTimeFolder() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${min}${sec}`;
}

async function runTest(testNum) {
  const folderName = getDateTimeFolder();
  const testFolder = path.join(TEST_DIR, folderName);
  fs.mkdirSync(testFolder, { recursive: true });

  console.log(`\n[${getTimestamp()}] ========== 测试 #${testNum} 开始 ==========`);
  console.log(`[${getTimestamp()}] 测试文件夹: ${folderName}`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";

    const child = spawn("node", ["scripts/flow_frames.js",
      "--first=./test_frames/火影换头_K1.jpeg",
      "--last=./test_frames/火影换头_K2.jpeg",
      "女子弯下腰抱住男子"
    ], {
      env: {
        ...process.env,
        HEADLESS: "true",
        DOWNLOAD_DIR: testFolder
      },
      cwd: process.cwd()
    });

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const success = code === 0;

      if (success) {
        successCount++;
        console.log(`[${getTimestamp()}] ✓ 测试 #${testNum} 成功 (耗时 ${duration}s)`);

        // 移动 downloads 文件夹中的视频到测试文件夹
        const downloadsDir = path.resolve(process.cwd(), "downloads");
        if (fs.existsSync(downloadsDir)) {
          const files = fs.readdirSync(downloadsDir);
          const recentFiles = files.filter(f => f.startsWith("flow_frames_") && f.endsWith(".mp4"));
          // 只移动最近的文件（根据文件名中的时间戳）
          const sortedFiles = recentFiles.sort().reverse();
          const filesToMove = sortedFiles.slice(0, 4); // 最多4个视频

          for (const file of filesToMove) {
            const src = path.join(downloadsDir, file);
            const dest = path.join(testFolder, file);
            try {
              fs.renameSync(src, dest);
            } catch {
              // 如果移动失败，尝试复制
              fs.copyFileSync(src, dest);
              fs.unlinkSync(src);
            }
          }
          console.log(`[${getTimestamp()}]   已移动 ${filesToMove.length} 个视频到测试文件夹`);
        }
      } else {
        failCount++;
        console.log(`[${getTimestamp()}] ✗ 测试 #${testNum} 失败 (耗时 ${duration}s)`);

        // 保存日志
        const logPath = path.join(testFolder, "error_log.txt");
        fs.writeFileSync(logPath, output);
        console.log(`[${getTimestamp()}]   日志已保存: ${logPath}`);

        // 移动调试截图
        const debugFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith("debug_"));
        for (const file of debugFiles) {
          const src = path.join(process.cwd(), file);
          const dest = path.join(testFolder, file);
          try {
            fs.renameSync(src, dest);
          } catch {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
          }
        }
      }

      results.push({
        testNum,
        folder: folderName,
        success,
        duration,
        timestamp: new Date().toISOString()
      });

      console.log(`[${getTimestamp()}] 当前统计: 成功 ${successCount}/${TARGET_SUCCESS}, 失败 ${failCount}`);
      resolve(success);
    });
  });
}

async function generateReport() {
  const reportPath = path.join(TEST_DIR, "test_report.md");

  const successResults = results.filter(r => r.success);
  const failResults = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const avgDuration = results.length > 0 ? Math.round(totalDuration / results.length) : 0;

  let content = `# Flow Frames 自动化测试报告

## 测试概要

| 项目 | 数值 |
|------|------|
| 测试目标 | ${TARGET_SUCCESS} 次成功 |
| 总测试次数 | ${results.length} |
| 成功次数 | ${successCount} |
| 失败次数 | ${failCount} |
| 成功率 | ${results.length > 0 ? ((successCount / results.length) * 100).toFixed(1) : 0}% |
| 总耗时 | ${Math.round(totalDuration / 60)} 分钟 |
| 平均单次耗时 | ${avgDuration} 秒 |

## 测试配置

- 模式: 无头模式 (Headless)
- 首帧图: \`test_frames/火影换头_K1.jpeg\`
- 尾帧图: \`test_frames/火影换头_K2.jpeg\`
- 提示词: \`女子弯下腰抱住男子\`

## 详细结果

### 成功的测试 (${successResults.length})

| # | 文件夹 | 耗时 | 时间 |
|---|--------|------|------|
${successResults.map(r => `| ${r.testNum} | ${r.folder} | ${r.duration}s | ${r.timestamp.split('T')[1].split('.')[0]} |`).join('\n')}

### 失败的测试 (${failResults.length})

| # | 文件夹 | 耗时 | 时间 |
|---|--------|------|------|
${failResults.length > 0 ? failResults.map(r => `| ${r.testNum} | ${r.folder} | ${r.duration}s | ${r.timestamp.split('T')[1].split('.')[0]} |`).join('\n') : '| - | - | - | - |'}

## 测试时间

- 开始: ${results.length > 0 ? results[0].timestamp : '-'}
- 结束: ${results.length > 0 ? results[results.length - 1].timestamp : '-'}

---
*报告生成时间: ${new Date().toISOString()}*
`;

  fs.writeFileSync(reportPath, content);
  console.log(`\n[${getTimestamp()}] 测试报告已生成: ${reportPath}`);
}

async function main() {
  console.log("========================================");
  console.log("Flow Frames 自动化测试开始");
  console.log(`目标: ${TARGET_SUCCESS} 次成功`);
  console.log("========================================");

  let testNum = 0;

  while (successCount < TARGET_SUCCESS) {
    testNum++;
    await runTest(testNum);

    // 测试间隔 5 秒
    if (successCount < TARGET_SUCCESS) {
      console.log(`[${getTimestamp()}] 等待 5 秒后开始下一次测试...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log("\n========================================");
  console.log("测试完成!");
  console.log(`总测试次数: ${testNum}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${failCount}`);
  console.log("========================================");

  await generateReport();
}

main().catch(console.error);
