#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import requests

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "9083"))
MIGRATE = os.environ.get("MIGRATE", "/usr/local/bin/lubanote-migrate")
SUPABASE_ENV = os.environ.get(
    "SUPABASE_ENV", "/home/luban78/luba-server/luba-supabase/.env"
)
SUPABASE_RPC_URL = os.environ.get(
    "SUPABASE_RPC_URL",
    "http://127.0.0.1:8000/rest/v1/rpc/lubanote_admin_is_current_user",
)
STATE_FILE = Path(
    os.environ.get(
        "MIGRATION_STATE_FILE",
        "/home/luban78/luba-server/migration-manager/state/state",
    )
)
RUNTIME_DIR = Path(
    os.environ.get("BRIDGE_RUNTIME_DIR", "/home/luban78/luba-server/migration-bridge")
)
JOBS_DIR = RUNTIME_DIR / "jobs"
CONTROL_STATE_FILE = RUNTIME_DIR / "control-state.json"
MAX_LOG_TAIL_BYTES = 32_768
DESTINATION_ENV = Path(os.environ.get("DESTINATION_ENV", "/home/luban78/luba-server/migration-manager/config/destination.env"))
ALLOWED_ACTIONS = {"prepare", "verify", "cutover"}
ALLOWED_CONTROL_MODES = {"NORMAL", "MAINTENANCE"}
BACKEND_ID_RE = re.compile(r"^[a-z0-9._-]+$")

