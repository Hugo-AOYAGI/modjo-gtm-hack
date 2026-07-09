#!/usr/bin/env bash
#
# Expose the backend (:8000) over HTTPS so the prospect phone works on mobile.
# The prospect phone page is then:  https://<your-ngrok-url>/phone
#
# Runs in the foreground — keep this terminal open during the demo.
set -uo pipefail

NGROK="$(command -v ngrok 2>/dev/null || true)"
if [ -z "$NGROK" ]; then
  NGROK="$HOME/AppData/Local/Microsoft/WinGet/Packages/Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe/ngrok.exe"
fi
if [ ! -f "$NGROK" ] && ! command -v ngrok >/dev/null 2>&1; then
  echo "✗ ngrok not found. Install it and run: ngrok config add-authtoken <token>"
  exit 1
fi

echo "→ Tunnelling http://localhost:8000 …"
echo "  Once up, open  https://<url-shown-below>/phone  on the phone."
echo ""
exec "$NGROK" http 8000
