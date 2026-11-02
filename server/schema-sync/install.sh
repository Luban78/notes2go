#!/usr/bin/env bash
# Only installs launcher scripts. No changes to Migration Manager, data, or DB.
set -Eeuo pipefail
umask 077
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/luba-server/schema-sync"
[[ -f "$SOURCE/launch.sh" && -f "$SOURCE/schema-sync.py" ]] || exit 1
bash -n "$SOURCE/launch.sh"
python3 -m py_compile "$SOURCE/schema-sync.py"
mkdir -p "$TARGET"
cp "$SOURCE/launch.sh" "$TARGET/launch.sh"
chmod 700 "$TARGET" "$TARGET/launch.sh"
echo 'SCHEMA_SYNC_INSTALL=PASS DATABASE_WRITES=NONE'
echo "NEXT=$TARGET/launch.sh --check"
