#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
RUNTIME="${XDG_DATA_HOME:-$HOME/.local/share}/character-ai-expressive-tts"
[[ -x "$RUNTIME/.venv/bin/uvicorn" ]] || { echo "Run: bash $ROOT/scripts/install-expressive.sh" >&2; exit 1; }
cd "$ROOT"
echo "Qwen3-TTS expressive audiobook API: http://127.0.0.1:8881"
echo "First synthesis downloads model weights. Ctrl+C to stop."
exec "$RUNTIME/.venv/bin/uvicorn" expressive_server:app --host 127.0.0.1 --port 8881
