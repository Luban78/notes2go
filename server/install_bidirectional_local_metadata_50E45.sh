#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E45-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }

[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -f "$CONTROL" ] || fail "chybi control-state.json"

for f in filter-public-local lubanote-migrate cutover-final; do
  bash -n "$SRC_ROOT/server/migration/$f"
done
node --check "$SRC_ROOT/adminDashboard.js" >/dev/null

grep -q 'lubanote_server_status' "$SRC_ROOT/server/migration/filter-public-local" || fail "chybi local-only table guard"
grep -q 'filter-public-local.*run_dir' "$SRC_ROOT/server/migration/lubanote-migrate" || fail "chybi PREPARE local-only filter"
grep -q 'filter-public-local.*FINAL' "$SRC_ROOT/server/migration/cutover-final" || fail "chybi CUTOVER local-only filter"
grep -q 'PREPARE V3 / 1: source preflight' "$SRC_ROOT/adminDashboard.js" || fail "chybi PREPARE V3 progress"
grep -q 'adminMigrationConfirmSourceName' "$SRC_ROOT/adminDashboard.js" || fail "chybi dynamicky SOURCE label"
grep -q 'adminControlDetails' "$SRC_ROOT/index.html" || fail "chybi kompaktni Udrzba"
echo "PATCH_GUARDS=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"

mkdir -p "$BACKUP/migration-manager-bin"
for f in lubanote-migrate cutover-final; do
  [ -f "$RUNTIME_MANAGER/bin/$f" ] || fail "chybi runtime $f"
  cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/migration-manager-bin/$f.before"
done
[ -f "$RUNTIME_MANAGER/bin/filter-public-local" ] && cp -a "$RUNTIME_MANAGER/bin/filter-public-local" "$BACKUP/migration-manager-bin/filter-public-local.before" || true

install -m 750 "$SRC_ROOT/server/migration/filter-public-local" "$RUNTIME_MANAGER/bin/filter-public-local"
install -m 750 "$SRC_ROOT/server/migration/lubanote-migrate" "$RUNTIME_MANAGER/bin/lubanote-migrate"
install -m 750 "$SRC_ROOT/server/migration/cutover-final" "$RUNTIME_MANAGER/bin/cutover-final"
echo "FILES_INSTALLED=PASS"

# Read-only self-test filtru na kopii artefaktu; zadny DB/control zapis.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf 'notes\t1\taaa\nlubanote_server_status\t1\tbbb\n' > "$TMP/public-fingerprints.tsv"
printf '1; 0 0 TABLE DATA public notes postgres\n2; 0 0 TABLE DATA public lubanote_server_status postgres\n' > "$TMP/public-data.list"
printf 'public.notes_id_seq\t1\n' > "$TMP/public-sequences.tsv"
"$RUNTIME_MANAGER/bin/filter-public-local" "$TMP" >/dev/null
[ "$(wc -l < "$TMP/public-fingerprints.tsv" | tr -d ' ')" = 1 ] || fail "filter self-test fingerprints"
! grep -q 'lubanote_server_status' "$TMP/public-fingerprints.tsv" || fail "filter self-test fingerprints stale"
! grep -q 'lubanote_server_status' "$TMP/public-data.list" || fail "filter self-test restore list stale"
echo "FILTER_SELFTEST=PASS"

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
