#!/usr/bin/env bash
# 691BD: READ ONLY live database compatibility preflight.
# Requires existing, explicitly provided libpq connection env (PGHOST, PGDATABASE, PGUSER, etc.).
# Does not write to production. Does not print SQL definitions, tokens, or note content.
set -Eeuo pipefail
export PGCONNECT_TIMEOUT=5
if [[ -z "${PGHOST:-}" || -z "${PGDATABASE:-}" || -z "${PGUSER:-}" ]]; then
  echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=missing_connection_environment'; exit 2
fi
command -v psql >/dev/null || { echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=psql_unavailable'; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT="$ROOT/server/autotester/689F_real_rpc.sql"
[[ -r "$SNAPSHOT" ]] || { echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=missing_export'; exit 2; }
# Function implementation is intentionally checked without emitting bodies to terminal.
# Snapshot is 3 function definitions; require known local reference checksum.
KNOWN_SHA='a46d38e29819ae67b037ebebc5dbedf3539109c25f747156437b4cc6e27302b3'
actual_sha="$(sha256sum "$SNAPSHOT" | awk '{print $1}')"
[[ "$actual_sha" == "$KNOWN_SHA" ]] || { echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=export_changed'; exit 2; }
# Force read-only even if the role unexpectedly has write privileges.
# Check minimal deployed function contract and report counts only.
if ! output="$(PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on -c statement_timeout=10000" \
  psql -X -q -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='save_note_safe' AND p.pronargs=5 AND pg_get_function_result(p.oid)='jsonb' AND p.prosecdef" 2>/dev/null)"; then
  echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=db_connection_or_catalog'; exit 2
fi
if [[ "$output" != '1' ]]; then
  echo 'LIVE_RPC_PREFLIGHT=BLOCKED reason=rpc_signature_mismatch'; exit 2
fi
# PostgreSQL normalized functions can vary in formatting; only a presence/signature check here.
# IMPORTANT: This does not establish body parity or actual write safety.
echo 'LIVE_RPC_PREFLIGHT=PASS scope=READ_ONLY_SIGNATURE_ONLY body_parity=NOT_VERIFIED writes=NOT_TESTED'
