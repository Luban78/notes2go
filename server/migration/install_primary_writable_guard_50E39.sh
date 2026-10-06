#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo "CHYBA: instalaci spust pres sudo." >&2; exit 1; }

OWNER="luban78"
GROUP="luban78"
BASE="/home/luban78/luba-server/migration-manager"
BIN="$BASE/bin"
BRIDGE_DIR="/home/luban78/luba-server/migration-bridge"
BRIDGE="$BRIDGE_DIR/bridge.py"
SERVICE="lubanote-migration-bridge.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_SRC="$SCRIPT_DIR/source-primary-invariant"
HELPER_DST="$BIN/source-primary-invariant"
DISABLE="$BIN/source-freeze-disable"
LIBEXEC="$BASE/libexec"
INNER="$LIBEXEC/source-freeze-disable-50E39-inner"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BASE/backups/50E39-$STAMP"
STATE_MARKER="$BASE/state/50E39-backup-path"

[ -f "$HELPER_SRC" ] || { echo "CHYBA: chybi $HELPER_SRC" >&2; exit 1; }
[ -f "$BRIDGE" ] || { echo "CHYBA: chybi $BRIDGE" >&2; exit 1; }
[ -f "$DISABLE" ] || { echo "CHYBA: chybi $DISABLE" >&2; exit 1; }

echo "50E39 PRIMARY WRITABLE GUARD"
echo "Checkpoint: $BACKUP"

mkdir -p "$BACKUP" "$LIBEXEC" "$(dirname "$STATE_MARKER")"
cp -a "$BRIDGE" "$BACKUP/bridge.py"
cp -a "$DISABLE" "$BACKUP/source-freeze-disable"
[ -f "$HELPER_DST" ] && cp -a "$HELPER_DST" "$BACKUP/source-primary-invariant.previous" || true
printf '%s\n' "$BACKUP" > "$STATE_MARKER"
chown "$OWNER:$GROUP" "$STATE_MARKER"
chmod 600 "$STATE_MARKER"

rollback() {
  rc=$?
  echo "CHYBA: 50E39 instalace selhala, vracim checkpoint." >&2
  cp -a "$BACKUP/bridge.py" "$BRIDGE" || true
  cp -a "$BACKUP/source-freeze-disable" "$DISABLE" || true
  if [ -f "$BACKUP/source-primary-invariant.previous" ]; then
    cp -a "$BACKUP/source-primary-invariant.previous" "$HELPER_DST" || true
  else
    rm -f "$HELPER_DST" || true
  fi
  rm -f "$INNER" || true
  chown "$OWNER:$GROUP" "$BRIDGE" "$DISABLE" 2>/dev/null || true
  systemctl restart "$SERVICE" 2>/dev/null || true
  exit "$rc"
}
trap rollback ERR

install -m 0755 -o "$OWNER" -g "$GROUP" "$HELPER_SRC" "$HELPER_DST"

if ! grep -q '50E39_SOURCE_FREEZE_DISABLE_WRAPPER' "$DISABLE"; then
  install -m 0755 -o "$OWNER" -g "$GROUP" "$DISABLE" "$INNER"
  cat > "$DISABLE" <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
# 50E39_SOURCE_FREEZE_DISABLE_WRAPPER
BASE="/home/luban78/luba-server/migration-manager"
INNER="$BASE/libexec/source-freeze-disable-50E39-inner"
HELPER="$BASE/bin/source-primary-invariant"
CFG="$BASE/config/source.env"

"$INNER" "$@"
"$HELPER" check --config "$CFG"
WRAPPER
  chown "$OWNER:$GROUP" "$DISABLE"
  chmod 0755 "$DISABLE"
fi

if ! grep -q '50E39_PRIMARY_WRITABLE_GUARD_BEGIN' "$BRIDGE"; then
  python3 - "$BRIDGE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
marker = "class Handler("
pos = text.find(marker)
if pos < 0:
    raise SystemExit("CHYBA: bridge.py nema ocekavany class Handler marker")
if "def write_control_mode(" not in text:
    raise SystemExit("CHYBA: bridge.py nema write_control_mode")
if "def read_control_state(" not in text:
    raise SystemExit("CHYBA: bridge.py nema read_control_state")

block = r'''
# 50E39_PRIMARY_WRITABLE_GUARD_BEGIN
# NORMAL na aktivnim PRIMARY backendu s cutover_enabled=false nesmi byt
# publikovan, dokud databazovy SOURCE write-freeze neni skutecne vypnuty
# a transakcni write probe pres save_note_safe neprojde.
_write_control_mode_50e39_original = write_control_mode


def _50e39_ensure_primary_writable_before_normal() -> None:
    current = read_control_state()
    active_backend = str(current.get("active_backend") or "").strip()
    cutover_enabled = current.get("cutover_enabled")

    if not active_backend:
        raise RuntimeError("50E39: active_backend chybi")

    # Pri skutecnem CUTOVERu zustava tento guard mimo cestu. Tady hlidame
    # pouze navrat/abort/rollback do bezneho PRIMARY rezimu.
    if cutover_enabled is not False:
        return

    helper = "/home/luban78/luba-server/migration-manager/bin/source-primary-invariant"
    result = subprocess.run(
        [helper, "recover", "--backend", active_backend],
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )

    if result.returncode != 0:
        detail = ((result.stdout or "") + (result.stderr or "")).strip()
        raise RuntimeError(f"50E39: PRIMARY writable invariant FAIL: {detail[-2000:]}")


def write_control_mode(mode: str) -> dict[str, Any]:
    normalized = str(mode or "").upper()
    if normalized == "NORMAL":
        _50e39_ensure_primary_writable_before_normal()
    return _write_control_mode_50e39_original(mode)
# 50E39_PRIMARY_WRITABLE_GUARD_END

'''
path.write_text(text[:pos] + block + text[pos:], encoding="utf-8")
PY
  chown "$OWNER:$GROUP" "$BRIDGE"
  chmod 0750 "$BRIDGE"
fi

python3 -m py_compile "$BRIDGE"
bash -n "$HELPER_DST"
bash -n "$DISABLE"
bash -n "$INNER"

systemctl restart "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE"
curl -fsS http://127.0.0.1:9083/health >/dev/null

# Aktualni stav musi po dnesnim incidentu projit jako skutecne writable.
ACTIVE_BACKEND="$(python3 - "$BRIDGE_DIR/control-state.json" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    d = json.load(f)
print(str(d.get("active_backend") or "").strip())
PY
)"

[ -n "$ACTIVE_BACKEND" ] || { echo "CHYBA: control-state nema active_backend" >&2; exit 1; }
"$HELPER_DST" check --backend "$ACTIVE_BACKEND"

trap - ERR

echo "50E39 INSTALL=PASS"
echo "BRIDGE=PASS"
echo "SOURCE_FREEZE_DISABLE_POSTCHECK=PASS"
echo "PRIMARY_WRITABLE_INVARIANT=PASS"
echo "Rollback checkpoint: $BACKUP"
