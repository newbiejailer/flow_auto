# Flow Auto (Playwright)

基于 Playwright 的 Google Labs Flow 自动化工具，支持自动生成视频并下载。

## 安装

```bash
npm i
```

## 使用

```bash
# 1. 首次使用需要登录（保存登录态）
npm run login

# 2. 运行主脚本（需先修改 scripts/flow.js 中的 CONFIG）
npm run flow

# 或者通过命令行传入提示词
npm run flow:run -- "你的提示词"

# 从已有项目下载视频
npm run flow:download

# 无头模式运行（不显示浏览器窗口）
HEADLESS=true npm run flow:run -- "你的提示词"
```

## 配置

修改各脚本顶部的 `CONFIG` 对象：
- `prompt` - 生成提示词
- `settings.aspectRatio` - 宽高比：`"Portrait (9:16)"` / `"Landscape (16:9)"`
- `settings.outputsPerPrompt` - 每次生成数量：`"1"` / `"2"` / `"3"` / `"4"`
- `settings.model` - 模型：`"Veo 3.1 - Fast"` / `"Veo 3.1 - Quality"`
