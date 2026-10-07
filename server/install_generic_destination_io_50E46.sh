#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E46-$STAMP"
CONTROL="$ROOT/migration-bridge/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }

[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -f "$CONTROL" ] || fail "chybi control-state.json"
for f in destination-manifests apply-public; do bash -n "$SRC_ROOT/server/migration/$f"; done

grep -q 'source .*destination-lib' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests nepouziva destination-lib"
grep -q 'dest_psql' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests nepouziva dest_psql"
grep -q 'source .*destination-lib' "$SRC_ROOT/server/migration/apply-public" || fail "apply-public nepouziva destination-lib"
grep -q '} | dest_psql' "$SRC_ROOT/server/migration/apply-public" || fail "public restore nejde pres dest_psql"
! grep -q 'docker exec -i supabase-db psql' "$SRC_ROOT/server/migration/destination-manifests" || fail "destination-manifests stale hardcoded supabase-db"
! grep -q 'docker exec -i supabase-db psql' "$SRC_ROOT/server/migration/apply-public" || fail "apply-public stale hardcoded supabase-db"
grep -q 'SET LOCAL session_replication_role = replica' "$SRC_ROOT/server/migration/apply-public" || fail "chybi controlled freeze bypass"
echo "PATCH_GUARDS=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
mkdir -p "$BACKUP/migration-manager-bin"
for f in destination-manifests apply-public; do
  [ -f "$RUNTIME_MANAGER/bin/$f" ] || fail "chybi runtime $f"
  cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/migration-manager-bin/$f.before"
done

install -m 750 "$SRC_ROOT/server/migration/destination-manifests" "$RUNTIME_MANAGER/bin/destination-manifests"
install -m 750 "$SRC_ROOT/server/migration/apply-public" "$RUNTIME_MANAGER/bin/apply-public"
echo "FILES_INSTALLED=PASS"

# Staticky dokaz, ze oba helpery jsou skutecne smerovane pres destination-lib.
! grep -q 'docker exec -i supabase-db psql' "$RUNTIME_MANAGER/bin/destination-manifests" || fail "runtime destination-manifests stale"
! grep -q 'docker exec -i supabase-db psql' "$RUNTIME_MANAGER/bin/apply-public" || fail "runtime apply-public stale"
grep -q 'dest_psql' "$RUNTIME_MANAGER/bin/destination-manifests" || fail "runtime destination-manifests nema dest_psql"
grep -q '} | dest_psql' "$RUNTIME_MANAGER/bin/apply-public" || fail "runtime apply-public nema dest_psql"
echo "GENERIC_DEST_IO_SELFTEST=PASS"

CONTROL_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_AFTER="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_AFTER="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
[ "$CONTROL_BEFORE" = "$CONTROL_AFTER" ] || fail "installer zmenil control-state.json"
[ "$STATE_BEFORE" = "$STATE_AFTER" ] || fail "installer zmenil manager state"
[ "$RUN_BEFORE" = "$RUN_AFTER" ] || fail "installer zmenil current_run"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "MANAGER_STATE_UNCHANGED=PASS"
echo "CURRENT_RUN_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
