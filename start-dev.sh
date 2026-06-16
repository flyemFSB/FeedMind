#!/usr/bin/env bash
# FeedMind 本地开发环境一键启动
# 用法：./start-dev.sh [--skip-install] [--skip-db]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SKIP_INSTALL=0
SKIP_DB=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-db) SKIP_DB=1 ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

# ── 1. .env ──────────────────────────────────────────────
[[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]] && cp "$ROOT/.env.example" "$ROOT/.env"

# ── 2. data ──────────────────────────────────────────────
mkdir -p "$ROOT/data"

# ── 3. install + db ──────────────────────────────────────
cd "$ROOT"
[[ "$SKIP_INSTALL" -eq 0 ]] && pnpm install
[[ "$SKIP_DB" -eq 0 ]] && pnpm run db:init

# ── 4. 启动 API + Web（同一终端，concurrently 加前缀区分）───
pnpm run dev
