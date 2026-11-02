#!/usr/bin/env bash
# 699D - GitHub sync + separate server-schema sync. No web deploy, no APK changes.
set -Eeuo pipefail
umask 077
printf '%s\n' '********************************' '********************************'
trap 'printf "%s\n" "********************************" "********************************"' EXIT
export PATH="$HOME/.local/bin:$PATH"
MODE="${1:---check}"
case "$MODE" in --check|--apply) ;; *) echo 'Use: launch.sh --check|--apply' >&2; exit 2 ;; esac
ROOT="$HOME/luba-server"
REPO="${LUBANOTE_GIT_REPO:-$ROOT/lubanote}"
[[ -d "$REPO/.git" ]] || { echo 'REPO_MISSING' >&2; exit 1; }
BASE="${LUBANOTE_MIGRATION_BASE:-$ROOT/migration-manager}"
[[ -d "$BASE/state" ]] || { echo 'MIGRATION_STATE_MISSING' >&2; exit 1; }
command -v flock >/dev/null
command -v git >/dev/null
command -v python3 >/dev/null
# A shared lock file prevents concurrent schema sync; existing migration commands
# are guarded separately by state/control checks. Does not claim global exclusion.
exec 9> "$ROOT/schema-sync.lock"
flock -n 9 || { echo 'SCHEMA_SYNC=BLOCKED another_sync_running'; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; printf "%s\n" "********************************" "********************************"' EXIT
# Git fetch only updates remote ref, NOT working tree or web production.
git -C "$REPO" fetch --quiet origin main
SHA="$(git -C "$REPO" rev-parse origin/main)"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
git -C "$REPO" archive "$SHA" server/schema-sync | tar -x -C "$TMP"
[[ -s "$TMP/server/schema-sync/schema-sync.py" ]] || exit 1
python3 "$TMP/server/schema-sync/schema-sync.py" "$MODE"
