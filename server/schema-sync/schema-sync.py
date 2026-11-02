#!/usr/bin/env python3
"""LubaNote 699C: migration-compatible schema sync from live LubaServer.

This is a controlled wrapper for DBDiff; all runtime credentials stay in 0600 temp files.
The code intentionally fails closed for DDL that cannot be reviewed safely.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent
HOME = Path.home()
BASE = Path(os.environ.get("LUBANOTE_MIGRATION_BASE", str(HOME / "luba-server/migration-manager")))
CONTROL = Path(os.environ.get("SOURCE_CONTROL_STATE_FILE", str(HOME / "luba-server/migration-bridge/control-state.json")))
REGISTRY = ROOT / "backends.conf"
APPROVAL = HOME / ".config/lubanote/schema-sync-auto-apply.enabled"
LOG_DIR = HOME / ".local/state/lubanote-schema-sync"

class SyncError(Exception):
    pass

def run(argv, *, env=None, input_text=None, capture=True, timeout=90):
    p = subprocess.run(argv, env=env, input=input_text, text=True,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.PIPE if capture else None,
                       timeout=timeout, check=False)
    if p.returncode:
        # Avoid printing stderr from database clients because it may contain connection info.
        raise SyncError(f"Command failed ({argv[0]} exit={p.returncode}); check local server logs")
    return p.stdout or ""

def system_status():
    if not CONTROL.is_file():
        raise SyncError(f"Missing Control Point: {CONTROL}")
    c = json.loads(CONTROL.read_text(encoding="utf-8"))
    state_path = BASE / "state/state"
    state = state_path.read_text().strip() if state_path.exists() else "UNKNOWN"
    if c.get("mode") != "NORMAL" or c.get("cutover_enabled") is not False or state != "IDLE":
        raise SyncError(f"Migration Manager not IDLE/NORMAL (state={state})")
    return c

def registered_backends():
    ids = []
    for line in REGISTRY.read_text(encoding="utf-8").splitlines():
        ident = line.split("#", 1)[0].strip()
        if ident:
            if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", ident) or ident in ids:
                raise SyncError(f"Invalid or duplicate backend ID: {ident}")
            ids.append(ident)
    if len(ids) < 2:
        raise SyncError("At least source and destination backend must be registered")
    return ids

# Uses existing Migration Manager profiles/adapter. Its secret values are captured only
# by this Python process; neither terminal nor report nor Git receives them.
PROFILE_SCRIPT = r'''set -Eeuo pipefail
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
profile="$BASE/config/backend-profiles/$1.destination.env"
[[ -f "$profile" && "$(stat -c %a "$profile")" == 600 ]] || exit 71
source "$BASE/bin/destination-lib"
DEST_CFG="$profile"
dest_load
[[ "$DEST_BACKEND_ID" == "$1" ]] || exit 72
if [[ "$DEST_MODE" == remote ]]; then
  PG_HOST="$DEST_DB_HOST" PG_PORT="$DEST_DB_PORT" PG_PASS="$DEST_DB_PASSWORD" PG_SSL="${DEST_DB_SSLMODE:-require}"
elif [[ "$DEST_MODE" == docker ]]; then
  PG_HOST="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$DEST_DOCKER_CONTAINER" | sed '/^$/d' | head -n1)"
  PG_PORT=5432
  PG_PASS="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$DEST_DOCKER_CONTAINER" | sed -n 's/^POSTGRES_PASSWORD=//p' | head -n1)"
  PG_SSL=disable
elif [[ "$DEST_MODE" == ssh ]]; then
  # SSH mode is supported through a local port forwarding tunnel (created by Python).
  PG_HOST="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -p "${DEST_SSH_PORT:-22}" "$DEST_SSH_USER@$DEST_SSH_HOST" docker inspect -f '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$DEST_DOCKER_CONTAINER" | sed '/^$/d' | head -n1)"
  PG_PORT=5432
  PG_PASS="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -p "${DEST_SSH_PORT:-22}" "$DEST_SSH_USER@$DEST_SSH_HOST" docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$DEST_DOCKER_CONTAINER" | sed -n 's/^POSTGRES_PASSWORD=//p' | head -n1)"
  PG_SSL=disable
else exit 73; fi
export PG_HOST PG_PORT PG_PASS PG_SSL
python3 -c 'import json,os; print(json.dumps({k:os.environ.get(k, "") for k in ("DEST_MODE", "DEST_BACKEND_ID", "DEST_DB_NAME", "DEST_DB_USER", "DEST_SSH_HOST", "DEST_SSH_PORT", "DEST_SSH_USER", "PG_HOST", "PG_PORT", "PG_PASS", "PG_SSL")}))'
'''

def profile(ident):
    raw = run(["bash", "-c", PROFILE_SCRIPT, "_", ident])
    obj = json.loads(raw)
    for field in ("PG_HOST", "PG_PORT", "PG_PASS", "DEST_DB_NAME", "DEST_DB_USER"):
        if not obj.get(field):
            raise SyncError(f"{ident}: missing database connection property {field}")
    return obj

FREEZE_SCRIPT = r'''set -Eeuo pipefail
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
source "$BASE/bin/destination-lib"
DEST_CFG="$BASE/config/backend-profiles/$1.destination.env"
dest_load
[[ "${DEST_BACKEND_ID:-}" == "$1" ]] || exit 8
dest_psql -q -At -c "SELECT CASE WHEN frozen THEN 'FROZEN' ELSE 'UNFROZEN' END FROM lubanote_migration_internal.write_freeze_state WHERE singleton=true;"
'''

def freeze(ident):
    return run(["bash", "-c", FREEZE_SCRIPT, "_", ident]).strip()

class SshTunnel:
    def __init__(self, obj):
        self.obj = obj
        self.process = None
    def __enter__(self):
        if self.obj["DEST_MODE"] != "ssh":
            return self.obj
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        host = self.obj["DEST_SSH_HOST"]
        user = self.obj["DEST_SSH_USER"]
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+", host) or not re.fullmatch(r"[a-zA-Z0-9_.-]+", user):
            raise SyncError("Invalid SSH host/user")
        ssh_port = self.obj.get("DEST_SSH_PORT") or "22"
        self.process = subprocess.Popen([
            "ssh", "-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
            "-o", "ConnectTimeout=10", "-p", ssh_port,
            "-L", f"127.0.0.1:{port}:{self.obj['PG_HOST']}:{self.obj['PG_PORT']}",
            f"{user}@{host}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        if self.process.poll() is not None:
            raise SyncError("SSH database tunnel failed")
        self.obj = dict(self.obj, PG_HOST="127.0.0.1", PG_PORT=str(port))
        return self.obj
    def __exit__(self, *exc):
        if self.process:
            self.process.terminate()
            try: self.process.wait(timeout=4)
            except subprocess.TimeoutExpired: self.process.kill()

def yval(text):
    # JSON string syntax is valid YAML and safely handles special characters.
    return json.dumps(str(text), ensure_ascii=True)

def write_dbdiff_config(path, src, dst):
    lines = ["driver: pgsql", "type: schema", "allowDestructive: false"]
    for section, obj in (("server1", src), ("server2", dst)):
        lines.append(f"{section}:")
        for yaml_name, key in (("user", "DEST_DB_USER"), ("password", "PG_PASS"),
                               ("host", "PG_HOST"), ("port", "PG_PORT")):
            lines.append(f"  {yaml_name}: {yval(obj[key])}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)

# Explicit exclusions: these objects are node-specific, or are owned by the
# hosting Supabase environment. Do not broaden to generic DROP/GRANT matching.
# Every excluded statement is recorded in the human-readable report.
LOCAL_TABLES = {"lubanote_server_status"}
LOCAL_FUNCTIONS = {"lubanote_admin_get_server_status"}
SYSTEM_EVENT_TRIGGERS = {"ensure_rls"}

TABLE_IDENT = r'(?:public\.)?"?([a-z][a-z0-9_]*)"?'


def split_sql(sql):
    """Split PostgreSQL DDL without confusing plpgsql bodies with SQL DDL.

    Comments are removed; quotes and nested /* */ blocks are respected.
    Refuse unterminated literals/comments, so the result never silently drops DDL.
    """
    statements, buf = [], []
    i, n = 0, len(sql)
    state, tag, depth = 'normal', '', 0
    while i < n:
        c, nxt = sql[i], sql[i:i+2]
        if state == 'linecomment':
            if c == '\n':
                state = 'normal'; buf.append('\n')
            i += 1; continue
        if state == 'blockcomment':
            if nxt == '/*': depth += 1; i += 2; continue
            if nxt == '*/':
                depth -= 1; i += 2
                if depth == 0: state = 'normal'; buf.append(' ')
                continue
            i += 1; continue
        if state == 'single':
            buf.append(c)
            if c == "'":
                if i + 1 < n and sql[i+1] == "'":
                    buf.append("'"); i += 2; continue
                state = 'normal'
            i += 1; continue
        if state == 'double':
            buf.append(c)
            if c == '"':
                if i + 1 < n and sql[i+1] == '"':
                    buf.append('"'); i += 2; continue
                state = 'normal'
            i += 1; continue
        if state == 'dollar':
            if sql.startswith(tag, i):
                buf.append(tag); i += len(tag); state = 'normal'
            else:
                buf.append(c); i += 1
            continue
        if nxt == '--':
            state = 'linecomment'; i += 2; continue
        if nxt == '/*':
            state = 'blockcomment'; depth = 1; i += 2; continue
        if c == "'": state = 'single'; buf.append(c); i += 1; continue
        if c == '"': state = 'double'; buf.append(c); i += 1; continue
        if c == '$':
            m = re.match(r'\$[a-zA-Z_][a-zA-Z_0-9]*\$|\$\$', sql[i:])
            if m:
                tag = m.group(0); buf.append(tag); i += len(tag); state = 'dollar'; continue
        if c == ';':
            statement = ''.join(buf).strip()
            if statement: statements.append(statement + ';')
            buf = []; i += 1; continue
        buf.append(c); i += 1
    if state not in ('normal','linecomment'):
        raise SyncError('Unterminated SQL quote/comment; refusing partial plan')
    if ''.join(buf).strip():
        raise SyncError('SQL statement without final semicolon; refusing partial plan')
    return statements


def sql_without_comments(sql):
    return '\n'.join(split_sql(sql))


def short_kind(stmt):
    return ' '.join(stmt.split()[:4])[:110]


def relation(stmt, verb):
    m = re.match(r'(?is)^' + verb + r'\s+(?:ONLY\s+)?' + TABLE_IDENT + r'(?=\s|\(|;)', stmt)
    return m.group(1) if m else None


def classify(sql):
    """Return (ignored, eligible, blocked) as (reason, statement) pairs.

    Recognition uses a strict allowlist, not a blacklist of SQL keywords.
    Unexpected DDL cannot ever be applied through this path.
    """
    ignored, eligible, blocked = [], [], []
    statements = split_sql(sql)
    new_tables = set()
    for stmt in statements:
        name = relation(stmt, 'CREATE TABLE')
        if name: new_tables.add(name)
    rls_tables = set()
    for stmt in statements:
        m = re.match(r'(?is)^ALTER\s+TABLE\s+(?:ONLY\s+)?'+TABLE_IDENT+r'\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;', stmt)
        if m: rls_tables.add(m.group(1))
    for stmt in statements:
        normal = ' '.join(stmt.split())
        table_create = relation(stmt, 'CREATE TABLE')
        table_alter = relation(stmt, 'ALTER TABLE')
        if re.fullmatch(r'(?is)DROP\s+EVENT\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?ensure_rls"?\s*;', normal):
            ignored.append(('HOST_EVENT_TRIGGER', stmt)); continue
        if re.match(r'(?is)^ALTER\s+DEFAULT\s+PRIVILEGES\s+', stmt):
            # Supabase-hosted defaults must not overwrite the self-hosted setup.
            ignored.append(('HOST_DEFAULT_PRIVILEGES', stmt)); continue
        if table_create in LOCAL_TABLES or table_alter in LOCAL_TABLES:
            ignored.append(('LOCAL_SERVER_TABLE', stmt)); continue
        if re.match(r'(?is)^COMMENT\s+ON\s+', stmt):
            ignored.append(('NON_MIGRATION_COMMENT', stmt)); continue
        func_match = re.match(r'(?is)^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z][a-z0-9_]*)"?\s*\(', stmt)
        if func_match and func_match.group(1) in LOCAL_FUNCTIONS:
            ignored.append(('LOCAL_SERVER_FUNCTION', stmt)); continue
        if table_create:
            if not re.match(r'(?is)^CREATE\s+TABLE\s+'+TABLE_IDENT+r'\s*\(', stmt) or not stmt.rstrip().endswith(');'):
                blocked.append(('NEW_TABLE_SYNTAX_REVIEW', stmt)); continue
            if table_create not in rls_tables:
                blocked.append(('NEW_TABLE_RLS_NOT_ENABLED', stmt)); continue
            if re.search(r'(?is)\b(UNLOGGED|INHERITS|PARTITION\s+BY|LIKE\s+|REFERENCES|FOREIGN\s+TABLE)\b', stmt):
                blocked.append(('NEW_TABLE_COMPLEX_STRUCTURE', stmt)); continue
            eligible.append(('CREATE_RLS_TABLE', stmt)); continue
        if table_alter and table_alter in new_tables:
            if re.fullmatch(r'(?is)ALTER\s+TABLE\s+(?:ONLY\s+)?'+TABLE_IDENT+r'\s+(?:ENABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY)\s*;', stmt):
                eligible.append(('NEW_TABLE_RLS', stmt)); continue
        if table_alter:
            m = re.fullmatch(r'(?is)ALTER\s+TABLE\s+(?:ONLY\s+)?'+TABLE_IDENT+r'\s+ADD\s+(?:COLUMN\s+)?"?([a-z][a-z0-9_]*)"?\s+(.+);', stmt, re.S)
            if m and table_alter not in LOCAL_TABLES:
                col_name, decl = m.group(2), m.group(3).strip()
                # A fixed set of simple built-in nullable types. In particular,
                # ADD CONSTRAINT must never pass as ADD <column> <type>.
                native_type = r'(?:text|int|integer|int2|int4|int8|bigint|smallint|uuid|boolean|bool|jsonb?|bytea|date|timestamptz|timestamp(?:\s+with(?:out)?\s+time\s+zone)?|numeric|decimal|varchar|character\s+varying|double\s+precision|real)'
                if col_name.lower() not in ('constraint','primary','unique','check','foreign','column') and re.fullmatch(r'(?is)' + native_type + r'(?:\s*\([0-9]+(?:\s*,\s*[0-9]+)?\))?(?:\[\])?', decl):
                    eligible.append(('ADD_NULLABLE_COLUMN', stmt)); continue
            blocked.append(('ALTER_TABLE_REVIEW', stmt)); continue
        if func_match:
            if re.search(r'(?is)\bSECURITY\s+DEFINER\b', stmt):
                blocked.append(('SECURITY_DEFINER_REVIEW', stmt)); continue
            if not re.match(r'(?is)^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.', stmt):
                blocked.append(('FUNCTION_SIGNATURE_REVIEW', stmt)); continue
            # Existing routine only; a newly-created routine has a default PUBLIC
            # execute grant that may diverge from the source ACL.
            eligible.append(('REPLACE_INVOKER_FUNCTION_CHECK_ACL', stmt)); continue
        if re.match(r'(?is)^CREATE\s+POLICY\s+', stmt):
            m = re.search(r'(?is)\bON\s+'+TABLE_IDENT+r'(?=\s|;)', stmt)
            if m and m.group(1) in new_tables:
                eligible.append(('NEW_TABLE_POLICY', stmt)); continue
        if re.match(r'(?is)^CREATE\s+TRIGGER\s+', stmt):
            m = re.search(r'(?is)\bON\s+'+TABLE_IDENT+r'(?=\s|;)', stmt)
            if m and m.group(1) in new_tables:
                eligible.append(('NEW_TABLE_TRIGGER', stmt)); continue
        blocked.append(('UNSUPPORTED_DDL', stmt))
    return ignored, eligible, blocked


# This checker intentionally is stricter than the syntax-only classifer above:
# table ownership/ACL and routine ACL must also be verified against live data.
READ_CATALOG_SCRIPT = r'''set -Eeuo pipefail
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
source "$BASE/bin/destination-lib"
DEST_CFG="$BASE/config/backend-profiles/$1.destination.env"
dest_load
[[ "$DEST_BACKEND_ID" == "$1" ]] || exit 89
dest_psql -q -At -F '|' -c "$2"
'''


def catalog_query(backend, sql):
    return run(['bash', '-c', READ_CATALOG_SCRIPT, '_', backend, sql], timeout=120)


def table_acl(backend, table):
    assert re.fullmatch('[a-z][a-z0-9_]*', table)
    sql = f'''SELECT 'META', c.relrowsecurity::text, pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='{table}' AND c.relkind IN ('r','p')
UNION ALL
SELECT 'ACL', COALESCE(r.rolname, 'PUBLIC'), a.privilege_type || ':' || a.is_grantable::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
LEFT JOIN pg_roles r ON r.oid=a.grantee
WHERE n.nspname='public' AND c.relname='{table}' AND c.relkind IN ('r','p');'''
    rows = [line.split('|') for line in catalog_query(backend, sql).splitlines() if line]
    rows.sort(key=lambda row: 0 if row[0] == 'META' else 1)
    if not rows or rows[0][0] != 'META':
        raise SyncError(f'{backend}: source table catalog missing for {table}')
    return rows


def new_table_acl_sql(src_backend, table):
    rows = table_acl(src_backend, table)
    if rows[0][1:] not in (['true','postgres'], ['t','postgres']):
        raise SyncError(f'{table}: expected RLS enabled and owner postgres on source')
    grants = {}
    allowed = {'PUBLIC', 'anon', 'authenticated', 'service_role', 'postgres'}
    permissions = {'INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'}
    for row in rows[1:]:
        if len(row) != 3 or row[0] != 'ACL':
            raise SyncError(f'{table}: unexpected table ACL row')
        role, sep, privilege = row[2].partition(':')
        grantee = row[1]
        if grantee not in allowed or not sep or role not in permissions or privilege != 'false':
            raise SyncError(f'{table}: unexpected ACL or grant option; manual review required')
        if grantee != 'postgres':
            grants.setdefault(grantee, set()).add(role)
    ref = 'public."' + table + '"'
    # Newly created table only. Revoke broad Supabase default grants first.
    parts = [f'REVOKE ALL PRIVILEGES ON TABLE {ref} FROM PUBLIC, anon, authenticated, service_role;']
    for who in ('PUBLIC', 'anon', 'authenticated', 'service_role'):
        if who in grants:
            parts.append(f"GRANT {', '.join(sorted(grants[who]))} ON TABLE {ref} TO {who};")
    return parts


def function_identity_args_from_ddl(stmt):
    # The planned argument list must match an existing routine, not a new
    # overload with the same name. Conservative: disallow quoted/default args.
    m = re.match(r'(?is)^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\."?[a-z][a-z0-9_]*"?\s*\(', stmt)
    if not m:
        return None
    start = m.end()
    depth = 1
    i = start
    while i < len(stmt):
        c = stmt[i]
        if c in ('\'', '"', '$'):
            # complex signature: require manual review
            return None
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return stmt[start:i]
        i += 1
    return None


def normalize_signature(args):
    return re.sub(r'\s+', ' ', args.strip()).lower()


def existing_function_acl_ok(src_backend, dst_backend, stmt):
    # Deliberately restrict auto replacements to one unoverloaded routine with
    # identical signature and exact ACL on both backends.
    m = re.match(r'(?is)^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\."?([a-z][a-z0-9_]*)"?\s*\(', stmt)
    if not m: return False
    name = m.group(1)
    sql = f'''SELECT pg_get_function_identity_arguments(p.oid) || '|' ||
  COALESCE((SELECT string_agg(COALESCE(r.rolname, 'PUBLIC') || ':' || a.privilege_type || ':' || a.is_grantable::text, ',' ORDER BY a.grantee, a.privilege_type)
  FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid=a.grantee), '')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='{name}';'''
    source = catalog_query(src_backend, sql).splitlines()
    dest = catalog_query(dst_backend, sql).splitlines()
    desired_args = function_identity_args_from_ddl(stmt)
    if desired_args is None or len(source) != 1 or len(dest) != 1 or source != dest:
        return False
    return normalize_signature(desired_args) == normalize_signature(source[0].split('|', 1)[0])


def build_deploy_sql(source_backend, dest_backend, eligible):
    statements = []
    for kind, stmt in eligible:
        if kind == 'CREATE_RLS_TABLE':
            table = relation(stmt, 'CREATE TABLE')
        if kind == 'REPLACE_INVOKER_FUNCTION_CHECK_ACL':
            if not existing_function_acl_ok(source_backend, dest_backend, stmt):
                raise SyncError('Routine missing/overloaded or ACL differs; manual review required')
    for kind, stmt in eligible:
        statements.append(stmt)
        if kind == 'CREATE_RLS_TABLE':
            # ACL is installed in the same transaction as the table and RLS;
            # no period of unwanted PUBLIC/anon access is exposed to other sessions.
            statements.extend(new_table_acl_sql(source_backend, relation(stmt, 'CREATE TABLE')))
    return '\n'.join(statements) + ('\n' if statements else '')


def write_report(path, ignored, eligible, blocked):
    record = {
        'ignored': [{'reason': k, 'statement_type': short_kind(v)} for k,v in ignored],
        'eligible': [{'reason': k, 'statement_type': short_kind(v)} for k,v in eligible],
        'blocked': [{'reason': k, 'statement_type': short_kind(v)} for k,v in blocked],
        'note': 'DDL only; no data or Auth/Storage migration; read-only check.',
    }
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    path.chmod(0o600)


def plan(source, target, directory):
    """DBDiff compares source server1 to target server2; generate UP migration for target.
    Its actual direction is verified before first apply by comparing catalog snapshots.
    """
    config = directory / "dbdiff.yml"
    output = directory / "plan.sql"
    write_dbdiff_config(config, source, target)
    argv = ["dbdiff", "diff", "--driver=pgsql", "--type=schema", "--schemas=public",
            "--include=up", "--renames=off", "--config=" + str(config),
            "--output=" + str(output),
            f"server1.{source['DEST_DB_NAME']}:server2.{target['DEST_DB_NAME']}"]
    # DBDiff 3.0.0-rc.29 does not create an output file when schemas are
    # identical. It returns 0 and explicitly prints this message instead:
    #   Databases are identical — no migration needed.
    # Only this exact success signal authorizes an empty plan. An absent or
    # empty file for any other reason is a hard failure (never false PASS).
    if output.exists():
        raise SyncError("Refusing to overwrite a pre-existing SQL plan")
    try:
        result = run(argv, timeout=300)
    except SyncError:
        raise SyncError("Schema comparison failed; check that DBDiff is installed and two DBs are accessible")
    if not output.is_file():
        clean_output = re.sub(r"\x1b\[[0-9;]*m", "", result)
        identical = re.search(
            r"(?m)^\s*Databases are identical\s+[\u2014-]\s+no migration needed\.\s*$",
            clean_output,
        )
        if not identical:
            raise SyncError("DBDiff produced no SQL file and did not confirm identical databases")
        output.write_text("", encoding="utf-8")
        output.chmod(0o600)
    elif output.stat().st_size == 0:
        raise SyncError("DBDiff produced an empty SQL file without identical-database confirmation")
    return output

APPLY_SCRIPT = r'''set -Eeuo pipefail
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
source "$BASE/bin/destination-lib"
DEST_CFG="$BASE/config/backend-profiles/$1.destination.env"
dest_load
[[ "$DEST_BACKEND_ID" == "$1" ]] || exit 10
# The SQL is executed in a transaction for this backend only, not for all servers.
# No schema-only restore; no data migration; no alteration of auth/storage schemas.
{ printf 'BEGIN;\nSET LOCAL lock_timeout=\0473s\047;\nSET LOCAL statement_timeout=\04790s\047;\nSET LOCAL search_path=public,pg_temp;\n'; cat "$2"; printf '\nCOMMIT;\n'; } | dest_psql -q -v ON_ERROR_STOP=1 >/dev/null
'''

def apply(ident, sql_file):
    run(["bash", "-c", APPLY_SCRIPT, "_", ident, str(sql_file)], timeout=180)

def main():
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] not in ('--check', '--apply')):
        raise SyncError('Use: schema-sync.py --check|--apply')
    mode = sys.argv[1] if len(sys.argv) == 2 else '--check'
    if not shutil.which('dbdiff'):
        raise SyncError('DBDiff not installed: cannot compare live DB schemas')
    control = system_status()
    ids = registered_backends()
    source_id = 'lubaserver'
    if control.get('active_backend') != source_id:
        raise SyncError('Active backend is not LubaServer')
    if source_id not in ids:
        raise SyncError('LubaServer missing from backend registry')
    if mode == '--apply' and (not APPROVAL.is_file() or APPROVAL.read_text().strip() != 'APPROVED_AFTER_REAL_TEST=YES'):
        raise SyncError('Live apply is locked until isolated/live read-only verification and explicit approval')
    dest_ids = [i for i in ids if i != source_id]
    states = {i: freeze(i) for i in ids}
    if states[source_id] != 'UNFROZEN' or any(states[i] != 'FROZEN' for i in dest_ids):
        raise SyncError('Source must be UNFROZEN; all destinations must be FROZEN')
    print('=== LUBANOTE SCHEMA SYNC 699B ===', flush=True)
    print(f'MODE={mode} SOURCE={source_id} DESTINATIONS={" ".join(dest_ids)}', flush=True)
    print('SCOPE=migration_compatible_public DATA_SYNC=NO', flush=True)
    print('BACKEND_STATES=' + ' '.join(f'{x}:{states[x]}' for x in ids), flush=True)
    profiles = {i: profile(i) for i in ids}
    LOG_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    LOG_DIR.chmod(0o700)
    run_folder = Path(tempfile.mkdtemp(prefix=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-'), dir=LOG_DIR))
    plans = []
    # Never write to one destination until every destination has passed checking.
    with SshTunnel(profiles[source_id]) as src:
        for ident in dest_ids:
            with SshTunnel(profiles[ident]) as dst:
                target_dir = run_folder / ident
                target_dir.mkdir(mode=0o700)
                try:
                    sql_file = plan(src, dst, target_dir)
                finally:
                    (target_dir / 'dbdiff.yml').unlink(missing_ok=True)
                raw = sql_file.read_text(encoding='utf-8')
                ignored, eligible, blocked = classify(raw)
                # --check also validates live ACLs, never only SQL syntax.
                if eligible and not blocked:
                    try:
                        build_deploy_sql(source_id, ident, eligible)
                    except SyncError:
                        blocked.append(('CATALOG_ACL_REVIEW', '/* details deliberately withheld */;'))
                write_report(target_dir/'classification.json', ignored, eligible, blocked)
                print(f'BACKEND={ident} PLAN_BYTES={len(raw.encode())} IGNORED={len(ignored)} ELIGIBLE={len(eligible)} BLOCKED={len(blocked)}', flush=True)
                for reason in sorted({k for k,_ in blocked}):
                    print(f'BLOCKED_REASON={ident}:{reason}', flush=True)
                plans.append((ident, target_dir, raw, ignored, eligible, blocked))
    if mode == '--check':
        print(f'READ_ONLY=PASS PLANS={run_folder} DATABASE_WRITES=NONE', flush=True)
        if any(b for _,_,_,_,_,b in plans):
            print('RESULT=REVIEW_REQUIRED', flush=True)
        elif any(e for _,_,_,_,e,_ in plans):
            print('RESULT=SAFE_CANDIDATES_TO_TEST', flush=True)
        else:
            print('RESULT=NO_MIGRATION_RELEVANT_SCHEMA_DIFF', flush=True)
        return
    if any(b for _,_,_,_,_,b in plans):
        raise SyncError('Unsupported or risky differences; no DB was changed. See classification.json')
    # Build complete audited SQL before any target write.
    for ident, directory, raw, ignored, eligible, blocked in plans:
        safe_sql = build_deploy_sql(source_id, ident, eligible)
        (directory/'deploy.sql').write_text(safe_sql, encoding='utf-8')
        (directory/'deploy.sql').chmod(0o600)
    for ident, directory, raw, ignored, eligible, blocked in plans:
        if not eligible:
            print(f'APPLY={ident} SKIP_NO_MIGRATION_DIFFERENCES', flush=True)
            continue
        if system_status().get('active_backend') != source_id or freeze(ident) != 'FROZEN':
            raise SyncError('Backend state changed before apply')
        # Re-diff directly before write: the reviewed SQL may have gone stale.
        with SshTunnel(profiles[source_id]) as src:
            with SshTunnel(profiles[ident]) as dst:
                checkdir = directory / 'recheck'
                checkdir.mkdir(mode=0o700)
                try:
                    checked = plan(src, dst, checkdir)
                finally:
                    (checkdir/'dbdiff.yml').unlink(missing_ok=True)
                if split_sql(checked.read_text(encoding='utf-8')) != split_sql(raw):
                    raise SyncError(f'{ident}: schema changed since plan; refusing stale deploy')
        print(f'APPLY={ident} START', flush=True)
        apply(ident, directory/'deploy.sql')
        with SshTunnel(profiles[source_id]) as src:
            with SshTunnel(profiles[ident]) as dst:
                verify_dir = directory / 'verify'
                verify_dir.mkdir(mode=0o700)
                try:
                    final = plan(src, dst, verify_dir)
                finally:
                    (verify_dir/'dbdiff.yml').unlink(missing_ok=True)
                remain_ignored, remain_eligible, remain_blocked = classify(final.read_text(encoding='utf-8'))
                write_report(verify_dir/'classification.json', remain_ignored, remain_eligible, remain_blocked)
                if remain_eligible or remain_blocked:
                    raise SyncError(f'{ident}: remaining migration differences; see {verify_dir}')
        print(f'APPLY={ident} VERIFIED_BY_SCHEMA_SCOPE', flush=True)
    print('SCHEMA_SYNC=PASS', flush=True)

if __name__ == "__main__":
    try:
        main()
    except (SyncError, subprocess.TimeoutExpired, OSError, ValueError) as exc:
        print(f"SCHEMA_SYNC=BLOCKED reason={exc}", file=sys.stderr)
        sys.exit(1)
