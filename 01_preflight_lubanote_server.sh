#!/usr/bin/env bash
set -Eeuo pipefail

cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 0)"
mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
mem_gb=$(( mem_kb / 1024 / 1024 ))
disk_gb="$(df -Pk / | awk 'NR==2 {printf "%d", $4/1024/1024}')"

printf 'LubaNote Server BI-2A – preflight\n'
printf 'CPU:  %s cores\n' "$cpu_count"
printf 'RAM:  %s GB\n' "$mem_gb"
printf 'Disk: %s GB free on /\n' "$disk_gb"

ok=1
if [ "$cpu_count" -lt 2 ]; then
  echo 'CHYBA: potreba minimalne 2 CPU cores.' >&2
  ok=0
fi
if [ "$mem_gb" -lt 4 ]; then
  echo 'CHYBA: potreba minimalne 4 GB RAM.' >&2
  ok=0
fi
if [ "$disk_gb" -lt 40 ]; then
  echo 'CHYBA: potreba minimalne 40 GB volneho SSD prostoru.' >&2
  ok=0
fi

for cmd in git docker openssl sed awk grep curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "CHYBA: chybi prikaz: $cmd" >&2
    ok=0
  fi
done

if command -v docker >/dev/null 2>&1; then
  if ! docker compose version >/dev/null 2>&1; then
    echo 'CHYBA: chybi Docker Compose plugin (docker compose).' >&2
    ok=0
  fi
fi

if [ "$ok" -ne 1 ]; then
  exit 1
fi

echo 'OK: server splnuje minimalni BI-2A predpoklady.'
echo 'Doporuceni pro produkci LubaNote: 4 CPU, 8+ GB RAM, 80+ GB SSD.'
