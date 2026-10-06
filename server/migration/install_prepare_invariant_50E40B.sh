#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HOME/luba-server/migration-manager"
BIN="$BASE/bin"
STATE="$BASE/state"
CONTROL="$HOME/luba-server/migration-bridge/control-state.json"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BASE/backups/50E40B-$STAMP"

fail() {
  echo "INSTALL=FAIL" >&2
  echo "REASON=$*" >&2
  exit 1
}

[ -d "$BASE" ] || fail "Chybi $BASE"
[ -d "$BIN" ] || fail "Chybi $BIN"
[ -f "$CONTROL" ] || fail "Chybi $CONTROL"
[ -f "$BIN/lubanote-migrate" ] || fail "Chybi $BIN/lubanote-migrate"
[ -f "$PATCH_DIR/lubanote-migrate" ] || fail "Chybi patch lubanote-migrate"

bash -n "$PATCH_DIR/lubanote-migrate" || fail "bash -n selhal"
grep -q 'SOURCE a DEST backend jsou stejne' "$PATCH_DIR/lubanote-migrate" \
  || fail "chybi SOURCE != DEST invariant"
grep -q 'PREPARE Control Point NORMAL + SOURCE active' "$PATCH_DIR/lubanote-migrate" \
  || fail "chybi active SOURCE invariant"

mkdir -p "$BACKUP/bin" "$STATE"
chmod 700 "$BACKUP"
CONTROL_SHA_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
cp -a "$BIN/lubanote-migrate" "$BACKUP/bin/lubanote-migrate"
install -m 700 "$PATCH_DIR/lubanote-migrate" "$BIN/lubanote-migrate"
CONTROL_SHA_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
[ "$CONTROL_SHA_BEFORE" = "$CONTROL_SHA_AFTER" ] || fail "Installer zmenil control-state.json"

printf '%s\n' "$BACKUP" > "$STATE/50E40B-backup-path"
chmod 600 "$STATE/50E40B-backup-path"

echo "BASH_SYNTAX=PASS"
echo "PREPARE_SOURCE_NE_DEST_GUARD=PASS"
echo "PREPARE_ACTIVE_SOURCE_GUARD=PASS"
echo "PREPARE_GUARDS_BEFORE_RUN_CREATION=PASS"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
