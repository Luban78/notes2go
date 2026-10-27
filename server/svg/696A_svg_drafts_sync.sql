-- LubaNote 696A – editable SVG Studio drafts shared between APK and PC.
-- Run once on the self-hosted LubaServer PostgreSQL before enabling the UI.
-- No production notes, secrets, migrations or storage objects are altered.
-- IMPORTANT: draft JSON (including optional reference image) is stored server-side
-- without LubaNote Secret/E2E encryption. Access is restricted with Auth + RLS.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lubanote_svg_drafts_696a (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 5 AND 128 AND id !~ '^__'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 70),
  document jsonb NOT NULL CHECK (
    jsonb_typeof(document)='object'
    AND jsonb_typeof(document->'shapes')='array'
    AND jsonb_array_length(document->'shapes') BETWEEN 1 AND 800
    AND octet_length(document::text) <= 2400000
  ),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,id)
);
CREATE INDEX IF NOT EXISTS lubanote_svg_drafts_696a_updated_idx
  ON public.lubanote_svg_drafts_696a (user_id,updated_at DESC);

ALTER TABLE public.lubanote_svg_drafts_696a ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lubanote_svg_drafts_696a FROM PUBLIC, anon;
-- Clients can list/read only their own designs. All writes MUST use the RPC,
-- preventing direct API calls from bypassing optimistic revision checks.
REVOKE ALL ON public.lubanote_svg_drafts_696a FROM authenticated;
GRANT SELECT ON public.lubanote_svg_drafts_696a TO authenticated;
DROP POLICY IF EXISTS svg696a_read_own ON public.lubanote_svg_drafts_696a;
CREATE POLICY svg696a_read_own ON public.lubanote_svg_drafts_696a
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Atomic compare-and-swap; an older client can never replace a newer revision.
-- SECURITY DEFINER is deliberately necessary because authenticated clients
-- have SELECT ONLY. The RPC derives user_id exclusively from auth.uid() and
-- uses explicit WHERE user_id=v_user on every write.
CREATE OR REPLACE FUNCTION public.lubanote_svg_draft_push_696a(
  p_id text, p_name text, p_document jsonb, p_expected_revision bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
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
$body$;
REVOKE ALL ON FUNCTION public.lubanote_svg_draft_push_696a(text,text,jsonb,bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lubanote_svg_draft_push_696a(text,text,jsonb,bigint)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
