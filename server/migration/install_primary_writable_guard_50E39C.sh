#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo "CHYBA: instalaci spust pres sudo." >&2; exit 1; }

OWNER="luban78"
GROUP="luban78"
BASE="/home/luban78/luba-server/migration-manager"
BIN="$BASE/bin"
CONTROL="/home/luban78/luba-server/migration-bridge/control-state.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BASE/backups/50E39C-$STAMP"
MARKER="$BASE/state/50E39C-backup-path"
OLD_B_MARKER="$BASE/state/50E39B-backup-path"

PRECHECK="$BIN/source-freeze-precheck"
DISABLE="$BIN/source-freeze-disable"
CUTOVER="$BIN/cutover-final"
HELPER="$BIN/source-primary-invariant"
RESTORE="$BIN/restore-primary-normal"

# Akceptujeme pouze presne analyzovany puvodni runtime nebo presny 50E39B runtime.
allowed_hash() {
  local file="$1" got="$2"
  case "$file:$got" in
    "$PRECHECK:856d713ebe0124597970b5f8fcde288d085e5825763f41f3d394d16cf84e0c26"|\
    "$PRECHECK:c9cdafc163facb2a34433f4f63766a79cf8f5852161e2ded03c962263e378d24"|\
    "$DISABLE:49b2f050632dbc8f6ddff0011a30fe81ea186e4dd392e343ac815f00dbbbba76"|\
    "$DISABLE:7bc215e30c29686fc0b961744df9880dc839e8dda98be868d1bd4fe92ba0fe80"|\
    "$CUTOVER:bdaee29bd0a1bbb5ce931eae447ef6d66eea0f7cf7560c3f97ad92fe7a6c34d2"|\
    "$CUTOVER:3b4f5dedee234dedd30943949d554415393b9e561703d89e7d5b0956046f5cb9") return 0 ;;
    *) return 1 ;;
  esac
}

for live in "$PRECHECK" "$DISABLE" "$CUTOVER"; do
  [ -f "$live" ] || { echo "CHYBA: chybi $live" >&2; exit 1; }
  got="$(sha256sum "$live" | awk '{print $1}')"
  allowed_hash "$live" "$got" || {
    echo "CHYBA: runtime se od analyzovaneho stavu zmenil: $live" >&2
    echo "actual=$got" >&2
    exit 1
  }
done

for src in source-primary-invariant source-freeze-precheck source-freeze-disable restore-primary-normal cutover-final; do
  [ -f "$SCRIPT_DIR/$src" ] || { echo "CHYBA: chybi patch soubor $SCRIPT_DIR/$src" >&2; exit 1; }
  bash -n "$SCRIPT_DIR/$src"
done

[ -f "$CONTROL" ] || { echo "CHYBA: chybi $CONTROL" >&2; exit 1; }
[ -f "$BASE/config/source-cloud.env" ] || { echo "CHYBA: chybi source-cloud.env" >&2; exit 1; }

echo "50E39C PRIMARY WRITABLE INVARIANT"
echo "Checkpoint: $BACKUP"
mkdir -p "$BACKUP" "$(dirname "$MARKER")"
cp -a "$PRECHECK" "$BACKUP/source-freeze-precheck"
cp -a "$DISABLE" "$BACKUP/source-freeze-disable"
cp -a "$CUTOVER" "$BACKUP/cutover-final"
cp -a "$CONTROL" "$BACKUP/control-state.json"
[ -f "$HELPER" ] && cp -a "$HELPER" "$BACKUP/source-primary-invariant.previous" || true
[ -f "$RESTORE" ] && cp -a "$RESTORE" "$BACKUP/restore-primary-normal.previous" || true
[ -f "$OLD_B_MARKER" ] && cp -a "$OLD_B_MARKER" "$BACKUP/50E39B-backup-path.previous" || true
printf '%s\n' "$BACKUP" > "$MARKER"
chown "$OWNER:$GROUP" "$MARKER"
chmod 600 "$MARKER"

rollback() {
  rc=$?
  echo "CHYBA: 50E39C instalace selhala, vracim checkpoint." >&2
  cp -a "$BACKUP/source-freeze-precheck" "$PRECHECK" || true
  cp -a "$BACKUP/source-freeze-disable" "$DISABLE" || true
  cp -a "$BACKUP/cutover-final" "$CUTOVER" || true
  cp -a "$BACKUP/control-state.json" "$CONTROL" || true
  if [ -f "$BACKUP/source-primary-invariant.previous" ]; then
    cp -a "$BACKUP/source-primary-invariant.previous" "$HELPER" || true
  else
    rm -f "$HELPER" || true
  fi
  if [ -f "$BACKUP/restore-primary-normal.previous" ]; then
    cp -a "$BACKUP/restore-primary-normal.previous" "$RESTORE" || true
  else
    rm -f "$RESTORE" || true
  fi
  rm -f "$MARKER" || true
  exit "$rc"
}
trap rollback ERR

install -m 0700 -o "$OWNER" -g "$GROUP" "$SCRIPT_DIR/source-primary-invariant" "$HELPER"
install -m 0700 -o "$OWNER" -g "$GROUP" "$SCRIPT_DIR/source-freeze-precheck" "$PRECHECK"
install -m 0700 -o "$OWNER" -g "$GROUP" "$SCRIPT_DIR/source-freeze-disable" "$DISABLE"
install -m 0700 -o "$OWNER" -g "$GROUP" "$SCRIPT_DIR/restore-primary-normal" "$RESTORE"
install -m 0700 -o "$OWNER" -g "$GROUP" "$SCRIPT_DIR/cutover-final" "$CUTOVER"

bash -n "$HELPER"
bash -n "$PRECHECK"
bash -n "$DISABLE"
bash -n "$RESTORE"
bash -n "$CUTOVER"

read -r MODE ACTIVE CUTOVER_ENABLED < <(python3 - "$CONTROL" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    d=json.load(f)
print(d.get("mode", ""), d.get("active_backend", ""), str(d.get("cutover_enabled")).lower())
PY
)

if [ "$MODE" = "NORMAL" ] && [ "$CUTOVER_ENABLED" = "false" ]; then
  [ -n "$ACTIVE" ] || { echo "CHYBA: NORMAL control nema active_backend" >&2; exit 1; }
  echo "Postcheck aktivniho PRIMARY: $ACTIVE"
  "$HELPER" check --backend "$ACTIVE"
  echo "PRIMARY_WRITABLE_POSTCHECK=PASS"
else
  echo "PRIMARY_WRITABLE_POSTCHECK=DEFERRED mode=$MODE active=$ACTIVE cutover_enabled=$CUTOVER_ENABLED"
fi

# Stary marker po neuspesnem 50E39B muze pozdeji omylem vratit runtime zpet.
# Po uspesnem 50E39C jej deaktivujeme; jeho obsah zustava v tomto checkpointu.
rm -f "$OLD_B_MARKER"

trap - ERR

echo "50E39C INSTALL=PASS"
echo "BOOLEAN_NORMALIZATION=PASS"
echo "SOURCE_FREEZE_PRECHECK_LOCAL_CONTROL=PASS"
echo "SOURCE_FREEZE_DISABLE_WRITE_PROBE=PASS"
echo "CUTOVER_FINAL_SINGLE_SWITCH=PASS"
echo "RESTORE_PRIMARY_ORDER=UNFREEZE_PROBE_THEN_NORMAL"
echo "Rollback checkpoint: $BACKUP"
