#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOSTNAME:-0.0.0.0}"

if [ ! -d node_modules ]; then
  npm install
fi

npx prisma generate

# Replit deployments commonly use SQLite in the project volume.
# Ignore migrate errors on first boot when no migrations are present.
npx prisma migrate deploy || true

npm run start -- --hostname "$HOST" --port "$PORT"
