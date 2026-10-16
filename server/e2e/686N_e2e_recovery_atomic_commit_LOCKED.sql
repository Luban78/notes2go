-- 686N: server foundation for one-account E2E password recovery.
-- INSTALLATION DOES NOT ENABLE RECOVERY: no client role can execute this RPC.
-- Do not grant EXECUTE until 686O client staging, snapshot, multi-device write
-- fence and end-to-end rollback have been implemented and verified.
-- The TEST web may route to the very same DB as PROD.
BEGIN;

CREATE SCHEMA IF NOT EXISTS lubanote_recovery_internal;
REVOKE ALL ON SCHEMA lubanote_recovery_internal FROM PUBLIC;

-- The DBA must explicitly authorize ONE test account for ONE short window.
-- This table is intentionally NOT writable/readable from the client.
CREATE TABLE IF NOT EXISTS lubanote_recovery_internal.account_authorization_686n (
  user_id uuid PRIMARY KEY,
  enabled_until timestamptz NOT NULL,
  used_at timestamptz,
  authorized_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_authorization_686n_authorized_by_nonempty
    CHECK (length(btrim(authorized_by)) > 0)
);
REVOKE ALL ON TABLE lubanote_recovery_internal.account_authorization_686n
  FROM PUBLIC, anon, authenticated;

