-- 699D-BW: sidecar pro nove sdileni E2E obsahu bez prepisu puvodni
-- soukrome notes.data. Pred nasazenim porovnat s aktualnim schematem.
-- NEJPRVE testovaci DB, pote transakcni produkcni migrace.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '699D-BW: required postgres owner';
  END IF;
  IF to_regclass('public.notes') IS NULL
     OR to_regclass('public.note_collaborators') IS NULL
     OR to_regclass('public.note_share_invitations') IS NULL
     OR to_regclass('public.note_user_state') IS NULL
     OR to_regclass('public.shared_note_editor_sessions') IS NULL THEN
    RAISE EXCEPTION '699D-BW: required relation missing';
  END IF;
  IF to_regclass('public.lubanote_shared_e2e_content_v1') IS NOT NULL THEN
    RAISE EXCEPTION '699D-BW: migration already present; verify manually';
  END IF;
  IF to_regprocedure('public.lubanote_685c3_valid_private_envelope(jsonb)') IS NULL
     OR to_regprocedure('public.lubanote_685c3_notes_guard()') IS NULL
     OR to_regprocedure('public.lubanote_685c3_share_guard()') IS NULL
     OR to_regprocedure('public.lubanote_get_shared_notes_safe()') IS NULL
     OR to_regprocedure('public.lubanote_get_my_owned_shared_notes_safe()') IS NULL
     OR to_regprocedure('public.lubanote_shared_content_from_note_data(jsonb)') IS NULL
     OR to_regprocedure('public.lubanote_user_can_use_shared_editor_for(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION '699D-BW: unexpected backend function signatures';
  END IF;
  IF position('LUBANOTE_E2E_DOWNGRADE_BLOCKED' IN
       pg_get_functiondef('public.lubanote_685c3_notes_guard()'::regprocedure)) = 0
     OR position('LUBANOTE_E2E_SHARING_DISABLED' IN
       pg_get_functiondef('public.lubanote_685c3_share_guard()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '699D-BW: existing E2E guard body differs';
  END IF;
END
$preflight$;

-- Pole neni soucasti notes.data. Puvodni soukroma Root-Key obalka zustava
-- nedotcena a slouzi k obnove osobniho stavu vlastnika.
CREATE TABLE public.lubanote_shared_e2e_content_v1 (
  note_id uuid PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
  envelope jsonb NOT NULL,
  trashed_at timestamptz,
  last_editor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lubanote_shared_e2e_content_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lubanote_shared_e2e_content_v1 FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.lubanote_699dbw_valid_shared_envelope(p_data jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_iv text; v_ciphertext text;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR
     p_data -> '__lubanoteSharedContentE2E' IS DISTINCT FROM 'true'::jsonb OR
     p_data -> 'version' IS DISTINCT FROM '1'::jsonb OR
     p_data -> 'keyVersion' IS DISTINCT FROM '1'::jsonb OR
     p_data ->> 'algorithm' IS DISTINCT FROM 'AES-256-GCM' OR
     jsonb_typeof(p_data -> 'iv') IS DISTINCT FROM 'string' OR
     jsonb_typeof(p_data -> 'ciphertext') IS DISTINCT FROM 'string' OR
     (SELECT count(*) FROM jsonb_object_keys(p_data)) <> 6 THEN
    RETURN false;
  END IF;
  v_iv := p_data ->> 'iv';
  v_ciphertext := p_data ->> 'ciphertext';
  IF length(v_iv) <> 16 OR length(v_ciphertext) < 24 OR
     length(v_ciphertext) > 34952600 OR
     v_iv !~ '^[A-Za-z0-9+/]+={0,2}$' OR
     v_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
    RETURN false;
  END IF;
  IF encode(decode(v_iv,'base64'),'base64') IS DISTINCT FROM v_iv OR
     octet_length(decode(v_iv,'base64')) <> 12 OR
     replace(encode(decode(v_ciphertext,'base64'),'base64'), chr(10), '')
       IS DISTINCT FROM v_ciphertext OR
     octet_length(decode(v_ciphertext,'base64')) < 16 OR
     octet_length(decode(v_ciphertext,'base64')) > 26214416 THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

ALTER TABLE public.lubanote_shared_e2e_content_v1
  ADD CONSTRAINT lubanote_shared_e2e_envelope_valid
  CHECK (public.lubanote_699dbw_valid_shared_envelope(envelope));

-- Starou E2E obalku lze nadale UPDATE pouze v nesdilenem rezimu.
-- Ve sdilenem rezimu se meni jen metadata revize/updated_at, nikoli
-- obsah Root-Key obalky: stare APK nesmi nenapadne prepsat Shared obsah.
CREATE OR REPLACE FUNCTION public.lubanote_685c3_notes_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_old_e2e boolean; v_new_reserved boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v_new_reserved := NEW.data IS NOT NULL AND NEW.data ? '__lubanoteE2ENote';
  IF TG_OP = 'INSERT' THEN
    IF v_new_reserved THEN
      IF NEW.user_id IS NULL OR
         NOT public.lubanote_685c3_valid_private_envelope(NEW.data) THEN
        RAISE EXCEPTION 'LUBANOTE_E2E_INVALID_ENVELOPE' USING ERRCODE='23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.note_collaborators c WHERE c.note_id=NEW.id)
         OR EXISTS (SELECT 1 FROM public.note_share_invitations i WHERE i.note_id=NEW.id) THEN
        RAISE EXCEPTION 'LUBANOTE_E2E_CANNOT_SHARE' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  v_old_e2e := OLD.data IS NOT NULL AND OLD.data ? '__lubanoteE2ENote';
  IF v_old_e2e THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NOT v_new_reserved OR
       NOT public.lubanote_685c3_valid_private_envelope(NEW.data) THEN
      RAISE EXCEPTION 'LUBANOTE_E2E_DOWNGRADE_BLOCKED' USING ERRCODE='23514';
    END IF;
    IF NEW.data ->> 'keyId' IS DISTINCT FROM OLD.data ->> 'keyId' THEN
      RAISE EXCEPTION 'LUBANOTE_E2E_KEY_CHANGE_BLOCKED' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lubanote_shared_e2e_content_v1 e
               WHERE e.note_id=OLD.id) AND NEW.data IS DISTINCT FROM OLD.data THEN
      RAISE EXCEPTION 'LUBANOTE_E2E_SHARED_PRIVATE_WRITE_BLOCKED' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_new_reserved THEN
    RAISE EXCEPTION 'LUBANOTE_E2E_LEGACY_CONVERSION_NOT_ENABLED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger vyzaduje, aby sidecar s ciphertextem existoval PRED pozvankou.
CREATE OR REPLACE FUNCTION public.lubanote_685c3_share_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_note_data jsonb;
BEGIN
  -- Serialize invitation / accept with owner detach and conversion.
  SELECT n.data INTO v_note_data FROM public.notes n
  WHERE n.id=NEW.note_id FOR UPDATE;
  IF v_note_data IS NOT NULL AND v_note_data ? '__lubanoteE2ENote' AND
     NOT EXISTS (
       SELECT 1 FROM public.lubanote_shared_e2e_content_v1 e
       WHERE e.note_id=NEW.note_id AND
             public.lubanote_699dbw_valid_shared_envelope(e.envelope)
     ) THEN
    RAISE EXCEPTION 'LUBANOTE_E2E_SHARING_DISABLED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Stare prijate-Shared RPC nesmi prijemci ukazat ani ciphertext puvodni
-- osobni Root-Key obalky. Nove APK jej nacte pouze owner-only RPC.
CREATE OR REPLACE FUNCTION public.lubanote_shared_content_from_note_data(p_data jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN coalesce(p_data ? '__lubanoteE2ENote', false) THEN '{}'::jsonb
    ELSE coalesce(p_data, '{}'::jsonb) - ARRAY[
      'date','reminder','favorite','notificationId','area','pinned',
      'tags','repeat','plannedItems','completed','syncConflict','__lubanoteSecret'
    ]::text[]
  END;
$$;

-- Zarazuje owner E2E Shared do existujici ochrany private sync,
-- a to i kdyz pozvanka jeste ceka na prijeti.
CREATE OR REPLACE FUNCTION public.lubanote_get_my_owned_shared_notes_safe()
RETURNS TABLE(note_id uuid, owner_username text, role text,
              accepted_at timestamptz, revision bigint,
              updated_at timestamptz, data jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.lubanote_user_has_data_access(v_uid) THEN
    RAISE EXCEPTION 'account_not_active_or_plan_expired' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT n.id, p.username::text, 'owner'::text,
      NULL::timestamptz, n.revision, n.updated_at, n.data
  FROM public.notes n
  LEFT JOIN public.lubanote_profiles p ON p.user_id=n.user_id
  WHERE n.user_id=v_uid AND n.deleted_at IS NULL
    AND COALESCE(n.data ->> 'isSecret','false') <> 'true'
    AND (EXISTS (SELECT 1 FROM public.note_collaborators c WHERE c.note_id=n.id)
         OR EXISTS (SELECT 1 FROM public.lubanote_shared_e2e_content_v1 e
                    WHERE e.note_id=n.id))
  ORDER BY n.updated_at DESC, n.id;
END;
$$;

-- Vlastnik musi smet otevrit a ulozit E2E Shared i v okamziku, kdy
-- pozvanka teprve ceka na prijeti. Dosavadni RPC umoznovaly editor
-- pouze pro poznamky s alespon jednim prijatym spolupracovnikem.
-- Vsechny ostatni podminky (ucet, vlastnictvi/ACL, Secret) zustavaji.
CREATE OR REPLACE FUNCTION public.lubanote_current_user_can_use_shared_editor(p_note_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.lubanote_user_has_data_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id=p_note_id AND n.user_id IS NOT NULL
        AND n.deleted_at IS NULL
        AND public.lubanote_user_has_data_access(n.user_id)
        AND NOT (
          COALESCE(lower(n.data ->> 'isSecret') IN ('true','1','yes'),false)
          OR COALESCE(n.data ? '__lubanoteSecret',false)
        )
        AND (
          EXISTS (SELECT 1 FROM public.note_collaborators c
                  WHERE c.note_id=n.id)
          OR (n.user_id=auth.uid() AND EXISTS (
            SELECT 1 FROM public.lubanote_shared_e2e_content_v1 e
            WHERE e.note_id=n.id
          ))
        )
        AND (
          n.user_id=auth.uid()
          OR EXISTS (SELECT 1 FROM public.note_collaborators c
                     WHERE c.note_id=n.id AND c.user_id=auth.uid())
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.lubanote_user_can_use_shared_editor_for(
  p_note_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_user_id IS NOT NULL
    AND public.lubanote_user_has_data_access(p_user_id)
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id=p_note_id AND n.user_id IS NOT NULL
        AND n.deleted_at IS NULL
        AND public.lubanote_user_has_data_access(n.user_id)
        AND NOT (
          COALESCE(lower(n.data ->> 'isSecret') IN ('true','1','yes'),false)
          OR COALESCE(n.data ? '__lubanoteSecret',false)
        )
        AND (
          EXISTS (SELECT 1 FROM public.note_collaborators c
                  WHERE c.note_id=n.id)
          OR (n.user_id=p_user_id AND EXISTS (
            SELECT 1 FROM public.lubanote_shared_e2e_content_v1 e
            WHERE e.note_id=n.id
          ))
        )
        AND (
          n.user_id=p_user_id
          OR EXISTS (SELECT 1 FROM public.note_collaborators c
                     WHERE c.note_id=n.id AND c.user_id=p_user_id)
        )
    );
$$;

-- Atomicka priprava sdileni. Soukromy notes.data se NIKDY neprepisuje.
CREATE FUNCTION public.lubanote_convert_private_e2e_to_shared_v1(
  p_note_id uuid, p_expected_revision bigint, p_shared_envelope jsonb,
  p_owner_private_envelope jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_note public.notes%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT public.lubanote_user_has_data_access(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_note FROM public.notes WHERE id=p_note_id FOR UPDATE;
  IF NOT FOUND OR v_note.user_id IS DISTINCT FROM v_uid OR
     v_note.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','not_owner_or_missing');
  END IF;
  IF EXISTS (SELECT 1 FROM public.lubanote_shared_e2e_content_v1
             WHERE note_id=p_note_id) THEN
    RETURN jsonb_build_object('ok',true,'already',true);
  END IF;
  IF v_note.revision IS DISTINCT FROM p_expected_revision OR
     NOT public.lubanote_685c3_valid_private_envelope(v_note.data) OR
     NOT public.lubanote_685c3_valid_private_envelope(p_owner_private_envelope) OR
     octet_length(p_owner_private_envelope::text) > 1048576 OR
     v_note.data ->> 'keyId' IS DISTINCT FROM p_owner_private_envelope ->> 'keyId' OR
     NOT public.lubanote_699dbw_valid_shared_envelope(p_shared_envelope) THEN
    RETURN jsonb_build_object('ok',false,'reason','revision_or_envelope_invalid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.note_collaborators WHERE note_id=p_note_id)
     OR EXISTS (SELECT 1 FROM public.note_share_invitations
                WHERE note_id=p_note_id AND status='pending') THEN
    RETURN jsonb_build_object('ok',false,'reason','unexpected_existing_sharing');
  END IF;
  INSERT INTO public.lubanote_shared_e2e_content_v1(note_id,envelope)
  VALUES(p_note_id,p_shared_envelope);
  INSERT INTO public.note_user_state(note_id,user_id,personal_data,created_at,updated_at)
  VALUES(p_note_id,v_uid,
         jsonb_build_object('__lubanoteSharedPersonalE2E',p_owner_private_envelope),
         now(),now())
  ON CONFLICT (note_id,user_id) DO UPDATE SET
    personal_data=EXCLUDED.personal_data, updated_at=now();
  RETURN jsonb_build_object('ok',true,'already',false);
END;
$$;

-- Kazdy vidi jen sve prijate poznamky + vlastni; puvodni soukroma
-- Root-Key obalka se smi vratit vyhradne vlastnikovi.
CREATE FUNCTION public.lubanote_get_e2e_shared_notes_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_items jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.lubanote_user_has_data_access(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'note_id', n.id,
    'owner_username', CASE WHEN p.username IS NULL THEN NULL ELSE '@'||p.username END,
    'role', CASE WHEN n.user_id=v_uid THEN 'owner' ELSE c.role END,
    'accepted_at', c.accepted_at,
    'revision', n.revision,
    'updated_at', n.updated_at,
    'data', e.envelope || jsonb_build_object(
      'id',n.id::text, 'updatedAt',n.updated_at,'isSecret',false,
      'trashedAt',e.trashed_at,
      'sharedLastEditedAt',e.last_edited_at,
      'sharedLastEditorUsername',CASE WHEN ep.username IS NULL THEN NULL ELSE '@'||ep.username END
    ),
    'owner_private_envelope',CASE WHEN n.user_id=v_uid THEN n.data ELSE NULL END,
    'personal_envelope',s.personal_data -> '__lubanoteSharedPersonalE2E'
  ) ORDER BY n.updated_at DESC), '[]'::jsonb) INTO v_items
  FROM public.lubanote_shared_e2e_content_v1 e
  JOIN public.notes n ON n.id=e.note_id
  LEFT JOIN public.note_collaborators c ON c.note_id=n.id AND c.user_id=v_uid
  LEFT JOIN public.note_user_state s ON s.note_id=n.id AND s.user_id=v_uid
  LEFT JOIN public.lubanote_profiles p ON p.user_id=n.user_id
  LEFT JOIN public.lubanote_profiles ep ON ep.user_id=e.last_editor_user_id
  WHERE n.deleted_at IS NULL
    AND (n.user_id=v_uid OR (c.user_id=v_uid AND
      public.lubanote_user_has_data_access(n.user_id)));
  RETURN jsonb_build_object('ok',true,'notes',v_items);
END;
$$;

-- Sdileny save: server nikdy nedostane title/note/todos ani osobni
-- tags/reminder/plaintext. Dve nezavisle AES-GCM obalky v jedne transakci.
CREATE FUNCTION public.lubanote_save_shared_note_e2e_v1(
  p_note_id uuid, p_shared_envelope jsonb, p_personal_envelope jsonb,
  p_expected_revision bigint, p_device_id text, p_session_id text,
  p_trash_action text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_note public.notes%rowtype;
  v_editor public.shared_note_editor_sessions%rowtype;
  v_time timestamptz := now(); v_username text;
BEGIN
  IF v_uid IS NULL OR NOT public.lubanote_user_has_data_access(v_uid)
     OR NOT public.lubanote_user_can_use_shared_editor_for(p_note_id,v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.lubanote_699dbw_valid_shared_envelope(p_shared_envelope) OR
     NOT public.lubanote_685c3_valid_private_envelope(p_personal_envelope) OR
     octet_length(p_personal_envelope::text) > 1048576 OR
     coalesce(trim(p_device_id),'')='' OR
     coalesce(trim(p_session_id),'')='' OR
     (p_trash_action IS NOT NULL AND p_trash_action NOT IN ('trash','restore')) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_e2e_save');
  END IF;
  SELECT * INTO v_note FROM public.notes WHERE id=p_note_id FOR UPDATE;
  IF NOT FOUND OR v_note.deleted_at IS NOT NULL OR
     NOT EXISTS (SELECT 1 FROM public.lubanote_shared_e2e_content_v1
                 WHERE note_id=p_note_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','note_missing');
  END IF;
  SELECT * INTO v_editor FROM public.shared_note_editor_sessions
  WHERE note_id=p_note_id FOR UPDATE;
  IF NOT FOUND OR v_editor.editor_user_id IS DISTINCT FROM v_uid OR
     v_editor.owner_device_id IS DISTINCT FROM p_device_id OR
     v_editor.owner_session_id IS DISTINCT FROM p_session_id OR
     v_editor.lease_until <= now() THEN
    RETURN jsonb_build_object('ok',false,'reason','shared_editor_lock_not_owned');
  END IF;
  IF v_note.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok',false,'conflict',true,
      'reason','revision_mismatch','current_revision',v_note.revision);
  END IF;
  IF p_trash_action IS NOT NULL AND v_note.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok',false,'reason','not_owner');
  END IF;
  UPDATE public.lubanote_shared_e2e_content_v1 SET
    envelope=p_shared_envelope, updated_at=v_time,
    last_editor_user_id=v_uid, last_edited_at=v_time,
    trashed_at=CASE WHEN p_trash_action='trash' THEN v_time
                   WHEN p_trash_action='restore' THEN NULL ELSE trashed_at END
  WHERE note_id=p_note_id;
  INSERT INTO public.note_user_state(note_id,user_id,personal_data,created_at,updated_at)
  VALUES(p_note_id,v_uid,
    jsonb_build_object('__lubanoteSharedPersonalE2E',p_personal_envelope),
    v_time,v_time)
  ON CONFLICT(note_id,user_id) DO UPDATE SET
    personal_data=EXCLUDED.personal_data, updated_at=v_time;
  UPDATE public.notes SET updated_at=v_time,revision=v_note.revision+1
  WHERE id=p_note_id;
  SELECT username INTO v_username FROM public.lubanote_profiles WHERE user_id=v_uid;
  INSERT INTO public.note_change_log(
    note_id,actor_user_id,actor_username_snapshot,action,metadata,created_at)
  VALUES(p_note_id,v_uid,
    CASE WHEN v_username IS NULL THEN NULL ELSE '@'||v_username END,
    'note_content_updated',
    jsonb_build_object('previous_revision',v_note.revision,
      'new_revision',v_note.revision+1,'actor_is_owner',v_note.user_id=v_uid,
      'e2e_shared',true),v_time);
  RETURN jsonb_build_object('ok',true,'conflict',false,
    'revision',v_note.revision+1,'updated_at',v_time);
END;
$$;

-- Po odebrani posledniho pristupu vrati vlastnik aktualni shared obsah
-- zpet pod svuj Root Key. Nikdy nepouzivat zastaralou predkonverzni
-- obalku: ta neobsahuje pozdejsi editace spolupracovniku.
CREATE FUNCTION public.lubanote_detach_shared_e2e_v1(
  p_note_id uuid, p_expected_revision bigint, p_private_envelope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_note public.notes%rowtype;
  v_time timestamptz := now();
BEGIN
  IF v_uid IS NULL OR NOT public.lubanote_user_has_data_access(v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_note FROM public.notes WHERE id=p_note_id FOR UPDATE;
  IF NOT FOUND OR v_note.user_id IS DISTINCT FROM v_uid OR
     v_note.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','not_owner_or_missing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lubanote_shared_e2e_content_v1
                 WHERE note_id=p_note_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','not_e2e_shared');
  END IF;
  IF EXISTS (SELECT 1 FROM public.note_collaborators c WHERE c.note_id=p_note_id)
     OR EXISTS (SELECT 1 FROM public.note_share_invitations i
                WHERE i.note_id=p_note_id AND i.status='pending') THEN
    RETURN jsonb_build_object('ok',false,'reason','sharing_still_active');
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_note.revision OR
     NOT public.lubanote_685c3_valid_private_envelope(p_private_envelope) OR
     p_private_envelope ->> 'keyId' IS DISTINCT FROM v_note.data ->> 'keyId' THEN
    RETURN jsonb_build_object('ok',false,'reason','revision_or_envelope_invalid');
  END IF;
  DELETE FROM public.lubanote_shared_e2e_content_v1 WHERE note_id=p_note_id;
  UPDATE public.notes SET data=p_private_envelope, updated_at=v_time,
    revision=v_note.revision+1 WHERE id=p_note_id;
  DELETE FROM public.note_user_state WHERE note_id=p_note_id AND user_id=v_uid;
  RETURN jsonb_build_object('ok',true,'revision',v_note.revision+1);
END;
$$;

REVOKE ALL ON FUNCTION public.lubanote_699dbw_valid_shared_envelope(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_convert_private_e2e_to_shared_v1(uuid,bigint,jsonb,jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lubanote_get_e2e_shared_notes_v1()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lubanote_save_shared_note_e2e_v1(uuid,jsonb,jsonb,bigint,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lubanote_convert_private_e2e_to_shared_v1(uuid,bigint,jsonb,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_get_e2e_shared_notes_v1()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_save_shared_note_e2e_v1(uuid,jsonb,jsonb,bigint,text,text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.lubanote_detach_shared_e2e_v1(uuid,bigint,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lubanote_detach_shared_e2e_v1(uuid,bigint,jsonb)
  TO authenticated;

DO $postcheck$
BEGIN
  IF public.lubanote_699dbw_valid_shared_envelope(
    '{"__lubanoteSharedContentE2E":true,"version":1,"keyVersion":1,"algorithm":"AES-256-GCM","iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA=="}'::jsonb
  ) IS DISTINCT FROM true OR
  public.lubanote_699dbw_valid_shared_envelope(
    '{"__lubanoteSharedContentE2E":true,"version":1,"keyVersion":1,"algorithm":"AES-256-GCM","iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAA==","title":"NEPOSILAT"}'::jsonb
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION '699D-BW: server E2E envelope validation failed';
  END IF;
  IF has_table_privilege('authenticated',
    'public.lubanote_shared_e2e_content_v1','SELECT') OR
     NOT EXISTS (SELECT 1 FROM pg_class
       WHERE oid='public.lubanote_shared_e2e_content_v1'::regclass
         AND relrowsecurity) THEN
    RAISE EXCEPTION '699D-BW: new sidecar RLS/ACL not protected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname='lubanote_685c3_notes_guard' AND t.tgenabled IN ('O','A')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname='lubanote_685c3_share_invitation_guard' AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION '699D-BW: E2E guard triggers missing';
  END IF;
END;
$postcheck$;

NOTIFY pgrst, 'reload schema';

COMMIT;
