#!/usr/bin/env bash
# 698B: LubaNote Server Deploy – libovolny pocet registrovanych backendu.
# Prvni bezpecny beh: --check (read-only). --apply vyzaduje potvrzeni.
set -Eeuo pipefail
umask 077
MODE="${1:---check}"
case "$MODE" in --check|--apply) ;; *) echo 'Pouziti: server-deploy.sh --check|--apply' >&2; exit 2;; esac
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$SELF/migrations"
VERIFY="$SELF/verify"
REGISTRY="$SELF/backends.conf"
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
CONTROL="${SOURCE_CONTROL_STATE_FILE:-$HOME/luba-server/migration-bridge/control-state.json}"
LIB="$BASE/bin/destination-lib"
ROOT_STATE="${LUBANOTE_SERVER_DEPLOY_STATE:-$HOME/.local/state/lubanote-server-deploy}"

fail() { printf 'SERVER_DEPLOY=BLOCKED reason=%s\n' "$*" >&2; exit 1; }
[[ -r "$LIB" ]] || fail "chybi destination-lib: $LIB"
[[ -r "$CONTROL" ]] || fail "chybi control-state.json"
[[ -d "$MIGRATIONS" ]] || fail 'chybi adresar migrations'
[[ -d "$VERIFY" ]] || fail 'chybi adresar verify'
[[ -r "$REGISTRY" ]] || fail 'chybi seznam backendu backends.conf'
command -v sha256sum >/dev/null || fail 'chybi sha256sum'
command -v python3 >/dev/null || fail 'chybi python3'

# NIKDY neprepisovat aktivni Migration Manager destination.env ani backend-select.
# Vsechny operace pouzivaji ulozene backend profily ve vlastnim subshellu.
read -r ACTIVE MODE_CONTROL CUTOVER < <(python3 - "$CONTROL" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
print(str(x.get('active_backend','?')),str(x.get('mode','?')),str(x.get('cutover_enabled','?')))
PY
)
MANAGER_STATE="$(cat "$BASE/state/state" 2>/dev/null || echo UNKNOWN)"
printf '=== LUBANOTE SERVER DEPLOY 698B ===\n'
printf 'RUN_MODE=%s\nACTIVE_BACKEND=%s\nCONTROL_MODE=%s\nCUTOVER_ENABLED=%s\nMANAGER_STATE=%s\n' \
  "$MODE" "$ACTIVE" "$MODE_CONTROL" "$CUTOVER" "$MANAGER_STATE"
[[ "$ACTIVE" =~ ^[a-z0-9._-]+$ && "$MODE_CONTROL" == NORMAL && "$CUTOVER" == False ]] || fail 'produkce neni NORMAL s platnym aktivnim backendem' 
[[ "$MANAGER_STATE" == IDLE || "$MANAGER_STATE" == CUTOVER_COMPLETE ]] || fail 'Migration Manager ma rozpracovanou migraci'

