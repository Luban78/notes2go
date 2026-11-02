-- Fail-fast read-only test. The deployer treats any SQL exception as failed.
DO $verify$
DECLARE
  c record;
  v boolean;
BEGIN
  SELECT column_name, data_type, is_nullable INTO c
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='lubanote_plans'
     AND column_name='auto_demo_after_confirmation';
  IF NOT FOUND OR c.data_type <> 'boolean' OR c.is_nullable <> 'NO' THEN
    RAISE EXCEPTION '697FA: missing/incorrect setting column';
  END IF;
  IF to_regprocedure('public.lubanote_admin_get_auto_demo_697fa()') IS NULL
     OR to_regprocedure('public.lubanote_admin_set_auto_demo_697fa(boolean)') IS NULL THEN
    RAISE EXCEPTION '697FA: admin RPC missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.lubanote_auto_demo_on_confirmation_697f()'::regprocedure
      AND p.prosecdef
      AND p.prosrc LIKE '%auto_demo_after_confirmation%'
  ) THEN RAISE EXCEPTION '697FA: trigger function does not read setting'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='auth.users'::regclass
      AND tgname='lubanote_auto_demo_after_confirm_697f'
      AND tgenabled IN ('O','A')
      AND NOT tgisinternal
  ) THEN RAISE EXCEPTION '697FA: confirmation trigger not active'; END IF;
  IF has_function_privilege('anon', 'public.lubanote_admin_set_auto_demo_697fa(boolean)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.lubanote_admin_set_auto_demo_697fa(boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.lubanote_admin_get_auto_demo_697fa()', 'EXECUTE') THEN
    RAISE EXCEPTION '697FA: RPC permissions incorrect';
  END IF;
  SELECT auto_demo_after_confirmation INTO v FROM public.lubanote_plans WHERE id='demo';
  IF NOT FOUND THEN RAISE EXCEPTION '697FA: demo plan missing'; END IF;
END;
$verify$;
SELECT '697FA_VERIFY=PASS';
