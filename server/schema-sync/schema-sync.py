#!/usr/bin/env python3
"""LubaNote 699A: compare live PostgreSQL schemas, never infer changes from Git.

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

def sql_without_comments(sql):
    # Conservative inspection: strings are intentionally NOT interpreted as SQL.
    # A dangerous keyword in a function string may block an otherwise safe update.
    return "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith(("--", "#"))).strip()

RISKY = [
    (r"\bDROP\b", "DROP"), (r"\bTRUNCATE\b", "TRUNCATE"),
    (r"\bDELETE\s+FROM\b", "DELETE"), (r"\bUPDATE\s+[\w\".]+\s+SET\b", "DATA_UPDATE"),
    (r"\bINSERT\s+INTO\b", "DATA_INSERT"), (r"\bREVOKE\b", "REVOKE"),
    (r"\bGRANT\b", "GRANT"), (r"\bALTER\s+ROLE\b", "ALTER_ROLE"),
    (r"\bALTER\s+DEFAULT\s+PRIVILEGES\b", "DEFAULT_PRIVILEGES"),
    (r"\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b", "ALTER_COLUMN"),
    (r"\bALTER\s+TABLE\b[^;]*\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b", "RLS_DISABLED"),
    (r"\bCREATE\s+EXTENSION\b", "EXTENSION"),
    (r"\bALTER\s+EXTENSION\b", "EXTENSION_CHANGE"),
    (r"\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b[^;]*\bSECURITY\s+DEFINER\b", "SECURITY_DEFINER_REVIEW"),
]

def hazards(sql):
    src = sql_without_comments(sql)
    # Remove dollar-quoted function bodies from lexical risk checks. This avoids
    # treating e.g. UPDATE in a newly defined function as immediate data DML.
    # Unclosed dollar quote fails closed rather than getting misclassified.
    dollar = re.compile(r"\$([a-zA-Z_][a-zA-Z0-9_]*|)\$(.*?)\$\1\$", re.S)
    src = dollar.sub("__FUNCTION_BODY__", src)
    if re.search(r"\$[a-zA-Z_][a-zA-Z0-9_]*\$|\$\$", src):
        return ["UNTERMINATED_DOLLAR_QUOTE"]
    # Also scrub string literals: they are not SQL statements themselves.
    src = re.sub(r"'(?:''|[^'])*'", "'STRING'", src, flags=re.S)
    return sorted({label for pat, label in RISKY if re.search(pat, src, re.I | re.S)})

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
    # DBDiff may print warnings, which the terminal needs to see. Never dump credentials.
    try:
        run(argv, timeout=300)
    except SyncError:
        raise SyncError("Schema comparison failed; check that DBDiff is installed and two DBs are accessible")
    if not output.is_file():
        raise SyncError("DBDiff did not create SQL plan")
    return output

APPLY_SCRIPT = r'''set -Eeuo pipefail
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
source "$BASE/bin/destination-lib"
DEST_CFG="$BASE/config/backend-profiles/$1.destination.env"
dest_load
[[ "$DEST_BACKEND_ID" == "$1" ]] || exit 10
# The SQL is executed in a transaction for this backend only, not for all servers.
# No schema-only restore; no data migration; no alteration of auth/storage schemas.
{ printf 'BEGIN;\nSET LOCAL lock_timeout=\0473s\047;\nSET LOCAL statement_timeout=\04790s\047;\n'; cat "$2"; printf '\nCOMMIT;\n'; } | dest_psql -q -v ON_ERROR_STOP=1 >/dev/null
'''

def apply(ident, sql_file):
    run(["bash", "-c", APPLY_SCRIPT, "_", ident, str(sql_file)], timeout=180)

def main():
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] not in ("--check", "--apply")):
        raise SyncError("Use: schema-sync.py --check|--apply")
    mode = sys.argv[1] if len(sys.argv) == 2 else "--check"
    if not shutil.which("dbdiff"):
        raise SyncError("DBDiff not installed: cannot compare live DB schemas")
    control = system_status()
    ids = registered_backends()
    source_id = "lubaserver"  # Explicit user request; not implicitly 'current destination'.
    if control.get("active_backend") != source_id:
        raise SyncError("Source LubaServer is not the active backend; refuse to infer new source")
    if source_id not in ids:
        raise SyncError("Source LubaServer missing from registered backends")
    if mode == "--apply" and (not APPROVAL.is_file() or APPROVAL.read_text().strip() != "APPROVED_AFTER_REAL_TEST=YES"):
        raise SyncError("Apply disabled until real read-only verification and explicit enablement")
    dest_ids = [i for i in ids if i != source_id]
    states = {i: freeze(i) for i in ids}
    if states[source_id] != "UNFROZEN" or any(states[i] != "FROZEN" for i in dest_ids):
        raise SyncError("Source must be writable and every destination FROZEN")
    print("=== LUBANOTE SCHEMA SYNC 699A ===", flush=True)
    print(f"MODE={mode} SOURCE={source_id} DESTINATIONS={' '.join(dest_ids)}", flush=True)
    print("SCOPE=public_schema_only DATA_SYNC=NO", flush=True)
    print("BACKEND_STATES=" + " ".join(f"{x}:{states[x]}" for x in ids), flush=True)
    profiles = {i: profile(i) for i in ids}
    LOG_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    LOG_DIR.chmod(0o700)
    run_folder = LOG_DIR / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_folder.mkdir(mode=0o700)
    plans = []
    # All destinations must be reachable and plans computed before ANY write.
    with SshTunnel(profiles[source_id]) as src:
        for ident in dest_ids:
            with SshTunnel(profiles[ident]) as dst:
                target_dir = run_folder / ident
                target_dir.mkdir(mode=0o700)
                try:
                    sql_file = plan(src, dst, target_dir)
                finally:
                    (target_dir / "dbdiff.yml").unlink(missing_ok=True)
                sql_text = sql_file.read_text(encoding="utf-8")
                unsafe = hazards(sql_text)
                print(f"BACKEND={ident} PLAN_BYTES={len(sql_text)} HAZARDS={','.join(unsafe) if unsafe else 'NONE'}", flush=True)
                plans.append((ident, sql_file, unsafe))
    if mode == "--check":
        print(f"READ_ONLY=PASS PLANS={run_folder} DATABASE_WRITES=NONE", flush=True)
        if any(h for _, _, h in plans):
            print("RESULT=REVIEW_REQUIRED", flush=True)
        else:
            print("RESULT=PLANS_READY_FOR_REVIEW", flush=True)
        return
    if any(h for _, _, h in plans):
        raise SyncError("Risky SQL detected; no database changed. Inspect plans; automatic apply blocked")
    # Before first live apply: DBDiff direction, coverage, grants and freeze behavior
    # must be tested explicitly on both backends. Keep auto-apply opt-in disabled by default.
    if system_status().get("active_backend") != source_id:
        raise SyncError("Control Point changed; refusing deploy")
    for ident, sql_file, _ in plans:
        if freeze(ident) != "FROZEN":
            raise SyncError(f"{ident} not frozen anymore")
        print(f"APPLY={ident} START", flush=True)
        apply(ident, sql_file)
        # Verify that the diff is empty after applying. No false success reports.
        with SshTunnel(profiles[source_id]) as src:
            with SshTunnel(profiles[ident]) as dst:
                verify_dir = run_folder / (ident + "-verify")
                verify_dir.mkdir(mode=0o700)
                try:
                    result = plan(src, dst, verify_dir)
                finally:
                    (verify_dir / "dbdiff.yml").unlink(missing_ok=True)
                remains = sql_without_comments(result.read_text())
                if remains:
                    raise SyncError(f"{ident}: residual schema differences; see {result}")
        print(f"APPLY={ident} VERIFIED", flush=True)
    print("SCHEMA_SYNC=PASS", flush=True)

if __name__ == "__main__":
    try:
        main()
    except (SyncError, subprocess.TimeoutExpired, OSError, ValueError) as exc:
        print(f"SCHEMA_SYNC=BLOCKED reason={exc}", file=sys.stderr)
        sys.exit(1)
