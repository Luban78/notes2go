#!/usr/bin/env bash
# LUBANOTE 686R: DB metadata audit. No user rows; no writes; no secrets.
set -Eeuo pipefail

DB_KONTEJNER="${LUBA_DB_CONTAINER:-supabase-db}"
HV='********************************'
printf '%s\n%s\n' "$HV" "$HV"
trap 'printf "%s\n%s\n" "$HV" "$HV"' EXIT

printf '%s\n' 'LUBANOTE 686R - SERVER WRITE FENCE AUDIT (READ-ONLY)'
printf '%s\n' 'scope: local LubaServer PostgreSQL catalogs only'

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'auditResult: ERROR_DOCKER_MISSING' 'safeToRotate: NO'
  exit 10
fi
if ! docker inspect --format '{{.State.Running}}' "$DB_KONTEJNER" 2>/dev/null | grep -qx true; then
  printf '%s\n' 'auditResult: ERROR_DB_CONTAINER_NOT_RUNNING' 'safeToRotate: NO'
  exit 11
fi

if ! docker exec -i "$DB_KONTEJNER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';

SELECT 'dbCatalogAccess: YES';
SELECT 'readOnlyTransaction: YES';

-- No function call; metadata only. Do not reveal the implementation body.
WITH f AS (
  SELECT to_regprocedure('public.lubanote_recovery_atomic_commit_686n(jsonb,jsonb,jsonb,jsonb,jsonb,integer)') AS oid
)
SELECT 'recoveryRpcInstalled: '||
  CASE WHEN oid IS NULL THEN 'NO' ELSE 'YES' END
FROM f;
WITH f AS (
  SELECT to_regprocedure('public.lubanote_recovery_atomic_commit_686n(jsonb,jsonb,jsonb,jsonb,jsonb,integer)') AS oid
)
SELECT 'recoveryRpcAnonAccess: '||
  CASE WHEN oid IS NULL THEN 'NOT_INSTALLED'
       WHEN has_function_privilege('anon',oid,'EXECUTE') THEN 'EXPOSED'
       ELSE 'BLOCKED' END
FROM f;
WITH f AS (
  SELECT to_regprocedure('public.lubanote_recovery_atomic_commit_686n(jsonb,jsonb,jsonb,jsonb,jsonb,integer)') AS oid
)
SELECT 'recoveryRpcAuthenticatedAccess: '||
  CASE WHEN oid IS NULL THEN 'NOT_INSTALLED'
       WHEN has_function_privilege('authenticated',oid,'EXECUTE') THEN 'EXPOSED'
       ELSE 'BLOCKED' END
FROM f;

-- RLS states of the known E2E and sync write surfaces.
WITH target(s,n) AS (VALUES
  ('public','notes'),
  ('public','secret_settings'),
  ('public','devices'),
  ('public','attachments'),
  ('public','tags'),
  ('public','lubanote_shared_crypto_identities'),
  ('storage','objects')
)
SELECT 'rls_'||t.s||'.'||t.n||': '||
       CASE WHEN c.oid IS NULL THEN 'TABLE_NOT_FOUND'
            WHEN c.relrowsecurity THEN 'ENABLED'
            ELSE 'DISABLED' END
FROM target t
LEFT JOIN pg_namespace ns ON ns.nspname=t.s
LEFT JOIN pg_class c ON c.relnamespace=ns.oid AND c.relname=t.n AND c.relkind IN ('r','p')
ORDER BY t.s,t.n;

-- Only names/counts of enabled triggers, not data or trigger definitions.
WITH target(s,n) AS (VALUES
  ('public','notes'),
  ('public','secret_settings'),
  ('public','devices'),
  ('public','attachments'),
  ('public','tags'),
  ('public','lubanote_shared_crypto_identities'),
  ('storage','objects')
), triggers AS (
  SELECT t.s,t.n,tr.tgname,
    (tr.tgenabled IN ('O','A')) AS enabled_for_origin,
    (tr.tgname ~* '(recover|rotat|rekey|epoch|key.?version|write.?fence|password)'
      OR pr.proname ~* '(recover|rotat|rekey|epoch|key.?version|write.?fence|password)')
      AND NOT (tr.tgname ~* 'migration' OR pr.proname ~* 'migration') AS possible_fence
  FROM target t
  JOIN pg_namespace ns ON ns.nspname=t.s
  JOIN pg_class c ON c.relnamespace=ns.oid AND c.relname=t.n
  JOIN pg_trigger tr ON tr.tgrelid=c.oid AND NOT tr.tgisinternal
  JOIN pg_proc pr ON pr.oid=tr.tgfoid
)
SELECT 'writeTriggers_'||t.s||'.'||t.n||': '||
  COUNT(tr.tgname)::text||' enabled='||
  COUNT(tr.tgname) FILTER (WHERE tr.enabled_for_origin)::text||
  ' recoveryNamed='||COUNT(tr.tgname) FILTER (WHERE tr.enabled_for_origin AND tr.possible_fence)::text
FROM target t LEFT JOIN triggers tr USING (s,n)
GROUP BY t.s,t.n ORDER BY t.s,t.n;

-- Policy counts distinguish SELECT and writes but cannot prove an epoch fence.
WITH target(s,n) AS (VALUES
  ('public','notes'),
  ('public','secret_settings'),
  ('public','devices'),
  ('public','attachments'),
  ('public','tags'),
  ('public','lubanote_shared_crypto_identities'),
  ('storage','objects')
)
SELECT 'writePolicies_'||t.s||'.'||t.n||': '||COUNT(pol.oid)::text
FROM target t
LEFT JOIN pg_namespace ns ON ns.nspname=t.s
LEFT JOIN pg_class c ON c.relnamespace=ns.oid AND c.relname=t.n
LEFT JOIN pg_policy pol ON pol.polrelid=c.oid AND pol.polcmd IN ('a','w','*')
GROUP BY t.s,t.n ORDER BY t.s,t.n;

-- Catalog signals for key versioning, not a claim of enforcement.
SELECT 'epochLikeColumns: '||COUNT(*)::text
FROM information_schema.columns
WHERE (table_schema='public' AND table_name IN
       ('notes','devices','secret_settings','lubanote_shared_crypto_identities'))
  AND column_name ~* '(epoch|rotat|key.*generation|credential.*version)';

SELECT 'sessionRevocationVerified: NO';
SELECT 'offlineQueuedWritesRejectedVerified: NO';
SELECT 'allWritePathsVerified: NO';
SELECT 'serverWriteFenceInspected: CATALOG_ONLY';
SELECT 'serverWriteFenceVerified: NO';
SELECT 'multiDeviceFenceVerified: NO';
SELECT 'serverAtomicCommitCalled: NO';
SELECT 'safeToRotate: NO';
SELECT 'reason: metadata_only_dynamic_old_key_write_rejection_not_proven';
SELECT 'E2E password/keys/notes/server modified: NO';
ROLLBACK;
SQL
then
  printf '%s\n' 'auditResult: ERROR_DB_READ_FAILED' 'safeToRotate: NO'
  exit 12
fi
printf '%s\n' 'auditResult: CATALOG_AUDIT_COMPLETE'