job_lock = threading.Lock()
current_job: dict[str, Any] | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_env_value(path: str, key: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, value = line.split("=", 1)
                if k.strip() == key:
                    value = value.strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                        value = value[1:-1]
                    return value
    except OSError:
        return ""
    return ""


def read_state() -> str:
    try:
        state = STATE_FILE.read_text(encoding="utf-8").strip()
        return state or "UNKNOWN"
    except OSError:
        return "UNKNOWN"


def read_control_state() -> dict[str, Any]:
    data = json.loads(CONTROL_STATE_FILE.read_text(encoding="utf-8"))

    mode = str(data.get("mode", "")).upper()
    backend = str(data.get("active_backend", "")).strip().lower()
    cutover_enabled = data.get("cutover_enabled")

    if mode not in ALLOWED_CONTROL_MODES:
        raise ValueError("invalid_control_mode")
    if not BACKEND_ID_RE.fullmatch(backend):
        raise ValueError("invalid_active_backend")
    if not isinstance(cutover_enabled, bool):
        raise ValueError("invalid_cutover_enabled")

    payload: dict[str, Any] = {
        "ok": True,
        "version": 1,
        "mode": mode,
        "active_backend": backend,
        "cutover_enabled": cutover_enabled,
        "updated_utc": data.get("updated_utc"),
    }

    client_profile = data.get("client_profile")
    if isinstance(client_profile, dict):
        profile_backend = str(client_profile.get("backend_id", "")).strip().lower()
        profile_url = str(client_profile.get("url", "")).strip()
        profile_key = str(client_profile.get("publishable_key", "")).strip()
        if (
            profile_backend == backend
            and BACKEND_ID_RE.fullmatch(profile_backend)
            and profile_url.startswith(("https://", "http://"))
            and profile_key
        ):
            payload["client_profile"] = {
                "backend_id": profile_backend,
                "url": profile_url,
                "publishable_key": profile_key,
                "project_ref": str(client_profile.get("project_ref", profile_backend)),
                "auth_storage_key": str(client_profile.get("auth_storage_key", "")),
                "name": str(client_profile.get("name", "")),
            }

    return payload


def write_control_mode(mode: str) -> dict[str, Any]:
    mode = mode.upper()
    if mode not in ALLOWED_CONTROL_MODES:
        raise ValueError("invalid_control_mode")

    current_raw = json.loads(CONTROL_STATE_FILE.read_text(encoding="utf-8"))
    current = read_control_state()

    current_raw["ok"] = True
    current_raw["version"] = 1
    current_raw["mode"] = mode
    current_raw["active_backend"] = current["active_backend"]
    current_raw["cutover_enabled"] = current["cutover_enabled"]
    current_raw["updated_utc"] = utc_now()

    temp = CONTROL_STATE_FILE.with_suffix(".json.tmp")
    temp.write_text(
        json.dumps(current_raw, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.chmod(temp, 0o600)
    temp.replace(CONTROL_STATE_FILE)
    return read_control_state()


def tail_log(path: str | None) -> str:
    if not path:
        return ""
    p = Path(path)
    try:
        size = p.stat().st_size
        with p.open("rb") as handle:
            if size > MAX_LOG_TAIL_BYTES:
                handle.seek(size - MAX_LOG_TAIL_BYTES)
            data = handle.read()
        return data.decode("utf-8", errors="replace")
    except OSError:
        return ""


def manager_status_output() -> str:
    try:
        result = subprocess.run(
            [MIGRATE, "status"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return output[-MAX_LOG_TAIL_BYTES:]
    except Exception as exc:
        return f"status unavailable: {type(exc).__name__}"


def verify_admin(auth_header: str | None) -> tuple[bool, str]:
    if not auth_header or not auth_header.startswith("Bearer "):
        return False, "missing_bearer"

    anon_key = read_env_value(SUPABASE_ENV, "ANON_KEY")
    if not anon_key:
        return False, "anon_key_unavailable"

    try:
        response = requests.post(
            SUPABASE_RPC_URL,
            headers={
                "apikey": anon_key,
                "Authorization": auth_header,
                "Content-Type": "application/json",
            },
            json={},
            timeout=8,
        )
    except requests.RequestException:
        return False, "auth_rpc_unreachable"

    if response.status_code != 200:
        return False, "auth_rpc_rejected"

    try:
        is_admin = response.json() is True
    except ValueError:
        is_admin = response.text.strip().lower() == "true"

    return (True, "ok") if is_admin else (False, "not_admin")


def write_job_meta(job: dict[str, Any]) -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    path = JOBS_DIR / f"{job['id']}.json"
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(temp, 0o600)
    temp.replace(path)


def destination_public() -> dict[str, Any]:
    return {
        "host": read_env_value(str(DESTINATION_ENV), "DEST_SSH_HOST"),
        "mode": read_env_value(str(DESTINATION_ENV), "DEST_MODE"),
        "client_url": read_env_value(str(DESTINATION_ENV), "DEST_CLIENT_URL"),
    }


def configure_destination(host: str) -> tuple[bool, str]:
    raw = (host or "").strip()
    if not raw:
        return False, "invalid_destination_host"

    client_url = ""
    if raw.startswith(("https://", "http://")):
        client_url = raw.rstrip("/")
        host_only = raw.split("://", 1)[1].strip().strip("/")
    else:
        host_only = raw.strip().strip("/")
        client_url = f"https://{host_only}"

    if not host_only or len(host_only) > 253 or not all(c.isalnum() or c in ".:-" for c in host_only):
        return False, "invalid_destination_host"
    if "/" in host_only or "@" in host_only:
        return False, "invalid_destination_host"

    try:
        lines = DESTINATION_ENV.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False, "destination_config_unavailable"

    updates = {
        "DEST_NAME": "LubaServerNext",
        "DEST_BACKEND_ID": "lubaservernext",
        "DEST_MODE": "ssh",
        "DEST_SSH_HOST": host_only,
        "DEST_SSH_USER": "luban78",
        "DEST_SSH_PORT": "22",
        "DEST_DOCKER_CONTAINER": "supabase-db",
        "DEST_SUPABASE_DIR": "/home/luban78/luba-server/luba-supabase",
        "DEST_STORAGE_DIR": "/home/luban78/luba-server/luba-supabase/volumes/storage",
        "DEST_SERVER_BASE": "/home/luban78/luba-server",
        "DEST_SERVER_PROJECT": "luba-supabase",
        "DEST_CLIENT_URL": client_url,
        "DEST_CLIENT_PROJECT_REF": "lubaservernext",
        "DEST_CLIENT_AUTH_STORAGE_KEY": "sb-lubaservernext-auth-token",
        "DEST_CLIENT_NAME": "LubaServer Next",
    }
    seen = set()
    out = []
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in updates:
                out.append(f"{key}={updates[key]}")
                seen.add(key)
                continue
        out.append(line)
    for key, value in updates.items():
        if key not in seen:
            out.append(f"{key}={value}")

    temp = DESTINATION_ENV.with_suffix(".env.tmp")
    try:
        temp.write_text("\n".join(out) + "\n", encoding="utf-8")
        os.chmod(temp, 0o600)
        temp.replace(DESTINATION_ENV)
    except OSError:
        return False, "destination_config_write_failed"
    return True, host_only


def run_action(job_id: str, action: str, log_path: str) -> None:
    global current_job
    exit_code = 1
    error_text = None

    try:
        with open(log_path, "a", encoding="utf-8", buffering=1) as log:
            log.write(f"[{utc_now()}] START {action}\n")
            commands = [[MIGRATE, action]]
            if action == "prepare":
                commands = [[MIGRATE, "prepare-server"], [MIGRATE, "prepare"]]
            for command in commands:
                log.write(f"[{utc_now()}] RUN {' '.join(command[1:])}\n")
                process = subprocess.Popen(
                    command,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    text=True,
                )
                exit_code = process.wait()
                if exit_code != 0:
                    break
            log.write(f"[{utc_now()}] END {action} exit={exit_code}\n")
    except Exception as exc:
        error_text = f"{type(exc).__name__}: {exc}"
        try:
            with open(log_path, "a", encoding="utf-8") as log:
                log.write(f"[{utc_now()}] ERROR {error_text}\n")
        except OSError:
            pass

    with job_lock:
        if current_job and current_job.get("id") == job_id:
            current_job["status"] = "success" if exit_code == 0 and not error_text else "failed"
            current_job["exit_code"] = exit_code
            current_job["finished_utc"] = utc_now()
            current_job["manager_state"] = read_state()
            if error_text:
                current_job["error"] = error_text
            write_job_meta(current_job)


def start_action(action: str) -> tuple[bool, dict[str, Any]]:
    global current_job

    if action not in ALLOWED_ACTIONS:
        return False, {"error": "action_not_allowed"}

    with job_lock:
        if current_job and current_job.get("status") == "running":
            return False, {
                "error": "migration_busy",
                "job": current_job.copy(),
            }

        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        job_id = f"{action}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
        log_path = str(JOBS_DIR / f"{job_id}.log")
        current_job = {
            "id": job_id,
            "action": action,
            "status": "running",
            "started_utc": utc_now(),
            "finished_utc": None,
            "exit_code": None,
            "manager_state": read_state(),
            "log_path": log_path,
        }
        write_job_meta(current_job)

        thread = threading.Thread(
            target=run_action,
            args=(job_id, action, log_path),
            daemon=True,
            name=f"migration-{action}",
        )
        thread.start()
        return True, current_job.copy()


class Handler(BaseHTTPRequestHandler):
    server_version = "LubaNoteMigrationBridge/1.1-50E41"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Never log request headers/tokens. Base log format contains only method/path/status.
        print(f"[{utc_now()}] {self.client_address[0]} {fmt % args}", flush=True)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Max-Age", "600")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def authenticate_admin(self) -> bool:
        ok, reason = verify_admin(self.headers.get("Authorization"))
        if ok:
            return True
        status = 401 if reason in {"missing_bearer", "auth_rpc_rejected"} else 403
        self.send_json(status, {"ok": False, "error": reason})
        return False

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/control/v1/status":
            try:
                self.send_json(200, read_control_state())
            except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
                self.send_json(503, {"ok": False, "error": "invalid_control_state", "detail": type(exc).__name__})
            return

        if self.path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "service": "lubanote-migration-bridge",
                    "version": 1,
                    "manager_state": read_state(),
                    "cutover_enabled": read_state() == "VERIFIED",
                },
            )
            return

        if self.path != "/migration/v1/status":
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        if not self.authenticate_admin():
            return

        with job_lock:
            job = current_job.copy() if current_job else None

        if job:
            job["log_tail"] = tail_log(job.get("log_path"))
            job.pop("log_path", None)

        self.send_json(
            200,
            {
                "ok": True,
                "api_version": 1,
                "manager_state": read_state(),
                "job": job,
                "capabilities": {
                    "status": True,
                    "prepare": True,
                    "verify": True,
                    "cutover": read_state() == "VERIFIED",
                    "destination": True,
                },
                "destination": destination_public(),
                "manager_status": manager_status_output(),
            },
        )

    def do_POST(self) -> None:
        control_paths = {
            "/control/v1/maintenance": "MAINTENANCE",
            "/control/v1/normal": "NORMAL",
        }
        control_mode = control_paths.get(self.path)

        if control_mode:
            if not self.authenticate_admin():
                return
            try:
                payload = write_control_mode(control_mode)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                self.send_json(500, {"ok": False, "error": "control_state_write_failed"})
                return
            self.send_json(200, payload)
            return

        if self.path == "/migration/v1/destination":
            if not self.authenticate_admin():
                return
            try:
                length = min(int(self.headers.get("Content-Length", "0")), 4096)
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                self.send_json(400, {"ok": False, "error": "invalid_json"})
                return
            with job_lock:
                if current_job and current_job.get("status") == "running":
                    self.send_json(409, {"ok": False, "error": "migration_busy"})
                    return
            ok, result = configure_destination(str(payload.get("host", "")))
            if not ok:
                self.send_json(400, {"ok": False, "error": result})
                return
            self.send_json(200, {"ok": True, "destination": destination_public()})
            return

        path_to_action = {
            "/migration/v1/prepare": "prepare",
            "/migration/v1/verify": "verify",
            "/migration/v1/cutover": "cutover",
        }
        action = path_to_action.get(self.path)
        if not action:
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        if not self.authenticate_admin():
            return

        ok, result = start_action(action)
        if not ok:
            status = 409 if result.get("error") == "migration_busy" else 400
            self.send_json(status, {"ok": False, **result})
            return

        result.pop("log_path", None)
        self.send_json(
            202,
            {
                "ok": True,
                "accepted": True,
                "job": result,
                "cutover_enabled": read_state() == "VERIFIED",
            },
        )


def main() -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(JOBS_DIR, 0o700)

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[{utc_now()}] LubaNote Migration Bridge listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
