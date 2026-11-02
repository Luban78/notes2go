import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'schema-sync.py'
spec = importlib.util.spec_from_file_location('luba_schema_sync', MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SchemaSyncTests(unittest.TestCase):
    def test_additive_function_body_not_dml(self):
        q = "CREATE OR REPLACE FUNCTION public.foo() RETURNS void LANGUAGE plpgsql AS $function$ BEGIN UPDATE public.a SET b=1; END $function$;"
        self.assertEqual(module.hazards(q), [])

    def test_destructive_blocked(self):
        for q in ('DROP TABLE public.notes;', 'ALTER TABLE public.notes DROP COLUMN name;', 'DELETE FROM public.notes;', 'REVOKE ALL ON public.notes FROM authenticated;'):
            with self.subTest(q=q):
                self.assertTrue(module.hazards(q))

    def test_security_definer_review(self):
        q = 'CREATE FUNCTION public.g() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$;'
        self.assertIn('SECURITY_DEFINER_REVIEW', module.hazards(q))

    def test_yaml_secrets_quoted_and_permissions(self):
        a = {'DEST_DB_USER': 'postgres', 'PG_PASS': 'a:#!$\'"', 'PG_HOST': '127.0.0.1', 'PG_PORT': '5432'}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'config.yml'
            module.write_dbdiff_config(p, a, a)
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)
            self.assertIn("password: " + module.yval(a["PG_PASS"]), p.read_text())

    def test_sql_only_comments_empty(self):
        self.assertEqual(module.sql_without_comments('-- migration: no changes\n'), '')

    def test_backend_registry(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'backends.conf'
            old = module.REGISTRY
            try:
                module.REGISTRY = p
                p.write_text('lubaserver\ncloud\n# vps\n')
                self.assertEqual(module.registered_backends(), ['lubaserver', 'cloud'])
                p.write_text('lubaserver\nlubaserver\n')
                with self.assertRaises(module.SyncError): module.registered_backends()
            finally:
                module.REGISTRY = old

if __name__ == '__main__':
    unittest.main()
