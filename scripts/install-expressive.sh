#!/usr/bin/env bash
# One-time opt-in install of expressive Qwen TTS in its own Python environment.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/character-ai-expressive-tts"
PYTHON="${PYTHON_BIN:-python3}"
command -v "$PYTHON" >/dev/null || { echo "Python 3 required" >&2; exit 1; }
mkdir -p "$DEST"
if [[ ! -x "$DEST/.venv/bin/python" ]]; then
  "$PYTHON" -m venv "$DEST/.venv"
fi
# Deliberately isolated from the existing Kokoro runtime.
"$DEST/.venv/bin/python" -m pip install --upgrade pip
"$DEST/.venv/bin/python" -m pip install -r "$ROOT/requirements-expressive.txt"
"$DEST/.venv/bin/python" - <<'PY'
import torch
print("PyTorch:", torch.__version__, "CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
else:
    print("WARNING: No CUDA; expressive generation will fail, Kokoro fallback remains available.")
PY
echo "Installed isolated Qwen environment at $DEST"
echo "Model is NOT downloaded yet; it downloads on the first /speak request."
echo "Start it with: bash $ROOT/scripts/start-expressive.sh"
