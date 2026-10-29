-- LUBANOTE 697F | Stop NEW automatic activations, without touching user data.
-- Run only if the 697F trigger must be disabled.
-- Previously activated Demo accounts remain active until their own expiry.
BEGIN;
DROP TRIGGER IF EXISTS lubanote_auto_demo_after_confirm_697F ON auth.users;
DROP FUNCTION IF EXISTS public.lubanote_auto_demo_on_confirmation_697F();
COMMIT;
