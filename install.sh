#!/usr/bin/env bash
set -Eeuo pipefail
REPO_URL="https://github.com/lofacic11/character-ai-kokoro-bridge.git"
BOOTSTRAP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/character-ai-kokoro-bridge"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/character-ai-kokoro"
RUNTIME_DIR="$APP_DIR/runtime"
BIN_DIR="$HOME/.local/bin"
MODEL_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx"
VOICES_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"
PORT="${KOKORO_PORT:-8880}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid port" >&2; exit 1; }
HEALTH="http://127.0.0.1:$PORT/health"
COMMAND="${1:-start}"
say() { printf '[kokoro-cai] %s\n' "$*"; }
die() { printf '[kokoro-cai] ERROR: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
Usage: kokoro-cai [start|stop|restart|status|help]
 start    Install missing dependencies then start the local API.
 stop     Stop a launcher-managed server.
 restart  Stop and start the server.
 status   Check the local server's health.
On reruns this script reuses the existing installation.
Brave and Tampermonkey setup must be completed manually.
HELP
}
case "$COMMAND" in start|stop|restart|status|help|-h|--help) ;; *) usage; die "Unknown command: $COMMAND" ;; esac
if [[ "$COMMAND" == help || "$COMMAND" == -h || "$COMMAND" == --help ]]; then usage; exit 0; fi

SOURCE_DIR=""
if [[ -f "${BASH_SOURCE[0]}" ]]; then
  SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fi
# Bootstrap when used as a curl | bash one-liner.
if [[ "$COMMAND" == start || "$COMMAND" == restart ]]; then
  if [[ ! -f "$SOURCE_DIR/server.py" || ! -f "$SOURCE_DIR/requirements.txt" || ! -f "$SOURCE_DIR/character-ai-kokoro.user.js" ]]; then
    command -v git >/dev/null || die 'git required: sudo apt install git'
    if [[ ! -d "$BOOTSTRAP_DIR/.git" ]]; then
      [[ ! -e "$BOOTSTRAP_DIR" ]] || die "Existing non-Git directory: $BOOTSTRAP_DIR"
      mkdir -p "$(dirname "$BOOTSTRAP_DIR")"
      git clone --depth 1 "$REPO_URL" "$BOOTSTRAP_DIR"
    fi
    exec bash "$BOOTSTRAP_DIR/install.sh" "$COMMAND"
  fi
