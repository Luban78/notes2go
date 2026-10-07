BEGIN;

ALTER TABLE public.secret_settings
  ADD COLUMN IF NOT EXISTS e2e_root_key_version integer,
  ADD COLUMN IF NOT EXISTS e2e_root_key_algorithm text,
  ADD COLUMN IF NOT EXISTS e2e_root_key_id text,
  ADD COLUMN IF NOT EXISTS e2e_root_key_box jsonb;

COMMENT ON COLUMN public.secret_settings.e2e_root_key_version IS
  'LubaNote Full E2E Account Root Key envelope version. NULL = not initialized.';
COMMENT ON COLUMN public.secret_settings.e2e_root_key_algorithm IS
  'Client-side Root Key algorithm identifier; no plaintext key material.';
COMMENT ON COLUMN public.secret_settings.e2e_root_key_id IS
  'Non-secret SHA-256 based identifier of the random Account Root Key.';
COMMENT ON COLUMN public.secret_settings.e2e_root_key_box IS
  'AES-GCM encrypted Account Root Key envelope. Server never receives plaintext Root Key.';

COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
