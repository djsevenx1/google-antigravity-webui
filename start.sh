#!/usr/bin/env bash
# 一键启动 Google Antigravity Web UI（连接本机安装的 antigravity CLI）
set -euo pipefail
cd "$(dirname "$0")"

# 设独立 HOME：让 agy 读取本目录 home/ 下的登录态与对话历史，脱离 vol5 原 HOME
export HOME="$(pwd)/home"

# 强制英文/非亚洲环境，避免 agy 识别成中文区域触发地区报错
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"
export LANGUAGE="en:en"
export TZ="America/New_York"

# 1) 检查 CLI
AGY_BIN="${AGY_BIN:-}"
if [ -z "$AGY_BIN" ]; then
  for cand in "$(pwd)/bin/antigravity" "$(pwd)/bin/agy" "$(command -v antigravity || true)" /usr/local/bin/antigravity "$HOME/.local/bin/antigravity"; do
    if [ -n "$cand" ] && [ -x "$cand" ]; then AGY_BIN="$cand"; break; fi
  done
fi
if [ -z "$AGY_BIN" ]; then
  echo "未找到 Antigravity CLI，请先安装："
  echo "  curl -fsSL https://antigravity.google/cli/install.sh | bash"
  exit 1
fi
echo "[CLI] $AGY_BIN  ($("$AGY_BIN" --version 2>/dev/null || echo '?'))"

# 2) 安装依赖（如缺）
if [ ! -d node_modules ]; then
  echo "[npm] 安装依赖…"
  npm install
fi

# 3) 代理开关：读根目录 proxy-toggle.txt，yes=起 SOCKS5 代理，no=直连不起
PROXY_TOGGLE="$(cat "$(pwd)/proxy-toggle.txt" 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
if [ "$PROXY_TOGGLE" = "yes" ] || [ "$PROXY_TOGGLE" = "on" ] || [ "$PROXY_TOGGLE" = "true" ]; then
  echo "[socks] proxy-toggle=yes，启动 URnetwork SOCKS5 代理（美国出口）"
  bash "$(pwd)/start-urn-socks.sh" || echo "[socks] URnetwork SOCKS5 启动失败，agy 将直连"
else
  echo "[socks] proxy-toggle=no，直连模式（不起 SOCKS5）"
fi

# 4) 启动主服务
echo "[run] 正在启动…"
AGY_BIN="$AGY_BIN" exec node server.js