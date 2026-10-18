#!/usr/bin/env bash
# 689D: physical PostgreSQL DB-LAB fixture in a disposable isolated container.
# MUTATING only to a temporary Docker container; NO network, port, host volume or prod credentials.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="$ROOT/server/autotester/689D_schema.sql"
CASES="$ROOT/server/autotester/689D_cases.sql"
IMAGE="postgres:16-alpine"
NAME="ln-autotest-689d-$(date +%s)-$$"
CONTAINER=''
cleanup(){
  if [[ -n "$CONTAINER" ]]; then docker stop --time 3 "$CONTAINER" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM
for f in "$SCHEMA" "$CASES"; do [[ -r "$f" ]] || { echo "BLOCKED: missing $f"; exit 2; }; done
command -v docker >/dev/null || { echo 'BLOCKED: docker unavailable'; exit 2; }
docker info >/dev/null 2>&1 || { echo 'BLOCKED: Docker daemon unavailable'; exit 2; }
echo '********************************'
echo '********************************'
echo '689D START: disposable TEST PostgreSQL / --network none / no ports / no mounts'
# Password is for disposable synthetic container only, NEVER a production credential.
TEST_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
CONTAINER="$(docker run --detach --rm --network none --name "$NAME" \
  --memory 512m --pids-limit 128 --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_USER=autotester \
  -e POSTGRES_PASSWORD="$TEST_PASSWORD" \
  -e POSTGRES_DB=autotester \
  "$IMAGE")"
unset TEST_PASSWORD
READY=0
for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -q -U autotester -d autotester; then READY=1; break; fi
  sleep 1
done
[[ "$READY" -eq 1 ]] || { echo 'BLOCKED: ephemeral PostgreSQL did not start'; exit 2; }
# Explicitly verify isolation BEFORE executing SQL.
NET_MODE="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$CONTAINER")"
PORTS="$(docker port "$CONTAINER" 2>/dev/null || true)"
MOUNTS="$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{.Destination}};{{end}}' "$CONTAINER")"
TMPFS="$(docker inspect -f '{{json .HostConfig.Tmpfs}}' "$CONTAINER")"
if [[ "$NET_MODE" != 'none' || -n "$PORTS" ||
      ( -n "$MOUNTS" && "$MOUNTS" != 'tmpfs:/var/lib/postgresql/data;' ) ||
      "$TMPFS" != *'"/var/lib/postgresql/data"'* ]]; then
  echo 'BLOCKED: container is not isolated; stopping without SQL execution'
  exit 2
fi
echo 'ISOLATION=PASS (no network, host ports, binds, or persistent volumes)'

docker exec -i "$CONTAINER" psql -U autotester -d autotester -X -q -v ON_ERROR_STOP=1 < "$SCHEMA"
LOG="$(mktemp)"
trap 'rm -f "$LOG"; cleanup' EXIT INT TERM
if docker exec -i "$CONTAINER" psql -U autotester -d autotester -X -v ON_ERROR_STOP=1 < "$CASES" >"$LOG" 2>&1; then
  cat "$LOG"
  PASS_COUNT="$(grep -c 'DB_LAB_PASS [0-9][0-9] ' "$LOG" || true)"
  [[ "$PASS_COUNT" -eq 12 ]] && grep -q 'DB_LAB_ROLLBACK_PASS' "$LOG" || {
    echo "DB_LAB_BLOCKED: expected 12 checks plus rollback, observed $PASS_COUNT";exit 1;
  }
  echo 'RESULT: DB_LAB_PASS=12 / ROLLBACK=PASS / NOT production RPC'
else
  tail -n 90 "$LOG"
  echo 'RESULT: DB_LAB_FAIL'
  exit 1
fi
echo '********************************'
echo '********************************'
