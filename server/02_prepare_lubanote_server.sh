#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/lubanote-server.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "CHYBA: chybi $ENV_FILE" >&2
  echo 'Zkopiruj lubanote-server.env.example -> lubanote-server.env a dopln domeny.' >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${LUBANOTE_BACKEND_DOMAIN:?Chybi LUBANOTE_BACKEND_DOMAIN}"
: "${LUBANOTE_APP_URL:?Chybi LUBANOTE_APP_URL}"
: "${CERTBOT_EMAIL:?Chybi CERTBOT_EMAIL}"
INSTALL_DIR="${INSTALL_DIR:-/opt/lubanote-supabase}"
SUPABASE_REF="${SUPABASE_REF:-self-hosted/v0.8.2}"

case "$LUBANOTE_BACKEND_DOMAIN" in
  *://*|*/*|*:* )
    echo 'CHYBA: LUBANOTE_BACKEND_DOMAIN ma byt jen domena, napr. api.lubanote.cz' >&2
    exit 1
    ;;
esac

if [ "${1:-}" != "--apply" ]; then
  cat <<PLAN
BI-2A priprava – DRY RUN
  Supabase ref : ${SUPABASE_REF}
  Instalace    : ${INSTALL_DIR}
  Backend URL  : https://${LUBANOTE_BACKEND_DOMAIN}
  App URL      : ${LUBANOTE_APP_URL}
  HTTPS        : Caddy / Let's Encrypt

Nic jsem nezmenil.
Po kontrole spust znovu s parametrem --apply.
PLAN
  exit 0
fi

if [ -e "$INSTALL_DIR" ]; then
  echo "CHYBA: cil uz existuje: $INSTALL_DIR" >&2
  echo 'BI-2A zamerne neprepisuje existujici server.' >&2
  exit 1
fi

for cmd in git docker openssl sed awk grep curl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "CHYBA: chybi $cmd. Nejdriv spust 01_preflight_lubanote_server.sh" >&2
    exit 1
  }
done

docker compose version >/dev/null 2>&1 || {
  echo 'CHYBA: chybi Docker Compose plugin.' >&2
  exit 1
}

parent_dir="$(dirname "$INSTALL_DIR")"
mkdir -p "$parent_dir"

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

echo "Stahuji oficialni Supabase ${SUPABASE_REF}..."
git clone \
  --depth 1 \
  --filter=blob:none \
  --sparse \
  --branch "$SUPABASE_REF" \
  https://github.com/supabase/supabase.git \
  "$tmp_dir/supabase"

git -C "$tmp_dir/supabase" sparse-checkout set docker
mkdir -p "$INSTALL_DIR"
cp -a "$tmp_dir/supabase/docker/." "$INSTALL_DIR/"
cd "$INSTALL_DIR"

cp .env.example .env
printf 'ref=%s\n' "$SUPABASE_REF" > .supabase-version

echo 'Generuji lokalni hesla, API klice a JWT klice...'
sh utils/generate-keys.sh --update-env
sh utils/add-new-auth-keys.sh --update-env

set_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*$|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env SUPABASE_PUBLIC_URL "https://${LUBANOTE_BACKEND_DOMAIN}"
set_env API_EXTERNAL_URL "https://${LUBANOTE_BACKEND_DOMAIN}/auth/v1"
set_env SITE_URL "$LUBANOTE_APP_URL"
set_env PROXY_DOMAIN "$LUBANOTE_BACKEND_DOMAIN"
set_env CERTBOT_EMAIL "$CERTBOT_EMAIL"
set_env STUDIO_DEFAULT_ORGANIZATION "LubaNote"
set_env STUDIO_DEFAULT_PROJECT "LubaNote"

# HTTPS reverse proxy je soucasti oficialniho self-hosted baliku.
sh run.sh config add caddy

echo 'Stahuji pripnute Docker image...'
docker compose pull

cat <<DONE

BI-2A priprava dokoncena.
Server jeste neni spusten.

Instalace: ${INSTALL_DIR}
Backend:   https://${LUBANOTE_BACKEND_DOMAIN}

Dalsi krok:
  cd ${INSTALL_DIR}
  sh run.sh secrets
  ${SCRIPT_DIR}/03_start_and_check_lubanote_server.sh

DULEZITE: Pred startem musi DNS domeny smerovat na IP tohoto serveru a firewall musi pustit TCP 80/443.
DONE
