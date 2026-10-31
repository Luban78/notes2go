-- 697Z-G: read-only existence/activation check, suitable before and after applying the migration.
-- Expected before on Cloud: functions=0, triggers_active=0, frozen=true.
-- Expected after on Cloud: functions=3, triggers_active=3, frozen=true.
SELECT '685C3_functions' AS check_name, count(*)::text AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'lubanote_685c3_valid_private_envelope',
  'lubanote_685c3_notes_guard',
  'lubanote_685c3_share_guard'
)
UNION ALL
SELECT '685C3_triggers_active', count(*)::text
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND t.tgenabled IN ('O','A') AND t.tgname IN (
    'lubanote_685c3_notes_guard',
    'lubanote_685c3_collaborator_guard',
    'lubanote_685c3_share_invitation_guard'
  )
UNION ALL
SELECT 'cloud_frozen', frozen::text
FROM lubanote_migration_internal.write_freeze_state
WHERE singleton = true
ORDER BY 1;
