"""699B: deterministic guard tests; no connection or writes to production."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'schema-sync.py'
spec = importlib.util.spec_from_file_location('luba_schema_sync', MODULE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class SchemaSyncTests(unittest.TestCase):
    def test_699a_actual_baseline_is_ignored_for_migration(self):
        q = '''-- auto
DROP EVENT TRIGGER IF EXISTS "ensure_rls";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE TRUNCATE, REFERENCES ON TABLES FROM "authenticated";
CREATE TABLE "lubanote_server_status" ("id" text NOT NULL, CONSTRAINT "lubanote_server_status_pkey" PRIMARY KEY ("id"));
CREATE OR REPLACE FUNCTION public.lubanote_admin_get_server_status() RETURNS SETOF lubanote_server_status LANGUAGE plpgsql SECURITY DEFINER AS $function$ BEGIN RETURN QUERY SELECT * FROM public.lubanote_server_status; END; $function$;
ALTER TABLE "lubanote_server_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lubanote_server_status" NO FORCE ROW LEVEL SECURITY;
COMMENT ON FUNCTION public.lubanote_auto_demo_on_confirmation_697f() IS 'LubaNote grants Demo';'''
        ignored, eligible, blocked = m.classify(q)
        self.assertEqual(len(ignored), 7)
        self.assertFalse(eligible)
        self.assertFalse(blocked)

    def test_triggers_with_other_names_cannot_be_ignored(self):
        _,_, blocked = m.classify('DROP EVENT TRIGGER other;')
        self.assertTrue(blocked)

    def test_unexpected_drop_privileges_and_dml_blocked(self):
        for q in ('DROP TABLE public.notes;', 'ALTER TABLE public.notes DROP COLUMN x;',
                  'DELETE FROM public.notes;', 'REVOKE ALL ON public.notes FROM authenticated;',
                  'CREATE TABLE notes AS SELECT * FROM public.notes;'):
            with self.subTest(sql=q):
                self.assertTrue(m.classify(q)[2])

    def test_simple_nullable_column_is_candidate(self):
        for typ in ('text', 'timestamptz', 'jsonb', 'numeric(12, 2)', 'uuid', 'character varying(100)', 'boolean'):
            with self.subTest(type=typ):
                ignored, eligible, blocked = m.classify(f'ALTER TABLE "notes" ADD COLUMN "x" {typ};')
                self.assertEqual(len(eligible), 1); self.assertFalse(blocked)

    def test_add_constraint_and_not_null_are_not_columns(self):
        for sql in ('ALTER TABLE "notes" ADD CONSTRAINT "pk" PRIMARY KEY (id);',
                    'ALTER TABLE "notes" ADD COLUMN "x" text NOT NULL;',
                    'ALTER TABLE "notes" ADD COLUMN "x" int DEFAULT 42;',
                    'ALTER TABLE "notes" ADD COLUMN "x" text, DROP COLUMN y;'):
            with self.subTest(sql=sql): self.assertTrue(m.classify(sql)[2])

    def test_new_table_requires_rls(self):
        _,_, blocked = m.classify('CREATE TABLE "foo" (id text);')
        self.assertEqual(blocked[0][0], 'NEW_TABLE_RLS_NOT_ENABLED')

    def test_new_table_rls_pair_candidate(self):
        ignored,eligible,blocked = m.classify('CREATE TABLE "foo" ("id" text);\nALTER TABLE "foo" ENABLE ROW LEVEL SECURITY;')
        self.assertEqual([kind for kind,_ in eligible], ['CREATE_RLS_TABLE','NEW_TABLE_RLS'])
        self.assertFalse(blocked)

    def test_new_table_acl_is_restricted(self):
        rows = [['META','true','postgres'],['ACL','postgres','SELECT:false'],['ACL','service_role','SELECT:false'],['ACL','service_role','UPDATE:false']]
        with patch.object(m, 'table_acl', return_value=rows):
            sql = '\n'.join(m.new_table_acl_sql('lubaserver','foo'))
        self.assertIn('REVOKE ALL PRIVILEGES ON TABLE public."foo" FROM PUBLIC', sql)
        self.assertIn('GRANT SELECT, UPDATE ON TABLE public."foo" TO service_role', sql)
        self.assertNotIn('TO anon;', sql)
        self.assertNotIn('TO authenticated;', sql)

    def test_source_acl_owner_or_grant_option_blocks(self):
        for rows in (
          [['META','true','service_role']],
          [['META','true','postgres'],['ACL','authenticated','SELECT:true']],
          [['META','true','postgres'],['ACL','alien_role','SELECT:false']]):
            with patch.object(m,'table_acl',return_value=rows):
                with self.assertRaises(m.SyncError): m.new_table_acl_sql('lubaserver','foo')

    def test_function_body_semicolon_preserved(self):
        q = """-- comment ;
