#!/usr/bin/env bash
# Start Kokoro in the foreground; Ctrl+C stops it.
set -Eeuo pipefail
PORT="${KOKORO_PORT:-8880}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid KOKORO_PORT" >&2; exit 1; }
HEALTH="http://127.0.0.1:$PORT/health"
RECORD="${XDG_DATA_HOME:-$HOME/.local/share}/character-ai-kokoro/runtime.path"
LEGACY="$HOME/AI/tts/kokoro"
if [[ -s "$RECORD" ]]; then
  RUNTIME="$(cat "$RECORD")"
elif [[ -f "$LEGACY/server.py" && -x "$LEGACY/.venv/bin/uvicorn" ]]; then
  RUNTIME="$LEGACY"
else
  echo "No Kokoro installation found. Install it first with the project install.sh." >&2
  exit 1
fi
if [[ ! -f "$RUNTIME/server.py" || ! -f "$RUNTIME/.venv/bin/activate" ]]; then
  echo "Kokoro runtime is incomplete: $RUNTIME" >&2
  exit 1
fi
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$HEALTH" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ready"'; then
  echo "Kokoro is already running: $HEALTH"
  exit 0
fi
# A non-Kokoro service on this port must not be overwritten or killed.
if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q LISTEN; then
  echo "Port $PORT is in use, but Kokoro health check failed. Check the other process." >&2
  exit 1
fi
cd "$RUNTIME"
# shellcheck source=/dev/null
source .venv/bin/activate
echo "Starting Kokoro from $RUNTIME"
echo "URL: $HEALTH"
echo "Press Ctrl+C to stop the server."
exec uvicorn server:app --host 127.0.0.1 --port "$PORT"
