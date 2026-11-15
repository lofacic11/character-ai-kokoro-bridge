#!/usr/bin/env bash
set -Eeuo pipefail
BASE="$(pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home"
mkdir -p "$HOME/AI/tts/kokoro/.venv/bin" "$TMP/bin"
printf "placeholder\n" > "$HOME/AI/tts/kokoro/server.py"
printf "# mocked activation\n" > "$HOME/AI/tts/kokoro/.venv/bin/activate"
printf "#!/bin/sh\nexit 0\n" > "$HOME/AI/tts/kokoro/.venv/bin/uvicorn"
chmod +x "$HOME/AI/tts/kokoro/.venv/bin/uvicorn"
cat > "$TMP/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf '{"status":"ready"}\n'
MOCK
chmod +x "$TMP/bin/curl"
export PATH="$TMP/bin:$PATH"
bash "$BASE/scripts/install-shortcut.sh"
[[ -x "$HOME/.local/bin/start-kokoro" ]]
bash "$BASE/scripts/install-shortcut.sh"
[[ "$(grep -Fc 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc")" -eq 1 ]]
"$HOME/.local/bin/start-kokoro" > "$TMP/output"
grep -q "already running" "$TMP/output"
echo "Shortcut smoke test: PASS"
