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
CURRENT_RUN_FILE = STATE_FILE.parent / "current_run"
RUNS_DIR = STATE_FILE.parent.parent / "runs"
SOURCE_ENV = Path(os.environ.get("SOURCE_ENV", "/home/luban78/luba-server/migration-manager/config/source.env"))
RUNTIME_DIR = Path(
    os.environ.get("BRIDGE_RUNTIME_DIR", "/home/luban78/luba-server/migration-bridge")
)
JOBS_DIR = RUNTIME_DIR / "jobs"
CONTROL_STATE_FILE = RUNTIME_DIR / "control-state.json"
MAX_LOG_TAIL_BYTES = 32_768
DESTINATION_ENV = Path(os.environ.get("DESTINATION_ENV", "/home/luban78/luba-server/migration-manager/config/destination.env"))
BACKEND_PROFILES_DIR = SOURCE_ENV.parent / "backend-profiles"
ALLOWED_ACTIONS = {"prepare", "verify", "cutover"}
BACKEND_SELECT = os.environ.get("BACKEND_SELECT", "/home/luban78/luba-server/migration-manager/bin/backend-select")
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


def backend_source_auth_target(backend_id: str) -> tuple[str, str] | None:
    backend = str(backend_id or "").strip().lower()
    if not BACKEND_ID_RE.fullmatch(backend):
        return None

    # Domaci LubaServer overujeme pres lokalni Kong, bez zavislosti na verejne siti.
    if backend == "lubaserver":
        key = read_env_value(SUPABASE_ENV, "ANON_KEY")
        return ("http://127.0.0.1:8000", key) if key else None

    profile = BACKEND_PROFILES_DIR / f"{backend}.source.env"
    api_url = read_env_value(str(profile), "SOURCE_API_URL").rstrip("/")
    api_key = (
        read_env_value(str(profile), "SOURCE_ANON_KEY")
        or read_env_value(str(profile), "SOURCE_SERVICE_ROLE_KEY")
    )
    if not api_url or not api_key:
        return None
    return api_url, api_key


def backend_destination_admin_target(backend_id: str) -> tuple[str, str] | None:
    backend = str(backend_id or "").strip().lower()
    if not BACKEND_ID_RE.fullmatch(backend):
        return None

    if backend == "lubaserver":
        key = read_env_value(SUPABASE_ENV, "SERVICE_ROLE_KEY")
        return ("http://127.0.0.1:8000", key) if key else None

    # Po CUTOVERu destination.env stale popisuje prave novy PRIMARY.
    dest_backend = read_env_value(str(DESTINATION_ENV), "DEST_BACKEND_ID").strip().lower()
    profile = DESTINATION_ENV if dest_backend == backend else BACKEND_PROFILES_DIR / f"{backend}.destination.env"
    api_url = (
        read_env_value(str(profile), "DEST_API_URL")
        or read_env_value(str(profile), "DEST_CLIENT_URL")
    ).rstrip("/")
    service_key = read_env_value(str(profile), "DEST_SERVICE_ROLE_KEY")
    if not api_url or not service_key:
        return None
    return api_url, service_key


