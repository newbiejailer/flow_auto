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

# Text to Video 模式
npm run run -- "你的提示词"

# Frames to Video 模式（需要首帧图）
npm run frames -- --first=./first.png "提示词"

# Frames to Video 模式（首帧+尾帧）
npm run frames -- --first=./first.png --last=./last.png "提示词"

# 从已有项目 URL 下载视频
npm run download

# 无头模式运行（不显示浏览器窗口）
HEADLESS=true npm run run -- "你的提示词"

# 类型检查
npm run build
```

## 架构

**共享模块 (`src/`)：**
- `types.ts` - TypeScript 类型定义
- `config.ts` - 默认配置和选择器
- `browser.ts` - 浏览器启动和上下文管理
- `utils/random.ts` - 随机数、延迟、正则工具
- `utils/interaction.ts` - 人性化交互（点击、输入）
- `utils/logger.ts` - 日志和步骤计数

**动作模块 (`src/actions/`)：**
- `settings.ts` - 打开设置面板、应用配置
- `mode.ts` - 选择生成模式
- `prompt.ts` - 填写提示词
- `create.ts` - 点击创建按钮
- `popups.ts` - 关闭弹窗

**视频处理 (`src/video/`)：**
- `detect.ts` - 检测视频 URL、等待生成完成
- `download.ts` - 下载视频文件

**帧处理 (`src/frames/`)：**
- `upload.ts` - 上传首帧/尾帧图片

**入口脚本 (`scripts/`)：**
- `login.ts` - 打开浏览器让用户手动登录，登录后按 Enter 保存登录态
- `run.ts` - Text to Video 模式：创建新项目、配置、生成、下载
- `frames.ts` - Frames to Video 模式：上传帧图、配置、生成、下载
- `download.ts` - 从已有项目 URL 下载视频

**配置：**
`src/config.ts` 中的 `createConfig()` 和 `createFramesConfig()` 函数创建配置对象，包含：
- `url` - 目标 Flow URL
- `prompt` - 生成用的文本提示词
- `settings` - aspectRatio、outputsPerPrompt、model
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
