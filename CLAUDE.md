# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概述

Flow Auto 是基于 Playwright 的自动化工具，用于操作 Google Labs Flow (labs.google/fx/tools/flow) 视频生成服务。脚本可自动创建项目、配置设置、提交提示词并下载生成的视频。

## 前置要求

由于 Google Flow 会检测自动化浏览器指纹，脚本需要通过 CDP (Chrome DevTools Protocol) 连接到真实的 Chrome 浏览器。

## 命令

```bash
# 安装依赖
npm i

# 启动 Chrome 调试模式并登录（首次使用或需要重新登录时）
npm run login

# Text to Video 模式
npm run run -- "你的提示词"

# Frames to Video 模式（需要首帧图）
npm run frames -- --first=./first.png "提示词"

# Frames to Video 模式（首帧+尾帧）
npm run frames -- --first=./first.png --last=./last.png "提示词"

# 从已有项目 URL 下载视频
npm run download

# 类型检查
npm run build
```

## 架构

**共享模块 (`src/`)：**
- `types.ts` - TypeScript 类型定义
- `config.ts` - 默认配置和选择器
- `browser.ts` - 通过 CDP 连接 Chrome 浏览器
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
- `login.ts` - 启动 Chrome 调试模式，等待用户登录
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

**登录态：**
脚本通过 CDP 连接到已启动的 Chrome，直接使用 Chrome 中的登录状态，无需单独保存。

**输出：**
生成的视频保存到 `downloads/` 目录。

## 浏览器连接

脚本通过 CDP 连接到本地 9222 端口的 Chrome 实例：
- 连接地址：`http://127.0.0.1:9222`
- 复用已有的浏览器上下文和登录状态
- 优先使用已打开的 Flow 页面，否则创建新标签页
