#!/usr/bin/env bash
# 690A one-time controlled install. Default --check (READ ONLY); --apply is MUTATING.
# Installs a LOCALHOST-only test runner. Does NOT modify Caddy, Cloudflare, DB, or migration bridge.
set -Eeuo pipefail
MODE="${1:---check}"
[[ "$MODE" == '--check' || "$MODE" == '--apply' ]] || { echo 'Use --check or --apply'; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST='/opt/lubanote-autotester'
UNIT='/etc/systemd/system/lubanote-autotester.service'
REQ=(
  'server/autotester-apk/bridge.py'
  'server/autotester-apk/lubanote-autotester.service'
  'tests/autotester-db-lab-689D.sh'
  'tests/autotester-real-rpc-689F.sh'
  'server/autotester/689D_schema.sql'
  'server/autotester/689D_cases.sql'
  'server/autotester/689F_fixture.sql'
  'server/autotester/689F_cases.sql'
  'server/autotester/689F_real_rpc.sql'
)
for f in "${REQ[@]}"; do
  [[ -s "$SOURCE_ROOT/$f" ]] || { echo "BLOCKED: missing repository file: $f"; exit 2; }
done
for tool in docker curl python3 systemctl sha256sum; do
  command -v "$tool" >/dev/null || { echo "BLOCKED: missing $tool"; exit 2; }
done
id luban78 >/dev/null || { echo 'BLOCKED: user luban78 missing'; exit 2; }
getent group docker >/dev/null || { echo 'BLOCKED: docker group missing'; exit 2; }
python3 - "$SCRIPT_DIR/bridge.py" <<'PYCODE'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
compile(p.read_text(encoding='utf-8'), str(p), 'exec')
PYCODE
bash -n "$SOURCE_ROOT/tests/autotester-db-lab-689D.sh"
bash -n "$SOURCE_ROOT/tests/autotester-real-rpc-689F.sh"
# Fail closed if the export snapshot does not match the pinned verified SHA from server.
actual="$(sha256sum "$SOURCE_ROOT/server/autotester/689F_real_rpc.sql" | awk '{print $1}')"
[[ "$actual" == 'a46d38e29819ae67b037ebebc5dbedf3539109c25f747156437b4cc6e27302b3' ]] || {
  echo 'BLOCKED: real RPC exported snapshot SHA mismatch'; exit 2;
}
[[ -r /home/luban78/luba-server/luba-supabase/.env ]] || { echo 'BLOCKED: local Supabase env not readable'; exit 2; }
[[ -r /home/luban78/luba-server/migration-bridge/control-state.json ]] || {
  echo 'BLOCKED: Control Point state unavailable'; exit 2;
}
echo '********************************'
echo '********************************'
echo "AUTOTESTER 690A: checks PASS / requested=$MODE"
echo 'Docker tests: disposable --network none, --tmpfs, no production DB credentials.'
echo 'Auth: local Kong / admin RPC, active NORMAL LubaServer only.'
echo 'Listen: 127.0.0.1:9084 (requires one Cloudflare Tunnel hostname route).'
if [[ "$MODE" == '--check' ]]; then
  echo 'READ ONLY: nothing changed.'
  echo '********************************'
  echo '********************************'
  exit 0
fi
[[ "$(id -u)" -eq 0 ]] || { echo 'BLOCKED: use sudo ... --apply'; exit 2; }
# Do not replace other services or users. Everything touched is under own prefix + unit.
STAGE="$(mktemp -d /opt/.ln-autotester-690A.XXXXXXXX)"
BACKUP=''
UNIT_BACKUP=""
if [[ -f "$UNIT" ]]; then
  UNIT_BACKUP="$UNIT.backup-690A-$(date +%Y%m%dT%H%M%S)"
  cp -a "$UNIT" "$UNIT_BACKUP"
fi
installed=0
cleanup() {
  rm -rf "$STAGE"
  if [[ "$installed" -ne 1 ]]; then
    systemctl stop lubanote-autotester.service 2>/dev/null || true
    if [[ -n "$BACKUP" && -d "$BACKUP" ]]; then
      rm -rf "$DEST"
      mv "$BACKUP" "$DEST"
    else
      rm -rf "$DEST"
    fi
    if [[ -n "$UNIT_BACKUP" && -f "$UNIT_BACKUP" ]]; then
      cp -a "$UNIT_BACKUP" "$UNIT"
      systemctl daemon-reload || true
      systemctl restart lubanote-autotester.service 2>/dev/null || true
    else
      systemctl disable lubanote-autotester.service 2>/dev/null || true
      rm -f "$UNIT"
      systemctl daemon-reload || true
    fi
  fi
}
trap cleanup EXIT
install -d -m 755 "$STAGE/tests" "$STAGE/server/autotester"
install -m 644 "$SCRIPT_DIR/bridge.py" "$STAGE/bridge.py"
for f in "${REQ[@]}"; do
  case "$f" in
    tests/*) install -m 755 "$SOURCE_ROOT/$f" "$STAGE/$f" ;;
    server/autotester/*) install -m 644 "$SOURCE_ROOT/$f" "$STAGE/$f" ;;
  esac
done
chown -R root:root "$STAGE"
chmod 755 "$STAGE" "$STAGE/tests" "$STAGE/server" "$STAGE/server/autotester"
if [[ -e "$DEST" ]]; then
  BACKUP="${DEST}.backup-$(date +%Y%m%dT%H%M%S)"
  mv "$DEST" "$BACKUP"
fi
mv "$STAGE" "$DEST"
STAGE='/nonexistent-lubanote-autotester-stage'
install -m 644 "$SCRIPT_DIR/lubanote-autotester.service" "$UNIT"
systemctl daemon-reload
systemctl enable --now lubanote-autotester.service
systemctl restart lubanote-autotester.service
sleep 1
curl -fsS --max-time 4 http://127.0.0.1:9084/autotester/v1/health >/dev/null || {
  echo 'BLOCKED: health check failed. Previous test runner will be restored if it existed.'
  exit 1
}
installed=1
trap - EXIT
echo 'AUTOTESTER 690A: LOCAL SERVER PASS'
echo 'NO tests have been run yet. No Cloudflare route added or changed.'
echo 'Tunnel hostname needed: autotest.lubanote.com -> http://127.0.0.1:9084'
echo '********************************'
echo '********************************'
