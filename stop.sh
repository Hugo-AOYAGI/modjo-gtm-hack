#!/usr/bin/env bash
#
# Stop the Prospect Flow demo (backend :8000 + webapp :3000).
set -uo pipefail

for port in 8000 3000; do
  netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u | while read -r pid; do
    [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1 || true
  done
done

echo "✓ Stopped services on :8000 and :3000"
echo "  (ngrok tunnel, if running, must be stopped in its own terminal)"
