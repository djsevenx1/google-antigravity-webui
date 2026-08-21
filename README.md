# Google Antigravity Web UI

基于 [Google Antigravity CLI](https://antigravity.google)（命令名 `agy` / `antigravity`）的 Web 界面：在浏览器里选模型、多轮对话、权限确认、附件上传、文件管理、模型用量与配额监控。

> 轻量 Node.js（Express + 原生前端）WebUI，直接包装本机的 Antigravity CLI，通过 WebSocket 实现流式对话，支持断线重连、后台任务持久化、刷新恢复实时状态。

---

## ✨ 功能特性

### 对话
- **真会话续接**：用官方 `--conversation <id>` 续接，agy 服务端记住上下文，不靠前端拼历史
- **WebSocket 传输**：替代 SSE，解决反向代理对长连接 HTTP 响应的缓冲/超时掐断
- **断线自动重连**：浏览器切后台/网络抖动时 ws 断开 → 自动 subscribe 重连 → 回放错过的事件 → 继续接收实时流
- **刷新恢复**：刷新页面后自动重连到正在跑的后台任务，实时显示思考/工具执行/文本流
- **Run Registry**：后台 CLI 执行与前端网络连接解耦，agy 进程不因前端断开而 kill

### 权限
- **🟢 自动批准**：`--dangerously-skip-permissions`，所有工具自动放行
- **🟡 询问模式**：不跳过权限，工具被拒时弹窗展示工具名 + 错误详情，可选"允许并重试"或"允许并记住"（写入 `settings.json` allow 列表，该工具以后自动放行）

### 模型与配额
- **多模型目录**：自动从 `antigravity models` 拉取（Gemini / Claude / GPT-OSS 等）
- **思考强度**：`--effort low/medium/high`
- **Google 账号配额**：直连 Google API 获取实时 Tier 状态、5 小时滚动窗口、每周配额
- **账号资料**：显示 Google 头像、邮箱、Tier 等级（Pro / Enterprise / Free）

### 文件与附件
- **附件上传**：拖拽或点击添加文件（≤10MB，最多 10 个），存到 `~/.antigravity/assets/`
- **路径注入**：图片用 `<images_input>`、文件用 `<files_input>` 标签注入 prompt
- **文件管理**：侧边栏文件树浏览、在线编辑、保存（支持创建/删除/重命名）

### 其他
- **OAuth 登录**：浏览器内完成 Google 授权（授权 URL → 贴 code → 令牌交换）
- **插件管理**：`agy plugin list / install / enable / disable` 可视化入口 + 内置市场模板
- **会话持久化**：服务端文件数据库（`data/sessions/`）+ localStorage 双写
- **保活脚本**：`keepalive.sh`，server 挂了自动重启
- **全局错误兜底**：`uncaughtException` / `unhandledRejection` 不崩溃

---

## 📋 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| **Node.js** | ≥ 18（推荐 20+） | 运行 Express 后端 |
| **npm** | ≥ 8 | 安装依赖 |
| **Antigravity CLI** | ≥ 1.1.0（当前 1.1.17） | `agy` / `antigravity` 命令 |
| **Google 账号** | — | 能使用 Antigravity 服务的 Google 账号 |
| **操作系统** | Linux / macOS | Windows 理论可行但未测试 |

### npm 依赖

| 包 | 版本 | 用途 |
|---|---|---|
| `express` | ^4.19 | Web 服务器 |
| `express-session` | ^1.18 | Session 管理 |
| `ws` | ^8.21 | WebSocket 服务器（替代 SSE） |
| `node-pty` | ^1.1 | 真实 TTY（agy 多工具编排必需） |
| `multer` | ^2.2 | 附件上传（multipart/form-data） |

### 系统依赖
- `bash` — keepalive.sh 和 start.sh 需要
- `which` — cli.js 自动探测 agy 路径
- 反向代理（可选）— nginx 等用于外网访问，WebSocket 需配置 `proxy_pass` + `proxy_read_timeout`

---

## 🚀 快速开始

### 1. 安装 Antigravity CLI

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
# 默认装到 ~/.local/bin/agy
agy --version  # 确认可用
```

### 2. 首次登录（命令行）

```bash
agy  # 交互式登录，按提示完成 Google 授权
```

### 3. 克隆并启动

```bash
git clone https://github.com/djsevenx1/google-antigravity-webui.git
cd google-antigravity-webui
npm install
PORT=3100 node server.js
```

### 4. 浏览器访问

```
http://localhost:3100
```

### 5. 如需外网访问

用 nginx 反代，**关键：WebSocket 需要特殊配置**：

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

---

## ⚙️ 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 监听端口 | `3100` |
| `AGY_BIN` | agy 可执行文件路径 | 自动探测 |
| `AGY_SESSION_SECRET` | session 密钥 | `dev-insecure-secret` |
| `AGY_OAUTH_CLIENT_ID` | Google OAuth Client ID（可选） | 空 |
| `AGY_OAUTH_CLIENT_SECRET` | Google OAuth Client Secret（可选） | 空 |
| `AGY_OAUTH_REDIRECT_URI` | OAuth 回调地址 | 空 |
| `AGY_CHAT_ENDPOINT` | 自定义对话端点 | 空（用 CLI 默认） |

### config.json

复制 `config.json.example` 为 `config.json`：

```json
{
  "port": 3100,
  "agyBin": "",
  "sessionSecret": "your-secret-here"
}
```

---

## 📁 目录结构

```
google-antigravity-webui/
├── server.js              # Express 入口：REST API + WebSocket + 静态托管
├── keepalive.sh          # 保活脚本（server 挂了自动重启）
├── start.sh              # 启动脚本（自动探测 CLI + npm install + 启动）
├── package.json          # 依赖与脚本
├── config.json.example    # 配置模板
├── lib/
│   ├── cli.js            # agy CLI 桥：模型列表、流式对话、插件管理、权限检测
│   ├── cli-login.js     # OAuth 贴码登录（抓授权 URL → 喂 code）
│   ├── config.js         # 配置加载（环境变量 > config.json > 默认值）
│   ├── oauth.js          # 可选 Google OAuth 路由
│   └── permissions.js    # 权限管理：settings.json allow/deny/ask 列表
├── public/
│   ├── index.html        # 前端单页
│   ├── app.js            # 前端应用（WebSocket 客户端 + UI 逻辑）
│   ├── style.css         # 样式
│   └── vendor/          # 第三方库（marked, highlight.js, lucide icons）
├── data/
│   └── sessions/        # 会话持久化（JSON 文件）
└── .gitignore
```

---

## 🏗️ 架构

```
浏览器（vanilla JS）
  │  WebSocket /ws/chat
  │  POST /api/assets/files（附件上传）
  │  GET /api/workspace/tree（文件树）
  ▼
server.js（Express + WebSocketServer）
  │  Run Registry（内存 Map：convKey → {events[], listeners, isRunning, done}）
  │  会话持久化（data/sessions/*.json）
  │  权限管理（~/.gemini/antigravity-cli/settings.json）
  ▼
lib/cli.js（node-pty spawn）
  │  agy --print --output-format stream-json --conversation <id>
  │  NDJSON 事件流：init → step_update → result
  ▼
Google Antigravity CLI（agy/antigravity）
  │  Google AI Pro / Gemini / Claude / GPT-OSS
  ▼
Google Cloud
```

### 关键设计

- **WebSocket 替代 SSE**：SSE 是 HTTP 响应保持打开，反向代理当普通 HTTP 处理会缓冲/掐断；WebSocket 是协议升级后的持久 TCP，代理做透传
- **Run Registry**：后台 CLI 执行与前端网络连接解耦——agy 进程在 `activeRuns` Map 里持续运行，前端断了不 kill，重连后回放 `events[]` + 继续接收实时流
- **conversation_id 早报**：agy 的 `init` 事件几乎立即带 `conversation_id`，通过 `onConversationId` 回调第一时间发给前端，即使后续连接断开，前端已有 id 可续接
- **node-pty 真实 TTY**：agy 在无 TTY 时无法编排多工具（会 `Agent execution terminated`），必须用 node-pty 分配 PTY
- **权限"允许并记住"**：工具被拒时捕获工具名，用户选"记住"→ 写入 `settings.json` 的 `permissions.allow` 列表 → agy 下次重读该文件自动放行

---

## 🔧 运维

### 保活启动

```bash
# 用 keepalive.sh 启动，server 挂了自动重启
PORT=3100 nohup bash keepalive.sh >> server.log 2>&1 &
```

### 日志

| 文件 | 内容 |
|---|---|
| `chat-debug.log` | 对话请求/响应/错误/权限事件 |
| `server.log` | server 启动/stdout |
| `~/.gemini/antigravity-cli/cli-err-debug.log` | agy 子进程错误详情 |

### 排查

| 症状 | 排查 |
|---|---|
| 模型列表空 | `agy models` 手动确认 CLI 登录态 |
| 发消息没反应 | 看日志 `BEGIN` 后有没有 `DONE`；检查 `attach to run (isRunning=...)` |
| network error | 检查反代 WebSocket 配置（Upgrade/Connection/timeout） |
| 权限被拒 | 切到"自动批准"模式，或用"允许并记住"逐个放行 |
| server 挂了 | 用 `keepalive.sh` 保活；看 `chat-debug.log` 有没有 `[FATAL]` |
| 刷新后不显示 | `tryReconnectToOngoingRun` 自动重连；检查 subscribe 是否命中 `isRunning=true` |

---

## 📝 License

MIT