CREATE OR REPLACE FUNCTION public.fn() RETURNS void LANGUAGE plpgsql AS $body$
BEGIN UPDATE public.notes SET x = 1; RAISE NOTICE 'not; a statement'; END;
$body$;
"""
        self.assertEqual(len(m.split_sql(q)),1)
        self.assertEqual(m.classify(q)[1][0][0], 'REPLACE_INVOKER_FUNCTION_CHECK_ACL')

    def test_security_definer_function_requires_review(self):
        q = 'CREATE OR REPLACE FUNCTION public.fn() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$;'
        self.assertEqual(m.classify(q)[2][0][0], 'SECURITY_DEFINER_REVIEW')

    def test_function_acl_match_only_existing(self):
        q = 'CREATE OR REPLACE FUNCTION public.foo() RETURNS void LANGUAGE sql AS $$SELECT 1$$;'
        with patch.object(m,'catalog_query',side_effect=['|PUBLIC:EXECUTE:false\n','|PUBLIC:EXECUTE:false\n']):
            self.assertTrue(m.existing_function_acl_ok('lubaserver','cloud',q))
        with patch.object(m,'catalog_query',side_effect=['|PUBLIC:EXECUTE:false\n','']):
            self.assertFalse(m.existing_function_acl_ok('lubaserver','cloud',q))

    def test_function_new_overload_is_blocked(self):
        q = 'CREATE OR REPLACE FUNCTION public.foo(integer) RETURNS void LANGUAGE sql AS $$SELECT 1$$;'
        with patch.object(m,'catalog_query',side_effect=['|PUBLIC:EXECUTE:false\n','|PUBLIC:EXECUTE:false\n']):
            self.assertFalse(m.existing_function_acl_ok('lubaserver','cloud',q))
        self.assertEqual(m.function_identity_args_from_ddl(q),'integer')

    def test_new_table_policy_and_trigger_only_on_new_table(self):
        q = ('CREATE TABLE "foo" ("id" text);\nALTER TABLE "foo" ENABLE ROW LEVEL SECURITY;\n'
             'CREATE POLICY "p" ON "foo" FOR SELECT TO authenticated USING (true);\n'
             'CREATE TRIGGER "tg" BEFORE INSERT ON "foo" FOR EACH ROW EXECUTE FUNCTION public.tg();')
        self.assertEqual(len(m.classify(q)[1]),4)
        self.assertFalse(m.classify(q)[2])
        self.assertTrue(m.classify('CREATE POLICY p ON public.notes USING (true);')[2])

    def test_unterminated_sql_fails_closed(self):
        for q in ("SELECT 'abc;", 'SELECT 1', '/* nested', 'DO $$ BEGIN SELECT 1;'):
            with self.subTest(sql=q):
                with self.assertRaises(m.SyncError): m.split_sql(q)

    def test_comment_sql_is_not_executed(self):
        self.assertEqual(m.split_sql('-- DROP TABLE notes;\n/* DROP TABLE foo; */'), [])

    def test_config_secret_only_0600(self):
        a={'DEST_DB_USER':'postgres','PG_PASS':'a:#!$\'"','PG_HOST':'127.0.0.1','PG_PORT':'5432'}
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'dbdiff.yml'
            m.write_dbdiff_config(p,a,a)
            self.assertEqual(p.stat().st_mode & 0o777,0o600)
            self.assertIn('password: '+m.yval(a['PG_PASS']),p.read_text())

    def test_dbdiff_identical_output_creates_empty_plan(self):
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d)
            db = {'DEST_DB_NAME':'postgres','DEST_DB_USER':'postgres',
                  'PG_HOST':'127.0.0.1','PG_PORT':'5432','PG_PASS':'test'}
            with patch.object(m, 'run', return_value='Databases are identical — no migration needed.\n'):
                result = m.plan(db, db, directory)
            self.assertEqual(result.read_text(), '')
            self.assertEqual(result.stat().st_mode & 0o777, 0o600)
            self.assertEqual(m.classify(result.read_text()), ([],[],[]))

    def test_dbdiff_no_file_without_explicit_success_fails(self):
        with tempfile.TemporaryDirectory() as d:
            db = {'DEST_DB_NAME':'postgres','DEST_DB_USER':'postgres',
                  'PG_HOST':'127.0.0.1','PG_PORT':'5432','PG_PASS':'test'}
            with patch.object(m, 'run', return_value='Completed\n'):
                with self.assertRaisesRegex(m.SyncError, 'did not confirm identical'):
                    m.plan(db, db, Path(d))

    def test_dbdiff_error_never_becomes_empty_success(self):
        with tempfile.TemporaryDirectory() as d:
            db = {'DEST_DB_NAME':'postgres','DEST_DB_USER':'postgres',
                  'PG_HOST':'127.0.0.1','PG_PORT':'5432','PG_PASS':'test'}
            with patch.object(m, 'run', side_effect=m.SyncError('nonzero')):
                with self.assertRaisesRegex(m.SyncError, 'Schema comparison failed'):
                    m.plan(db, db, Path(d))

    def test_dbdiff_generated_plan_is_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d)
            db = {'DEST_DB_NAME':'postgres','DEST_DB_USER':'postgres',
                  'PG_HOST':'127.0.0.1','PG_PORT':'5432','PG_PASS':'test'}
            sql = 'ALTER TABLE "notes" ADD COLUMN "x" text;\n'
            def fake_run(argv, **_):
                Path(next(a.split('=',1)[1] for a in argv if a.startswith('--output='))).write_text(sql)
                return 'Written: plan.sql\n'
            with patch.object(m, 'run', side_effect=fake_run):
                result = m.plan(db, db, directory)
            self.assertEqual(result.read_text(), sql)

    def test_backend_registry_disallows_duplicates(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'backends.conf'; old=m.REGISTRY
            try:
                m.REGISTRY=p
                p.write_text('lubaserver\ncloud\n# vps\n')
                self.assertEqual(m.registered_backends(),['lubaserver','cloud'])
                p.write_text('lubaserver\nlubaserver\n')
                with self.assertRaises(m.SyncError): m.registered_backends()
            finally: m.REGISTRY=old

if __name__=='__main__': unittest.main()
