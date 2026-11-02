-- 697FA: serverem rizene automaticke Demo se sdilenym nastavenim v public.lubanote_plans.
-- NENI instalovano automaticky pri --check. Do produkce az po preflight PASS.
-- DULEZITE: zadne BEGIN/COMMIT – vkladá je nasazovaci engine do jedné transakce.
-- Default FALSE zastavi automaticke aktivace novych Demo uctu.
-- Stavajici Demo zustavaji aktivni, plan 'demo' zustava active.
ALTER TABLE public.lubanote_plans
  ADD COLUMN IF NOT EXISTS auto_demo_after_confirmation boolean NOT NULL DEFAULT false;

-- Stavajici trigger zustava natrvalo zapnuty. Rozhoduje databazove nastaveni.
CREATE OR REPLACE FUNCTION public.lubanote_auto_demo_on_confirmation_697f()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz;
  v_days integer;
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.email_confirmed_at IS NOT NULL
     OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.demo_days INTO v_days
  FROM public.lubanote_plans AS p
  WHERE p.id = 'demo'
    AND p.active IS TRUE
    AND p.auto_demo_after_confirmation IS TRUE;

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
END;
$function$;

-- SECURITY DEFINER: pouze overeny admin smi cist/menit prepinac.
CREATE OR REPLACE FUNCTION public.lubanote_admin_get_auto_demo_697fa()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_enabled boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  SELECT p.auto_demo_after_confirmation INTO v_enabled
  FROM public.lubanote_plans AS p
  WHERE p.id='demo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Demo plan missing'; END IF;
  RETURN v_enabled;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lubanote_admin_set_auto_demo_697fa(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid auto demo state';
  END IF;
  UPDATE public.lubanote_plans
     SET auto_demo_after_confirmation=p_enabled
   WHERE id='demo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Demo plan missing'; END IF;
  RETURN public.lubanote_admin_get_auto_demo_697fa();
END;
$function$;

REVOKE ALL ON FUNCTION public.lubanote_auto_demo_on_confirmation_697f()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lubanote_admin_get_auto_demo_697fa()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lubanote_admin_set_auto_demo_697fa(boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_get_auto_demo_697fa()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_set_auto_demo_697fa(boolean)
  TO authenticated;

COMMENT ON COLUMN public.lubanote_plans.auto_demo_after_confirmation IS
  '697FA – globalni automaticke pridelovani 14-denniho Demo novym potvrzenym registracim';
NOTIFY pgrst, 'reload schema';
