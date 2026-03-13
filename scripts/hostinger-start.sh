#!/usr/bin/env bash
set -euo pipefail

npx prisma generate
npx prisma migrate deploy || true
npm run start
