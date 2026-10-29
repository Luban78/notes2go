-- LUBANOTE 697F | READ-ONLY post-install verification

-- 1. Trigger installed and enabled: tgenabled should be O (origin).
SELECT tgname AS trigger_name,
       tgenabled,
       pg_get_triggerdef(oid, true) AS definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND tgname = 'lubanote_auto_demo_after_confirm_697F';

-- 2. Function exists, SECURITY DEFINER = true; callable by clients = false.
SELECT p.proname,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS p
WHERE p.oid = to_regprocedure('public.lubanote_auto_demo_on_confirmation_697F()');

-- 3. After signing up a NEW test account and confirming its email, run this
--    query with its real email (remove the -- and edit the address):
-- SELECT u.created_at, u.email_confirmed_at,
--        a.account_status, a.plan_id, a.demo_started_at, a.demo_until,
--        a.entitlement_source,
--        round(extract(epoch from (a.demo_until - a.demo_started_at)) / 86400, 4) AS days_granted
-- FROM auth.users AS u
-- LEFT JOIN public.lubanote_user_access AS a ON a.user_id = u.id
-- WHERE u.email = 'test-account@example.com';
-- Expected: verified email; active/demo; 14 days; auto_verified_demo_697F.
-- Do not test by changing status on an existing real user.
