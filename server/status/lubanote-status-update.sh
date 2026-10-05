#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${LUBA_DB_CONTAINER:-supabase-db}"

read -r LOAD_1 LOAD_5 LOAD_15 _ < /proc/loadavg
UPTIME_SECONDS="$(cut -d. -f1 /proc/uptime)"
HOSTNAME_VALUE="$(hostname)"

mem_kb() {
  awk -v key="$1" '$1 == key ":" {print $2; exit}' /proc/meminfo
}

MEM_TOTAL_KB="$(mem_kb MemTotal)"
MEM_AVAILABLE_KB="$(mem_kb MemAvailable)"
SWAP_TOTAL_KB="$(mem_kb SwapTotal)"
SWAP_FREE_KB="$(mem_kb SwapFree)"
MEM_TOTAL_BYTES="$((MEM_TOTAL_KB * 1024))"
MEM_AVAILABLE_BYTES="$((MEM_AVAILABLE_KB * 1024))"
MEM_USED_BYTES="$((MEM_TOTAL_BYTES - MEM_AVAILABLE_BYTES))"
SWAP_TOTAL_BYTES="$((SWAP_TOTAL_KB * 1024))"
SWAP_USED_BYTES="$(((SWAP_TOTAL_KB - SWAP_FREE_KB) * 1024))"

read -r DISK_TOTAL_BYTES DISK_USED_BYTES DISK_AVAILABLE_BYTES DISK_PERCENT_RAW < <(
  df -B1 --output=size,used,avail,pcent / | tail -n 1
)
DISK_USED_PERCENT="${DISK_PERCENT_RAW%%%}"

BATTERY_PERCENTAGE=""
BATTERY_STATE=""
for BAT in /sys/class/power_supply/BAT*; do
  [[ -d "$BAT" ]] || continue
  [[ -r "$BAT/capacity" ]] && BATTERY_PERCENTAGE="$(cat "$BAT/capacity")"
  [[ -r "$BAT/status" ]] && BATTERY_STATE="$(cat "$BAT/status")"
  break
done

AC_ONLINE=""
for AC in /sys/class/power_supply/AC* /sys/class/power_supply/ADP*; do
  [[ -d "$AC" ]] || continue
  if [[ -r "$AC/online" ]]; then
    case "$(cat "$AC/online")" in
      1) AC_ONLINE="true" ;;
      0) AC_ONLINE="false" ;;
    esac
    break
  fi
done

if systemctl is-active --quiet docker; then
  DOCKER_ACTIVE="true"
else
  DOCKER_ACTIVE="false"
fi

if systemctl is-active --quiet cloudflared; then
  CLOUDFLARED_ACTIVE="true"
else
  CLOUDFLARED_ACTIVE="false"
fi

SUPABASE_TOTAL=0
SUPABASE_HEALTHY=0
if command -v docker >/dev/null 2>&1; then
  while IFS='|' read -r _name status; do
    [[ -n "${status:-}" ]] || continue
    SUPABASE_TOTAL=$((SUPABASE_TOTAL + 1))
    if [[ "$status" == *"(healthy)"* ]]; then
      SUPABASE_HEALTHY=$((SUPABASE_HEALTHY + 1))
    fi
  done < <(docker ps -a \
    --filter label=com.docker.compose.project=supabase \
    --format '{{.Names}}|{{.Status}}' 2>/dev/null || true)
fi

command -v docker >/dev/null 2>&1 || exit 1

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v hostname="$HOSTNAME_VALUE" \
  -v uptime_seconds="$UPTIME_SECONDS" \
  -v load_1="$LOAD_1" \
  -v load_5="$LOAD_5" \
  -v load_15="$LOAD_15" \
  -v memory_total_bytes="$MEM_TOTAL_BYTES" \
  -v memory_used_bytes="$MEM_USED_BYTES" \
  -v memory_available_bytes="$MEM_AVAILABLE_BYTES" \
  -v swap_total_bytes="$SWAP_TOTAL_BYTES" \
  -v swap_used_bytes="$SWAP_USED_BYTES" \
  -v disk_total_bytes="$DISK_TOTAL_BYTES" \
  -v disk_used_bytes="$DISK_USED_BYTES" \
  -v disk_available_bytes="$DISK_AVAILABLE_BYTES" \
  -v disk_used_percent="$DISK_USED_PERCENT" \
  -v battery_percentage="$BATTERY_PERCENTAGE" \
  -v battery_state="$BATTERY_STATE" \
  -v ac_online="$AC_ONLINE" \
  -v supabase_healthy="$SUPABASE_HEALTHY" \
  -v supabase_total="$SUPABASE_TOTAL" \
  -v docker_active="$DOCKER_ACTIVE" \
  -v cloudflared_active="$CLOUDFLARED_ACTIVE" <<'SQL'
UPDATE public.lubanote_server_status
SET
  updated_at = now(),
  hostname = :'hostname',
  uptime_seconds = :'uptime_seconds'::bigint,
  load_1 = :'load_1'::numeric,
  load_5 = :'load_5'::numeric,
  load_15 = :'load_15'::numeric,
  memory_total_bytes = :'memory_total_bytes'::bigint,
  memory_used_bytes = :'memory_used_bytes'::bigint,
  memory_available_bytes = :'memory_available_bytes'::bigint,
  swap_total_bytes = :'swap_total_bytes'::bigint,
  swap_used_bytes = :'swap_used_bytes'::bigint,
  disk_total_bytes = :'disk_total_bytes'::bigint,
  disk_used_bytes = :'disk_used_bytes'::bigint,
  disk_available_bytes = :'disk_available_bytes'::bigint,
  disk_used_percent = :'disk_used_percent'::numeric,
  battery_percentage = NULLIF(:'battery_percentage', '')::numeric,
  battery_state = NULLIF(:'battery_state', ''),
  ac_online = NULLIF(:'ac_online', '')::boolean,
  supabase_healthy = :'supabase_healthy'::integer,
  supabase_total = :'supabase_total'::integer,
  docker_active = :'docker_active'::boolean,
  cloudflared_active = :'cloudflared_active'::boolean
WHERE id = 'main';
SQL
