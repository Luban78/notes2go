-- LUBANOTE 697F | READ ONLY PRECHECK | V1 automatic 14-day Demo
-- Run in self-hosted Supabase Studio SQL Editor with the database admin role.
-- Does not create, modify or delete data.

-- 1. Expected schema and field types
SELECT 'TABLES' AS check_name,
       to_regclass('auth.users') IS NOT NULL AS auth_users_ok,
       to_regclass('public.lubanote_user_access') IS NOT NULL AS access_ok,
       to_regclass('public.lubanote_plans') IS NOT NULL AS plans_ok,
       to_regprocedure('public.lubanote_admin_approve_demo(uuid)') IS NOT NULL AS manual_approval_ok;

-- 2. Critical columns expected by the proposed trigger
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_schema = 'auth' AND table_name = 'users'
       AND column_name IN ('id', 'created_at', 'email_confirmed_at'))
   OR (table_schema = 'public' AND table_name = 'lubanote_user_access'
       AND column_name IN ('user_id', 'plan_id', 'account_status', 'demo_started_at',
                           'demo_until', 'full_until', 'entitlement_source', 'updated_at'))
   OR (table_schema = 'public' AND table_name = 'lubanote_plans'
       AND column_name IN ('id', 'active', 'demo_days'))
ORDER BY table_schema, table_name, column_name;

-- 3. 14-day plan configuration. Expected: demo / true / 14
SELECT id, active, demo_days
FROM public.lubanote_plans
WHERE id = 'demo';

-- 4. Current account status summary (no names or emails)
SELECT account_status, plan_id, count(*) AS pocet
FROM public.lubanote_user_access
GROUP BY account_status, plan_id
ORDER BY account_status, plan_id;

-- 5. Existing triggers on auth.users (to check signup provisioning)
SELECT tgname AS trigger_name,
       pg_get_triggerdef(oid, true) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
ORDER BY tgname;

-- 6. CHECK constraints for access table, useful for confirming entitlement_source values
SELECT conname, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'public.lubanote_user_access'::regclass
  AND contype = 'c'
ORDER BY conname;

-- 7. FINAL SINGLE-LINE RESULT (shown even if Studio displays only last result)
WITH required_cols(schema_name, table_name, column_name) AS (
  VALUES
    ('auth', 'users', 'id'),
    ('auth', 'users', 'email_confirmed_at'),
    ('public', 'lubanote_user_access', 'user_id'),
    ('public', 'lubanote_user_access', 'plan_id'),
    ('public', 'lubanote_user_access', 'account_status'),
    ('public', 'lubanote_user_access', 'demo_started_at'),
    ('public', 'lubanote_user_access', 'demo_until'),
    ('public', 'lubanote_user_access', 'full_until'),
    ('public', 'lubanote_user_access', 'entitlement_source'),
    ('public', 'lubanote_user_access', 'updated_at'),
    ('public', 'lubanote_plans', 'id'),
    ('public', 'lubanote_plans', 'active'),
    ('public', 'lubanote_plans', 'demo_days')
), info AS (
  SELECT
    (SELECT count(*) FROM required_cols r WHERE EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = r.schema_name AND c.table_name = r.table_name
        AND c.column_name = r.column_name
    )) AS found_columns,
    (SELECT p.demo_days FROM public.lubanote_plans p WHERE p.id='demo' AND p.active IS TRUE) AS days,
    to_regprocedure('public.lubanote_admin_approve_demo(uuid)') IS NOT NULL AS admin_rpc
)
SELECT CASE WHEN found_columns = 13 AND days = 14 AND admin_rpc
       THEN 'PASS - 697F PREFLIGHT' ELSE 'FAIL - ZASTAVIT A PROVERIT' END AS result,
       found_columns AS columns_of_13, days AS demo_days, admin_rpc AS manual_approval_exists
FROM info;
