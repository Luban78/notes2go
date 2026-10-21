#!/usr/bin/env bash
# 691BI: verified 691BG bridge integration with readiness polling after restart.
set -Eeuo pipefail
ROOT=/opt/lubanote-autotester
BRIDGE="$ROOT/bridge.py"
NEW="$ROOT/tests/autotester-real-rpc-691BG.sh"
TEMP="$(mktemp -d /tmp/ln691bh.XXXXXXXX)"
cleanup(){ rm -rf -- "$TEMP"; }
trap cleanup EXIT
[[ "$(id -u)" -eq 0 ]] || { echo '691BH_BLOCKED: run with sudo'; exit 2; }
[[ -f "$BRIDGE" ]] || { echo '691BH_BLOCKED: installed bridge missing'; exit 2; }
command -v curl >/dev/null || { echo '691BH_BLOCKED: curl missing'; exit 2; }
# Source comes from committed main; never fetch executable source from a variable URL.
curl -fL --retry 2 --connect-timeout 8 --max-time 30 -sS \
  https://raw.githubusercontent.com/Luban78/notes2go/main/tests/autotester-real-rpc-691BG.sh \
  -o "$TEMP/691BG.sh" || { echo '691BH_BLOCKED: cannot fetch 691BG'; exit 2; }
# Exact known script markers; no production DB credentials or endpoints.
grep -Fq '691BG_RESULT: SNAPSHOT_RPC_BODY_PASS=22 / ROLLBACK=PASS / DISPOSABLE_DB=YES' "$TEMP/691BG.sh" || { echo '691BH_BLOCKED: unexpected 691BG script'; exit 2; }
grep -Fq 'set -Eeuo pipefail' "$TEMP/691BG.sh" || { echo '691BH_BLOCKED: script guard missing'; exit 2; }
bash -n "$TEMP/691BG.sh" || { echo '691BH_BLOCKED: invalid script syntax'; exit 2; }
python3 - "$BRIDGE" "$TEMP/bridge.py" <<'PY691BH'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text(encoding='utf8')
old='("real-rpc-689f", "Export 3 skutečných RPC (689F) – izolovaný PostgreSQL", "tests/autotester-real-rpc-689F.sh", "REAL_RPC_BODY_PASS=22 / ROLLBACK=PASS", 22, "REAL_RPC_BODY"),'
new='("real-rpc-689f", "RPC 691BG – aktuální tombstone logika (izolovaný PostgreSQL)", "tests/autotester-real-rpc-691BG.sh", "REAL_RPC_BODY_PASS=22 / ROLLBACK=PASS", 22, "REAL_RPC_BODY"),'
if src.count(old)!=1:
    if src.count(new)==1:
        print('691BH_ALREADY_CONFIGURED')
        Path(sys.argv[2]).write_text(src,encoding='utf8')
        raise SystemExit(0)
    print('691BH_BLOCKED: bridge version differs; no changes')
    raise SystemExit(2)
Path(sys.argv[2]).write_text(src.replace(old,new),encoding='utf8')
PY691BH
python3 -m py_compile "$TEMP/bridge.py"
# Install the runner first, then atomically replace the bridge and restart.
install -o root -g root -m 755 "$TEMP/691BG.sh" "$NEW"
backup="$ROOT/bridge.py.before-691BH"
if [[ ! -e "$backup" ]]; then cp -p "$BRIDGE" "$backup"; fi
owner="$(stat -c %u "$BRIDGE")"; group="$(stat -c %g "$BRIDGE")"
install -o "$owner" -g "$group" -m 644 "$TEMP/bridge.py" "$TEMP/bridge.installed"
mv -f "$TEMP/bridge.installed" "$BRIDGE"
systemctl restart lubanote-autotester.service
if ! systemctl is-active --quiet lubanote-autotester.service; then
  cp -p "$backup" "$BRIDGE"
  systemctl restart lubanote-autotester.service || true
  echo '691BI_FAIL: restart failed; original bridge restored'
  exit 1
fi
health=""
for attempt in $(seq 1 30); do
  if ! systemctl is-active --quiet lubanote-autotester.service; then break; fi
  health="$(curl -fsS --silent --max-time 2 http://127.0.0.1:9084/autotester/v1/health 2>/dev/null || true)"
  if [[ "$health" == *'"ok":true'* ]]; then break; fi
  sleep 0.5
done
if [[ "$health" != *'"ok":true'* ]]; then
  cp -p "$backup" "$BRIDGE"
  systemctl restart lubanote-autotester.service || true
  echo '691BI_FAIL: health check failed after readiness retries; original bridge restored'
  exit 1
fi
echo '691BI_INSTALL_PASS: 691BG wired into existing APK Spustit vse, two existing DB results unchanged'
echo '691BI_SCOPE: isolated RPC body only; NOT production write, triggers, RLS or real two-device sync'
echo "$health"
