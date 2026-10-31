-- LubaNote 697Z-J: frozen inactive Supabase Cloud only. Not for active LubaServer.
-- Exact function bodies exported from live LubaServer at deploy time.
-- Four missing app functions + one auth-confirmation trigger. No user data DML.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $pre$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION '697ZJ_ROLE_NOT_POSTGRES'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true AND frozen) THEN RAISE EXCEPTION '697ZJ_TARGET_NOT_FROZEN'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('lubanote_fcm_allow_send','lubanote_svg_draft_push_696a','lubanote_get_account_cloud_usage_v1','lubanote_auto_demo_on_confirmation_697f')) THEN RAISE EXCEPTION '697ZJ_ALREADY_HAS_APP_FUNCTION'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='lubanote_auto_demo_after_confirm_697f' AND NOT tgisinternal) THEN RAISE EXCEPTION '697ZJ_DEMO_TRIGGER_ALREADY_PRESENT'; END IF;
END
$pre$;
CREATE OR REPLACE FUNCTION public.lubanote_fcm_allow_send(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.lubanote_fcm_dispatch(user_id, last_sent_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_sent_at = EXCLUDED.last_sent_at
    WHERE public.lubanote_fcm_dispatch.last_sent_at < now() - interval '20 seconds';
  RETURN FOUND;
END;
$function$

;
REVOKE ALL ON FUNCTION public.lubanote_fcm_allow_send(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_fcm_allow_send(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.lubanote_svg_draft_push_696a(p_id text, p_name text, p_document jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_rev bigint;
  v_at timestamptz;
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'SVG696A_AUTH_REQUIRED';
  END IF;
  IF p_id IS NULL OR char_length(p_id) NOT BETWEEN 5 AND 128 OR p_id ~ '^__'
    OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 70
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_document IS NULL OR jsonb_typeof(p_document) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_document->'shapes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_document->'shapes') NOT BETWEEN 1 AND 800
    OR octet_length(p_document::text) > 2400000
  THEN
    RAISE EXCEPTION 'SVG696A_INVALID_INPUT';
  END IF;

  IF p_expected_revision = 0 THEN
    INSERT INTO public.lubanote_svg_drafts_696a (user_id,id,name,document,revision,updated_at)
      VALUES(v_user,p_id,p_name,p_document,1,clock_timestamp())
      ON CONFLICT (user_id,id) DO NOTHING
      RETURNING revision,updated_at INTO v_rev,v_at;
  ELSE
    UPDATE public.lubanote_svg_drafts_696a
      SET name=p_name,document=p_document,revision=revision+1,updated_at=clock_timestamp()
      WHERE user_id=v_user AND id=p_id AND revision=p_expected_revision
      RETURNING revision,updated_at INTO v_rev,v_at;
  END IF;
  IF v_rev IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','revision_conflict');
  END IF;
  RETURN jsonb_build_object('ok',true,'revision',v_rev,'updated_at',v_at);
END
$function$

;
REVOKE ALL ON FUNCTION public.lubanote_svg_draft_push_696a(text,text,jsonb,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_svg_draft_push_696a(text,text,jsonb,bigint) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.lubanote_get_account_cloud_usage_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_access public.lubanote_user_access%ROWTYPE;
  v_plan public.lubanote_plans%ROWTYPE;

  v_note_count bigint := 0;
  v_note_bytes bigint := 0;
  v_media_count bigint := 0;
  v_media_bytes bigint := 0;
  v_attachment_bytes bigint := 0;
  v_reserved_bytes bigint := 0;
  v_used_bytes bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_authenticated'
    );
  END IF;

  SELECT *
  INTO v_access
  FROM public.lubanote_user_access
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'access_not_configured'
    );
  END IF;

  IF v_access.account_status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'account_not_active'
    );
  END IF;

  SELECT *
  INTO v_plan
  FROM public.lubanote_plans
  WHERE id = v_access.plan_id
    AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'plan_not_available'
    );
  END IF;

  -- Aktivni poznamky vcetne jejich E2E dat.
  SELECT
    COUNT(*),
    COALESCE(SUM(octet_length(data::text)), 0)::bigint
  INTO v_note_count, v_note_bytes
  FROM public.notes
  WHERE user_id = v_uid
    AND deleted_at IS NULL;

  -- Sifrovana sdilena media pripisujeme autorovi.
  SELECT
    COUNT(*),
    COALESCE(SUM(octet_length(ciphertext)), 0)::bigint
  INTO v_media_count, v_media_bytes
  FROM public.lubanote_shared_media_payloads
  WHERE created_by_user_id = v_uid;

  -- Samostatne cloudove prilohy.
  -- Rezervace evidujeme oddelene od ulozenych dat.
  SELECT
    COALESCE(SUM(
      CASE
        WHEN status IN ('uploaded', 'active')
        THEN COALESCE(size_bytes, reserved_bytes, 0)
        ELSE 0
      END
    ), 0)::bigint,
    COALESCE(SUM(
      CASE
        WHEN status = 'reserved'
        THEN COALESCE(reserved_bytes, 0)
        ELSE 0
      END
    ), 0)::bigint
  INTO v_attachment_bytes, v_reserved_bytes
  FROM public.attachments
  WHERE user_id = v_uid;

  v_used_bytes :=
    v_note_bytes + v_media_bytes + v_attachment_bytes;

  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', v_access.plan_id,
    'usage_bytes', v_used_bytes,
    'cloud_bytes_limit', v_plan.cloud_bytes_limit,
    'note_bytes', v_note_bytes,
    'note_count', v_note_count,
    'shared_media_bytes', v_media_bytes,
    'shared_media_count', v_media_count,
    'attachment_bytes', v_attachment_bytes,
    'reserved_bytes', v_reserved_bytes,
    'quota_accounted_bytes', v_used_bytes + v_reserved_bytes,
    'is_over_limit',
      CASE
        WHEN v_plan.cloud_bytes_limit IS NULL THEN false
        ELSE v_used_bytes + v_reserved_bytes >
             v_plan.cloud_bytes_limit
      END
  );
END;
$function$

;
REVOKE ALL ON FUNCTION public.lubanote_get_account_cloud_usage_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_get_account_cloud_usage_v1() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.lubanote_auto_demo_on_confirmation_697f()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$

;
REVOKE ALL ON FUNCTION public.lubanote_auto_demo_on_confirmation_697f() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_auto_demo_on_confirmation_697f() TO service_role;
CREATE TRIGGER lubanote_auto_demo_after_confirm_697f AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (((old.email_confirmed_at IS NULL) AND (new.email_confirmed_at IS NOT NULL))) EXECUTE FUNCTION public.lubanote_auto_demo_on_confirmation_697f()
;
DO $verify_body$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.lubanote_fcm_allow_send(uuid)')) IS DISTINCT FROM 'cc6794744a50c245b631425b5800c5ec' THEN RAISE EXCEPTION '697ZJ_BODY_MISMATCH_lubanote_fcm_allow_send'; END IF; END $verify_body$;
DO $verify_body$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.lubanote_svg_draft_push_696a(text,text,jsonb,bigint)')) IS DISTINCT FROM 'db72df42c825c04a1c4b166c9f9965b4' THEN RAISE EXCEPTION '697ZJ_BODY_MISMATCH_lubanote_svg_draft_push_696a'; END IF; END $verify_body$;
DO $verify_body$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.lubanote_get_account_cloud_usage_v1()')) IS DISTINCT FROM 'b09e6c14d8653fe57d6b01acdb452704' THEN RAISE EXCEPTION '697ZJ_BODY_MISMATCH_lubanote_get_account_cloud_usage_v1'; END IF; END $verify_body$;
DO $verify_body$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.lubanote_auto_demo_on_confirmation_697f()')) IS DISTINCT FROM 'fe132b7b9ea8ce5b8ebf756fff129169' THEN RAISE EXCEPTION '697ZJ_BODY_MISMATCH_lubanote_auto_demo_on_confirmation_697f'; END IF; END $verify_body$;
DO $post$
BEGIN
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('lubanote_fcm_allow_send','lubanote_svg_draft_push_696a','lubanote_get_account_cloud_usage_v1','lubanote_auto_demo_on_confirmation_697f') AND p.prosecdef) <> 4 THEN RAISE EXCEPTION '697ZJ_FUNCTION_POSTCHECK_FAILED'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='lubanote_auto_demo_after_confirm_697f' AND NOT tgisinternal AND tgenabled IN ('O','A') AND tgfoid=to_regprocedure('public.lubanote_auto_demo_on_confirmation_697f()') AND tgqual IS NOT NULL) <> 1 THEN RAISE EXCEPTION '697ZJ_TRIGGER_POSTCHECK_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true AND frozen) THEN RAISE EXCEPTION '697ZJ_FREEZE_LOST'; END IF;
END
$post$;
COMMIT;
