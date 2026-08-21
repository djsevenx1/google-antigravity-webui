#!/usr/bin/env bash
# Google Antigravity Web UI — 自动保活脚本
# 用法: nohup bash keepalive.sh &
# server 挂了自动重启
cd "$(dirname "$0")"

PORT="${PORT:-3100}"
COUNT=0

while true; do
  COUNT=$((COUNT + 1))
  echo "[keepalive] 启动 #$COUNT PORT=$PORT"
  PORT=$PORT node server.js
  echo "[keepalive] server 退出(_code=$?)，2秒后重启"
  sleep 2
done
