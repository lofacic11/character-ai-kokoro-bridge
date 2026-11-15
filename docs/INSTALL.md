# Installation: Ubuntu + Brave

## Quickest method (one command)

Install `git` and `curl` first if your Ubuntu installation lacks them:

```bash
sudo apt install git curl
```

Review [install.sh](../install.sh), then run:

```bash
curl -fsSL https://raw.githubusercontent.com/lofacic11/character-ai-kokoro-bridge/main/install.sh | bash
```

This command clones the project into `~/.local/share/character-ai-kokoro-bridge`, reuses an existing complete `~/AI/tts/kokoro` installation if found, or installs system libraries, a virtual environment, Kokoro ONNX and voice files in `~/.local/share/character-ai-kokoro/runtime`. It starts a **local-only** FastAPI service on `127.0.0.1:8880`. The model download is roughly 340 MB combined. Sudo may ask for your password when packages need installing. No credentials are needed by the script or the TTS server.

**Run again:** the same one-line command is safe to repeat. It will not start a duplicate server. You can also run:

```bash
~/.local/bin/kokoro-cai start
~/.local/bin/kokoro-cai status
~/.local/bin/kokoro-cai stop
~/.local/bin/kokoro-cai restart
```

Logs are saved to `~/.local/share/character-ai-kokoro/server.log`. The generated userscript is copied to `~/.local/share/character-ai-kokoro/character-ai-kokoro.user.js`.

To install from an inspected local clone instead:

```bash
git clone https://github.com/lofacic11/character-ai-kokoro-bridge.git
cd character-ai-kokoro-bridge
bash install.sh
```

For future source updates, navigate to the clone and run `git pull --ff-only` (the one-liner reuses its existing clone rather than silently upgrading code).

## Interactive foreground `start-kokoro` shortcut

The automatic installer also installs `~/.local/bin/start-kokoro` as an alternative to `kokoro-cai`. This follows the familiar manual workflow:

```bash
cd ~/AI/tts/kokoro
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8880
```

The shortcut locates your runtime automatically, activates the virtual environment and runs Uvicorn in the **foreground**, with logs shown in the terminal. Stop it using **Ctrl+C**.

```bash
start-kokoro
```

If you cloned the repository but already installed Kokoro yourself, install only the shortcut (without reinstalling the model):

```bash
bash scripts/install-shortcut.sh
source ~/.bashrc
start-kokoro
```

The setup copies `scripts/start-kokoro.sh` into `~/.local/bin/start-kokoro`, marks it executable, and adds `~/.local/bin` to `~/.bashrc` without repeating the PATH entry.

Troubleshooting:

- **No such file or directory:** the script was not installed; run `bash scripts/install-shortcut.sh`.
- **Permission denied:** `chmod +x ~/.local/bin/start-kokoro`, or reinstall the shortcut.
- **Command not found:** run `source ~/.bashrc`, open a new terminal, or invoke `~/.local/bin/start-kokoro`.
- **Address already in use:** another service occupies port 8880; check it first with `curl -fsS http://127.0.0.1:8880/health`. Avoid running two Uvicorn processes.
- **Missing Python environment:** run `bash install.sh` first, or finish the manual server setup.

This shortcut and `kokoro-cai` use the same API. `start-kokoro` does **not** set up a systemd service or auto-start at login.

## Required browser setup (cannot be automated safely)

1. Install **Tampermonkey** from [tampermonkey.net](https://www.tampermonkey.net/) / the Chrome Web Store for **Brave**. Brave supports Chrome extensions.
2. Open `brave://extensions`, select **Tampermonkey → Details**, and enable **Allow User Scripts**. Grant Tampermonkey access to `character.ai`. Brave may require **Developer Mode** before the Allow User Scripts setting is visible.
3. Click the Tampermonkey toolbar icon, select **Dashboard**, then **Utilities → Import from file**.
4. Choose `~/.local/share/character-ai-kokoro/character-ai-kokoro.user.js`. In the Linux file picker, expand `~` to your home directory and use Ctrl+H to show the hidden `.local` directory if necessary.
5. Confirm **Install** in Tampermonkey. Disable older versions of this userscript, especially v0.1–0.3.
6. Visit [character.ai](https://character.ai), refresh your chat, and click **Test voice**. You should hear a test sentence. The first complete sentence in new replies should start synthesis before the entire message ends.

**Only one browser extension is needed: Tampermonkey.** The shell script does not install extensions, grant Brave permissions or import the file on your behalf.

## Checking it works

```bash
curl -fsS http://127.0.0.1:8880/health
```

Expected response: `{"status":"ready","model":"kokoro-82m"}`.

If the overlay appears but doesn't speak, open Brave Developer Tools (Ctrl+Shift+J) and check `[c.ai Kokoro]` messages. The Python API will log `POST /speak` requests while the voice is being generated. See [troubleshooting](TROUBLESHOOTING.md).

## Security and limitations

The server is bound to the loopback interface, with no authentication. Do not change its bind address to `0.0.0.0` without adding proper protection. The userscript accesses only Character.AI and `127.0.0.1`; there is no official Character.AI API involved. Respect Character.AI's applicable terms. Linux environments other than Ubuntu/Debian may need a manual setup.
