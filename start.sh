#!/usr/bin/env bash
#
# Start the Prospect Flow demo:
#   • voice backend  (FastAPI + gradbot)      → http://localhost:8000
#   • sales webapp   (Next.js, production)    → http://localhost:3000
#
# Usage:  ./start.sh            (production build — stable, use for demos)
#         ./start.sh --dev      (Next dev server — hot reload, for iterating)
#
# Stop with ./stop.sh   •   expose the phone for mobile with ./tunnel.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-prod}"

free_port() {
  netstat -ano | grep ":$1 " | grep LISTENING | awk '{print $5}' | sort -u | while read -r pid; do
    [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1 || true
  done
}

echo "→ Freeing ports 8000 and 3000…"
free_port 8000
free_port 3000
sleep 1

echo "→ Starting voice backend on :8000…"
( cd "$ROOT/services" && nohup uv run uvicorn app:app --host 0.0.0.0 --port 8000 \
    > "$ROOT/services/server.log" 2>&1 & )

if [ "$MODE" = "--dev" ]; then
  echo "→ Starting sales webapp (dev) on :3000…"
  ( cd "$ROOT/prospect-flow" && nohup npm run dev \
      > "$ROOT/prospect-flow/webapp.log" 2>&1 & )
else
  echo "→ Building sales webapp (production)…"
  ( cd "$ROOT/prospect-flow" && npm run build )
  echo "→ Starting sales webapp on :3000…"
  ( cd "$ROOT/prospect-flow" && nohup npm run start \
      > "$ROOT/prospect-flow/webapp.log" 2>&1 & )
fi

echo "→ Waiting for both to come up…"
for _ in $(seq 1 40); do
  b=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/audio-config 2>/dev/null || echo 000)
  w=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$b" = "200" ] && [ "$w" = "200" ] && break
  sleep 1
done

echo ""
echo "  ✓ Sales monitor  →  http://localhost:3000"
echo "  ✓ Prospect phone →  http://localhost:8000/phone   (run ./tunnel.sh for mobile)"
echo "  ✓ Backend        →  http://localhost:8000"
echo ""
echo "  Logs: services/server.log · prospect-flow/webapp.log"
echo "  Stop: ./stop.sh"
