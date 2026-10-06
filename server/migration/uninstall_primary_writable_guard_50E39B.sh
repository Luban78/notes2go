#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo "CHYBA: rollback spust pres sudo." >&2; exit 1; }

BASE="/home/luban78/luba-server/migration-manager"
BIN="$BASE/bin"
MARKER="$BASE/state/50E39B-backup-path"

[ -f "$MARKER" ] || { echo "CHYBA: chybi $MARKER" >&2; exit 1; }
BACKUP="$(cat "$MARKER")"
[ -d "$BACKUP" ] || { echo "CHYBA: checkpoint neexistuje: $BACKUP" >&2; exit 1; }

cp -a "$BACKUP/source-freeze-precheck" "$BIN/source-freeze-precheck"
cp -a "$BACKUP/source-freeze-disable" "$BIN/source-freeze-disable"
cp -a "$BACKUP/cutover-final" "$BIN/cutover-final"

if [ -f "$BACKUP/source-primary-invariant.previous" ]; then
  cp -a "$BACKUP/source-primary-invariant.previous" "$BIN/source-primary-invariant"
else
  rm -f "$BIN/source-primary-invariant"
fi

if [ -f "$BACKUP/restore-primary-normal.previous" ]; then
  cp -a "$BACKUP/restore-primary-normal.previous" "$BIN/restore-primary-normal"
else
  rm -f "$BIN/restore-primary-normal"
fi

chown luban78:luban78 \
  "$BIN/source-freeze-precheck" \
  "$BIN/source-freeze-disable" \
  "$BIN/cutover-final" 2>/dev/null || true
chmod 0700 \
  "$BIN/source-freeze-precheck" \
  "$BIN/source-freeze-disable" \
  "$BIN/cutover-final"

bash -n "$BIN/source-freeze-precheck"
bash -n "$BIN/source-freeze-disable"
bash -n "$BIN/cutover-final"

echo "50E39B ROLLBACK=PASS"
echo "Obnoveno z: $BACKUP"
