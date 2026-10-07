#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="/home/luban78/luba-server"
RUNTIME_BRIDGE="$ROOT/migration-bridge"
RUNTIME_MANAGER="$ROOT/migration-manager"
SRC_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RUNTIME_MANAGER/backups/50E41-$STAMP"
CONTROL="$RUNTIME_BRIDGE/control-state.json"

fail() {
  echo "INSTALL=FAIL" >&2
  echo "REASON=$*" >&2
  exit 1
}

[ "$(id -un)" = "luban78" ] || fail "spust jako uzivatel luban78, ne pres sudo"
[ -d "$RUNTIME_BRIDGE" ] || fail "chybi $RUNTIME_BRIDGE"
[ -d "$RUNTIME_MANAGER/bin" ] || fail "chybi $RUNTIME_MANAGER/bin"
[ -f "$CONTROL" ] || fail "chybi control-state.json"

python3 -m py_compile "$SRC_ROOT/server/migration-bridge/bridge.py"
for f in cutover-final restore-primary-normal destination-client-profile; do
  bash -n "$SRC_ROOT/server/migration/$f"
done
echo "SYNTAX=PASS"

CONTROL_BEFORE="$(sha256sum "$CONTROL" | awk '{print $1}')"
mkdir -p "$BACKUP/migration-bridge" "$BACKUP/migration-manager-bin"
cp -a "$RUNTIME_BRIDGE/bridge.py" "$BACKUP/migration-bridge/bridge.py.before"
for f in cutover-final restore-primary-normal destination-client-profile; do
  [ -f "$RUNTIME_MANAGER/bin/$f" ] && cp -a "$RUNTIME_MANAGER/bin/$f" "$BACKUP/migration-manager-bin/$f.before"
done

install -m 750 "$SRC_ROOT/server/migration-bridge/bridge.py" "$RUNTIME_BRIDGE/bridge.py"
for f in cutover-final restore-primary-normal destination-client-profile; do
  install -m 750 "$SRC_ROOT/server/migration/$f" "$RUNTIME_MANAGER/bin/$f"
done

echo "FILES_INSTALLED=PASS"

sudo systemctl restart lubanote-migration-bridge.service
sleep 1
sudo systemctl is-active --quiet lubanote-migration-bridge.service || fail "migration bridge service nenabehla"
echo "BRIDGE_SERVICE=PASS"

CONTROL_JSON="$(curl -fsS --max-time 5 http://127.0.0.1:9083/control/v1/status)" || fail "local control status neodpovida"
python3 - "$CONTROL_JSON" <<'PY'
import json, re, sys
d = json.loads(sys.argv[1])
assert d.get("ok") is True
assert d.get("version") == 1
assert d.get("mode") in {"NORMAL", "MAINTENANCE"}
assert re.fullmatch(r"[a-z0-9._-]+", str(d.get("active_backend", "")))
assert isinstance(d.get("cutover_enabled"), bool)
print("CONTROL_STATUS=PASS")
print("CONTROL_MODE=" + str(d.get("mode")))
print("ACTIVE_BACKEND=" + str(d.get("active_backend")))
print("CUTOVER_ENABLED=" + str(d.get("cutover_enabled")).lower())
PY

CONTROL_AFTER="$(sha256sum "$CONTROL" | awk '{print $1}')"
[ "$CONTROL_BEFORE" = "$CONTROL_AFTER" ] || fail "installer zmenil control-state.json"
echo "CONTROL_STATE_UNCHANGED=PASS"
echo "BACKUP=$BACKUP"
echo "INSTALL=PASS"
