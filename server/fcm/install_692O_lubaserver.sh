#!/usr/bin/env bash
# 692O: update only the installed Edge Function; never touch Firebase secrets,
# database schema, env, Supabase data, or unrelated Docker services.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STACK="$HOME/luba-server/luba-supabase"
LIVE="$STACK/volumes/functions"
SRC="$HERE/lubanote-fcm/index.ts"
DST="$LIVE/lubanote-fcm/index.ts"
[[ -f "$SRC" && -f "$DST" ]] || { echo 'FAIL: FCM function not installed or source missing'; exit 1; }
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' supabase-edge-functions)" == "$LIVE" ]] || { echo 'FAIL: unexpected Edge Functions mount'; exit 1; }
[[ "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' supabase-edge-functions)" == 'functions' ]] || { echo 'FAIL: wrong Docker service'; exit 1; }
cp -p -- "$DST" "$DST.before-692O"
cp -- "$SRC" "$DST"
if ! docker restart supabase-edge-functions >/dev/null ||
   [[ "$(docker inspect -f '{{.State.Running}}' supabase-edge-functions)" != true ]]; then
  cp -- "$DST.before-692O" "$DST"
  docker restart supabase-edge-functions >/dev/null || true
  echo 'FAIL: Edge Function rollout was reverted'; exit 1
fi
printf '%s\n' 'PASS: 692O Edge Function installed and restarted.' 'Firebase credentials and database were not modified.'
