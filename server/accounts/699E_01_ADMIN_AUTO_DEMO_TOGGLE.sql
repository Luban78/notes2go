-- LUBANOTE 699F | Oprava Admin Dashboard automatickeho Dema
-- NEMENI auth.users ani jeho trigger (ten zustava beze zmeny a zapnuty).
-- Naprava chyby: "must be owner of table users" pri pokusu ALTER TABLE auth.users.
-- Server-side prepinac: samostatny konfig flag; trigger funkce 697F ho cte.
-- VYCHOZI STAV: VYPNUTO; pouze nove email confirmations, neuzivatelska data.
-- Spustit roli postgres; po uspechu na aktivnim LubaServeru opakovat na Cloudu.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight_699f$
DECLARE v_owner text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '699F_ROLE_MUST_BE_POSTGRES';
  END IF;
  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.lubanote_user_access') IS NULL
     OR to_regclass('public.lubanote_plans') IS NULL
     OR to_regprocedure('public.lubanote_admin_is_current_user()') IS NULL
     OR to_regprocedure('public.lubanote_auto_demo_on_confirmation_697f()') IS NULL THEN
    RAISE EXCEPTION '699F_REQUIRED_OBJECT_MISSING';
  END IF;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure;
  IF v_owner IS DISTINCT FROM current_user THEN
    RAISE EXCEPTION '699F_FUNCTION_OWNER_MISMATCH (owner=%)', v_owner;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass
      AND t.tgname = 'lubanote_auto_demo_after_confirm_697f'
      AND t.tgfoid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION '699F_TRIGGER_MISSING_OR_NOT_ENABLED';
  END IF;
END
$preflight_699f$;

-- Nastaveni se neda cist ani menit primo z webu (zadne policy/granty).
-- Pouze admin RPC pracujici jako SECURITY DEFINER s opakovanou admin kontrolou.
CREATE TABLE IF NOT EXISTS public.lubanote_auto_demo_config_699f (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.lubanote_auto_demo_config_699f ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lubanote_auto_demo_config_699f
  FROM PUBLIC, anon, authenticated, service_role;

-- Instalace fail-safe: jiz pri COMMIT je automaticke Demo vypnute.
INSERT INTO public.lubanote_auto_demo_config_699f (singleton, enabled)
VALUES (true, false)
ON CONFLICT (singleton) DO UPDATE
SET enabled=false, updated_at=pg_catalog.now();

-- Existujici 697F trigger se NEMENI, jeho funkce zachovava puvodni logiku.
-- Oproti 697F pridava pouze kontrolu enabled pred pridelenim Dema.
CREATE OR REPLACE FUNCTION public.lubanote_auto_demo_on_confirmation_697f()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $auto_demo_699f$
DECLARE
  v_now timestamptz;
  v_days integer;
  v_enabled boolean;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.email_confirmed_at IS NOT NULL
     OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.enabled INTO v_enabled
  FROM public.lubanote_auto_demo_config_699f AS c
  WHERE c.singleton IS TRUE;
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT p.demo_days INTO v_days
  FROM public.lubanote_plans AS p
  WHERE p.id = 'demo' AND p.active IS TRUE;
  IF v_days IS NULL OR v_days <= 0 THEN
    RETURN NEW;
  END IF;

  v_now := pg_catalog.now();
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
$auto_demo_699f$;

-- Stavajici vykonna prava na trigger funkci nevymenovat ani nerozsirovat.
-- Dashboard vola pouze admin RPC pres autentizovanou relaci.
CREATE OR REPLACE FUNCTION public.lubanote_admin_get_auto_demo_699e()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $get_699f$
DECLARE v_enabled boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  SELECT enabled INTO v_enabled
  FROM public.lubanote_auto_demo_config_699f WHERE singleton IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION '699F_CONFIG_MISSING'; END IF;
  RETURN v_enabled;
END
$get_699f$;

CREATE OR REPLACE FUNCTION public.lubanote_admin_set_auto_demo_699e(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $set_699f$
DECLARE v_enabled boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION '699F_INVALID_VALUE'; END IF;
  UPDATE public.lubanote_auto_demo_config_699f
  SET enabled=p_enabled, updated_at=pg_catalog.now()
  WHERE singleton IS TRUE
  RETURNING enabled INTO v_enabled;
  IF NOT FOUND THEN RAISE EXCEPTION '699F_CONFIG_MISSING'; END IF;
  RETURN v_enabled;
END
$set_699f$;

REVOKE ALL ON FUNCTION public.lubanote_admin_get_auto_demo_699e()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_get_auto_demo_699e() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean) TO authenticated;

COMMENT ON FUNCTION public.lubanote_admin_get_auto_demo_699e() IS
'LubaNote 699F: admin-only auto Demo configuration state.';
COMMENT ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean) IS
'LubaNote 699F: admin-only auto Demo setting without auth.users DDL.';
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Kontrola po uspesne instalaci (bez udaju o uzivatelich).
SELECT CASE
  WHEN c.enabled IS FALSE THEN 'AUTO_DEMO=OFF'
  ELSE 'AUTO_DEMO=ERROR'
END AS result
FROM public.lubanote_auto_demo_config_699f c
WHERE c.singleton IS TRUE;
