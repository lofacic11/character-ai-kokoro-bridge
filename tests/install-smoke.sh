#!/usr/bin/env bash
# Simulate a pre-existing Kokoro installation; never use network or apt.
set -Eeuo pipefail
BASE="$(pwd)"
TMP="$(mktemp -d)"
cleanup() {
  if [[ -f "$TMP/home/.local/share/character-ai-kokoro/server.pid" ]]; then
    kill "$(cat "$TMP/home/.local/share/character-ai-kokoro/server.pid")" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
export HOME="$TMP/home" KOKORO_PORT=18880
mkdir -p "$HOME/AI/tts/kokoro/.venv/bin" "$TMP/bin"
cat > "$HOME/AI/tts/kokoro/.venv/bin/uvicorn" <<'MOCK'
#!/usr/bin/env bash
exec -a "uvicorn server:app --host 127.0.0.1 --port 18880" sleep 300
MOCK
chmod +x "$HOME/AI/tts/kokoro/.venv/bin/uvicorn"
printf '# mock server\n' > "$HOME/AI/tts/kokoro/server.py"
printf 'mock\n' > "$HOME/AI/tts/kokoro/kokoro-v1.0.onnx"
printf 'mock\n' > "$HOME/AI/tts/kokoro/voices-v1.0.bin"
cat > "$TMP/bin/curl" <<'MOCK'
#!/usr/bin/env bash
pidfile="$HOME/.local/share/character-ai-kokoro/server.pid"
if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
  printf '{"status":"ready","model":"kokoro-82m"}\n'
else
  exit 7
fi
MOCK
cat > "$TMP/bin/ss" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
chmod +x "$TMP/bin/curl" "$TMP/bin/ss"
export PATH="$TMP/bin:$PATH"
bash "$BASE/install.sh"
PID1="$(cat "$HOME/.local/share/character-ai-kokoro/server.pid")"
[[ -f "$HOME/.local/share/character-ai-kokoro/character-ai-kokoro.user.js" ]]
[[ -x "$HOME/.local/bin/kokoro-cai" ]]
bash "$BASE/install.sh"
PID2="$(cat "$HOME/.local/share/character-ai-kokoro/server.pid")"
[[ "$PID1" == "$PID2" ]] || { echo 'Duplicate server created'; exit 1; }
bash "$BASE/install.sh" status
bash "$BASE/install.sh" stop
[[ ! -e "$HOME/.local/share/character-ai-kokoro/server.pid" ]]
bash "$BASE/install.sh"
bash "$BASE/install.sh" status
bash "$BASE/install.sh" stop
echo 'Installer repeatability tests: PASS'