def verify_admin(auth_header: str | None) -> tuple[bool, str]:
    if not auth_header or not auth_header.startswith("Bearer "):
        return False, "missing_bearer"

    try:
        control = read_control_state()
    except Exception:
        return False, "control_unavailable"

    target = backend_source_auth_target(str(control.get("active_backend", "")))
    if not target:
        return False, "active_backend_auth_unavailable"
    base_url, api_key = target
    rpc_url = f"{base_url.rstrip('/')}/rest/v1/rpc/lubanote_admin_is_current_user"

    try:
        response = requests.post(
            rpc_url,
            headers={
                "apikey": api_key,
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


def create_session_handoff(auth_header: str | None, request_payload: dict[str, Any] | None = None) -> tuple[bool, dict[str, Any]]:
    if not auth_header or not auth_header.startswith("Bearer "):
        return False, {"error": "missing_bearer"}

    try:
        control = read_control_state()
    except Exception:
        return False, {"error": "control_unavailable"}

    request_payload = request_payload or {}
    source_backend = str(request_payload.get("source_backend", "")).strip().lower()
    destination_backend = str(control.get("active_backend", "")).strip().lower()
    requested_destination = str(request_payload.get("destination_backend", destination_backend)).strip().lower()

    if not BACKEND_ID_RE.fullmatch(source_backend):
        return False, {"error": "handoff_source_backend_invalid"}
    if requested_destination != destination_backend:
        return False, {"error": "handoff_destination_not_active"}
    if source_backend == destination_backend:
        return False, {"error": "handoff_same_backend"}

    source_target = backend_source_auth_target(source_backend)
    dest_target = backend_destination_admin_target(destination_backend)
    if not source_target or not dest_target:
        return False, {"error": "handoff_backend_auth_unavailable"}

    source_url, source_key = source_target
    dest_url, dest_service_key = dest_target

    try:
        source_user_response = requests.get(
            f"{source_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": source_key, "Authorization": auth_header},
            timeout=8,
        )
    except requests.RequestException:
        return False, {"error": "handoff_source_auth_unreachable"}
    if source_user_response.status_code != 200:
        return False, {"error": "handoff_source_session_rejected"}

    try:
        source_user = source_user_response.json()
    except ValueError:
        return False, {"error": "handoff_source_user_invalid"}
    user_id = str(source_user.get("id", "")).strip()
    email = str(source_user.get("email", "")).strip()
    if not user_id or not email:
        return False, {"error": "handoff_source_identity_incomplete"}

    admin_headers = {
        "apikey": dest_service_key,
        "Authorization": f"Bearer {dest_service_key}",
        "Content-Type": "application/json",
    }
    try:
        dest_user_response = requests.get(
            f"{dest_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers=admin_headers,
            timeout=8,
        )
    except requests.RequestException:
        return False, {"error": "handoff_destination_auth_unreachable"}
    if dest_user_response.status_code != 200:
        return False, {"error": "handoff_destination_user_missing"}
    try:
        dest_user = dest_user_response.json()
    except ValueError:
        return False, {"error": "handoff_destination_user_invalid"}
    if str(dest_user.get("id", "")).strip() != user_id or str(dest_user.get("email", "")).strip().lower() != email.lower():
        return False, {"error": "handoff_destination_identity_mismatch"}

    try:
        link_response = requests.post(
            f"{dest_url.rstrip('/')}/auth/v1/admin/generate_link",
            headers=admin_headers,
            json={"type": "magiclink", "email": email},
            timeout=8,
        )
    except requests.RequestException:
        return False, {"error": "handoff_link_unreachable"}
    if link_response.status_code != 200:
        return False, {"error": "handoff_link_rejected"}
    try:
        link_data = link_response.json()
    except ValueError:
        return False, {"error": "handoff_link_invalid"}
    token_hash = str(
        link_data.get("hashed_token")
        or (link_data.get("properties") or {}).get("hashed_token")
        or ""
    ).strip()
    if not token_hash:
        return False, {"error": "handoff_token_missing"}

    return True, {
        "ok": True,
        "version": 1,
        "source_backend": source_backend,
        "destination_backend": destination_backend,
        "user_id": user_id,
        "token_hash": token_hash,
        "token_type": "magiclink",
        "issued_utc": utc_now(),
    }

def write_job_meta(job: dict[str, Any]) -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    path = JOBS_DIR / f"{job['id']}.json"
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(temp, 0o600)
    temp.replace(path)


def source_public() -> dict[str, Any]:
    return {
        "backend_id": read_env_value(str(SOURCE_ENV), "SOURCE_BACKEND_ID"),
        "name": read_env_value(str(SOURCE_ENV), "SOURCE_NAME"),
        "mode": read_env_value(str(SOURCE_ENV), "SOURCE_MODE"),
    }


def current_run_direction() -> dict[str, Any] | None:
    try:
        run_id = CURRENT_RUN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not run_id or not re.fullmatch(r"[A-Za-z0-9._-]+", run_id):
        return None
    manifest = RUNS_DIR / run_id / "manifest"
    try:
        values: dict[str, str] = {}
        for raw in manifest.read_text(encoding="utf-8").splitlines():
            if "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            values[key.strip()] = value.strip()
    except OSError:
        return None
    source_backend = values.get("source_backend_id", "").lower()
    dest_backend = values.get("destination_backend_id", "").lower()
    if not BACKEND_ID_RE.fullmatch(source_backend) or not BACKEND_ID_RE.fullmatch(dest_backend):
        return None
    return {
        "run_id": run_id,
        "source_backend_id": source_backend,
        "source_name": values.get("source_name", ""),
        "destination_backend_id": dest_backend,
        "destination_name": values.get("destination_name", ""),
    }


def destination_public() -> dict[str, Any]:
    return {
        "backend_id": read_env_value(str(DESTINATION_ENV), "DEST_BACKEND_ID"),
        "name": read_env_value(str(DESTINATION_ENV), "DEST_NAME"),
        "host": read_env_value(str(DESTINATION_ENV), "DEST_SSH_HOST"),
        "mode": read_env_value(str(DESTINATION_ENV), "DEST_MODE"),
        "client_url": read_env_value(str(DESTINATION_ENV), "DEST_CLIENT_URL") or read_env_value(str(DESTINATION_ENV), "DEST_API_URL"),
    }


def configure_known_destination(backend_id: str) -> tuple[bool, str]:
    backend = (backend_id or "").strip().lower()
    if backend not in {"cloud", "lubaserver"}:
        return False, "unknown_destination_backend"
    try:
        result = subprocess.run(
            [BACKEND_SELECT, backend],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except Exception:
        return False, "backend_select_failed"
    if result.returncode != 0:
        return False, "backend_select_rejected"
    return True, backend


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
    server_version = "LubaNoteMigrationBridge/1.4-50E44"

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
                    "bidirectional": True,
                },
                "source": source_public(),
                "destination": destination_public(),
                "direction": current_run_direction(),
                "manager_status": manager_status_output(),
            },
        )

    def do_POST(self) -> None:
        if self.path == "/control/v1/session-handoff":
            try:
                length = min(int(self.headers.get("Content-Length", "0")), 2048)
                request_payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                self.send_json(400, {"ok": False, "error": "invalid_json"})
                return
            ok, payload = create_session_handoff(self.headers.get("Authorization"), request_payload)
            if not ok:
                error = str(payload.get("error", "handoff_failed"))
                status = 401 if error in {"missing_bearer", "handoff_source_session_rejected"} else 409
                self.send_json(status, {"ok": False, **payload})
                return
            self.send_json(200, payload)
            return

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
            backend = str(payload.get("backend", "")).strip().lower()
            if backend:
                ok, result = configure_known_destination(backend)
            else:
                ok, result = configure_destination(str(payload.get("host", "")))
            if not ok:
                self.send_json(400, {"ok": False, "error": result})
                return
            self.send_json(200, {"ok": True, "destination": destination_public(), "manager_state": read_state()})
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
