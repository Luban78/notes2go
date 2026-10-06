#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HOME/luba-server/migration-manager"
BIN="$BASE/bin"
STATE="$BASE/state"
BRIDGE="$HOME/luba-server/migration-bridge"
CONTROL="$BRIDGE/control-state.json"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BASE/backups/50E40A-$STAMP"

fail() {
  echo "INSTALL=FAIL" >&2
  echo "REASON=$*" >&2
  exit 1
}

[ -d "$BASE" ] || fail "Chybi $BASE"
[ -d "$BIN" ] || fail "Chybi $BIN"
[ -f "$CONTROL" ] || fail "Chybi $CONTROL"

for f in \
  lubanote-migrate \
  cutover-final \
  source-freeze-precheck \
  source-freeze-enable \
  source-freeze-disable
do
  [ -f "$BIN/$f" ] || fail "Chybi puvodni $BIN/$f"
done

for f in \
  lubanote-migrate \
  cutover-final \
  source-freeze-precheck \
  source-freeze-enable \
  source-freeze-disable \
  source-write-probe \
  restore-primary-normal
do
  [ -f "$PATCH_DIR/$f" ] || fail "Chybi patch soubor $PATCH_DIR/$f"
  bash -n "$PATCH_DIR/$f" || fail "bash -n selhal: $PATCH_DIR/$f"
done

mkdir -p "$BACKUP/bin" "$STATE"
chmod 700 "$BACKUP"
CONTROL_SHA_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"

for f in \
  lubanote-migrate \
  cutover-final \
  source-freeze-precheck \
  source-freeze-enable \
  source-freeze-disable
do
  cp -a "$BIN/$f" "$BACKUP/bin/$f"
done

[ ! -f "$BIN/source-write-probe" ] || cp -a "$BIN/source-write-probe" "$BACKUP/bin/source-write-probe"
[ ! -f "$BIN/restore-primary-normal" ] || cp -a "$BIN/restore-primary-normal" "$BACKUP/bin/restore-primary-normal"
cp -a "$CONTROL" "$BACKUP/control-state.json"

for f in \
  lubanote-migrate \
  cutover-final \
  source-freeze-precheck \
  source-freeze-enable \
  source-freeze-disable \
  source-write-probe \
  restore-primary-normal
do
  install -m 700 "$PATCH_DIR/$f" "$BIN/$f"
done

grep -q 'exec "\$BIN/cutover-final"' "$BIN/lubanote-migrate" \
  || fail "lubanote-migrate cutover neni odemceny"

grep -q 'final public refresh' "$BIN/cutover-final" \
  || fail "cutover-final nema final refresh"

grep -q 'single atomic SOURCE -> DEST switch' "$BIN/cutover-final" \
  || fail "cutover-final nema single-switch marker"

grep -q '"\$BIN/source-freeze-disable"' "$BIN/restore-primary-normal" \
  || fail "restore-primary-normal nezacina unfreeze helperem"

grep -q '"\$BIN/source-write-probe"' "$BIN/source-freeze-disable" \
  || fail "source-freeze-disable nema write probe"

CONTROL_SHA_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
[ "$CONTROL_SHA_BEFORE" = "$CONTROL_SHA_AFTER" ] \
  || fail "Installer zmenil control-state.json"

printf '%s\n' "$BACKUP" > "$STATE/50E40A-backup-path"
chmod 600 "$STATE/50E40A-backup-path"

echo "BASH_SYNTAX=PASS"
echo "CUTOVER_FINAL_SINGLE_SWITCH=PASS"
echo "RESTORE_PRIMARY_ORDER=UNFREEZE_PROBE_NORMAL"
echo "SOURCE_FREEZE_DISABLE_WRITE_PROBE=PASS"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
echo
echo "Dalsi krok:"
echo "  lubanote-migrate status"
echo
echo "Pred skutecnym CUTOVER je nutny NOVY PREPARE -> VERIFY."
