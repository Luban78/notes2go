BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '697ZI_REQUIRES_POSTGRES_ROLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true AND frozen=true) THEN
    RAISE EXCEPTION '697ZI_CLOUD_NOT_FROZEN';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lubanote_change_e2e_password_688b') THEN
    RAISE EXCEPTION '697ZI_RPC_ALREADY_EXISTS';
  END IF;
  IF to_regclass('auth.sessions') IS NULL OR to_regclass('public.notes') IS NULL OR
     to_regclass('public.tags') IS NULL OR to_regclass('public.secret_settings') IS NULL OR
     to_regclass('public.lubanote_shared_crypto_identities') IS NULL OR
     to_regclass('public.attachments') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION '697ZI_MISSING_DEPENDENCY';
  END IF;
END
$preflight$;
CREATE OR REPLACE FUNCTION public.lubanote_change_e2e_password_688b(p_expected_settings jsonb, p_new_settings jsonb, p_expected_shared_box jsonb, p_new_shared_box jsonb, p_note_changes jsonb, p_tag_changes jsonb, p_expected_notes integer, p_expected_tags integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth', 'storage'
AS $function$
DECLARE
  who uuid := auth.uid();
  old_s public.secret_settings%ROWTYPE;
  shared_s public.lubanote_shared_crypto_identities%ROWTYPE;
  row_n public.notes%ROWTYPE;
  row_t public.tags%ROWTYPE;
  item jsonb;
  seen_n text[] := ARRAY[]::text[];
  seen_t text[] := ARRAY[]::text[];
  note_count integer;
  tag_count integer;
  protected_count integer;
  private_count integer;
  note_changes integer := 0;
  tag_changes integer := 0;
  v_row_id text;
BEGIN
  IF who IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION '688A_AUTH_REQUIRED';
  END IF;

  -- 688B: ensure the request is made by a newly created Auth session,
  -- not merely an old access token with a recently refreshed iat.
  -- A client cannot forge the session_id in a PostgREST-validated JWT.
  IF coalesce(auth.jwt()->>'session_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION '688B_FRESH_ACCOUNT_LOGIN_REQUIRED';
  END IF;
  PERFORM 1 FROM auth.sessions s
    WHERE s.id=(auth.jwt()->>'session_id')::uuid
      AND s.user_id=who
      AND s.created_at >= clock_timestamp() - interval '3 minutes'
      AND s.created_at <= clock_timestamp() + interval '30 seconds';
  IF NOT FOUND THEN
    RAISE EXCEPTION '688B_FRESH_ACCOUNT_LOGIN_REQUIRED';
  END IF;
  IF coalesce(auth.jwt()->>'iat','') !~ '^[0-9]{10,12}$' THEN
    RAISE EXCEPTION '688B_FRESH_ACCESS_TOKEN_REQUIRED';
  END IF;
  IF to_timestamp((auth.jwt()->>'iat')::bigint) < clock_timestamp() - interval '3 minutes'
    OR to_timestamp((auth.jwt()->>'iat')::bigint) > clock_timestamp() + interval '30 seconds' THEN
    RAISE EXCEPTION '688B_FRESH_ACCESS_TOKEN_REQUIRED';
  END IF;

  IF p_expected_notes IS NULL OR p_expected_notes NOT BETWEEN 0 AND 5000
     OR p_expected_tags IS NULL OR p_expected_tags NOT BETWEEN 0 AND 1000
     OR jsonb_typeof(p_note_changes) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_tag_changes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_note_changes) > 5000
     OR jsonb_array_length(p_tag_changes) > 1000
     OR pg_column_size(p_note_changes) > 16000000
     OR pg_column_size(p_tag_changes) > 2000000
     OR jsonb_typeof(p_expected_settings) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_new_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '688A_INVALID_INPUT';
  END IF;
  -- Blocks ordinary concurrent writes only for the duration of this DB transaction.
  LOCK TABLE public.notes, public.tags, public.secret_settings,
    public.lubanote_shared_crypto_identities IN SHARE ROW EXCLUSIVE MODE NOWAIT;

  SELECT * INTO old_s FROM public.secret_settings
    WHERE user_id = who FOR UPDATE;
  IF NOT FOUND OR old_s.salt IS DISTINCT FROM p_expected_settings->>'salt'
     OR old_s.verifier IS DISTINCT FROM p_expected_settings->>'verifier'
     OR old_s.kdf_iterations IS DISTINCT FROM 600000
     OR old_s.e2e_root_key_id IS DISTINCT FROM p_expected_settings->>'e2e_root_key_id'
     OR old_s.e2e_root_key_box IS DISTINCT FROM p_expected_settings->'e2e_root_key_box'
     OR old_s.e2e_root_key_version IS DISTINCT FROM 1
     OR old_s.e2e_root_key_algorithm IS DISTINCT FROM 'HKDF-SHA-256' THEN
    RAISE EXCEPTION '688A_SETTINGS_CHANGED';
  END IF;
  IF p_new_settings->>'e2e_root_key_id' IS DISTINCT FROM old_s.e2e_root_key_id
     OR p_new_settings->>'kdf_iterations' IS DISTINCT FROM '600000'
     OR length(coalesce(p_new_settings->>'salt','')) NOT BETWEEN 22 AND 28
     OR length(coalesce(p_new_settings->>'verifier','')) NOT BETWEEN 42 AND 48
     OR (p_new_settings->>'salt') = old_s.salt
     OR (p_new_settings->>'verifier') = old_s.verifier
     OR jsonb_typeof(p_new_settings->'e2e_root_key_box') IS DISTINCT FROM 'object'
     OR p_new_settings->'e2e_root_key_box' = old_s.e2e_root_key_box THEN
    RAISE EXCEPTION '688A_NEW_SETTINGS_INVALID';
  END IF;
  SELECT * INTO shared_s FROM public.lubanote_shared_crypto_identities
    WHERE user_id = who FOR UPDATE;
  IF FOUND THEN
    IF shared_s.private_key_box IS DISTINCT FROM p_expected_shared_box
       OR shared_s.algorithm IS DISTINCT FROM 'ECDH-P256'
       OR shared_s.key_version IS DISTINCT FROM 1
       OR jsonb_typeof(p_new_shared_box) IS DISTINCT FROM 'object'
       OR shared_s.private_key_box = p_new_shared_box THEN
      RAISE EXCEPTION '688A_SHARED_CHANGED';
    END IF;
  ELSIF p_expected_shared_box IS NOT NULL OR p_new_shared_box IS NOT NULL THEN
    RAISE EXCEPTION '688A_SHARED_NOT_FOUND';
  END IF;
  -- Storage encryption formats are out of scope; never silently abandon encrypted attachments.
  IF EXISTS (SELECT 1 FROM public.attachments WHERE user_id = who AND status IS DISTINCT FROM 'deleted')
     OR EXISTS (SELECT 1 FROM storage.objects
                WHERE owner_id = who::text OR owner = who OR name LIKE who::text || '/%') THEN
    RAISE EXCEPTION '688A_UNSUPPORTED_STORAGE';
  END IF;
  SELECT count(*) INTO note_count FROM public.notes WHERE user_id = who;
  SELECT count(*) INTO tag_count FROM public.tags WHERE user_id = who;
  SELECT count(*) INTO protected_count FROM public.notes WHERE user_id = who AND
    (data ? '__lubanoteSecret' OR data ? '__lubanoteE2ENote'
     OR data ? '__lubanoteMediaVault' OR data->>'isSecret' = 'true');
  -- 688Q: Vsechny aktivni tajne stitky zustavaji povinne chranene.
  -- Smazane radky s ciphertextem se prebalit MUSI (pro pripad obnoveni).
  -- Smazane tombstones bez ciphertextu nemaji k prebaleni zadna sifrovana data.
  SELECT count(*) INTO private_count FROM public.tags
    WHERE user_id = who AND is_secret IS TRUE
      AND (deleted_at IS NULL OR coalesce(encrypted_name->>'ciphertext','') <> '');
  IF note_count <> p_expected_notes OR tag_count <> p_expected_tags
    OR protected_count <> jsonb_array_length(p_note_changes)
    OR private_count <> jsonb_array_length(p_tag_changes) THEN
    RAISE EXCEPTION '688A_DATA_CHANGED_OR_INCOMPLETE';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_note_changes) LOOP
    v_row_id := item->>'id';
    IF v_row_id IS NULL OR length(v_row_id) NOT BETWEEN 8 AND 128 OR v_row_id=ANY(seen_n)
       OR jsonb_typeof(item->'old_data') IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'new_data') IS DISTINCT FROM 'object'
       OR item->'old_data' = item->'new_data' THEN
      RAISE EXCEPTION '688A_BAD_NOTE_CHANGE';
    END IF;
    seen_n := array_append(seen_n,v_row_id);
    SELECT * INTO row_n FROM public.notes
      WHERE user_id=who AND id::text=v_row_id FOR UPDATE;
    IF NOT FOUND OR row_n.data IS DISTINCT FROM item->'old_data'
       OR NOT (row_n.data ? '__lubanoteSecret' OR row_n.data ? '__lubanoteE2ENote'
               OR row_n.data ? '__lubanoteMediaVault' OR row_n.data->>'isSecret' = 'true') THEN
      RAISE EXCEPTION '688A_NOTE_CHANGED';
    END IF;
    -- A legacy plaintext Secret note must never be silently treated as ordinary data.
    IF row_n.data->>'isSecret' = 'true'
       AND NOT (row_n.data @> '{"__lubanoteSecret":true}'::jsonb) THEN
      RAISE EXCEPTION '688C_LEGACY_SECRET_UNSUPPORTED';
    END IF;
    IF (row_n.data ? '__lubanoteSecret' AND
        (NOT (row_n.data @> '{"__lubanoteSecret":true}'::jsonb)
         OR NOT (item->'new_data' @> '{"__lubanoteSecret":true}'::jsonb)
         OR jsonb_typeof(item->'new_data'->'encrypted') IS DISTINCT FROM 'object'
         OR item->'new_data'->'encrypted'->>'algorithm' IS DISTINCT FROM 'AES-GCM'))
       OR (row_n.data ? '__lubanoteE2ENote' AND
           (item->'new_data'->>'__lubanoteE2ENote' IS DISTINCT FROM 'true'
            OR item->'new_data'->>'keyId' IS DISTINCT FROM old_s.e2e_root_key_id))
       OR (row_n.data ? '__lubanoteMediaVault' AND
           NOT (item->'new_data' ? '__lubanoteMediaVault')) THEN
      RAISE EXCEPTION '688A_NOTE_PROTECTION_LOST';
    END IF;
    -- Force revision-based clients to observe the new encrypted representation.
    UPDATE public.notes SET data=item->'new_data',
      revision=COALESCE(revision,0)+1, updated_at=clock_timestamp()
      WHERE id=row_n.id;
    note_changes := note_changes + 1;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_tag_changes) LOOP
    v_row_id := item->>'id';
    IF v_row_id IS NULL OR length(v_row_id) NOT BETWEEN 8 AND 128 OR v_row_id=ANY(seen_t)
       OR jsonb_typeof(item->'old_encrypted_name') IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'new_encrypted_name') IS DISTINCT FROM 'object'
       OR item->'old_encrypted_name' = item->'new_encrypted_name' THEN
      RAISE EXCEPTION '688A_BAD_TAG_CHANGE';
    END IF;
    seen_t := array_append(seen_t,v_row_id);
    SELECT * INTO row_t FROM public.tags
      WHERE user_id=who AND id::text=v_row_id FOR UPDATE;
    IF NOT FOUND OR row_t.is_secret IS DISTINCT FROM TRUE
       OR row_t.encrypted_name IS DISTINCT FROM item->'old_encrypted_name'
       OR item->'new_encrypted_name'->>'algorithm' IS DISTINCT FROM 'AES-GCM' THEN
      RAISE EXCEPTION '688A_TAG_CHANGED';
    END IF;
    UPDATE public.tags SET encrypted_name=item->'new_encrypted_name' WHERE id=row_t.id;
    tag_changes := tag_changes + 1;
  END LOOP;
  IF note_changes <> protected_count OR tag_changes <> private_count THEN
    RAISE EXCEPTION '688A_INCOMPLETE_REWRAP';
  END IF;
  IF shared_s.user_id IS NOT NULL THEN
    UPDATE public.lubanote_shared_crypto_identities SET private_key_box=p_new_shared_box
      WHERE user_id=who;
  END IF;
  UPDATE public.secret_settings SET
      salt=p_new_settings->>'salt',
      verifier=p_new_settings->>'verifier',
      kdf_iterations=600000,
      e2e_root_key_box=p_new_settings->'e2e_root_key_box',
      updated_at=clock_timestamp()
    WHERE user_id=who;
  RETURN jsonb_build_object('ok',true,'atomic',true,
       'notes_rewrapped',note_changes,'tags_rewrapped',tag_changes,
       'root_key_id_preserved',true);
END;
$function$

;
REVOKE ALL ON FUNCTION public.lubanote_change_e2e_password_688b(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_change_e2e_password_688b(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer) TO authenticated;
DO $postcheck$
DECLARE
  fn_oid oid := to_regprocedure('public.lubanote_change_e2e_password_688b(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer)');
BEGIN
  IF fn_oid IS NULL OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=fn_oid AND prosecdef=true) THEN
    RAISE EXCEPTION '697ZI_POSTCHECK_FUNCTION_SECURITY_FAILED';
  END IF;
  IF has_function_privilege('anon',fn_oid,'EXECUTE') OR
     NOT has_function_privilege('authenticated',fn_oid,'EXECUTE') THEN
    RAISE EXCEPTION '697ZI_POSTCHECK_FUNCTION_GRANTS_FAILED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true AND frozen=true) THEN
    RAISE EXCEPTION '697ZI_POSTCHECK_FREEZE_FAILED';
  END IF;
END
$postcheck$;
COMMIT;