fi
mkdir -p "$APP_DIR"
PID_FILE="$APP_DIR/server.pid"
LOG_FILE="$APP_DIR/server.log"
RUNTIME_RECORD="$APP_DIR/runtime.path"
health() { curl --max-time 2 -fsS "$HEALTH" 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"ready"'; }
tracked_pid() { [[ -f "$PID_FILE" ]] && cat "$PID_FILE" || true; }
valid_pid() { local pid="$1"; [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; }
stop_server() {
  local pid; pid="$(tracked_pid)"
  if [[ -z "$pid" ]]; then say 'No managed server PID found.'; return; fi
  if ! valid_pid "$pid"; then rm -f "$PID_FILE"; say 'Removed stale PID file.'; return; fi
  local commandline=""
  [[ -r "/proc/$pid/cmdline" ]] && commandline="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
  if [[ "$commandline" != *uvicorn*server:app* ]] || [[ "$commandline" != *"--port $PORT"* ]]; then
    die "PID $pid is not the expected Uvicorn server; refusing to stop it."
  fi
  kill "$pid"
  for _ in {1..30}; do
    if ! valid_pid "$pid"; then break; fi
    sleep 0.1
  done
  rm -f "$PID_FILE"
  say "Stopped managed server ($pid)."
}
if [[ "$COMMAND" == status ]]; then
  command -v curl >/dev/null || die 'curl required for status'
  if health; then say "Kokoro is healthy: $HEALTH"; else say "No healthy Kokoro server at $HEALTH"; exit 1; fi
  exit 0
fi
if [[ "$COMMAND" == stop ]]; then stop_server; exit 0; fi
if [[ "$COMMAND" == restart ]]; then stop_server; fi
command -v curl >/dev/null || die 'curl required: sudo apt install curl'
if health; then
  say "Kokoro is already running: $HEALTH"
  if [[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/character-ai-kokoro.user.js" ]]; then
    cp "$SOURCE_DIR/character-ai-kokoro.user.js" "$APP_DIR/character-ai-kokoro.user.js"
  fi
  say "Userscript: $APP_DIR/character-ai-kokoro.user.js"
  exit 0
fi
if command -v ss >/dev/null && ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q LISTEN; then
  die "Port $PORT occupied, but Kokoro health check failed."
fi
LEGACY_DIR="$HOME/AI/tts/kokoro"
if [[ -f "$RUNTIME_RECORD" ]]; then
  RUNTIME_DIR="$(cat "$RUNTIME_RECORD")"
elif [[ -x "$LEGACY_DIR/.venv/bin/uvicorn" && -f "$LEGACY_DIR/server.py" && -s "$LEGACY_DIR/kokoro-v1.0.onnx" && -s "$LEGACY_DIR/voices-v1.0.bin" ]]; then
  RUNTIME_DIR="$LEGACY_DIR"
  say "Reusing existing Kokoro environment: $RUNTIME_DIR"
fi
ready_runtime() {
  [[ -x "$RUNTIME_DIR/.venv/bin/uvicorn" && -f "$RUNTIME_DIR/server.py" && -s "$RUNTIME_DIR/kokoro-v1.0.onnx" && -s "$RUNTIME_DIR/voices-v1.0.bin" ]]
}
if ! ready_runtime; then
  [[ "$RUNTIME_DIR" == "$APP_DIR/runtime" ]] || die "Existing runtime incomplete: $RUNTIME_DIR"
  command -v apt-get >/dev/null || die 'Automatic installation requires apt on Ubuntu/Debian'
  say 'Installing Ubuntu dependencies (sudo may prompt)...'
  sudo apt-get update
  sudo apt-get install -y python3-venv python3-pip espeak-ng libespeak-ng1 libsndfile1 ca-certificates curl git
  command -v python3 >/dev/null || die 'python3 missing'
  PYTHON_BIN="$(command -v python3.12 || command -v python3)"
  mkdir -p "$RUNTIME_DIR"
  if [[ ! -x "$RUNTIME_DIR/.venv/bin/python" ]]; then
    "$PYTHON_BIN" -m venv "$RUNTIME_DIR/.venv"
  fi
  "$RUNTIME_DIR/.venv/bin/python" -m pip install -r "$SOURCE_DIR/requirements.txt"
  cp "$SOURCE_DIR/server.py" "$RUNTIME_DIR/server.py"
  download() {
    local url="$1" target="$2" minimum="$3" tmp="$2.part"
    if [[ -f "$target" ]] && (( $(stat -c%s "$target") >= minimum )); then return; fi
    rm -f "$tmp"
    curl --fail --location --retry 3 --output "$tmp" "$url"
    local size; size="$(stat -c%s "$tmp")"
    if (( size < minimum )); then rm -f "$tmp"; die "Incomplete download: $target ($size bytes)"; fi
    mv -f "$tmp" "$target"
  }
  say 'Downloading Kokoro model and voices if missing...'
  download "$MODEL_URL" "$RUNTIME_DIR/kokoro-v1.0.onnx" 100000000
  download "$VOICES_URL" "$RUNTIME_DIR/voices-v1.0.bin" 10000000
fi
printf '%s\n' "$RUNTIME_DIR" > "$RUNTIME_RECORD"
if [[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/character-ai-kokoro.user.js" ]]; then
  cp "$SOURCE_DIR/character-ai-kokoro.user.js" "$APP_DIR/character-ai-kokoro.user.js"
fi
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/kokoro-cai" <<EOF
#!/usr/bin/env bash
exec bash "${SOURCE_DIR:-$BOOTSTRAP_DIR}/install.sh" "\$@"
EOF
chmod +x "$BIN_DIR/kokoro-cai"
say "Starting Uvicorn (logs: $LOG_FILE)..."
(
 cd "$RUNTIME_DIR"
 nohup "$RUNTIME_DIR/.venv/bin/uvicorn" server:app --host 127.0.0.1 --port "$PORT" >> "$LOG_FILE" 2>&1 < /dev/null &
 echo $! > "$PID_FILE"
)
for _ in {1..50}; do
  if health; then
    say "Kokoro ready: $HEALTH"
    say "Run again: $BIN_DIR/kokoro-cai"
    say "Stop: $BIN_DIR/kokoro-cai stop"
    say "Tampermonkey import file: $APP_DIR/character-ai-kokoro.user.js"
    exit 0
  fi
  if ! valid_pid "$(tracked_pid)"; then break; fi
  sleep 0.2
done
say 'Server startup failed. Recent logs:'
tail -n 30 "$LOG_FILE" >&2 || true
exit 1
