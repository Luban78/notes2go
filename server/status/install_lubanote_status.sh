#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Spusť přes sudo: sudo bash $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_USER="${SUDO_USER:-luban78}"
DB_CONTAINER="${LUBA_DB_CONTAINER:-supabase-db}"
TARGET_DIR="/usr/local/lib/lubanote"

command -v docker >/dev/null 2>&1 || { echo "Chybí docker."; exit 1; }
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || { echo "DB container $DB_CONTAINER neběží / neexistuje."; exit 1; }

mkdir -p "$TARGET_DIR"
install -m 0755 "$SCRIPT_DIR/lubanote-status-update.sh" "$TARGET_DIR/lubanote-status-update.sh"
install -m 0755 "$SCRIPT_DIR/luba-status" /usr/local/bin/luba-status

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$SCRIPT_DIR/lubanote-server-status.sql"

cat > /etc/systemd/system/lubanote-status.service <<EOF
[Unit]
Description=LubaNote server health snapshot
After=docker.service cloudflared.service
Wants=docker.service

[Service]
Type=oneshot
User=$RUN_USER
ExecStart=$TARGET_DIR/lubanote-status-update.sh
EOF

cat > /etc/systemd/system/lubanote-status.timer <<'EOF'
[Unit]
Description=Refresh LubaNote server health snapshot

[Timer]
OnBootSec=20s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=lubanote-status.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now lubanote-status.timer
systemctl start lubanote-status.service

echo
echo "OK: LubaServer status agent nainstalován."
echo "Timer: $(systemctl is-active lubanote-status.timer)"
echo
/usr/local/bin/luba-status
