#!/usr/bin/env bash
# 689F – isolated real RPC BODY test, with synthetic dependency fixture.
# Only temporary PostgreSQL; NEVER talks to production, uses no secrets or remote endpoints.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="$ROOT/server/autotester/689F_real_rpc.sql"
FIXTURE="$ROOT/server/autotester/689F_fixture.sql"
CASES="$ROOT/server/autotester/689F_cases.sql"
IMAGE='postgres:16-alpine'
NAME="ln-autotest-689f-$(date +%s)-$$"
CONTAINER=''
LOG=''
cleanup(){
  if [[ -n "$LOG" ]]; then rm -f "$LOG"; fi
  if [[ -n "$CONTAINER" ]]; then docker stop --time 3 "$CONTAINER" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM
for f in "$RPC" "$FIXTURE" "$CASES"; do
  [[ -r "$f" ]] || { echo "REAL_RPC_BLOCKED: missing test file"; exit 2; }
done
command -v docker >/dev/null || { echo 'REAL_RPC_BLOCKED: Docker unavailable'; exit 2; }
docker info >/dev/null 2>&1 || { echo 'REAL_RPC_BLOCKED: Docker daemon unavailable'; exit 2; }
# The three exported definitions are intentionally pinned to this inspected server snapshot.
# Updating the production server does not auto-update this lab! Explicit new export needed.
EXPECTED_SHA='a46d38e29819ae67b037ebebc5dbedf3539109c25f747156437b4cc6e27302b3'
ACTUAL_SHA="$(sha256sum "$RPC" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || { echo 'REAL_RPC_BLOCKED: exported function snapshot SHA differs'; exit 2; }
[[ "$(grep -c '^CREATE OR REPLACE FUNCTION public\.' "$RPC")" -eq 3 ]] || {
  echo 'REAL_RPC_BLOCKED: expected exactly 3 exported RPC functions'; exit 2;
}
echo '********************************'
echo '********************************'
echo "689F REAL RPC BODY TEST / exported SHA256=$ACTUAL_SHA"
echo 'SCOPE: real 3 PL/pgSQL RPC bodies; synthetic auth, entitlements, schema and manually seeded feed'
echo 'OUT OF SCOPE: E2E DB triggers, production auth/RLS, real change-feed triggers, real server'
CONTAINER="$(docker run --detach --rm --network none --name "$NAME" \
  --memory 512m --pids-limit 128 --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_USER=autotester -e POSTGRES_DB=autotester \
  -e POSTGRES_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')" \
  "$IMAGE")"
READY=0
for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -q -U autotester -d autotester; then READY=1; break; fi
  sleep 1
done
[[ "$READY" -eq 1 ]] || { echo 'REAL_RPC_BLOCKED: DB did not start'; exit 2; }
NET="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$CONTAINER")"
PORTS="$(docker port "$CONTAINER" 2>/dev/null || true)"
MOUNTS="$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{.Destination}};{{end}}' "$CONTAINER")"
TMPFS="$(docker inspect -f '{{json .HostConfig.Tmpfs}}' "$CONTAINER")"
if [[ "$NET" != 'none' || -n "$PORTS" ||
      ( -n "$MOUNTS" && "$MOUNTS" != 'tmpfs:/var/lib/postgresql/data;' ) ||
      "$TMPFS" != *'"/var/lib/postgresql/data"'* ]]; then
  echo 'REAL_RPC_BLOCKED: container isolation check failed'; exit 2
fi
echo 'ISOLATION=PASS (network:none, no host ports/mounts, tmpfs database)'
docker exec -i "$CONTAINER" psql -U autotester -d autotester -X -q -v ON_ERROR_STOP=1 < "$FIXTURE"
# pg_get_functiondef text output omits CREATE FUNCTION statement terminators.
# Appending only statement-ending semicolons retains the SQL function bodies unchanged.
sed 's/^\$function\$$/$function$;/' "$RPC" | \
  docker exec -i "$CONTAINER" psql -U autotester -d autotester -X -q -v ON_ERROR_STOP=1
LOG="$(mktemp)"
if docker exec -i "$CONTAINER" psql -U autotester -d autotester -X -v ON_ERROR_STOP=1 < "$CASES" >"$LOG" 2>&1; then
  cat "$LOG"
  N="$(grep -Ec 'REAL_RPC_PASS [0-9][0-9] ' "$LOG" || true)"
  if [[ "$N" -ne 22 ]] || ! grep -q 'REAL_RPC_ROLLBACK_PASS' "$LOG"; then
    echo "REAL_RPC_BLOCKED: expected 22 individual cases and rollback, saw $N"; exit 1
  fi
  echo 'RESULT: REAL_RPC_BODY_PASS=22 / ROLLBACK=PASS'
  echo 'IMPORTANT: E2E downgrade trigger / real auth and access control / event-write trigger NOT TESTED'
else
  tail -n 90 "$LOG"
  echo 'RESULT: REAL_RPC_BODY_FAIL'
  exit 1
fi
echo '********************************'
echo '********************************'
