#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E42B-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }
[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -f "$CONTROL" ] || fail "chybi control-state.json"
for f in destination-client-profile destination-lib; do bash -n "$SRC_ROOT/server/migration/$f"; done
echo "SYNTAX=PASS"
# Guard against regression back to RBAC-protected PostgREST root.
! grep -q '/rest/v1/' "$SRC_ROOT/server/migration/destination-client-profile" || fail "destination-client-profile stale rest healthcheck"
! grep -q '\$api/rest/v1/' "$SRC_ROOT/server/migration/destination-lib" || fail "destination-lib stale rest healthcheck"
grep -q '/auth/v1/settings' "$SRC_ROOT/server/migration/destination-client-profile" || fail "client profile auth healthcheck missing"
grep -q '/auth/v1/settings' "$SRC_ROOT/server/migration/destination-lib" || fail "destination health auth healthcheck missing"
echo "AUTH_HEALTHCHECK_PATCH=PASS"
CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
mkdir -p "$BACKUP"
for f in destination-client-profile destination-lib; do cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/$f.before"; done
for f in destination-client-profile destination-lib; do install -m 750 "$SRC_ROOT/server/migration/$f" "$RUNTIME_MANAGER/bin/$f"; done
echo "FILES_INSTALLED=PASS"
# Current selected DEST must now pass its public client endpoint preflight.
if "$RUNTIME_MANAGER/bin/destination-client-profile" >/dev/null; then
  echo "DEST_CLIENT_ENDPOINT=PASS"
else
  fail "destination client endpoint stale/nepristupny"
fi
CONTROL_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_AFTER="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_AFTER="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
[ "$CONTROL_BEFORE" = "$CONTROL_AFTER" ] || fail "installer zmenil control-state.json"
[ "$STATE_BEFORE" = "$STATE_AFTER" ] || fail "installer zmenil manager state"
[ "$RUN_BEFORE" = "$RUN_AFTER" ] || fail "installer zmenil current_run"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "MANAGER_STATE_UNCHANGED=PASS"
echo "CURRENT_RUN_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
