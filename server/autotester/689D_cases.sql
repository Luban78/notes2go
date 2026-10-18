-- Real PostgreSQL execution, but TEST FIXTURE RPC, not production RPC.
-- Values are synthetic and deterministic. One transaction; ROLLBACK always.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  owner_a uuid := '11111111-1111-4111-8111-111111111111';
  owner_b uuid := '22222222-2222-4222-8222-222222222222';
  note_a uuid := '33333333-3333-4333-8333-333333333333';
  note_b uuid := '44444444-4444-4444-8444-444444444444';
  cipher jsonb := '{"__lubanoteE2ENote":true,"version":1,"algorithm":"AES-256-GCM","keyId":"SYNTHETIC","iv":"AA==","ciphertext":"BB=="}'::jsonb;
  trash_cipher jsonb := '{"__lubanoteE2ENote":true,"version":1,"algorithm":"AES-256-GCM","keyId":"SYNTHETIC","iv":"CC==","ciphertext":"DD=="}'::jsonb;
  plain jsonb := '{"title":"SYNTHETIC ONLY","note":"synthetic"}'::jsonb;
  response jsonb;
  stored lab689d.notes%ROWTYPE;
  caught boolean;
  action_feed bigint;
BEGIN
  response := lab689d.save_note_safe(owner_a,note_a,cipher,0,false);
  IF response->>'ok' <> 'true' OR (response->>'revision')::int <> 1 THEN RAISE EXCEPTION '689D_CREATE_FAILED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 01 create E2E revision 1';

  SELECT * INTO stored FROM lab689d.notes WHERE id=note_a;
  IF stored.data <> cipher OR stored.revision <> 1 THEN RAISE EXCEPTION '689D_E2E_STORAGE_FAILED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 02 E2E JSONB stored (structural only)';

  response := lab689d.save_note_safe(owner_a,note_a,trash_cipher,1,false);
  IF response->>'ok' <> 'true' OR (response->>'revision')::int <> 2 THEN RAISE EXCEPTION '689D_TRASH_REVISION_FAILED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 03 trash-marker update stays encrypted';

  SELECT * INTO stored FROM lab689d.notes WHERE id=note_a;
  IF stored.data <> trash_cipher OR stored.deleted_at IS NOT NULL THEN RAISE EXCEPTION '689D_TRASH_WRONG_DATA'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 04 moving to Trash is NOT physical deletion';

  response := lab689d.save_note_safe(owner_a,note_a,cipher,2,false);
  IF response->>'ok' <> 'true' OR (response->>'revision')::int <> 3 THEN RAISE EXCEPTION '689D_RESTORE_FAILED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 05 restore E2E revision 3';

  response := lab689d.save_note_safe(owner_a,note_a,trash_cipher,2,false);
  IF response->>'reason' <> 'revision_conflict' THEN RAISE EXCEPTION '689D_STALE_WRITE_ACCEPTED'; END IF;
  SELECT * INTO stored FROM lab689d.notes WHERE id=note_a;
  IF stored.revision <> 3 OR stored.data <> cipher THEN RAISE EXCEPTION '689D_STALE_MUTATED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 06 stale revision cannot overwrite';

  caught := false;
  BEGIN
    PERFORM lab689d.save_note_safe(owner_a,note_a,plain,3,false);
  EXCEPTION WHEN OTHERS THEN
    caught := SQLERRM = 'E2E_DOWNGRADE_BLOCKED';
  END;
  IF NOT caught THEN RAISE EXCEPTION '689D_DOWNGRADE_NOT_BLOCKED'; END IF;
  SELECT * INTO stored FROM lab689d.notes WHERE id=note_a;
  IF stored.revision <> 3 OR stored.data <> cipher THEN RAISE EXCEPTION '689D_DOWNGRADE_MUTATED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 07 plaintext downgrade rejected atomically';

  response := lab689d.save_note_safe(owner_b,note_a,trash_cipher,3,false);
  IF response->>'reason' <> 'not_found' THEN RAISE EXCEPTION '689D_CROSS_OWNER_WRITE'; END IF;
  IF EXISTS(SELECT 1 FROM lab689d.notes WHERE id=note_a AND owner_id=owner_b) THEN RAISE EXCEPTION '689D_CROSS_OWNER_READ'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 08 owner isolation fixture';

  response := lab689d.save_note_safe(owner_a,note_a,NULL,3,true);
  IF response->>'ok' <> 'true' OR (response->>'revision')::int <> 4 THEN RAISE EXCEPTION '689D_DELETE_FAILED'; END IF;
  SELECT * INTO stored FROM lab689d.notes WHERE id=note_a;
  IF stored.deleted_at IS NULL OR stored.data <> cipher THEN RAISE EXCEPTION '689D_TOMBSTONE_FAILED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 09 tombstone retains ciphertext';

  response := lab689d.save_note_safe(owner_a,note_a,trash_cipher,3,false);
  IF response->>'reason' <> 'deleted' THEN RAISE EXCEPTION '689D_RESURRECTION_ACCEPTED'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 10 deleted note cannot be resurrected';

  response := lab689d.save_note_safe(owner_a,note_b,plain,0,false);
  IF response->>'ok' <> 'true' THEN RAISE EXCEPTION '689D_LEGACY_CREATE'; END IF;
  response := lab689d.save_note_safe(owner_a,note_b,plain,1,false);
  IF response->>'ok' <> 'true' OR (response->>'revision')::int <> 2 THEN RAISE EXCEPTION '689D_LEGACY_UPDATE'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 11 historical plaintext compatibility fixture';

  IF (SELECT COUNT(*) FROM lab689d.feed WHERE owner_id=owner_a) <> 6 OR
     (SELECT COUNT(*) FROM lab689d.feed WHERE owner_id=owner_b) <> 0 OR
     (SELECT COUNT(DISTINCT seq) FROM lab689d.feed) <> 6 OR
     (SELECT COUNT(*) FROM lab689d.feed WHERE action='remove' AND note_id=note_a) <> 1 THEN
    RAISE EXCEPTION '689D_FEED_WRONG';
  END IF;
  SELECT max(seq) INTO action_feed FROM lab689d.feed;
  IF action_feed <> 6 THEN RAISE EXCEPTION '689D_FEED_NOT_MONOTONIC'; END IF;
  RAISE NOTICE 'DB_LAB_PASS 12 feed revisions, monotonic IDs, owner isolation';
END $$;
ROLLBACK;
SELECT CASE WHEN (SELECT count(*) FROM lab689d.notes)=0 AND
    (SELECT count(*) FROM lab689d.feed)=0 THEN 'DB_LAB_ROLLBACK_PASS'
    ELSE 'DB_LAB_ROLLBACK_FAIL' END AS rollback_status;
