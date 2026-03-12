#!/usr/bin/env bash

set -euo pipefail

APP_PATH="${APP_PATH:-$(cd "$(dirname "$0")" && pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-rafaygen-agent-live}"
PORT="${PORT:-5001}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-ecosystem.config.cjs}"

echo "Starting deploy in $APP_PATH"
cd "$APP_PATH"

echo "Building application"
npm run build

echo "Reloading PM2 app $PM2_APP_NAME"
pm2 reload "$ECOSYSTEM_FILE" --update-env || pm2 start "$ECOSYSTEM_FILE"

echo "Waiting for local health check on port $PORT"
sleep 3
wget -q --spider "http://127.0.0.1:${PORT}"

echo "Deploy succeeded"
