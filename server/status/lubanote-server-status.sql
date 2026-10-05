BEGIN;

CREATE TABLE IF NOT EXISTS public.lubanote_server_status (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  hostname text,
  uptime_seconds bigint,
  load_1 numeric,
  load_5 numeric,
  load_15 numeric,
  memory_total_bytes bigint,
  memory_used_bytes bigint,
  memory_available_bytes bigint,
  swap_total_bytes bigint,
  swap_used_bytes bigint,
  disk_total_bytes bigint,
  disk_used_bytes bigint,
  disk_available_bytes bigint,
  disk_used_percent numeric,
  battery_percentage numeric,
  battery_state text,
  ac_online boolean,
  supabase_healthy integer,
  supabase_total integer,
  docker_active boolean,
  cloudflared_active boolean
);

ALTER TABLE public.lubanote_server_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lubanote_server_status FROM anon;
REVOKE ALL ON TABLE public.lubanote_server_status FROM authenticated;

INSERT INTO public.lubanote_server_status (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.lubanote_admin_get_server_status()
RETURNS SETOF public.lubanote_server_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(public.lubanote_admin_is_current_user(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.lubanote_server_status
  WHERE id = 'main';
END;
$$;

REVOKE ALL ON FUNCTION public.lubanote_admin_get_server_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lubanote_admin_get_server_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.lubanote_admin_get_server_status() TO authenticated;

COMMIT;
