# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概述

Flow Auto 是基于 Playwright 的自动化工具，用于操作 Google Labs Flow (labs.google/fx/tools/flow) 视频生成服务。脚本可自动创建项目、配置设置、提交提示词并下载生成的视频。

## 命令

```bash
# 安装依赖
npm i

# 手动登录并保存登录态
npm run login

# 运行主脚本（需先修改 scripts/flow.js 中的 CONFIG）
npm run flow

# 从已有项目 URL 下载视频
npm run flow:download

# 通过命令行参数传入提示词，生成并下载
npm run flow:run -- "你的提示词"

# 无头模式运行（不显示浏览器窗口）
HEADLESS=true npm run flow:run -- "你的提示词"
```

## 架构

**脚本 (`scripts/`)：**
- `login.js` - 打开浏览器让用户手动登录，登录后按 Enter 保存登录态到 storageState.json。
- `flow.js` - 完整流程：创建新项目、配置设置、提交提示词、等待生成、下载首个结果。需要编辑文件顶部的 `CONFIG` 对象设置提示词和偏好。
- `flow_run_and_download.js` - 相同流程，但通过命令行参数接收提示词，下载顶部一排所有生成的视频。
- `flow_download.js` - 从已有项目 URL 下载视频（在 CONFIG.url 中设置）。

**配置模式：**
所有脚本顶部都有 `CONFIG` 对象，包含：
- `url` - 目标 Flow URL
- `prompt` - 生成用的文本提示词
- `settings` - aspectRatio（宽高比）、outputsPerPrompt（每次生成数量）、model（模型选择）
- `selectors` - UI 元素的 CSS/role 选择器
- `human` - 模拟人工操作的延迟时间
- `storageStatePath` - Playwright 登录态存储路径

**登录态：**
脚本使用 `storageState.json` 保持登录状态。运行 `npm run login` 可手动登录并刷新该文件。

**输出：**
生成的视频保存到 `downloads/` 目录。

## Playwright 配置

- 超时：120 秒
- 默认非无头模式，可通过 `HEADLESS=true` 环境变量启用无头模式
- 视口：1440x900
- slowMo：非无头模式 120ms，无头模式 80ms
