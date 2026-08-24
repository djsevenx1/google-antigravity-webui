#!/usr/bin/env bash
# Google Antigravity Web UI — 自动保活脚本(单例锁,防多实例)
cd "$(dirname "$0")"
export HOME="$(pwd)/home"

PORT="${PORT:-3100}"
LOCKFILE="/tmp/antigravity-webui-keepalive.lock"

# 单例锁:如果已有 keepalive 在跑,直接退出
exec 200>"$LOCKFILE"
flock -n 200 || { echo "[keepalive] 已有实例在跑,退出"; exit 0; }

COUNT=0
while true; do
  COUNT=$((COUNT + 1))
  echo "[keepalive] 启动 #$COUNT PORT=$PORT"
  PORT=$PORT node server.js
  echo "[keepalive] server 退出(_code=$?),2秒后重启"
  sleep 2
done
