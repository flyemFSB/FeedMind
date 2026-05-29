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
  CONTAINER_NAME="feedmind-postgres"
  IMAGE_NAME="pgvector/pgvector:pg18"
  DB_USER="postgres"
  DB_PASS="postgres"
  DB_NAME="feedmind"
  HOST_PORT="5432"
  VOLUME_NAME="feedmind-pgdata"

  command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }
  [[ "$SKIP_PULL" -eq 1 ]] || docker pull "$IMAGE_NAME"

  STATUS="$(docker ps -a --filter "name=$CONTAINER_NAME" --format "{{.Status}}" || true)"
  if [[ -z "$STATUS" ]]; then
    docker volume create "$VOLUME_NAME" >/dev/null
    docker run -d \
      --name "$CONTAINER_NAME" \
      -e "TZ=Asia/Shanghai" \
      -e "POSTGRES_USER=$DB_USER" \
      -e "POSTGRES_PASSWORD=$DB_PASS" \
      -e "POSTGRES_DB=$DB_NAME" \
      -p "${HOST_PORT}:5432" \
      -v "${VOLUME_NAME}:/var/lib/postgresql" \
      --restart unless-stopped \
      "$IMAGE_NAME" >/dev/null
  elif [[ "$STATUS" != Up* ]]; then
    docker start "$CONTAINER_NAME" >/dev/null
  fi

  for _ in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
fi

cd "$ROOT"
[[ "$SKIP_INSTALL" -eq 1 ]] || pnpm install
pnpm build:packages
pnpm db:migrate

pnpm api:dev &
TZ=Asia/Shanghai pnpm agent:dev &
pnpm web:dev &

echo "FeedMind local services are starting:"
echo "  Web:       http://localhost:3000"
echo "  API:       http://localhost:8000/api/v1/health"
echo "  Agent API: http://localhost:2024/docs"

wait
