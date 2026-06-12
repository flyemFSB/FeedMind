#!/usr/bin/env bash
# FeedMind 本地开发环境一键启动脚本
# 用法：./start-dev.sh [--skip-install] [--skip-db]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 解析参数 ──────────────────────────────────────────────────────
SKIP_INSTALL=0
SKIP_DB=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-db) SKIP_DB=1 ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

# ── 1. 确保 .env 存在 ─────────────────────────────────────────────
if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "已从 .env.example 创建 .env"
fi

# ── 2. 确保 data 目录和 DATABASE_PATH ─────────────────────────────
mkdir -p "$ROOT/data"
export DATABASE_PATH="$ROOT/data/feedmind.db"

# ── 3. 安装依赖 + 构建共享包 + 初始化数据库 ──────────────────────
cd "$ROOT"

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "▶ 安装依赖..."
  pnpm install
fi

echo "▶ 构建共享包..."
pnpm build:packages

if [[ "$SKIP_DB" -eq 0 ]]; then
  echo "▶ 初始化数据库..."
  pnpm --filter @feedmind/db db:init
fi

# ── 4. 启动服务 ────────────────────────────────────────────────────
echo "▶ 启动服务..."
pnpm api:dev &
pnpm web:dev &

echo ""
echo "FeedMind 本地服务启动中："
echo "  Web 前端：http://localhost:3000"
echo "  API 服务：http://localhost:8000/api/v1/health"

wait
