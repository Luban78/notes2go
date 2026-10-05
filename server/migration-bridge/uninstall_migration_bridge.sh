#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: spust tento rollback pres sudo."
  exit 1
fi

systemctl disable --now lubanote-migration-bridge.service 2>/dev/null || true
rm -f /etc/systemd/system/lubanote-migration-bridge.service
systemctl daemon-reload
rm -f /home/luban78/luba-server/migration-bridge/bridge.py

echo "MIGRATION BRIDGE SERVICE REMOVED"
echo "bridge.env a jobs byly zachovany"
