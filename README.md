# Flow Auto

基于 Playwright 的 Google Labs Flow 自动化工具，支持自动生成视频并下载。

## 安装

```bash
npm i
```

## 使用

```bash
# 1. 首次使用需要登录（保存登录态）
npm run login

# 2. Text to Video 模式
npm run run -- "你的提示词"

# 3. Frames to Video 模式（需要首帧图）
npm run frames -- --first=./first.png "提示词"

# 4. Frames to Video 模式（首帧+尾帧）
npm run frames -- --first=./first.png --last=./last.png "提示词"

# 5. 从已有项目下载视频
npm run download

# 6. 无头模式运行（不显示浏览器窗口）
HEADLESS=true npm run run -- "你的提示词"
HEADLESS=true npm run frames -- --first=./first.png "提示词"
```

## 配置

默认配置在 `src/config.ts` 中定义：

- `settings.aspectRatio` - 宽高比：`"Portrait (9:16)"` / `"Landscape (16:9)"`
- `settings.outputsPerPrompt` - 每次生成数量：`"1"` / `"2"` / `"3"` / `"4"`
- `settings.model` - 模型：`"Veo 3.1 - Fast"` / `"Veo 3.1 - Quality"`

## 项目结构

```
flow_auto/
├── src/
│   ├── types.ts              # 类型定义
│   ├── config.ts             # 默认配置
│   ├── browser.ts            # 浏览器管理
│   ├── utils/
│   │   ├── random.ts         # 随机数和延迟
│   │   ├── interaction.ts    # 人性化交互
│   │   └── logger.ts         # 日志工具
│   ├── actions/
│   │   ├── settings.ts       # 设置面板操作
│   │   ├── mode.ts           # 模式选择
│   │   ├── prompt.ts         # 提示词填写
│   │   ├── create.ts         # 创建按钮
│   │   └── popups.ts         # 弹窗处理
│   ├── video/
│   │   ├── detect.ts         # 视频检测
│   │   └── download.ts       # 视频下载
│   └── frames/
│       └── upload.ts         # 帧上传
├── scripts/
│   ├── login.ts              # 登录脚本
│   ├── run.ts                # Text to Video
│   ├── frames.ts             # Frames to Video
│   └── download.ts           # 下载已有项目
├── tsconfig.json
└── package.json
```

## 开发

```bash
# 类型检查
npm run build
```
