# Google Antigravity Web UI

基于 [Google Antigravity CLI](https://antigravity.google)（命令名 `agy`/`antigravity`）的 Web 界面：在浏览器里选模型、多轮对话、权限确认、模型/插件管理。

> 一个轻量 Node.js（Express + 原生前端）WebUI，直接包装本机的 Antigravity CLI，不直连后端 API、不存储你的模型密钥。

## 功能

- **真实接入 agy CLI**：对话、模型列表、登录均调用本机 `antigravity` 命令，不依赖 mock。
- **多模型目录**：自动从 `antigravity models` 拉取可用模型（Gemini / Claude / GPT-OSS 等多 provider）。
- **多轮会话**：用官方 `--conversation <id>` 续接，前端按会话保存、支持新建/删除/续聊。
- **灵敏度与权限策略**：`--effort`（low/medium/high）、`--mode plan`（只读计划）/ `--sandbox`（沙箱）/ `--dangerously-skip-permissions`（自动批准）。
- **OAuth 登录**：在浏览器内完成 Google 授权（打印授权 URL → 授权 → 贴回 code），走 agy 官方无头认证。
- **插件管理**：`agy plugin list / install / enable / disable / uninstall` 的可视化入口。
- **流式输出**：消费 agy 官方 `--output-format stream-json`（`{event,result:{response,…}}`）做增量渲染。

## 技术栈

- 后端：Node.js 20+、Express、express-session
- 前端：单页原生 HTML/CSS/JS（无构建步骤），SSE 流式
- 进程调用：`node:child_process`（`spawn`），显式 `stdio:['ignore','pipe','pipe']` 关闭 stdin

## 前提

- **Antigravity CLI 1.1.x**：`antigravity --version` 可运行。安装见官方 github.com/google-antigravity/antigravity-cli Releases；默认装到 `~/.local/bin/`（本程序会自动探测该位置，也支持 `AGY_BIN` 覆盖）。
- 一个能使用 Antigravity 服务的 Google 账号（需先让本机 CLI 登录一次，或在 WebUI 里走 OAuth 授权）。

## 快速开始

```bash
# 1) 确认 agy 可用
antigravity --version

# 2) 安装依赖
npm ci

# 3) 启动
PORT=3100 node server.js
#   若 CLI 不在默认路径： AGY_BIN=/path/to/antigravity node server.js

# 4) 浏览器打开
#    http://localhost:3100
```

### 完成登录（首次）

1. 点右上角 **「连接」**，WebUI 调用 agy 打印一个 Google 授权 URL。
2. 打开该 URL，用 Google 账号授权，浏览器会跳转到 `antigravity.google/oauth-callback?code=…&state=…`。
3. 把**整个地址**或 `code=` 后面的值贴回弹窗 → 提交。
4. 登录成功后模型列表会来自真实 `antigravity models`。

> 远程/无显示器场景亦可：授权 URL 与贴码均在浏览器完成，无需桌面终端。

## 配置

可用环境变量或 `config.json`（参考 `config.json.example`）：

| 配置 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 | `3100` |
| `AGY_BIN` | antigravity 可执行文件路径（覆盖自动探测） | 自动探测 |
| `AGY_SESSION_SECRET` | session 密钥 | `dev-insecure-secret`（生产请改） |
| 可选 Google OAuth | `AGY_OAUTH_CLIENT_ID` / `AGY_OAUTH_CLIENT_SECRET` / `AGY_REDIRECT_URI` | 关闭 |

## 目录结构

```
server.js            Express 入口、REST + SSE(/api/chat) 路由
lib/
  cli.js             调用 agy：二进制定位、models、plugin、流式对话(--print)
  cli-login.js       OAuth 贴码登录（抓授权 URL、喂 code）
  oauth.js           可选的 Google 用户登录
  config.js          配置加载
public/
  index.html / app.js / style.css   前端单页
```

## 关键实现点（供二次开发）

- **`bin()`**：AGY_BIN > config > `/usr/local/bin` > `~/.local/bin` > `which`，全路径探测。
- **`run()`**：用 `spawn` + `stdio:['ignore','pipe','pipe']`。⚠️ 必须关 stdin——agy 在无 TTY 且 stdin 未 EOF 时会阻塞读标准输入，导致 `models` 等命令卡到超时并误判登录态。
- **流式协议**：`agy --model M --print <prompt> --output-format stream-json --print-timeout 120s`，逐行解析 `{"event":"result","result":{"response":"…","conversation_id":"…","error":"…"}}`，按 `prevResponse` 长度差发增量。
- **多轮**：每次对话把上次 `conversation_id` 通过 `--conversation` 回传续接。

## 已知限制

- 目前「权限/互动弹窗」在 CLI `--print` 批处理下是**被动提示 + 换档重试**（选 `--sandbox` / `--dangerously-skip-permissions` / `--mode plan`），并非 agy 运行中逐条授权请求 → 浏览器 reply 的双向往返；后者需要 node-pty 抓取 agy 的 permission gate，属增强项。
- 模型/插件列表来自文本表格解析（agy 官方无 `--json`），尽力而为。
- 沙箱等无 Google 出网/无 TTY 环境无法完成登录或对话，需部署到可直连 Google 的机器。

## License

MIT（见仓库 LICENSE，若有）。