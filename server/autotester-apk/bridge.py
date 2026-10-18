#!/usr/bin/env python3
"""LubaNote AutoTester 690A: localhost only; admin-authenticated, fixed isolated SQL jobs.

Never reads or writes production notes. No user-controlled executable arguments.
Never return bearer tokens, raw Docker logs, SQL definitions, or client content.
"""
from __future__ import annotations
import json
import os
import re
import secrets
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "690A"
HOST = "127.0.0.1"  # Immutable: public access ONLY via authenticated Cloudflare Tunnel.
PORT = int(os.environ.get("PORT", "9084"))
BASE = "/autotester/v1"
ROOT = Path(os.environ.get("TEST_ROOT", "/opt/lubanote-autotester"))
ENVFILE = Path(os.environ.get("SUPABASE_ENV", "/home/luban78/luba-server/luba-supabase/.env"))
CONTROL = Path(os.environ.get("CONTROL_STATE", "/home/luban78/luba-server/migration-bridge/control-state.json"))
RPC_URL = os.environ.get("ADMIN_RPC_URL", "http://127.0.0.1:8000/rest/v1/rpc/lubanote_admin_is_current_user")
ALLOWED_ORIGINS = frozenset({"https://app.lubanote.com", "https://test.lubanote.com", "http://localhost", "https://localhost", "capacitor://localhost"})
RUNNERS = (
    ("db-fixture-689d", "DB model – PostgreSQL", "tests/autotester-db-lab-689D.sh", "DB_LAB_PASS=12 / ROLLBACK=PASS", 12, "MODEL_DB"),
    ("real-rpc-689f", "Export 3 skutečných RPC (689F) – izolovaný PostgreSQL", "tests/autotester-real-rpc-689F.sh", "REAL_RPC_BODY_PASS=22 / ROLLBACK=PASS", 22, "REAL_RPC_BODY"),
)
MAX_JOB_SECONDS = 115
COOLDOWN_SECONDS = 30
lock = threading.Lock()
auth_slots = threading.BoundedSemaphore(value=4)
current = None


def now_utc():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_env_key():
    try:
        for raw in ENVFILE.read_text(encoding="utf-8").splitlines():
            if raw.startswith("ANON_KEY="):
                return raw.split("=", 1)[1].strip().strip('"').strip("'")
    except (OSError, UnicodeError):
        pass
    return ""


