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

if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo 'CHYBA: chybi self-hosted .env.' >&2
  exit 1
fi

read_env() {
  grep -m1 "^$1=" "$INSTALL_DIR/.env" | cut -d= -f2-
}

public_url="$(read_env SUPABASE_PUBLIC_URL)"
publishable_key="$(read_env SUPABASE_PUBLISHABLE_KEY)"

if [ -z "$public_url" ] || [ -z "$publishable_key" ]; then
  echo 'CHYBA: chybi SUPABASE_PUBLIC_URL nebo SUPABASE_PUBLISHABLE_KEY.' >&2
  exit 1
fi

cat <<PROFILE
Bezpecne hodnoty pro budouci LubaNote profil:

url: ${public_url}/
publishableKey: ${publishable_key}
projectRef: lubanote-server
authStorageKey: sb-lubanote-server-auth-token

POZOR: SERVICE_ROLE_KEY ani SUPABASE_SECRET_KEY nikdy nevkladej do aplikace.
PROFILE
