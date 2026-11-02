-- LubaNote 699E – Admin Dashboard: automatické 14denní Demo.
-- Pro aktivní LubaServer (potom samostatně Cloud). Nedotýká se uživatelských dat.
-- Výchozí nastavení po instalaci: VYPNUTO; ruční schvalování zůstává dostupné.
-- Vyžaduje aktuální trigger 697F a admin RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '699E vyzaduje databazoveho vlastnika postgres';
  END IF;
  IF to_regprocedure('public.lubanote_admin_is_current_user()') IS NULL THEN
    RAISE EXCEPTION '699E chybi admin RPC';
  END IF;
  IF to_regprocedure('public.lubanote_auto_demo_on_confirmation_697f()') IS NULL THEN
    RAISE EXCEPTION '699E chybi automaticke Demo 697F';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'lubanote_auto_demo_after_confirm_697f'
      AND tgfoid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '699E chybi odpovidajici trigger';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.lubanote_admin_get_auto_demo_699e()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_mode "char";
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  SELECT t.tgenabled INTO v_mode
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND t.tgname = 'lubanote_auto_demo_after_confirm_697f'
    AND t.tgfoid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure
    AND NOT t.tgisinternal;
  IF NOT FOUND THEN RAISE EXCEPTION '699E trigger missing'; END IF;
  RETURN v_mode IN ('O', 'A');
END
$fn$;

CREATE OR REPLACE FUNCTION public.lubanote_admin_set_auto_demo_699e(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION '699E invalid boolean'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'lubanote_auto_demo_after_confirm_697f'
      AND tgfoid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure
      AND NOT tgisinternal
  ) THEN RAISE EXCEPTION '699E trigger missing'; END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  IF p_enabled THEN
    EXECUTE 'ALTER TABLE auth.users ENABLE TRIGGER lubanote_auto_demo_after_confirm_697f';
  ELSE
    EXECUTE 'ALTER TABLE auth.users DISABLE TRIGGER lubanote_auto_demo_after_confirm_697f';
  END IF;
  RETURN public.lubanote_admin_get_auto_demo_699e();
END
$fn$;

-- Nepovolíme anonymní ani servisní běžné spouštění.
REVOKE ALL ON FUNCTION public.lubanote_admin_get_auto_demo_699e()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_get_auto_demo_699e() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean) TO authenticated;

-- DŮLEŽITÉ: instalace zároveň okamžitě vypne automatický Demo trigger.
-- Ruční admin schvalování neovlivní.
ALTER TABLE auth.users DISABLE TRIGGER lubanote_auto_demo_after_confirm_697f;

COMMENT ON FUNCTION public.lubanote_admin_get_auto_demo_699e() IS
'LubaNote 699E: admin-only current state of automatic Demo.';
COMMENT ON FUNCTION public.lubanote_admin_set_auto_demo_699e(boolean) IS
'LubaNote 699E: admin-only enable or disable automatic Demo on verification.';
NOTIFY pgrst, 'reload schema';
COMMIT;

-- READ-ONLY INSTALL VERIFICATION. Never prints user information.
SELECT CASE WHEN t.tgenabled = 'D' THEN 'AUTO_DEMO=OFF'
       ELSE 'AUTO_DEMO=WARNING_NOT_OFF' END AS result
FROM pg_catalog.pg_trigger t
WHERE t.tgrelid='auth.users'::regclass
  AND t.tgname='lubanote_auto_demo_after_confirm_697f';
