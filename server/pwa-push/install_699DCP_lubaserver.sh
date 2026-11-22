#!/usr/bin/env bash
# Run manually after reviewing the SQL migration and making a current DB backup.
# New PWA function and worker only. Existing FCM/alarms/PC services are untouched.
set -euo pipefail
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="${1:-/home/luban78/luba-server/luba-supabase}"
EDGE_DIR="$STACK_DIR/volumes/functions"
SOURCE_FUNCTION="$SOURCE_ROOT/lubanote-pwa-push"
WORKER_DIR="$SOURCE_ROOT/worker"
TARGET_FUNCTION="$EDGE_DIR/lubanote-pwa-push"

fail() { echo "STOP: $*" >&2; exit 1; }
command -v docker >/dev/null || fail 'docker not found'
docker compose version >/dev/null 2>&1 || fail 'Docker compose plugin is missing'
[[ -f "$STACK_DIR/.env" ]] || fail 'Existing Supabase .env is missing'
grep -q '^SERVICE_ROLE_KEY=.' "$STACK_DIR/.env" || fail 'Missing SERVICE_ROLE_KEY in existing .env'
[[ -f "$SOURCE_FUNCTION/index.ts" && -f "$WORKER_DIR/compose.yaml" ]] || fail 'Patch incomplete'
[[ -d "$EDGE_DIR" ]] || fail 'Edge functions directory missing'
[[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' supabase-edge-functions)" == 'functions' ]] || fail 'Unexpected Edge container'
MOUNT="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' supabase-edge-functions)"
[[ "$(realpath "$EDGE_DIR")" == "$(realpath "$MOUNT")" ]] || fail 'Unexpected live Edge function mount'
SQL_PRESENT="$(docker exec supabase-db psql -U postgres -d postgres -Atqc "SELECT to_regclass('public.lubanote_pwa_push_jobs_v1') IS NOT NULL" 2>/dev/null)" || fail 'Cannot verify DB schema'
[[ "$SQL_PRESENT" == 't' ]] || fail 'First install SQL migration 699DCP_PWA_WEB_PUSH.sql'
[[ ! -e "$TARGET_FUNCTION" ]] || fail 'PWA function already exists; will not overwrite automatically'

# Build and launch ONLY the new worker; no existing Compose services restarted.
docker compose --env-file "$STACK_DIR/.env" --project-directory "$WORKER_DIR" \
  -f "$WORKER_DIR/compose.yaml" up -d --build || fail 'PWA worker build failed'
PWA_CONTAINER="$(docker compose --env-file "$STACK_DIR/.env" --project-directory "$WORKER_DIR" \
  -f "$WORKER_DIR/compose.yaml" ps -q notifications)"
[[ -n "$PWA_CONTAINER" ]] || fail 'PWA worker container missing'
READY=no
for _ in {1..20}; do
  if docker logs "$PWA_CONTAINER" 2>&1 | grep -q 'PWA_PUSH_WORKER_READY'; then READY=yes; break; fi
  sleep 1
done
[[ "$READY" == yes ]] || fail 'PWA worker not ready; existing Edge functions untouched'

echo 'Worker started. Installing independent Edge function…'
cp -a "$SOURCE_FUNCTION" "$TARGET_FUNCTION"
if ! docker restart supabase-edge-functions >/dev/null; then
  mv "$TARGET_FUNCTION" "${TARGET_FUNCTION}.rollback.$(date +%Y%m%d%H%M%S)"
  docker restart supabase-edge-functions >/dev/null || true
  fail 'Edge container restart failed; new function was moved aside'
fi
[[ "$(docker inspect -f '{{.State.Running}}' supabase-edge-functions)" == true ]] || fail 'Edge container is not running'
echo 'OK: isolated PWA push deployed. Existing APK FCM/PC code was not modified.'
