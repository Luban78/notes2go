#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo "CHYBA: rollback spust pres sudo." >&2; exit 1; }

BASE="/home/luban78/luba-server/migration-manager"
BRIDGE="/home/luban78/luba-server/migration-bridge/bridge.py"
DISABLE="$BASE/bin/source-freeze-disable"
HELPER="$BASE/bin/source-primary-invariant"
INNER="$BASE/libexec/source-freeze-disable-50E39-inner"
MARKER="$BASE/state/50E39-backup-path"
SERVICE="lubanote-migration-bridge.service"

[ -f "$MARKER" ] || { echo "CHYBA: chybi $MARKER" >&2; exit 1; }
BACKUP="$(cat "$MARKER")"
[ -d "$BACKUP" ] || { echo "CHYBA: checkpoint neexistuje: $BACKUP" >&2; exit 1; }
[ -f "$BACKUP/bridge.py" ] || { echo "CHYBA: v checkpointu chybi bridge.py" >&2; exit 1; }
[ -f "$BACKUP/source-freeze-disable" ] || { echo "CHYBA: v checkpointu chybi source-freeze-disable" >&2; exit 1; }

cp -a "$BACKUP/bridge.py" "$BRIDGE"
cp -a "$BACKUP/source-freeze-disable" "$DISABLE"
if [ -f "$BACKUP/source-primary-invariant.previous" ]; then
  cp -a "$BACKUP/source-primary-invariant.previous" "$HELPER"
else
  rm -f "$HELPER"
fi
rm -f "$INNER"

chown luban78:luban78 "$BRIDGE" "$DISABLE" 2>/dev/null || true
python3 -m py_compile "$BRIDGE"
systemctl restart "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE"
curl -fsS http://127.0.0.1:9083/health >/dev/null

echo "50E39 ROLLBACK=PASS"
echo "Obnoveno z: $BACKUP"
