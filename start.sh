#!/usr/bin/env bash
# 一键启动 Google Antigravity Web UI（连接本机安装的 antigravity CLI）
set -euo pipefail
cd "$(dirname "$0")"

# 1) 检查 CLI
AGY_BIN="${AGY_BIN:-}"
if [ -z "$AGY_BIN" ]; then
  for cand in "$(command -v antigravity || true)" /usr/local/bin/antigravity "$HOME/.local/bin/antigravity"; do
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

# 3) 启动
echo "[run] 正在启动…"
AGY_BIN="$AGY_BIN" exec node server.js