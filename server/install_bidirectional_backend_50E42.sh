#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$HOME/luba-server"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
RUNTIME_MANAGER="$ROOT/migration-manager"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E42-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"
fail(){ echo "INSTALL=FAIL" >&2; echo "REASON=$*" >&2; exit 1; }
[ "$(id -un)" = luban78 ] || fail "spust jako luban78, ne pres sudo"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi migration-manager/bin"
[ -d "$RUNTIME_BRIDGE" ] || fail "chybi migration-bridge"
[ -f "$CONTROL" ] || fail "chybi control-state.json"

FILES=(lubanote-migrate backend-profile-init backend-select destination-lib destination-checkpoint destination-client-profile apply-auth-storage verify-run cutover-final destination-freeze-state destination-freeze-enable destination-freeze-disable destination-write-probe)
for f in "${FILES[@]}"; do bash -n "$SRC_ROOT/server/migration/$f"; done
python3 -m py_compile "$SRC_ROOT/server/migration-bridge/bridge.py"
node --check "$SRC_ROOT/adminDashboard.js" >/dev/null
echo "SYNTAX=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
STATE_BEFORE="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
mkdir -p "$BACKUP/migration-manager-bin" "$BACKUP/migration-bridge" "$BACKUP/config"
cp -a "$RUNTIME_BRIDGE/bridge.py" "$BACKUP/migration-bridge/bridge.py.before"
cp -a "$RUNTIME_MANAGER/config/source.env" "$BACKUP/config/source.env.before"
cp -a "$RUNTIME_MANAGER/config/destination.env" "$BACKUP/config/destination.env.before"
for f in "${FILES[@]}"; do [ -f "$RUNTIME_MANAGER/bin/$f" ] && cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/migration-manager-bin/$f.before" || true; done

for f in "${FILES[@]}"; do install -m 750 "$SRC_ROOT/server/migration/$f" "$RUNTIME_MANAGER/bin/$f"; done
install -m 750 "$SRC_ROOT/server/migration-bridge/bridge.py" "$RUNTIME_BRIDGE/bridge.py"
echo "FILES_INSTALLED=PASS"

PROFILES="$RUNTIME_MANAGER/config/backend-profiles"
if [ ! -s "$PROFILES/cloud.source.env" ] || [ ! -s "$PROFILES/cloud.destination.env" ] || [ ! -s "$PROFILES/lubaserver.source.env" ] || [ ! -s "$PROFILES/lubaserver.destination.env" ]; then
  "$RUNTIME_MANAGER/bin/backend-profile-init"
else
  echo "PROFILE_INIT=SKIP_EXISTING"
fi
for f in cloud.source.env cloud.destination.env lubaserver.source.env lubaserver.destination.env; do
  [ -s "$PROFILES/$f" ] || fail "chybi profil $f"
  [ "$(stat -c '%a' "$PROFILES/$f")" = 600 ] || fail "profil $f nema chmod 600"
done
echo "BACKEND_PROFILES=PASS"

grep -qx 'SOURCE_BACKEND_ID=cloud' "$PROFILES/cloud.source.env" || fail "cloud SOURCE identity"
grep -qx 'DEST_BACKEND_ID=cloud' "$PROFILES/cloud.destination.env" || fail "cloud DEST identity"
grep -qx 'SOURCE_BACKEND_ID=lubaserver' "$PROFILES/lubaserver.source.env" || fail "luba SOURCE identity"
grep -qx 'DEST_BACKEND_ID=lubaserver' "$PROFILES/lubaserver.destination.env" || fail "luba DEST identity"
echo "PROFILE_DIRECTION=PASS"

sudo systemctl restart lubanote-migration-bridge.service
sleep 1
sudo systemctl is-active --quiet lubanote-migration-bridge.service || fail "migration bridge service nenabehla"
echo "BRIDGE_SERVICE=PASS"

CONTROL_JSON="$(curl -fsS --max-time 5 http://127.0.0.1:9083/control/v1/status)" || fail "control status neodpovida"
python3 - "$CONTROL_JSON" <<'PY'
import json,sys
d=json.loads(sys.argv[1]); assert d.get('ok') is True; assert d.get('mode') in {'NORMAL','MAINTENANCE'}; assert d.get('active_backend') in {'cloud','lubaserver'}; assert isinstance(d.get('cutover_enabled'),bool)
print('CONTROL_STATUS=PASS'); print('CONTROL_MODE='+d['mode']); print('ACTIVE_BACKEND='+d['active_backend']); print('CUTOVER_ENABLED='+str(d['cutover_enabled']).lower())
PY
CONTROL_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
[ "$CONTROL_BEFORE" = "$CONTROL_AFTER" ] || fail "installer zmenil control-state.json"
STATE_AFTER="$(cat "$RUNTIME_MANAGER/state/state" 2>/dev/null || true)"
[ "$STATE_BEFORE" = "$STATE_AFTER" ] || fail "installer zmenil manager state"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "MANAGER_STATE_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
