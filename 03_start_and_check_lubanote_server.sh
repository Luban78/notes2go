#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/lubanote-server.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "CHYBA: chybi $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

INSTALL_DIR="${INSTALL_DIR:-/opt/lubanote-supabase}"
: "${LUBANOTE_BACKEND_DOMAIN:?Chybi LUBANOTE_BACKEND_DOMAIN}"

if [ ! -f "$INSTALL_DIR/docker-compose.yml" ] || [ ! -f "$INSTALL_DIR/.env" ]; then
  echo 'CHYBA: BI-2A instalace neni pripravena.' >&2
  exit 1
fi

cd "$INSTALL_DIR"
echo 'Spoustim self-hosted Supabase...'
sh run.sh start

echo
echo 'Docker stav:'
docker compose ps

echo
echo 'Cekam na verejny Auth health endpoint...'
url="https://${LUBANOTE_BACKEND_DOMAIN}/auth/v1/health"
for i in $(seq 1 24); do
  if curl --fail --silent --show-error --max-time 8 "$url" >/dev/null; then
    echo "OK: ${url}"
    echo 'BI-2A server bezi pres HTTPS.'
    exit 0
  fi
  sleep 5
done

echo "CHYBA: HTTPS health endpoint neodpovedel: $url" >&2
echo 'Zkontroluj DNS, porty 80/443 a: sh run.sh logs caddy' >&2
exit 1
