-- LubaNote 697Z-G / 685C3 E2E GUARDS: ONLY FOR CONTROLLED, ISOLATED TEST FIRST.
-- Derived solely from the 2026-10-31 LubaServer pg_dump schema-only snapshot.
-- NOT EXECUTED against any database. DO NOT RUN DIRECTLY ON PRODUCTION.
-- Scope: 3 existing LubaServer functions + 3 triggers; no table DML, no Auth/Storage changes.
-- Source-only E2E behavior: validates envelope, blocks E2E->plaintext and E2E sharing;
-- does NOT enable conversion of legacy plaintext notes and does NOT block hard DELETE.
-- Grants deliberately restricted to owner; PostgreSQL triggers call their functions by relation.
-- REVIEW BEFORE APPLY: concurrent write load, existing note data, RLS/RPC test cases.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '697Z-G: required postgres owner; got %', current_user;
  END IF;
  IF to_regclass('public.notes') IS NULL
     OR to_regclass('public.note_collaborators') IS NULL
     OR to_regclass('public.note_share_invitations') IS NULL THEN
    RAISE EXCEPTION '697Z-G: a required public relation is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid='public.notes'::regclass AND attname='data'
                 AND atttypid='jsonb'::regtype AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid='public.notes'::regclass AND attname='user_id'
                 AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION '697Z-G: unexpected notes table layout';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'lubanote_685c3_valid_private_envelope',
      'lubanote_685c3_notes_guard',
      'lubanote_685c3_share_guard'
    )
  ) THEN
    RAISE EXCEPTION '697Z-G: at least one guard function already exists; manual comparison required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
      'lubanote_685c3_notes_guard',
      'lubanote_685c3_collaborator_guard',
      'lubanote_685c3_share_invitation_guard'
    )
  ) THEN
    RAISE EXCEPTION '697Z-G: at least one guard trigger already exists; manual comparison required';
  END IF;
END
$preflight$;

CREATE FUNCTION public.lubanote_685c3_valid_private_envelope(p_data jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_iv text;
  v_ciphertext text;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN false;
  END IF;
  IF p_data -> '__lubanoteE2ENote' IS DISTINCT FROM 'true'::jsonb
     OR p_data -> 'version' IS DISTINCT FROM '1'::jsonb
     OR p_data ->> 'algorithm' IS DISTINCT FROM 'AES-256-GCM'
     OR jsonb_typeof(p_data -> 'keyId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_data -> 'iv') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_data -> 'ciphertext') IS DISTINCT FROM 'string'
     OR (SELECT count(*) FROM jsonb_object_keys(p_data)) <> 6
  THEN
    RETURN false;
  END IF;
  IF (p_data ->> 'keyId') !~ '^[A-Za-z0-9_-]{8,128}$' THEN
    RETURN false;
  END IF;
  v_iv := p_data ->> 'iv';
  v_ciphertext := p_data ->> 'ciphertext';
  -- WebCrypto btoa() emits canonical padded base64. AES-GCM uses 12-byte IV,
  -- 16-byte auth tag. Align ceiling with client-side 25 MiB plaintext limit.
  IF length(v_iv) <> 16
     OR length(v_ciphertext) < 24
     OR length(v_ciphertext) > 34952600
     OR v_iv !~ '^[A-Za-z0-9+/]+={0,2}$'
     OR v_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$'
  THEN
    RETURN false;
  END IF;
  IF encode(decode(v_iv, 'base64'), 'base64') IS DISTINCT FROM v_iv
     OR octet_length(decode(v_iv, 'base64')) <> 12
     OR replace(encode(decode(v_ciphertext, 'base64'), 'base64'), chr(10), '') IS DISTINCT FROM v_ciphertext
     OR octet_length(decode(v_ciphertext, 'base64')) < 16
     OR octet_length(decode(v_ciphertext, 'base64')) > 26214416
  THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$_$;

CREATE FUNCTION public.lubanote_685c3_notes_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old_e2e boolean;
  v_new_reserved boolean;
BEGIN
  -- Existing hard-delete routes remain unchanged: trash, account purge,
  -- demo cleanup, and archive cleanup already have their own logic.
  -- Prevents breaking account deletion; does not claim anti-delete protection.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_new_reserved := NEW.data IS NOT NULL
                    AND NEW.data ? '__lubanoteE2ENote';

  IF TG_OP = 'INSERT' THEN
    IF v_new_reserved THEN
      IF NEW.user_id IS NULL
         OR NOT public.lubanote_685c3_valid_private_envelope(NEW.data) THEN
        RAISE EXCEPTION 'LUBANOTE_E2E_INVALID_ENVELOPE'
          USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.note_collaborators c
                 WHERE c.note_id = NEW.id)
         OR EXISTS (SELECT 1 FROM public.note_share_invitations i
                    WHERE i.note_id = NEW.id) THEN
        RAISE EXCEPTION 'LUBANOTE_E2E_CANNOT_SHARE'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  v_old_e2e := OLD.data IS NOT NULL
               AND OLD.data ? '__lubanoteE2ENote';
  IF v_old_e2e THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NOT v_new_reserved
       OR NOT public.lubanote_685c3_valid_private_envelope(NEW.data) THEN
      RAISE EXCEPTION 'LUBANOTE_E2E_DOWNGRADE_BLOCKED'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.data ->> 'keyId' IS DISTINCT FROM OLD.data ->> 'keyId' THEN
      RAISE EXCEPTION 'LUBANOTE_E2E_KEY_CHANGE_BLOCKED'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Intentional: no rewriting of old plaintext notes or note_history.
  IF v_new_reserved THEN
    RAISE EXCEPTION 'LUBANOTE_E2E_LEGACY_CONVERSION_NOT_ENABLED'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.lubanote_685c3_share_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notes n WHERE n.id = NEW.note_id
      AND n.data IS NOT NULL AND n.data ? '__lubanoteE2ENote'
  ) THEN
    RAISE EXCEPTION 'LUBANOTE_E2E_SHARING_DISABLED'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lubanote_685c3_valid_private_envelope(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_685c3_notes_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_685c3_share_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lubanote_685c3_notes_guard BEFORE INSERT OR DELETE OR UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.lubanote_685c3_notes_guard();

CREATE TRIGGER lubanote_685c3_collaborator_guard BEFORE INSERT OR UPDATE ON public.note_collaborators FOR EACH ROW EXECUTE FUNCTION public.lubanote_685c3_share_guard();

CREATE TRIGGER lubanote_685c3_share_invitation_guard BEFORE INSERT OR UPDATE ON public.note_share_invitations FOR EACH ROW EXECUTE FUNCTION public.lubanote_685c3_share_guard();

DO $postcheck$
DECLARE fcount integer; tcount integer;
BEGIN
  SELECT count(*) INTO fcount FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'lubanote_685c3_valid_private_envelope',
      'lubanote_685c3_notes_guard',
      'lubanote_685c3_share_guard');
  SELECT count(*) INTO tcount FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public'
    AND t.tgname IN ('lubanote_685c3_notes_guard',
      'lubanote_685c3_collaborator_guard',
      'lubanote_685c3_share_invitation_guard')
    AND t.tgenabled IN ('O', 'A');
  IF fcount <> 3 OR tcount <> 3 THEN
    RAISE EXCEPTION '697Z-G: postcheck failed: functions %, triggers %', fcount, tcount;
  END IF;
END
$postcheck$;
COMMIT;
