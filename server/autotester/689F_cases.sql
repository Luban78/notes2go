-- Actual, byte-for-byte exported production RPC function bodies on a SYNTHETIC database.
-- Tests run in one transaction and rollback. No user data or live backend access.
-- Verified scope: RPC body branching / revision handling / targeted read / feed read.
-- Not verified: production triggers, RLS/grants, real auth, entitlements, replication.
\set ON_ERROR_STOP on
BEGIN;
DO $lab$
DECLARE
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  disabled uuid := '99999999-9999-4999-8999-999999999999';
  n uuid := '33333333-3333-4333-8333-333333333333';
  legacy_n uuid := '44444444-4444-4444-8444-444444444444';
  box1 jsonb := '{"__lubanoteE2ENote":true,"keyId":"synthetic","ciphertext":"AAAA"}'::jsonb;
  box2 jsonb := '{"__lubanoteE2ENote":true,"keyId":"synthetic","ciphertext":"BBBB"}'::jsonb;
  plain jsonb := '{"title":"synthetic legacy","note":"not a real note"}'::jsonb;
  r jsonb;
  rows_seen integer;
  first_seq bigint;
  second_seq bigint;
  third_seq bigint;
  state text;
BEGIN
  -- 01: actual security-definer RPC denies missing synthetic auth context.
  PERFORM set_config('ln689f.synthetic_user', '', true);
  state := '';
  BEGIN
    PERFORM public.save_note_safe(n, box1, 0, false, null);
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '42501' THEN RAISE EXCEPTION '689F_NO_AUTH_WRITE_ALLOWED got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 01 unauthenticated save denied';

  -- 02: real RPC checks a data-access predicate (the predicate here is a SHIM).
  PERFORM set_config('ln689f.synthetic_user', disabled::text, true);
  state := '';
  BEGIN
    PERFORM public.save_note_safe(n, box1, 0, false, null);
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '42501' THEN RAISE EXCEPTION '689F_INACTIVE_WRITE_ALLOWED got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 02 inactive access denied by RPC branch';

  PERFORM set_config('ln689f.synthetic_user', a::text, true);
  r := public.save_note_safe(n, box1, 0, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 1 OR
     (SELECT data FROM public.notes WHERE id=n) IS DISTINCT FROM box1 THEN
    RAISE EXCEPTION '689F_CREATE_FAILED: %', r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 03 E2E JSONB creation revision=1 (format not cryptographically verified)';

  SELECT count(*) INTO rows_seen FROM public.lubanote_get_notes_by_ids_safe(ARRAY[n]);
  IF rows_seen <> 1 OR
     (SELECT data FROM public.lubanote_get_notes_by_ids_safe(ARRAY[n]) LIMIT 1) IS DISTINCT FROM box1 THEN
    RAISE EXCEPTION '689F_TARGET_READ_FAILED';
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 04 actual targeted read returns owned row';

  SELECT count(*) INTO rows_seen FROM public.lubanote_get_notes_by_ids_safe(ARRAY[n,n,NULL]::uuid[]);
  IF rows_seen <> 1 THEN RAISE EXCEPTION '689F_TARGET_DEDUP_FAILED'; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 05 targeted read deduplicates IDs';

  PERFORM set_config('ln689f.synthetic_user', b::text, true);
  SELECT count(*) INTO rows_seen FROM public.lubanote_get_notes_by_ids_safe(ARRAY[n]);
  IF rows_seen <> 0 THEN RAISE EXCEPTION '689F_CROSS_OWNER_READ'; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 06 other owner cannot targeted-read row';

  state := '';
  BEGIN
    PERFORM public.save_note_safe(n, box2, 1, false, null);
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '42501' THEN RAISE EXCEPTION '689F_CROSS_OWNER_WRITE got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 07 other owner cannot write row';

  PERFORM set_config('ln689f.synthetic_user', a::text, true);
  state := '';
  BEGIN
    PERFORM 1 FROM public.lubanote_get_notes_by_ids_safe(array_fill(n, ARRAY[201]));
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '22023' THEN RAISE EXCEPTION '689F_TARGET_LIMIT got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 08 targeted read caps array size at 200';

  r := public.save_note_safe(n, box2, 0, false, null);
  IF r->>'reason' <> 'revision_mismatch' OR (r->>'current_revision')::bigint <> 1 OR
     (SELECT revision FROM public.notes WHERE id=n) <> 1 THEN
    RAISE EXCEPTION '689F_STALE_REVISION_WRITTEN: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 09 stale revision rejected';

  r := public.save_note_safe(n, box2, 1, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 2 OR
     (SELECT data FROM public.notes WHERE id=n) IS DISTINCT FROM box2 OR
     (SELECT deleted_at FROM public.notes WHERE id=n) IS NOT NULL THEN
    RAISE EXCEPTION '689F_E2E_TRASH_UPDATE: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 10 existing encrypted content update revision=2';

  r := public.save_note_safe(n, box1, 2, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 3 THEN
    RAISE EXCEPTION '689F_RESTORE_CONTENT_FAILED: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 11 followup encrypted update revision=3';

  INSERT INTO public.note_collaborators(note_id, collaborator) VALUES (n,b);
  r := public.save_note_safe(n, box2, 3, false, null);
  IF r->>'reason' <> 'shared_note_requires_shared_save' OR
     (SELECT revision FROM public.notes WHERE id=n) <> 3 THEN
    RAISE EXCEPTION '689F_SHARED_LOCK_BYPASS: %',r;
  END IF;
  DELETE FROM public.note_collaborators WHERE note_id=n;
  RAISE NOTICE 'REAL_RPC_PASS 12 shared collaborator prevents private save';

  r := public.save_note_safe(n, null, 3, true, 'synthetic-device');
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 4 OR
     (SELECT deleted_at FROM public.notes WHERE id=n) IS NULL OR
     (SELECT data FROM public.notes WHERE id=n) IS DISTINCT FROM box1 THEN
    RAISE EXCEPTION '689F_TOMBSTONE_FAILED: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 13 hard-delete tombstone and revision=4';

  r := public.save_note_safe(n, box1, 4, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 5 OR
     (SELECT deleted_at FROM public.notes WHERE id=n) IS NOT NULL THEN
    RAISE EXCEPTION '689F_RESTORE_TOMBSTONE_FAILED: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 14 restore from deleted_at respects revision';

  UPDATE public.lubanote_plans SET note_limit=1 WHERE id=1;
  r := public.save_note_safe(legacy_n, plain, 0, false, null);
  IF r->>'reason' <> 'note_limit_reached' OR (r->>'current_count')::bigint <> 1 OR
     EXISTS(SELECT 1 FROM public.notes WHERE id=legacy_n) THEN
    RAISE EXCEPTION '689F_QUOTA_BYPASS: %',r;
  END IF;
  UPDATE public.lubanote_plans SET note_limit=100 WHERE id=1;
  RAISE NOTICE 'REAL_RPC_PASS 15 quota branch rejects new note';

  r := public.save_note_safe(legacy_n, plain, 0, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 1 THEN
    RAISE EXCEPTION '689F_LEGACY_CREATE: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 16 legacy JSONB permitted for new row';

  r := public.save_note_safe(legacy_n, plain, 1, false, null);
  IF r->>'ok' <> 'true' OR (r->>'revision')::bigint <> 2 THEN
    RAISE EXCEPTION '689F_LEGACY_EDIT: %',r;
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 17 legacy update still works';

  -- Explicitly synthetic feed events. Real production triggers are NOT exported.
  INSERT INTO public.lubanote_note_changes(note_id,revision,operation,old_user_id,new_user_id)
  VALUES(n,1,'INSERT',NULL,a) RETURNING seq INTO first_seq;
  INSERT INTO public.lubanote_note_changes(note_id,revision,operation,old_user_id,new_user_id)
  VALUES(n,2,'UPDATE',a,a) RETURNING seq INTO second_seq;
  INSERT INTO public.lubanote_note_changes(note_id,revision,operation,old_user_id,new_user_id)
  VALUES(n,4,'DELETE',a,NULL) RETURNING seq INTO third_seq;
  INSERT INTO public.lubanote_note_changes(note_id,revision,operation,old_user_id,new_user_id)
  VALUES(legacy_n,1,'INSERT',NULL,b);
  SELECT count(*) INTO rows_seen FROM public.lubanote_get_note_changes_since(0,200);
  IF rows_seen <> 3 OR first_seq >= second_seq OR second_seq >= third_seq OR
     (SELECT action FROM public.lubanote_get_note_changes_since(0,200)
      WHERE seq=third_seq) <> 'remove' THEN
    RAISE EXCEPTION '689F_FEED_BAD';
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 18 feed reader filters by owner and maps removal';

  SELECT count(*) INTO rows_seen FROM public.lubanote_get_note_changes_since(first_seq,1);
  IF rows_seen <> 1 OR
     (SELECT seq FROM public.lubanote_get_note_changes_since(first_seq,1)) <> second_seq THEN
    RAISE EXCEPTION '689F_FEED_PAGE_BAD';
  END IF;
  RAISE NOTICE 'REAL_RPC_PASS 19 feed cursor and page size';

  SELECT count(*) INTO rows_seen FROM public.lubanote_get_note_changes_since(0,0);
  IF rows_seen <> 1 THEN RAISE EXCEPTION '689F_FEED_LIMIT_CLAMP_BAD'; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 20 feed minimum page size enforced';

  PERFORM set_config('ln689f.synthetic_user', '', true);
  state := '';
  BEGIN
    PERFORM 1 FROM public.lubanote_get_note_changes_since(0,200);
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '42501' THEN RAISE EXCEPTION '689F_FEED_NO_AUTH got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 21 unauthenticated feed read denied';

  PERFORM set_config('ln689f.synthetic_user', disabled::text, true);
  state := '';
  BEGIN
    PERFORM 1 FROM public.lubanote_get_notes_by_ids_safe(ARRAY[n]);
  EXCEPTION WHEN OTHERS THEN state := SQLSTATE;
  END;
  IF state <> '42501' THEN RAISE EXCEPTION '689F_ACCESS_GATE_READ got=%',state; END IF;
  RAISE NOTICE 'REAL_RPC_PASS 22 inactive access denied by targeted read';
END
$lab$;
ROLLBACK;
SELECT CASE WHEN (SELECT count(*) FROM public.notes)=0 AND
                 (SELECT count(*) FROM public.lubanote_note_changes)=0 AND
                 (SELECT count(*) FROM public.note_collaborators)=0
            THEN 'REAL_RPC_ROLLBACK_PASS' ELSE 'REAL_RPC_ROLLBACK_FAIL' END AS rollback_check;
