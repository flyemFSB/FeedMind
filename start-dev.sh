#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_INSTALL=0
SKIP_DB=0
SKIP_PULL=0

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

if [[ "$SKIP_DB" -eq 0 ]]; then
  mkdir -p "$ROOT/data"
  export DATABASE_PATH="./data/feedmind.db"
  echo "SQLite database: $ROOT/data/feedmind.db"
  if [[ -f "$ROOT/.env" ]] && ! grep -q '^DATABASE_PATH=' "$ROOT/.env"; then
    printf '\nDATABASE_PATH=./data/feedmind.db\n' >> "$ROOT/.env"
  fi
fi

cd "$ROOT"
[[ "$SKIP_INSTALL" -eq 1 ]] || pnpm install
pnpm build:packages
if [[ "$SKIP_DB" -eq 0 ]]; then
  pnpm --filter @feedmind/db db:init
fi

pnpm api:dev &
TZ=Asia/Shanghai pnpm agent:dev &
pnpm web:dev &

echo "FeedMind local services are starting:"
echo "  Web:       http://localhost:3000"
echo "  API:       http://localhost:8000/api/v1/health"
echo "  Agent API: http://localhost:2024/docs"

wait
