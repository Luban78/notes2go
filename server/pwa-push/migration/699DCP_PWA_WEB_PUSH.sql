-- 699D-CP: isolated Android PWA Web Push. Does not modify APK FCM, alarm or PC tables.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lubanote_pwa_push_subscriptions_v1 (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (length(device_id) BETWEEN 8 AND 128),
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 40 AND 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 40 AND 256),
  auth_key text NOT NULL CHECK (length(auth_key) BETWEEN 8 AND 128),
  last_revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);
CREATE TABLE IF NOT EXISTS public.lubanote_pwa_push_jobs_v1 (
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  job_key text NOT NULL CHECK (length(job_key) BETWEEN 16 AND 80),
  due_at timestamptz NOT NULL,
  leased_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  PRIMARY KEY (user_id, device_id, job_key),
  FOREIGN KEY (user_id, device_id)
    REFERENCES public.lubanote_pwa_push_subscriptions_v1(user_id, device_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS lubanote_pwa_push_due_v1_idx
  ON public.lubanote_pwa_push_jobs_v1(due_at, leased_until);
CREATE TABLE IF NOT EXISTS public.lubanote_pwa_push_config_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  public_key text NOT NULL CHECK (length(public_key) BETWEEN 80 AND 128)
);

ALTER TABLE public.lubanote_pwa_push_subscriptions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lubanote_pwa_push_jobs_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lubanote_pwa_push_config_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lubanote_pwa_push_subscriptions_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lubanote_pwa_push_jobs_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.lubanote_pwa_push_config_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lubanote_pwa_push_subscriptions_v1 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lubanote_pwa_push_jobs_v1 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lubanote_pwa_push_config_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.lubanote_pwa_push_register_v1(
  p_user_id uuid, p_device_id text, p_endpoint text,
  p_p256dh text, p_auth_key text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF length(p_device_id) NOT BETWEEN 8 AND 128
     OR length(p_endpoint) NOT BETWEEN 40 AND 2048
     OR length(p_p256dh) NOT BETWEEN 40 AND 256
     OR length(p_auth_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'BAD_PWA_SUBSCRIPTION' USING ERRCODE = '22023';
  END IF;
  -- A single browser subscription must never notify two signed-in accounts.
  DELETE FROM public.lubanote_pwa_push_subscriptions_v1
    WHERE endpoint = p_endpoint
      AND (user_id <> p_user_id OR device_id <> p_device_id);
  IF NOT EXISTS (
      SELECT 1 FROM public.lubanote_pwa_push_subscriptions_v1
       WHERE user_id = p_user_id AND device_id = p_device_id
    ) AND (SELECT count(*) FROM public.lubanote_pwa_push_subscriptions_v1
            WHERE user_id = p_user_id) >= 20 THEN
    RAISE EXCEPTION 'PWA_DEVICE_LIMIT' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lubanote_pwa_push_subscriptions_v1
    (user_id, device_id, endpoint, p256dh, auth_key)
  VALUES (p_user_id, p_device_id, p_endpoint, p_p256dh, p_auth_key)
  ON CONFLICT (user_id, device_id) DO UPDATE SET
    last_revision = CASE WHEN public.lubanote_pwa_push_subscriptions_v1.endpoint
                          IS DISTINCT FROM EXCLUDED.endpoint THEN 0
                         ELSE public.lubanote_pwa_push_subscriptions_v1.last_revision END,
    endpoint = EXCLUDED.endpoint,
    p256dh = EXCLUDED.p256dh,
    auth_key = EXCLUDED.auth_key,
    updated_at = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.lubanote_pwa_push_replace_v1(
  p_user_id uuid, p_device_id text, p_revision bigint, p_jobs jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  entry jsonb;
  entry_key text;
  entry_ms text;
  due_ms bigint;
  now_ms bigint := (extract(epoch FROM now()) * 1000)::bigint;
BEGIN
  IF p_revision <= 0 OR jsonb_typeof(p_jobs) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_jobs) > 400 THEN
    RAISE EXCEPTION 'BAD_PWA_SCHEDULE' USING ERRCODE = '22023';
  END IF;
  -- Do not allow old background requests to overwrite a newer schedule.
  UPDATE public.lubanote_pwa_push_subscriptions_v1
     SET last_revision = p_revision, updated_at = now()
   WHERE user_id = p_user_id AND device_id = p_device_id
     AND last_revision < p_revision;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.lubanote_pwa_push_jobs_v1
   WHERE user_id = p_user_id AND device_id = p_device_id;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_jobs) AS j(value) LOOP
    entry_key := entry->>'k';
    entry_ms := entry->>'t';
    IF jsonb_typeof(entry) <> 'object'
       OR entry_key IS NULL OR entry_key !~ '^[a-f0-9]{24,64}$'
       OR entry_ms IS NULL OR entry_ms !~ '^[0-9]{13}$' THEN
      RAISE EXCEPTION 'BAD_PWA_JOB' USING ERRCODE = '22023';
    END IF;
    due_ms := entry_ms::bigint;
    IF due_ms <= now_ms + 1000 OR due_ms > now_ms + 366::bigint * 86400000 THEN
      RAISE EXCEPTION 'BAD_PWA_DATE' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lubanote_pwa_push_jobs_v1(user_id,device_id,job_key,due_at)
    VALUES (p_user_id,p_device_id,entry_key,to_timestamp(due_ms::double precision / 1000))
    ON CONFLICT (user_id,device_id,job_key) DO NOTHING;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.lubanote_pwa_push_claim_v1(p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id uuid, device_id text, job_key text,
  endpoint text, p256dh text, auth_key text
) LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH picked AS (
    SELECT j.user_id, j.device_id, j.job_key
      FROM public.lubanote_pwa_push_jobs_v1 j
     WHERE j.due_at <= now()
       AND (j.leased_until IS NULL OR j.leased_until < now())
       AND j.attempts < 5
     ORDER BY j.due_at
     LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 50)
     FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.lubanote_pwa_push_jobs_v1 j
       SET leased_until = now() + interval '90 seconds', attempts = j.attempts + 1
      FROM picked p
     WHERE j.user_id=p.user_id AND j.device_id=p.device_id AND j.job_key=p.job_key
     RETURNING j.user_id,j.device_id,j.job_key
  )
  SELECT l.user_id,l.device_id,l.job_key,s.endpoint,s.p256dh,s.auth_key
    FROM leased l JOIN public.lubanote_pwa_push_subscriptions_v1 s
      ON s.user_id=l.user_id AND s.device_id=l.device_id;
$$;

CREATE OR REPLACE FUNCTION public.lubanote_pwa_push_ack_v1(
  p_user_id uuid, p_device_id text, p_job_key text, p_result text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_result='sent' THEN
    DELETE FROM public.lubanote_pwa_push_jobs_v1
     WHERE user_id=p_user_id AND device_id=p_device_id AND job_key=p_job_key;
  ELSIF p_result='invalid' THEN
    DELETE FROM public.lubanote_pwa_push_subscriptions_v1
     WHERE user_id=p_user_id AND device_id=p_device_id;
  ELSIF p_result='retry' THEN
    UPDATE public.lubanote_pwa_push_jobs_v1
       SET leased_until = now() + make_interval(secs => LEAST(300,30 * power(2,LEAST(attempts,4))::integer))
     WHERE user_id=p_user_id AND device_id=p_device_id AND job_key=p_job_key;
    DELETE FROM public.lubanote_pwa_push_jobs_v1
     WHERE user_id=p_user_id AND device_id=p_device_id
       AND job_key=p_job_key AND attempts >= 5;
  ELSE
    RAISE EXCEPTION 'BAD_PWA_ACK' USING ERRCODE = '22023';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.lubanote_pwa_push_register_v1(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_pwa_push_replace_v1(uuid,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_pwa_push_claim_v1(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lubanote_pwa_push_ack_v1(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lubanote_pwa_push_register_v1(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_pwa_push_replace_v1(uuid,text,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_pwa_push_claim_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lubanote_pwa_push_ack_v1(uuid,text,text,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
