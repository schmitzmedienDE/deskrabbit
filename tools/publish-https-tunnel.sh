#!/usr/bin/env bash
# Publish DeskRabbit over a public HTTPS URL so R1 getUserMedia works.
# Requires: local HTTP server on DR_PORT (default 8790) + tunnelmole (`npm i -g tunnelmole`).
#
# Usage:
#   python3 -m http.server 8790 --bind 0.0.0.0
#   ./tools/publish-https-tunnel.sh
# Then re-scan the QR on the R1 (creation.json updated).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DR_PORT:-8790}"
cd "$ROOT"

if ! command -v tmole >/dev/null 2>&1; then
  echo "Install tunnelmole: npm install -g tunnelmole" >&2
  exit 1
fi

echo "Starting tunnelmole for port $PORT (leave running)…"
# tmole prints https://….tunnelmole.net — capture first HTTPS URL
LOG="$(mktemp)"
tmole "$PORT" 2>&1 | tee "$LOG" &
TPID=$!
URL=""
for _ in $(seq 1 40); do
  URL="$(rg -o 'https://[a-zA-Z0-9.-]+' "$LOG" | head -1 || true)"
  if [ -n "$URL" ]; then break; fi
  sleep 0.5
done
if [ -z "$URL" ]; then
  echo "Could not parse HTTPS URL from tunnelmole" >&2
  kill "$TPID" 2>/dev/null || true
  exit 1
fi
export DR_PUBLIC_BASE="$URL"
node tools/sync-qr.cjs
echo "Tunnel PID $TPID — keep this process alive while testing on R1."
echo "Install: ${URL}/install.html"
wait "$TPID"
