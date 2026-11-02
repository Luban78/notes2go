#!/usr/bin/env bash
# Jednorazova instalace z checkoutu; NEPROVADI zadne SQL.
set -Eeuo pipefail
umask 077
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/luba-server/server-deploy"
[[ -r "$SOURCE/server-deploy.sh" ]] || { echo 'CHYBA: chybi server-deploy.sh' >&2; exit 1; }
bash -n "$SOURCE/server-deploy.sh"
if [[ "$SOURCE" == "$TARGET" ]]; then
  echo 'ALREADY_INSTALLED=YES'
else
  mkdir -p "$HOME/luba-server"
  if [[ -d "$TARGET" ]]; then
    BACKUP="$HOME/luba-server/server-deploy.backup-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -a "$TARGET" "$BACKUP"
    echo "BACKUP=$BACKUP"
  fi
  mkdir -p "$TARGET"
  cp -a "$SOURCE/server-deploy.sh" "$SOURCE/launch.sh" "$SOURCE/migrations" "$SOURCE/verify" "$SOURCE/backends.conf" "$TARGET/"
  chmod 700 "$TARGET"
  chmod 700 "$TARGET/server-deploy.sh" "$TARGET/launch.sh"
  find "$TARGET/migrations" "$TARGET/verify" -type f -name '*.sql' -exec chmod 600 {} +
fi
printf 'SERVER_DEPLOY_INSTALL=PASS\nDATABASE_WRITES=NONE\n'
printf 'NEXT=%s/launch.sh --check\n' "$TARGET"
