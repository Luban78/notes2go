#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: spust tento installer pres sudo."
  exit 1
fi

ROOT="/home/luban78/luba-server"
RUNTIME="$ROOT/migration-bridge"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DST="/etc/systemd/system/lubanote-migration-bridge.service"
CONFIG="$RUNTIME/bridge.env"

install -d -m 700 -o luban78 -g luban78 "$RUNTIME"
install -d -m 700 -o luban78 -g luban78 "$RUNTIME/jobs"
install -m 750 -o luban78 -g luban78 "$SRC_DIR/bridge.py" "$RUNTIME/bridge.py"

if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<'EOF'
HOST=127.0.0.1
PORT=9083
MIGRATE=/usr/local/bin/lubanote-migrate
EOF
fi

for line in \
  'HOST=127.0.0.1' \
  'PORT=9083' \
  'MIGRATE=/usr/local/bin/lubanote-migrate' \
  'DESTINATION_ENV=/home/luban78/luba-server/migration-manager/config/destination.env'
do
  key="${line%%=*}"
  if ! grep -q "^${key}=" "$CONFIG"; then
    printf '%s\n' "$line" >> "$CONFIG"
  fi
done

chown luban78:luban78 "$CONFIG"
chmod 600 "$CONFIG"

install -m 644 "$SRC_DIR/lubanote-migration-bridge.service" "$SERVICE_DST"
systemctl daemon-reload
systemctl enable --now lubanote-migration-bridge.service
sleep 1

if ! systemctl is-active --quiet lubanote-migration-bridge.service; then
  echo "ERROR: bridge service nenabehla."
  systemctl --no-pager --full status lubanote-migration-bridge.service || true
  exit 1
fi

if ! curl -fsS http://127.0.0.1:9083/health >/dev/null; then
  echo "ERROR: bridge bezi, ale /health neodpovida."
  exit 1
fi

echo "MIGRATION BRIDGE INSTALL OK"
echo "LOCAL HEALTH OK"
echo "CUTOVER DISABLED"
