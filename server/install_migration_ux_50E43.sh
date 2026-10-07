#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_MANAGER="$ROOT/migration-manager"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E43-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }

[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -d "$RUNTIME_BRIDGE" ] || fail "chybi migration-bridge"
[ -f "$CONTROL" ] || fail "chybi control-state.json"

bash -n "$SRC_ROOT/server/migration/cutover-final"
bash -n "$SRC_ROOT/server/migration/lubanote-migrate"
python3 -m py_compile "$SRC_ROOT/server/migration-bridge/bridge.py"
node --check "$SRC_ROOT/adminDashboard.js" >/dev/null
echo "SYNTAX=PASS"

grep -q 'automatic MAINTENANCE + drain' "$SRC_ROOT/server/migration/cutover-final" || fail "chybi auto maintenance"
grep -q 'AUTO_MAINTENANCE=PASS' "$SRC_ROOT/server/migration/cutover-final" || fail "chybi auto maintenance marker"
grep -q 'CUTOVER · 12 bezpečných kroků' "$SRC_ROOT/adminDashboard.js" || fail "chybi CUTOVER live progress"
grep -q 'puvodniAndroidZpetAdmin' "$SRC_ROOT/adminDashboard.js" || fail "chybi Android Back guard"
grep -q 'current_run_direction' "$SRC_ROOT/server/migration-bridge/bridge.py" || fail "chybi run direction"
echo "PATCH_GUARDS=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
RUN_BEFORE="$(cat "$RUNTIME_MANAGER/state/current_run" 2>/dev/null || true)"
mkdir -p "$BACKUP/migration-manager-bin" "$BACKUP/migration-bridge"
cp -a "$RUNTIME_BRIDGE/bridge.py" "$BACKUP/migration-bridge/bridge.py.before"
for f in cutover-final lubanote-migrate; do
  [ -f "$RUNTIME_MANAGER/bin/$f" ] && cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/migration-manager-bin/$f.before" || true
done

install -m 750 "$SRC_ROOT/server/migration/cutover-final" "$RUNTIME_MANAGER/bin/cutover-final"
install -m 750 "$SRC_ROOT/server/migration/lubanote-migrate" "$RUNTIME_MANAGER/bin/lubanote-migrate"
install -m 750 "$SRC_ROOT/server/migration-bridge/bridge.py" "$RUNTIME_BRIDGE/bridge.py"
echo "FILES_INSTALLED=PASS"

sudo systemctl restart lubanote-migration-bridge.service
sleep 1
sudo systemctl is-active --quiet lubanote-migration-bridge.service || fail "migration bridge service nenabehla"
echo "BRIDGE_SERVICE=PASS"

CONTROL_JSON="$(curl -fsS --max-time 5 http://127.0.0.1:9083/control/v1/status)" || fail "control status neodpovida"
python3 - "$CONTROL_JSON" <<'PY'
import json,sys
d=json.loads(sys.argv[1])
assert d.get('ok') is True
assert d.get('mode') in {'NORMAL','MAINTENANCE'}
assert isinstance(d.get('active_backend'),str) and d.get('active_backend')
assert isinstance(d.get('cutover_enabled'),bool)
print('CONTROL_STATUS=PASS')
print('CONTROL_MODE='+d['mode'])
print('ACTIVE_BACKEND='+d['active_backend'])
print('CUTOVER_ENABLED='+str(d['cutover_enabled']).lower())
PY

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
