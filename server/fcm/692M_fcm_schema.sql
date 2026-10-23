-- LubaNote 692M: device-token registry. Never stores note text or reminder content.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lubanote_fcm_tokens (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 8 AND 128),
  token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 30 AND 4096),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);
ALTER TABLE public.lubanote_fcm_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lubanote_fcm_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lubanote_fcm_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.lubanote_fcm_dispatch (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lubanote_fcm_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lubanote_fcm_dispatch FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lubanote_fcm_dispatch TO service_role;

-- Atomic 20-second throttle per authenticated user, bypassable only via server service_role.
CREATE OR REPLACE FUNCTION public.lubanote_fcm_allow_send(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.lubanote_fcm_dispatch(user_id, last_sent_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_sent_at = EXCLUDED.last_sent_at
    WHERE public.lubanote_fcm_dispatch.last_sent_at < now() - interval '20 seconds';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.lubanote_fcm_allow_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_fcm_allow_send(uuid) TO service_role;
COMMIT;
