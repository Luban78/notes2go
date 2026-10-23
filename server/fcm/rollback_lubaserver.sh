#!/usr/bin/env bash
# Roll back 692M Edge Function only; the unused DB tables remain for safe audit.
set -euo pipefail
STACK="$HOME/luba-server/luba-supabase"
[[ -f "$STACK/.env.before-fcm-692M" ]] || { echo 'FAIL: no recorded pre-692M env backup'; exit 1; }
cp -p "$STACK/.env.before-fcm-692M" "$STACK/.env"
rm -f "$STACK/compose.fcm.yml"
if [[ -f "$STACK/volumes/functions/lubanote-fcm/index.ts.before-692M" ]]; then
  cp -p "$STACK/volumes/functions/lubanote-fcm/index.ts.before-692M" "$STACK/volumes/functions/lubanote-fcm/index.ts"
else
  rm -f "$STACK/volumes/functions/lubanote-fcm/index.ts"
fi
(
  cd "$STACK"
  docker compose -f docker-compose.yml up -d --no-deps functions
)
echo 'PASS: server function/credentials reverted; no note data changed.'
