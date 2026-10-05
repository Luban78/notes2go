#!/usr/bin/env bash
set -Eeuo pipefail
BASE="$HOME/luba-server/migration-manager"
BIN="$BASE/bin"
STATE="$BASE/state/state"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -d "$BASE" ] || { echo "CHYBA: $BASE neexistuje"; exit 1; }
current="$(cat "$STATE" 2>/dev/null || echo IDLE)"
[ "$current" = "IDLE" ] || { echo "CHYBA: instalace V2 je povolena jen ve stavu IDLE, aktualne $current"; exit 1; }
ts="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BASE/backups/v1-$ts"
mkdir -p "$backup"
cp -a "$BIN/." "$backup/"
mkdir -p "$BIN"
for f in \
  lubanote-migrate source-preflight source-db-snapshot source-manifests source-storage-snapshot \
  destination-manifests destination-checkpoint apply-public verify-run
do
  install -m 0755 "$SCRIPT_DIR/$f" "$BIN/$f"
done
printf 'v2\n' > "$BASE/VERSION"
echo "OK: Migration Manager V2 nainstalovan."
echo "Backup V1: $backup"
echo
"$BIN/lubanote-migrate" status
