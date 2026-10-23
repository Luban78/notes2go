#!/usr/bin/env bash
# Install 692M safely on the confirmed live LubaServer stack.
# Usage: bash install_lubaserver.sh /absolute/path/to/Firebase-service-account.json
# The JSON is NEVER uploaded to GitHub, printed, or placed under web roots.
set -euo pipefail
umask 077
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STACK="$HOME/luba-server/luba-supabase"
LIVE="$STACK/volumes/functions"
CREDS="${1:-}"
[[ -r "$HERE/692M_fcm_schema.sql" && -r "$HERE/lubanote-fcm/index.ts" ]] || { echo 'FAIL: missing patch sources'; exit 1; }
[[ -f "$STACK/docker-compose.yml" && -d "$LIVE/main" ]] || { echo 'FAIL: unexpected server layout'; exit 1; }
[[ -f "$STACK/.env" ]] || { echo 'FAIL: .env missing; no changes made'; exit 1; }
[[ -f "$CREDS" ]] || { echo 'FAIL: provide local Firebase service-account JSON path'; exit 1; }
python3 - "$CREDS" <<'PY'
import json,sys
obj=json.load(open(sys.argv[1]));
assert obj.get('type') == 'service_account' and obj.get('project_id') == 'lubanote-22901'
assert obj.get('private_key') and obj.get('client_email')
print('PASS: correct Firebase service account (key not printed)')
PY
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' supabase-edge-functions)" == "$LIVE" ]] || { echo 'FAIL: functions mount differs; no changes made'; exit 1; }
[[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' supabase-edge-functions)" == 'functions' ]] || { echo 'FAIL: compose service not functions'; exit 1; }
docker exec supabase-db psql -U postgres -d postgres -Atqc 'select 1' | grep -qx '1' || { echo 'FAIL: database preflight failed'; exit 1; }

# Prepare dedicated env value without exposing credentials in stdout or logs.
ENCODED="$(python3 - "$CREDS" <<'PY'
import base64,sys
print(base64.b64encode(open(sys.argv[1],'rb').read()).decode('ascii'))
PY
)"
[[ "$ENCODED" =~ ^[A-Za-z0-9+/=]+$ ]] || { echo 'FAIL: malformed credentials'; exit 1; }
cp -p -- "$STACK/.env" "$STACK/.env.before-fcm-692M"
python3 - "$STACK/.env" "$ENCODED" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); k='FCM_SERVICE_ACCOUNT_BASE64='
lines=[line for line in p.read_text().splitlines() if not line.startswith(k)]
lines.append(k+sys.argv[2]);p.write_text('\n'.join(lines)+'\n')
PY
chmod 600 "$STACK/.env"
cp -- "$HERE/compose.fcm.yml" "$STACK/compose.fcm.yml"
mkdir -p "$LIVE/lubanote-fcm"
if [[ -f "$LIVE/lubanote-fcm/index.ts" ]]; then cp -p -- "$LIVE/lubanote-fcm/index.ts" "$LIVE/lubanote-fcm/index.ts.before-692M"; fi
cp -- "$HERE/lubanote-fcm/index.ts" "$LIVE/lubanote-fcm/index.ts"

# SQL is idempotent and transactional; do not expose service-role keys.
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$HERE/692M_fcm_schema.sql" > /dev/null
(
  cd "$STACK"
  docker compose -f docker-compose.yml -f compose.fcm.yml config --quiet
  docker compose -f docker-compose.yml -f compose.fcm.yml up -d --no-deps functions
)
if ! docker inspect -f '{{.State.Running}}' supabase-edge-functions | grep -qx true; then
  echo 'FAIL: function container not running; inspect compose logs'
  exit 1
fi
printf '%s\n' 'PASS: FCM function + table installed, container running.' 'No Firebase credential was uploaded to GitHub.'
