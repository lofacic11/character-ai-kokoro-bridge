#!/usr/bin/env bash
# Install/update the start-kokoro command. Does not start the server.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE="$SCRIPT_DIR/start-kokoro.sh"
DEST="$HOME/.local/bin/start-kokoro"
[[ -f "$SOURCE" ]] || { echo "Missing $SOURCE" >&2; exit 1; }
mkdir -p "$HOME/.local/bin"
cp "$SOURCE" "$DEST"
chmod 755 "$DEST"
# Append a PATH entry only once for interactive Bash sessions.
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
if [[ ! -f "$HOME/.bashrc" ]] || ! grep -Fqx "$PATH_LINE" "$HOME/.bashrc"; then
  printf "\n%s\n" "$PATH_LINE" >> "$HOME/.bashrc"
  echo "PATH updated in ~/.bashrc; run source ~/.bashrc or open a new terminal."
fi
echo "Installed $DEST"
echo "Run: start-kokoro (or $DEST)"
