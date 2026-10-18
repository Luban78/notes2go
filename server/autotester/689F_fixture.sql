-- 689F: minimal synthetic dependencies required to execute the 3 REAL exported RPC bodies.
-- DISPOSABLE PostgreSQL ONLY. Never apply this fixture to LubaServer/production!
-- auth.uid() and data-access checking are explicit synthetic SHIMS, not production functions.
CREATE SCHEMA auth;
CREATE SCHEMA lab689f;
CREATE TABLE lab689f.synthetic_access (uid uuid PRIMARY KEY, active boolean NOT NULL);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('ln689f.synthetic_user', true), '')::uuid
$$;
CREATE FUNCTION public.lubanote_user_has_data_access(who uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM lab689f.synthetic_access a WHERE a.uid = who AND a.active)
$$;
CREATE TABLE public.lubanote_plans (
  id bigint PRIMARY KEY, note_limit integer NULL
);
CREATE TABLE public.lubanote_user_access (
  user_id uuid PRIMARY KEY, plan_id bigint REFERENCES public.lubanote_plans(id)
);
CREATE TABLE public.notes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  data jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  deleted_by_device_id text,
  revision bigint NOT NULL
);
CREATE TABLE public.note_collaborators(note_id uuid NOT NULL, collaborator uuid NOT NULL);
CREATE TABLE public.lubanote_note_changes (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note_id uuid NOT NULL,
  revision bigint NOT NULL,
  operation text NOT NULL,
  old_user_id uuid,
  new_user_id uuid,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.lubanote_note_changes(seq);
-- IMPORTANT: The production NOTE TRIGGERS and RLS/role grants are NOT in this fixture.
-- No write-feed trigger, E2E downgrade trigger, real auth, or real plan logic is asserted.
INSERT INTO lab689f.synthetic_access(uid, active) VALUES
 ('11111111-1111-4111-8111-111111111111', true),
 ('22222222-2222-4222-8222-222222222222', true),
 ('99999999-9999-4999-8999-999999999999', false);
INSERT INTO public.lubanote_plans(id,note_limit) VALUES (1,100);
INSERT INTO public.lubanote_user_access(user_id,plan_id) VALUES
 ('11111111-1111-4111-8111-111111111111',1),
 ('22222222-2222-4222-8222-222222222222',1);
