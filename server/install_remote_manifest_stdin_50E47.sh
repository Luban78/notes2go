#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E47-$STAMP"
CONTROL="$ROOT/migration-bridge/control-state.json"
STATE="$RUNTIME_MANAGER/state/state"
CURRENT="$RUNTIME_MANAGER/state/current_run"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }

[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -f "$CONTROL" ] || fail "chybi control-state.json"
[ -f "$SRC_ROOT/server/migration/destination-manifests" ] || fail "chybi patch destination-manifests"
bash -n "$SRC_ROOT/server/migration/destination-manifests"

grep -q 'source .*destination-lib' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests nepouziva destination-lib"
grep -q 'dest_psql' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests nepouziva dest_psql"
COUNT_NULL="$(grep -c '</dev/null >> \"\$OUT/public-' "$SRC_ROOT/server/migration/destination-manifests" || true)"
[ "$COUNT_NULL" -eq 2 ] || fail "ocekavany 2x stdin guard, nalezeno $COUNT_NULL"
! grep -q 'docker exec -i supabase-db psql' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests stale hardcoded supabase-db"
echo "PATCH_GUARDS=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$STATE" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$CURRENT" 2>/dev/null || true)"

mkdir -p "$BACKUP/migration-manager-bin"
[ -f "$RUNTIME_MANAGER/bin/destination-manifests" ] || fail "chybi runtime destination-manifests"
cp -a "$RUNTIME_MANAGER/bin/destination-manifests" "$BACKUP/migration-manager-bin/destination-manifests.before"

install -m 750 "$SRC_ROOT/server/migration/destination-manifests" "$RUNTIME_MANAGER/bin/destination-manifests"
echo "FILES_INSTALLED=PASS"

bash -n "$RUNTIME_MANAGER/bin/destination-manifests"
COUNT_RUNTIME="$(grep -c '</dev/null >> \"\$OUT/public-' "$RUNTIME_MANAGER/bin/destination-manifests" || true)"
[ "$COUNT_RUNTIME" -eq 2 ] || fail "runtime nema oba stdin guardy"

grep -q 'done < "\$RUN/public-fingerprints.tsv"' "$RUNTIME_MANAGER/bin/destination-manifests" || fail "chybi fingerprint loop"
grep -q 'done < "\$RUN/public-sequences.tsv"' "$RUNTIME_MANAGER/bin/destination-manifests" || fail "chybi sequence loop"
echo "REMOTE_MANIFEST_STDIN_GUARD=PASS"

CONTROL_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_AFTER="$(cat "$STATE" 2>/dev/null || true)"
RUN_AFTER="$(cat "$CURRENT" 2>/dev/null || true)"
[ "$CONTROL_BEFORE" = "$CONTROL_AFTER" ] || fail "installer zmenil control-state.json"
[ "$STATE_BEFORE" = "$STATE_AFTER" ] || fail "installer zmenil manager state"
[ "$RUN_BEFORE" = "$RUN_AFTER" ] || fail "installer zmenil current_run"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "MANAGER_STATE_UNCHANGED=PASS"
echo "CURRENT_RUN_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
