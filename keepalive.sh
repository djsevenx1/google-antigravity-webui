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

# 启动 URnetwork SOCKS5 守护进程（仅代理 Gemini 认证流量）
URNETWORK_SOCKS="$(pwd)/urnetwork/urnetwork-socks"
URNETWORK_SOCKS_PORT=19999
URNETWORK_SOCKS_LOG="$(pwd)/urnetwork/socks.log"

URN_AUTH_FILE="$(pwd)/data/urn-auth.env"

if [ -x "$URNETWORK_SOCKS" ]; then
  echo "[socks] 启动 URnetwork SOCKS5 守护 (127.0.0.1:${URNETWORK_SOCKS_PORT})…"
  (
    export LD_LIBRARY_PATH="$(pwd)/urnetwork"
    while true; do
      if ! ss -tlnp 2>/dev/null | grep -q ":${URNETWORK_SOCKS_PORT} "; then
        [ -f "$URN_AUTH_FILE" ] && source "$URN_AUTH_FILE"
        echo "[socks] $(date '+%F %T'): 启动 urnetwork-socks" >> "$URNETWORK_SOCKS_LOG"
        "$URNETWORK_SOCKS" \
          --user-auth="${URN_USER_AUTH:-}" \
          --password="${URN_PASSWORD:-}" \
          --addr="127.0.0.1:${URNETWORK_SOCKS_PORT}" \
          --country="${URN_COUNTRY:-United States}" >> "$URNETWORK_SOCKS_LOG" 2>&1 || true
        echo "[socks] $(date '+%F %T'): urnetwork-socks 退出，5秒后重启" >> "$URNETWORK_SOCKS_LOG"
        sleep 5
      else
        sleep 10
      fi
    done
  ) &
  echo "[socks] 守护进程 PID=$!"
fi

while true; do
  COUNT=$((COUNT + 1))
  echo "[keepalive] 启动 #$COUNT PORT=$PORT"
  PORT=$PORT node server.js
  echo "[keepalive] server 退出(_code=$?),2秒后重启"
  sleep 2
done