def is_admin(bearer):
    if not bearer or not re.fullmatch(r"Bearer [A-Za-z0-9_.~-]{50,4096}", bearer):
        return False, "missing_or_invalid_bearer"
    try:
        state = json.loads(CONTROL.read_text(encoding="utf-8"))
        if state.get("active_backend") != "lubaserver" or state.get("mode") != "NORMAL":
            return False, "server_not_active_normal_backend"
    except (OSError, ValueError, TypeError):
        return False, "control_point_unavailable"
    anon = read_env_key()
    if not anon:
        return False, "anon_key_unavailable"
    req = urllib.request.Request(RPC_URL, data=b"{}", method="POST", headers={
        "apikey": anon, "Authorization": bearer, "Content-Type": "application/json", "Accept": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            if res.status != 200:
                return False, "admin_auth_failed"
            payload = res.read(256)
            return (payload.strip() == b"true", "ok" if payload.strip() == b"true" else "not_admin")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
        return False, "admin_auth_unavailable"


def execute_job(path):
    # Files are root-owned, unmodifiable by network or the service user.
    proc = subprocess.Popen(["bash", str(path)], cwd=str(ROOT), stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, errors="replace",
                            start_new_session=True,
                            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"})
    try:
        output, _ = proc.communicate(timeout=MAX_JOB_SECONDS)
        return proc.returncode, output[-100000:]
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            output, _ = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            output, _ = proc.communicate()
        return 124, (output or "")[-100000:]


def run_job(job_id):
    global current
    cases = []
    for code, title, relative, marker, expected, scope in RUNNERS:
        path = ROOT / relative
        if not path.is_file():
            result = {"id": code, "name": title, "status": "DB_BLOCKED", "count": 0,
                      "detail": "Testovací skript není nainstalován.", "scope": scope}
        else:
            try:
                rc, log = execute_job(path)
                # Only fixed markers are considered, never an arbitrary echoed PASS.
                match = bool(re.search(r"^RESULT: " + re.escape(marker) + r"(?: / .*|)$", log, re.M))
                isolation = "ISOLATION=PASS" in log
                if rc == 0 and match and isolation:
                    status = "DB_PASS"
                    detail = f"Dokončeno {expected}/{expected} + ROLLBACK. Izolovaný PostgreSQL bez sítě." + (" Exportovaný snapshot RPC; nikoli automatické porovnání s aktuálním serverem." if scope == "REAL_RPC_BODY" else "")
                elif rc == 2 or rc == 124 or "BLOCKED" in log:
                    status = "DB_BLOCKED"
                    detail = "Laboratoř nebylo možné bezpečně dokončit (prostředí, izolace nebo časový limit)."
                else:
                    status = "DB_FAIL"
                    # Only return a machine-like error identifier, never raw SQL logs or data.
                    failure = re.search(r"^ERROR:\s+([A-Z][A-Z0-9_]{4,63})(?::|\b)", log, re.M)
                    detail = ("Selhal SQL scénář " + failure.group(1) + "." if failure
                              else "Automatické SQL kontroly selhaly; podrobnosti jsou pouze v lokálním serverovém logu.")
                result = {"id": code, "name": title, "status": status,
                          "count": expected if status == "DB_PASS" else 0, "detail": detail, "scope": scope}
            except (OSError, ValueError, RuntimeError):
                result = {"id": code, "name": title, "status": "DB_BLOCKED", "count": 0,
                          "detail": "Spuštění izolovaného testu selhalo.", "scope": scope}
        cases.append(result)
        with lock:
            if current and current["id"] == job_id:
                current["results"] = list(cases)
    with lock:
        if current and current["id"] == job_id:
            current["state"] = "completed"
            current["finished_utc"] = now_utc()
            current["finished_monotonic"] = time.monotonic()


def start_job():
    global current
    with lock:
        if current and current["state"] == "running":
            return 409, {"ok": False, "error": "already_running", "run_id": current["id"]}
        if current and time.monotonic() - current.get("finished_monotonic", 0) < COOLDOWN_SECONDS:
            return 429, {"ok": False, "error": "cooldown", "retry_after_sec": COOLDOWN_SECONDS}
        job_id = secrets.token_hex(12)
        current = {"id": job_id, "state": "running", "started_utc": now_utc(),
                   "finished_utc": None, "results": []}
        thread = threading.Thread(target=run_job, args=(job_id,), daemon=True, name="db-isolated-runner")
        thread.start()
        return 202, {"ok": True, "run_id": job_id, "state": "running", "version": VERSION}


def job_status():
    with lock:
        if current is None:
            return {"ok": True, "state": "idle", "version": VERSION, "run_id": None, "results": []}
        return {"ok": True, "state": current["state"], "version": VERSION,
                "run_id": current["id"], "started_utc": current["started_utc"],
                "finished_utc": current["finished_utc"], "results": list(current["results"])}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "LN-AutoTester/690A"

    def log_message(self, format, *args):
        # Never log Authorization or request bodies. Avoid leaking caller IP/token in status logs.
        return

    def headers_standard(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")

    def reply(self, code, data):
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.headers_standard()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if self.path not in (BASE + "/start", BASE + "/status"):
            return self.reply(404, {"ok": False, "error": "not_found"})
        if self.headers.get("Origin") not in ALLOWED_ORIGINS:
            return self.reply(403, {"ok": False, "error": "origin_denied"})
        requested = self.headers.get("Access-Control-Request-Headers", "").lower()
        if not set(h.strip() for h in requested.split(",") if h.strip()).issubset({"authorization", "content-type"}):
            return self.reply(403, {"ok": False, "error": "headers_denied"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "300")
        self.send_header("Content-Length", "0")
        self.headers_standard()
        self.end_headers()

    def authorized(self):
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.reply(403, {"ok": False, "error": "origin_denied"})
            return False
        if not auth_slots.acquire(blocking=False):
            self.reply(429, {"ok": False, "error": "auth_busy"})
            return False
        try:
            ok, reason = is_admin(self.headers.get("Authorization"))
        finally:
            auth_slots.release()
        if not ok:
            self.reply(403, {"ok": False, "error": reason})
            return False
        return True

    def do_GET(self):
        if self.path == BASE + "/health":
            self.reply(200, {"ok": True, "service": "isolated-autotester", "version": VERSION})
            return
        if self.path != BASE + "/status":
            self.reply(404, {"ok": False, "error": "not_found"})
            return
        if self.authorized():
            self.reply(200, job_status())

    def do_POST(self):
        if self.path != BASE + "/start":
            return self.reply(404, {"ok": False, "error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            return self.reply(400, {"ok": False, "error": "invalid_length"})
        if not 0 <= length <= 128:
            self.close_connection = True
            return self.reply(413, {"ok": False, "error": "body_too_large"})
        if not self.authorized():
            self.close_connection = True
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"ok": False, "error": "invalid_json"})
        if payload != {"suite": "all"}:
            return self.reply(400, {"ok": False, "error": "invalid_suite"})
        code, value = start_job()
        self.reply(code, value)


def main():
    if not (0 < PORT < 65536):
        raise SystemExit("invalid port")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"LN AUTOTESTER {VERSION} localhost only port={PORT}", flush=True)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