-- IMPORTANT: intentionally UNGRANTED prototype. Explicit fields are encrypted
-- envelopes / password verifier; NO password or raw private keys go to DB.
-- p_note_changes: [{"id":"...", "old_data":{...}, "new_data":{...}}].
-- Every E2E note and every legacy media-vault note MUST appear in this array,
-- even if its new data is identical (not expected after actual rewrap).
CREATE OR REPLACE FUNCTION public.lubanote_recovery_atomic_commit_686n(
  p_expected_settings jsonb,
  p_new_settings jsonb,
  p_expected_shared_box jsonb,
  p_new_shared_box jsonb,
  p_note_changes jsonb,
  p_expected_live_note_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, storage
AS $body$
DECLARE
  v_user uuid;
  v_authorization lubanote_recovery_internal.account_authorization_686n%ROWTYPE;
  v_old_settings public.secret_settings%ROWTYPE;
  v_shared public.lubanote_shared_crypto_identities%ROWTYPE;
  v_note public.notes%ROWTYPE;
  v_change jsonb;
  v_id text;
  v_expected jsonb;
  v_replacement jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_changed integer := 0;
  v_required integer := 0;
  v_live integer := 0;
  v_iat bigint;
BEGIN
  -- Runtime self-checks; grants alone are never adequate authorization.
  v_user := auth.uid();
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION '686N_ACCOUNT_AUTH_REQUIRED';
  END IF;
  -- Short-lived JWT is a defense in depth. This is NOT proof that a password
  -- was re-entered; that must be enforced by the 686O client flow.
  IF ((auth.jwt()->>'iat') ~ '^[0-9]{10,12}$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '686N_FRESH_JWT_REQUIRED';
  END IF;
  v_iat := (auth.jwt()->>'iat')::bigint;
  IF to_timestamp(v_iat) > clock_timestamp() + interval '30 seconds'
    OR to_timestamp(v_iat) < clock_timestamp() - interval '5 minutes' THEN
    RAISE EXCEPTION '686N_FRESH_JWT_REQUIRED';
  END IF;

  -- No concurrent recovery for the same user. The row is consumed only when
  -- ALL updates commit together, so an exception leaves it unused.
  SELECT * INTO v_authorization
    FROM lubanote_recovery_internal.account_authorization_686n
    WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_authorization.used_at IS NOT NULL
     OR v_authorization.enabled_until <= clock_timestamp()
     OR v_authorization.enabled_until > clock_timestamp() + interval '15 minutes' THEN
    RAISE EXCEPTION '686N_ACCOUNT_NOT_EXPLICITLY_AUTHORIZED';
  END IF;

  IF p_expected_live_note_count IS NULL
     OR p_expected_live_note_count < 0 OR p_expected_live_note_count > 30
     OR jsonb_typeof(p_note_changes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_note_changes) > 30
     OR pg_column_size(p_note_changes) > 4000000
     OR jsonb_typeof(p_expected_settings) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_new_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '686N_INVALID_BOUNDED_INPUT';
  END IF;

  -- Lock ordinary note writers only during the narrow DB transaction.
  -- NOWAIT aborts instead of blocking production; rollback is automatic.
  LOCK TABLE public.notes IN SHARE ROW EXCLUSIVE MODE NOWAIT;

  SELECT * INTO v_old_settings FROM public.secret_settings
    WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND
     OR v_old_settings.salt IS DISTINCT FROM p_expected_settings->>'salt'
     OR v_old_settings.verifier IS DISTINCT FROM p_expected_settings->>'verifier'
     OR v_old_settings.kdf_iterations IS DISTINCT FROM
          (p_expected_settings->>'kdf_iterations')::integer
     OR v_old_settings.e2e_root_key_id IS DISTINCT FROM
          p_expected_settings->>'e2e_root_key_id'
     OR v_old_settings.e2e_root_key_box IS DISTINCT FROM
          p_expected_settings->'e2e_root_key_box'
     OR v_old_settings.e2e_root_key_version IS DISTINCT FROM 1
     OR v_old_settings.e2e_root_key_algorithm IS DISTINCT FROM 'HKDF-SHA-256' THEN
    RAISE EXCEPTION '686N_SECRET_SETTINGS_CHANGED';
  END IF;
  IF length(coalesce(p_new_settings->>'salt','')) NOT BETWEEN 22 AND 28
     OR length(coalesce(p_new_settings->>'verifier','')) NOT BETWEEN 42 AND 48
     OR (p_new_settings->>'kdf_iterations') IS DISTINCT FROM '600000'
     OR p_new_settings->>'e2e_root_key_id' IS DISTINCT FROM
           v_old_settings.e2e_root_key_id
     OR jsonb_typeof(p_new_settings->'e2e_root_key_box') IS DISTINCT FROM 'object'
     OR p_new_settings->'e2e_root_key_box' = v_old_settings.e2e_root_key_box
     OR p_new_settings->>'salt' = v_old_settings.salt
     OR p_new_settings->>'verifier' = v_old_settings.verifier THEN
    RAISE EXCEPTION '686N_NEW_SETTINGS_INVALID';
  END IF;

  SELECT * INTO v_shared FROM public.lubanote_shared_crypto_identities
    WHERE user_id = v_user FOR UPDATE;
  IF FOUND THEN
    IF v_shared.algorithm IS DISTINCT FROM 'ECDH-P256'
       OR v_shared.key_version IS DISTINCT FROM 1
       OR v_shared.private_key_box IS DISTINCT FROM p_expected_shared_box
       OR jsonb_typeof(p_new_shared_box) IS DISTINCT FROM 'object'
       OR p_new_shared_box = v_shared.private_key_box THEN
      RAISE EXCEPTION '686N_SHARED_IDENTITY_CHANGED';
    END IF;
  ELSIF p_expected_shared_box IS NOT NULL OR p_new_shared_box IS NOT NULL THEN
    RAISE EXCEPTION '686N_SHARED_IDENTITY_UNEXPECTED';
  END IF;

  -- Scope gate for first real trial: no password-protected legacy Secret,
  -- deleted-note history, attachment rows or Storage objects anywhere for
  -- the account. They require a separate implementation, not a best guess.
  IF EXISTS (SELECT 1 FROM public.notes
             WHERE user_id = v_user AND deleted_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.notes
                WHERE user_id = v_user AND is_secret IS TRUE)
     OR EXISTS (SELECT 1 FROM public.tags
                WHERE user_id = v_user AND is_secret IS TRUE)
     OR EXISTS (SELECT 1 FROM public.attachments
                WHERE user_id = v_user)
     OR EXISTS (SELECT 1 FROM storage.objects
                WHERE owner_id = v_user::text OR owner = v_user
                   OR name LIKE v_user::text || '/%') THEN
    RAISE EXCEPTION '686N_UNSUPPORTED_LEGACY_OR_STORAGE_SCOPE';
  END IF;

  SELECT count(*) INTO v_live FROM public.notes
    WHERE user_id = v_user AND deleted_at IS NULL;
  IF v_live <> p_expected_live_note_count THEN
    RAISE EXCEPTION '686N_NOTES_COUNT_CHANGED';
  END IF;
  SELECT count(*) INTO v_required FROM public.notes
    WHERE user_id = v_user AND deleted_at IS NULL
      AND (data ? '__lubanoteMediaVault' OR data ? '__lubanoteE2ENote');
  IF v_required <> jsonb_array_length(p_note_changes) THEN
    RAISE EXCEPTION '686N_PROTECTED_NOTE_SET_INCOMPLETE';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_note_changes)
  LOOP
    IF jsonb_typeof(v_change) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_change->'old_data') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_change->'new_data') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION '686N_NOTE_CHANGE_INVALID';
    END IF;
    v_id := v_change->>'id';
    IF v_id IS NULL OR length(v_id) NOT BETWEEN 1 AND 128
       OR v_id = ANY(v_seen) THEN
      RAISE EXCEPTION '686N_DUPLICATE_OR_BAD_NOTE_ID';
    END IF;
    v_seen := array_append(v_seen, v_id);
    v_expected := v_change->'old_data';
    v_replacement := v_change->'new_data';
    SELECT * INTO v_note FROM public.notes
      WHERE id::text = v_id AND user_id = v_user AND deleted_at IS NULL
      FOR UPDATE;
    IF NOT FOUND OR v_note.data IS DISTINCT FROM v_expected
       OR NOT (v_note.data ? '__lubanoteMediaVault'
               OR v_note.data ? '__lubanoteE2ENote')
       OR v_replacement = v_expected THEN
      RAISE EXCEPTION '686N_NOTE_CHANGED_OR_NOT_REWRAPPED';
    END IF;
    -- The client must cryptographically check new payloads before sending;
    -- the server cannot decrypt E2E ciphertext or prove semantic equality.
    UPDATE public.notes SET data = v_replacement WHERE id = v_note.id;
    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed <> v_required THEN
    RAISE EXCEPTION '686N_NOTE_COVERAGE_MISMATCH';
  END IF;

  IF v_shared.user_id IS NOT NULL THEN
    UPDATE public.lubanote_shared_crypto_identities
       SET private_key_box = p_new_shared_box WHERE user_id = v_user;
  END IF;

  UPDATE public.secret_settings SET
      salt = p_new_settings->>'salt',
      verifier = p_new_settings->>'verifier',
      kdf_iterations = 600000,
      e2e_root_key_box = p_new_settings->'e2e_root_key_box',
      updated_at = clock_timestamp()
    WHERE user_id = v_user;

  UPDATE lubanote_recovery_internal.account_authorization_686n
     SET used_at = clock_timestamp() WHERE user_id = v_user;
  RETURN jsonb_build_object('ok',true,'atomic',true,
           'notes_updated',v_changed,'root_key_id_preserved',true,
           'shared_identity_preserved',true);
END;
$body$;

-- IMPORTANT: The source-only 686N patch must remain locked even if an
-- operator installs the SQL. No application role receives EXECUTE.
REVOKE ALL ON FUNCTION public.lubanote_recovery_atomic_commit_686n(
  jsonb,jsonb,jsonb,jsonb,jsonb,integer
) FROM PUBLIC, anon, authenticated;

COMMIT;
