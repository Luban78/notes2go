-- 689D LAB FIXTURE, NOT the production Supabase schema or actual RPC.
-- Intentionally synthetic. Runs in disposable, network-isolated PostgreSQL.
-- No production credentials, tables, source records, or server connections.
CREATE SCHEMA lab689d;
CREATE TABLE lab689d.notes (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  data jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE lab689d.feed (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL,
  note_id uuid NOT NULL,
  revision bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('upsert', 'remove'))
);
CREATE INDEX ON lab689d.feed (owner_id, seq);

CREATE FUNCTION lab689d.save_note_safe(
  p_owner uuid, p_id uuid, p_data jsonb,
  p_expected_revision bigint, p_delete boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  old_note lab689d.notes%ROWTYPE;
  new_revision bigint;
  is_e2e boolean;
BEGIN
  IF p_owner IS NULL OR p_id IS NULL OR p_expected_revision IS NULL OR
      p_expected_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  SELECT * INTO old_note FROM lab689d.notes WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF old_note.owner_id <> p_owner THEN
      -- Don't leak whether a record exists for another synthetic owner.
      RETURN jsonb_build_object('ok',false,'reason','not_found');
    END IF;
    IF old_note.deleted_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok',false,'reason','deleted');
    END IF;
    IF old_note.revision <> p_expected_revision THEN
      RETURN jsonb_build_object('ok',false,'reason','revision_conflict');
    END IF;
    is_e2e := old_note.data->>'__lubanoteE2ENote' = 'true';
    IF NOT p_delete AND is_e2e AND (
      p_data IS NULL OR p_data->>'__lubanoteE2ENote' IS DISTINCT FROM 'true'
    ) THEN
      RAISE EXCEPTION 'E2E_DOWNGRADE_BLOCKED';
    END IF;
    IF NOT p_delete AND (p_data IS NULL OR jsonb_typeof(p_data) <> 'object') THEN
      RAISE EXCEPTION 'INVALID_DATA';
    END IF;
    new_revision := old_note.revision + 1;
    UPDATE lab689d.notes SET
      data = CASE WHEN p_delete THEN old_note.data ELSE p_data END,
      deleted_at = CASE WHEN p_delete THEN clock_timestamp() ELSE NULL END,
      revision = new_revision, updated_at = clock_timestamp()
    WHERE id = p_id;
  ELSE
    IF p_delete OR p_expected_revision <> 0 THEN
      RETURN jsonb_build_object('ok',false,'reason','not_found');
    END IF;
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_DATA';
    END IF;
    new_revision := 1;
    INSERT INTO lab689d.notes(id,owner_id,data,revision)
    VALUES (p_id,p_owner,p_data,new_revision);
  END IF;
  INSERT INTO lab689d.feed(owner_id,note_id,revision,action)
    VALUES (p_owner,p_id,new_revision,CASE WHEN p_delete THEN 'remove' ELSE 'upsert' END);
  RETURN jsonb_build_object('ok',true,'revision',new_revision);
END $$;
