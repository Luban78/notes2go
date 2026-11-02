#!/usr/bin/env python3
"""Isolated integration smoke test for live DBDiff + 699B classifier + SQL builder.

Requires Docker and `dbdiff` on a Linux host. NEVER reads LubaNote backend
profiles, connects to production, or changes a production database.
"""
import importlib.util
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time

IMAGE = 'postgres:17-alpine'
MODULE = Path(__file__).resolve().parents[1] / 'schema-sync.py'
CONTAINER = 'ln-schema-smoke-' + secrets.token_hex(5)
PASSWORD = secrets.token_urlsafe(24)
CREATED = False


def cmd(args, *, stdin=None, timeout=80):
    p = subprocess.run(args, input=stdin, text=True, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f'{args[0]} failed with code {p.returncode}')
    return p.stdout.strip()


def sql(database, statement, *, emit=False):
    args = ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', database,
            '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '|']
    if emit:
        return cmd(args + ['-c', statement])
    return cmd(args, stdin=statement)


def wait_ready():
    for _ in range(40):
        test = subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-q'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if test.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Docker test PostgreSQL did not become ready')


def make_test_cluster():
    global CREATED
    cmd(['docker', 'run', '-d', '--rm', '--name', CONTAINER,
         '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=' + PASSWORD, IMAGE], timeout=120)
    CREATED = True
    wait_ready()
    sql('postgres', '''
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
''')
    sql('postgres', 'CREATE DATABASE ln_smoke_source;')
    sql('postgres', 'CREATE DATABASE ln_smoke_target;')
    sql('ln_smoke_source', '''
CREATE TABLE public.ln699b_existing (id text PRIMARY KEY, added_field text);
ALTER TABLE public.ln699b_existing ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.ln699b_new_table (id text PRIMARY KEY, payload text);
ALTER TABLE public.ln699b_new_table ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ln699b_new_table FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ln699b_new_table TO service_role;
''')
    sql('ln_smoke_target', '''
CREATE TABLE public.ln699b_existing (id text PRIMARY KEY);
ALTER TABLE public.ln699b_existing ENABLE ROW LEVEL SECURITY;
''')
    portline = cmd(['docker', 'port', CONTAINER, '5432/tcp'])
    match = re.search(r'127\.0\.0\.1:(\d+)\b', portline)
    if not match:
        raise RuntimeError('Test container did not bind to a loopback port')
    return match.group(1)


def run_smoke():
    if not shutil.which('docker') or not shutil.which('dbdiff'):
        raise RuntimeError('Requires docker and dbdiff in PATH')
    if not MODULE.is_file():
        raise RuntimeError('schema-sync.py missing alongside this test')
    spec = importlib.util.spec_from_file_location('ln699b', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    print('TEST_SCOPE=TEMP_POSTGRESQL_17_ONLY', flush=True)
    print('PRODUCTION_CONNECTIONS=NONE', flush=True)
    port = make_test_cluster()
    with tempfile.TemporaryDirectory(prefix='ln699b-smoke-') as folder:
        root = Path(folder)
        src = {'DEST_DB_USER':'postgres', 'PG_PASS':PASSWORD, 'PG_HOST':'127.0.0.1',
               'PG_PORT':port, 'DEST_DB_NAME':'ln_smoke_source'}
        dst = dict(src, DEST_DB_NAME='ln_smoke_target')

        def test_catalog_query(backend, query):
            db = {'source':'ln_smoke_source', 'target':'ln_smoke_target'}[backend]
            return sql(db, query, emit=True) + '\n'

        module.catalog_query = test_catalog_query
        before_dir = root / 'before'
        before_dir.mkdir()
        planned = module.plan(src, dst, before_dir)
        text = planned.read_text(encoding='utf-8')
        ignored, eligible, blocked = module.classify(text)
        print(f'INITIAL_DIFF_IGNORED={len(ignored)} ELIGIBLE={len(eligible)} BLOCKED={len(blocked)}', flush=True)
        if blocked:
            print('BLOCKED_TYPES=' + ','.join(sorted({x[0] for x in blocked})), flush=True)
            raise RuntimeError('699B cannot deploy this basic fixture yet')
        kinds = {x[0] for x in eligible}
        expected = {'CREATE_RLS_TABLE', 'ADD_NULLABLE_COLUMN', 'NEW_TABLE_RLS'}
        if not expected.issubset(kinds):
            print('ELIGIBLE_TYPES=' + ','.join(sorted(kinds)), flush=True)
            raise RuntimeError('Basic table/column/RLS diff not classified as expected')

        deploy_sql = module.build_deploy_sql('source', 'target', eligible)
        if not deploy_sql.strip():
            raise RuntimeError('No deploy SQL produced')
        sql('ln_smoke_target', 'BEGIN;\n' + deploy_sql + '\nCOMMIT;\n')
        print('ISOLATED_APPLY=PASS', flush=True)

        check = sql('ln_smoke_target', '''
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ln699b_existing' AND column_name='added_field')
    AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='ln699b_new_table' AND c.relrowsecurity
    ) THEN 'PASS' ELSE 'FAIL' END;
''', emit=True)
        if check != 'PASS':
            raise RuntimeError('New table RLS or new column missing after apply')

        after_dir = root / 'after'
        after_dir.mkdir()
        verified = module.plan(src, dst, after_dir)
        remaining_i, remaining_e, remaining_b = module.classify(verified.read_text(encoding='utf-8'))
        print(f'AFTER_DIFF_IGNORED={len(remaining_i)} ELIGIBLE={len(remaining_e)} BLOCKED={len(remaining_b)}', flush=True)
        if remaining_e or remaining_b:
            print('REMAINING_TYPES=' + ','.join(sorted({x[0] for x in remaining_e + remaining_b})), flush=True)
            raise RuntimeError('Difference remained after applying into test PostgreSQL')
        print('SCHEMA_SYNC_ISOLATED_TEST=PASS', flush=True)
        print('PRODUCTION_WRITES=NONE', flush=True)


def main():
    try:
        run_smoke()
    except (Exception, KeyboardInterrupt) as e:
        print('SCHEMA_SYNC_ISOLATED_TEST=FAIL', flush=True)
        print('REASON=' + str(e), flush=True)
        return 1
    finally:
        if CREATED:
            subprocess.run(['docker', 'rm', '-f', CONTAINER],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
        print('ISOLATED_CONTAINER_REMOVED=' + ('YES' if CREATED else 'NOT_CREATED'), flush=True)
    return 0

if __name__ == '__main__':
    sys.exit(main())
