-- LUBANOTE 697F | Server-side Demo activation after email confirmation
-- Target: self-hosted LubaServer / Supabase Postgres, not the client or APK.
-- NO historical backfill. Existing pending users are not activated by installing this.
-- This file does not modify any user data on installation.
-- It adds a trigger for FUTURE email-confirmation events only.
-- Run AFTER reviewing 697F_01_PREFLIGHT_READ_ONLY.sql.
-- Database admin / postgres role required to create trigger on auth.users.

BEGIN;

DO $preflight$
DECLARE
  v_days integer;
  v_missing text;
BEGIN
  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.lubanote_user_access') IS NULL
     OR to_regclass('public.lubanote_plans') IS NULL THEN
    RAISE EXCEPTION '697F PRECHECK FAIL: auth/users, access or plans table is missing';
  END IF;

  SELECT string_agg(expectation, ', ' ORDER BY expectation)
  INTO v_missing
  FROM (VALUES
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
  ) AS requirements(schema_name, table_name, expectation)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = requirements.schema_name
      AND c.table_name = requirements.table_name
      AND c.column_name = requirements.expectation
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '697F PRECHECK FAIL: missing columns: %', v_missing;
  END IF;

  IF to_regprocedure('public.lubanote_admin_approve_demo(uuid)') IS NULL THEN
    RAISE EXCEPTION '697F PRECHECK FAIL: original admin approval function missing';
  END IF;

  SELECT demo_days INTO v_days
  FROM public.lubanote_plans
  WHERE id = 'demo' AND active IS TRUE;

  IF v_days IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION '697F PRECHECK FAIL: active Demo plan must be exactly 14 days; found %', v_days;
  END IF;
END
$preflight$;

-- Trigger privileges are internal to PostgreSQL. No public EXECUTE grant.
CREATE OR REPLACE FUNCTION public.lubanote_auto_demo_on_confirmation_697F()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz;
  v_days integer;
BEGIN
  -- Trigger only on the first transition from UNCONFIRMED to CONFIRMED.
  IF TG_OP <> 'UPDATE'
     OR OLD.email_confirmed_at IS NOT NULL
     OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Respect server-controlled plan configuration. Disabled plan = no activation.
  SELECT p.demo_days INTO v_days
  FROM public.lubanote_plans AS p
  WHERE p.id = 'demo' AND p.active IS TRUE;

  IF v_days IS NULL OR v_days <= 0 THEN
    RETURN NEW;
  END IF;

  v_now := pg_catalog.now();

  -- Intentional no-op if the account is missing, already active, rejected,
  -- suspended, previously on Demo/Full, or has reserved Full/Internal plan.
  UPDATE public.lubanote_user_access AS a
  SET account_status = 'active',
      plan_id = 'demo',
      demo_started_at = v_now,
      demo_until = v_now + pg_catalog.make_interval(days => v_days),
      full_until = NULL,
      entitlement_source = 'auto_verified_demo_697F',
      updated_at = v_now
  WHERE a.user_id = NEW.id
    AND a.account_status = 'pending'
    AND a.plan_id NOT IN ('full', 'internal')
    AND a.demo_started_at IS NULL
    AND a.demo_until IS NULL
    AND a.full_until IS NULL;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.lubanote_auto_demo_on_confirmation_697F()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lubanote_auto_demo_after_confirm_697F ON auth.users;

CREATE TRIGGER lubanote_auto_demo_after_confirm_697F
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.lubanote_auto_demo_on_confirmation_697F();

COMMENT ON FUNCTION public.lubanote_auto_demo_on_confirmation_697F() IS
'LubaNote 697F: grants server-configured Demo after first verified email, only to fresh pending users without existing entitlement.';

COMMIT;
