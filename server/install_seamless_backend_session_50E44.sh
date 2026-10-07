#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E44-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }

[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER" ] || fail "chybi migration-manager"
[ -d "$RUNTIME_BRIDGE" ] || fail "chybi migration-bridge"
[ -f "$CONTROL" ] || fail "chybi control-state.json"

python3 -m py_compile "$SRC_ROOT/server/migration-bridge/bridge.py"
node --check "$SRC_ROOT/adminDashboard.js" >/dev/null
node --check "$SRC_ROOT/maintenance.js" >/dev/null
node --check "$SRC_ROOT/supabaseClient.js" >/dev/null
echo "SYNTAX=PASS"

grep -q '/control/v1/session-handoff' "$SRC_ROOT/server/migration-bridge/bridge.py" || fail "chybi session handoff endpoint"
grep -q 'backend_source_auth_target' "$SRC_ROOT/server/migration-bridge/bridge.py" || fail "chybi active backend auth"
grep -q 'pripravBackendSessionHandoff' "$SRC_ROOT/adminDashboard.js" || fail "chybi admin seamless handoff"
grep -q 'pripravSessionHandoff' "$SRC_ROOT/maintenance.js" || fail "chybi production seamless handoff"
grep -q 'dokonciBackendSessionHandoffPokudJe' "$SRC_ROOT/supabaseClient.js" || fail "chybi redeem handoff"
if grep -q 'Migration Bridge se z bezpečnostních důvodů ověřuje účtem na LubaServeru' "$SRC_ROOT/adminDashboard.js"; then
  fail "zustal TEST-only migration guard"
fi
echo "PATCH_GUARDS=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
mkdir -p "$BACKUP/migration-bridge"
cp -a "$RUNTIME_BRIDGE/bridge.py" "$BACKUP/migration-bridge/bridge.py.before"
install -m 750 "$SRC_ROOT/server/migration-bridge/bridge.py" "$RUNTIME_BRIDGE/bridge.py"
echo "FILES_INSTALLED=PASS"

sudo systemctl restart lubanote-migration-bridge.service
sleep 1
sudo systemctl is-active --quiet lubanote-migration-bridge.service || fail "migration bridge service nenabehla"
echo "BRIDGE_SERVICE=PASS"

curl -fsS --max-time 5 http://127.0.0.1:9083/control/v1/status >/dev/null || fail "control status neodpovida"
HTTP_OPTIONS="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS http://127.0.0.1:9083/control/v1/session-handoff)"
[ "$HTTP_OPTIONS" = 204 ] || fail "session handoff OPTIONS HTTP=$HTTP_OPTIONS"
echo "SESSION_HANDOFF_ROUTE=PASS"

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