# Backend registry je explicitni whitelist; nelze automaticky vyhledat server,
# ktery dosud nema profil/spojeni/bezpecnostni overeni. V budoucnu staci
# pridat radek v backends.conf a prislusny profil u Migration Manageru.
declare -a BACKENDS=() DEPLOY_ORDER=()
declare -A BACKEND_SEEN=()
while IFS= read -r raw || [[ -n "$raw" ]]; do
  raw="${raw%%#*}"
  raw="${raw//[[:space:]]/}"
  [[ -n "$raw" ]] || continue
  [[ "$raw" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || fail "neplatny backend ID: $raw"
  [[ -z "${BACKEND_SEEN[$raw]+x}" ]] || fail "duplicitni backend ID: $raw"
  BACKEND_SEEN["$raw"]=1
  BACKENDS+=("$raw")
done < "$REGISTRY"
((${#BACKENDS[@]} > 0)) || fail 'zadne registrovane backendy'
[[ -n "${BACKEND_SEEN[$ACTIVE]+x}" ]] || fail "aktivni backend $ACTIVE neni v backends.conf"
# Aby se produkce menila az jako posledni, zacneme neaktivnimi backendy.
for target in "${BACKENDS[@]}"; do
  [[ "$target" == "$ACTIVE" ]] || DEPLOY_ORDER+=("$target")
done
DEPLOY_ORDER+=("$ACTIVE")
printf 'REGISTERED_BACKENDS=%s\n' "${BACKENDS[*]}"
printf 'DEPLOY_ORDER=%s\n' "${DEPLOY_ORDER[*]}"

shopt -s nullglob
MIG_FILES=("$MIGRATIONS"/*.sql)
((${#MIG_FILES[@]} > 0)) || fail 'zadne migrace'
for migration in "${MIG_FILES[@]}"; do
  id="$(basename "$migration" .sql)"
  [[ "$id" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "neplatny identifikator $id"
  [[ -r "$VERIFY/$id.sql" ]] || fail "chybi verify/$id.sql"
done

# Jednotny adapter na lokalni LubaServer (docker) a Cloud (remote), oba
# pres STEJNOU destination-lib, ale BEZ zasahu do produkcniho configu.
with_backend() (
  local target="$1"; shift
  local profile="$BASE/config/backend-profiles/$target.destination.env"
  [[ -r "$profile" ]] || fail "chybi profil $profile"
  [[ "$(stat -c '%a' "$profile")" == 600 ]] || fail "profil $target musi mit chmod 600"
  # shellcheck source=/dev/null
  source "$LIB"
  DEST_CFG="$profile"
  dest_load
  [[ "${DEST_BACKEND_ID:-}" == "$target" ]] || fail "spatny backend identifikator profilu $target"
  "$@"
)

backend_preflight() {
  local target="$1" role present owner mode trg
  # read-only kontrola, bez vypisu klicu a hesel
  role="$(dest_psql -At -c 'SELECT current_user;')"
  present="$(dest_psql -At -c "SELECT
    (to_regclass('public.lubanote_plans') IS NOT NULL)::int,
    (to_regclass('auth.users') IS NOT NULL)::int,
    (to_regprocedure('public.lubanote_auto_demo_on_confirmation_697f()') IS NOT NULL)::int,
    (to_regprocedure('public.lubanote_admin_is_current_user()') IS NOT NULL)::int;" | tr '\n' ' ' | tr -d ' ')"
  owner="$(dest_psql -At -c "SELECT COALESCE(pg_get_userbyid(c.relowner),'UNKNOWN') FROM pg_class c WHERE c.oid='public.lubanote_plans'::regclass;")"
  trg="$(dest_psql -At -c "SELECT count(*) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='lubanote_auto_demo_after_confirm_697f' AND NOT tgisinternal;")"
  local freeze_state
  freeze_state="$(dest_psql -At -c "SELECT CASE WHEN frozen THEN 'FROZEN' ELSE 'UNFROZEN' END FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true;")"
  printf 'BACKEND=%s FREEZE=%s\n' "$target" "$freeze_state"
  if [[ "$target" == "$ACTIVE" ]]; then
    [[ "$freeze_state" == UNFROZEN ]] || fail "$target: aktivni backend neni writable"
  else
    [[ "$freeze_state" == FROZEN ]] || fail "$target: neaktivni backend neni frozen"
  fi
  printf 'BACKEND=%s DB_ROLE=%s PLANS_OWNER=%s PREREQUISITES=%s TRIGGER_COUNT=%s\n' "$target" "$role" "$owner" "$present" "$trg"
  [[ "$role" == postgres ]] || fail "$target: DB role neni postgres"
  [[ "$owner" == postgres ]] || fail "$target: postgres nevlastni lubanote_plans; bez zmeny databaze"
  [[ "$present" == 1\|1\|1\|1 ]] || fail "$target: chybi vychozi schema/funkce"
  [[ "$trg" == 1 ]] || fail "$target: chybi puvodni trigger"
}

ledger_get() {
  local id="$1" exists
  exists="$(dest_psql -At -c "SELECT (to_regclass('lubanote_schema_deploy.applied_migrations') IS NOT NULL)::int;")"
  if [[ "$exists" == 0 ]]; then printf 'PENDING'; return; fi
  local current
  current="$(dest_psql -At -c "SELECT checksum_sha256 FROM lubanote_schema_deploy.applied_migrations WHERE migration_id='$id';")"
  [[ -n "$current" ]] && printf '%s' "$current" || printf 'PENDING'
}

# Funkci volame ve stejnem subshellu jako dest_load.
check_one_backend() {
  local target="$1" file id expected actual
  backend_preflight "$target"
  for file in "${MIG_FILES[@]}"; do
    id="$(basename "$file" .sql)"
    expected="$(sha256sum "$file" | cut -d' ' -f1)"
    actual="$(ledger_get "$id")"
    if [[ "$actual" == PENDING ]]; then
      printf 'BACKEND=%s MIGRATION=%s STATUS=PENDING\n' "$target" "$id"
    elif [[ "$actual" == "$expected" ]]; then
      printf 'BACKEND=%s MIGRATION=%s STATUS=APPLIED_CHECKSUM_OK\n' "$target" "$id"
      dest_psql -At < "$VERIFY/$id.sql" >/dev/null || fail "$target: verify selhalo u $id"
    else
      fail "$target: $id ma jiny checksum, NIKDY neprepisovat historickou migraci"
    fi
  done
}

# Nejdříve uplna read-only kontrola VSECH registrovanych backendu.
for target in "${DEPLOY_ORDER[@]}"; do
  with_backend "$target" check_one_backend "$target"
done
printf 'PREFLIGHT=PASS\n'
if [[ "$MODE" == --check ]]; then
  printf 'DATABASE_WRITES=NONE\nSERVER_DEPLOY=CHECK_ONLY\n'
  exit 0
fi

# Pri jednom kliknuti ve widgetu lze odklepnout terminalove potvrzeni.
[[ -t 0 ]] || fail 'aplikace vyzaduje interaktivni terminal; spust --check'
printf '\nPOZOR: nasleduji SQL migrace ve vsech registrovanych backendech; aktivni backend az posledni.\n'
read -r -p 'Pro potvrzeni napis NASADIT: ' answer
[[ "$answer" == NASADIT ]] || fail 'uzivatel nepotvrdil nasazeni'
mkdir -p "$ROOT_STATE"
chmod 700 "$ROOT_STATE"
RUN_LOG="$ROOT_STATE/$(date -u +%Y%m%dT%H%M%SZ).log"
printf 'RUN=%s\n' "$(date -u +%FT%TZ)" > "$RUN_LOG"

apply_one_backend() {
  local target="$1" file id expected actual
  for file in "${MIG_FILES[@]}"; do
    id="$(basename "$file" .sql)"
    expected="$(sha256sum "$file" | cut -d' ' -f1)"
    actual="$(ledger_get "$id")"
    if [[ "$actual" == "$expected" ]]; then
      printf 'BACKEND=%s MIGRATION=%s SKIP=ALREADY_APPLIED\n' "$target" "$id"
      continue
    fi
    [[ "$actual" == PENDING ]] || fail "$target: checksum conflict $id"
    printf 'BACKEND=%s MIGRATION=%s APPLY=START\n' "$target" "$id"
    # Jeden PostgreSQL transaction pro DDL + audit ledger na JEDNOM backendu.
    # Mezi dvema servery atomicka transakce neexistuje: pri neuspechu STOP,
    # nezahajovat operaci na druhem serveru.
    {
      printf 'BEGIN;\nSET LOCAL lock_timeout = %s;\nSET LOCAL statement_timeout = %s;\n' "'5s'" "'120s'"
      printf 'CREATE SCHEMA IF NOT EXISTS lubanote_schema_deploy;\n'
      printf 'REVOKE ALL ON SCHEMA lubanote_schema_deploy FROM PUBLIC;\n'
      printf 'CREATE TABLE IF NOT EXISTS lubanote_schema_deploy.applied_migrations (migration_id text PRIMARY KEY, checksum_sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n'
      cat "$file"
      printf '\nINSERT INTO lubanote_schema_deploy.applied_migrations(migration_id,checksum_sha256) VALUES (%s,%s);\n' "'$id'" "'$expected'"
      printf 'COMMIT;\n'
    } | dest_psql >/dev/null || fail "$target: apply $id selhal; zkontroluj log a stav pred dalsim pokusem"
    dest_psql -At < "$VERIFY/$id.sql" >/dev/null || fail "$target: post-verify $id FAILED"
    printf 'BACKEND=%s MIGRATION=%s APPLY=PASS VERIFY=PASS\n' "$target" "$id"
    printf '%s %s PASS\n' "$target" "$id" >> "$RUN_LOG"
  done
}

# Nejprve neaktivni backendy a produkce jako posledni.
for target in "${DEPLOY_ORDER[@]}"; do
  with_backend "$target" apply_one_backend "$target"
done
printf 'SERVER_DEPLOY=PASS\n'
