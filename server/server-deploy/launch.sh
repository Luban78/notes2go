#!/usr/bin/env bash
# Spolehlivy spoustec jednim kliknutim: nacte server-only soubory z GitHub origin/main.
# Nepouziva lubanote-deploy a neaktualizuje PROD/TEST web, APK ani git working tree.
set -Eeuo pipefail
umask 077
MODE="${1:---check}"
case "$MODE" in --check|--apply) ;; *) echo 'Pouziti: launch.sh --check|--apply' >&2;exit 2;; esac
REPO="${LUBANOTE_GIT_REPO:-$HOME/luba-server/lubanote}"
[[ -d "$REPO/.git" ]] || { echo "DEPLOY_SOURCE_MISSING=$REPO" >&2;exit 1; }
command -v git >/dev/null || exit 1
command -v tar >/dev/null || exit 1
command -v flock >/dev/null || exit 1
LOCK="${LUBANOTE_SERVER_DEPLOY_LOCK:-$HOME/luba-server/server-deploy.lock}"
exec 9> "$LOCK"
flock -n 9 || { echo 'SERVER_DEPLOY=BLOCKED another_deploy_running' >&2;exit 1; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/luba-server-deploy.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT
printf 'GIT_FETCH=START\n'
git -C "$REPO" fetch --quiet origin main
SHA="$(git -C "$REPO" rev-parse origin/main)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'BAD_GIT_SHA' >&2;exit 1; }
printf 'GIT_MAIN_SHA=%s\n' "$SHA"
# jen adresar server/server-deploy z nacteneho konkretniho commitu
( git -C "$REPO" archive "$SHA" server/server-deploy ) | tar -xf - -C "$TMP"
NEXT="$TMP/server/server-deploy/server-deploy.sh"
[[ -s "$NEXT" ]] || { echo 'SERVER_DEPLOY_SCRIPT_NOT_IN_MAIN' >&2;exit 1; }
bash -n "$NEXT"
bash "$NEXT" "$MODE"
