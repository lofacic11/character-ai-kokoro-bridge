# Character.AI → Local Kokoro TTS Bridge

A lightweight Tampermonkey userscript that automatically reads **Character.AI replies paragraph by paragraph** aloud using your own **local Kokoro ONNX TTS server**. No Character.AI credentials or unofficial API required.

> **Status:** v0.5.1 experimental audiobook + Qwen3-TTS expressive backend (real GPU/audio validation pending). Tested by the project creator in Brave on Ubuntu with a local Kokoro server. This is an independent, unofficial project; not affiliated with Character.AI or Kokoro.

## Features

- 🔊 Starts synthesizing **complete sentences or paragraphs before the whole reply finishes**; plays generated blocks sequentially while later blocks synthesize.
- 🧠 Uses local Kokoro ONNX TTS; default English voice `af_heart`.
- 🚀 Prefetches up to two audio blocks while keeping playback strictly ordered.
- ⏹️ Interrupts the previous audio when a newer character reply arrives.
- 🔁 Ignores already-loaded chat history to avoid speaking old messages.
- 🎛️ On/off, **Test voice**, and **Stop** controls in the browser.
- 🔒 Talks only to your local `127.0.0.1:8880` server.

## One-command Ubuntu installation

For a fresh Ubuntu system, with `git` and `curl` installed, run:

```bash
curl -fsSL https://raw.githubusercontent.com/lofacic11/character-ai-kokoro-bridge/main/install.sh | bash
```

**Review the script before running downloaded shell code:** [install.sh](install.sh). The installer clones this repository into `~/.local/share/character-ai-kokoro-bridge`, installs Ubuntu libraries and a Python virtual environment if needed, downloads Kokoro model assets (approximately 340 MB), and starts the loopback-only server. It may prompt for your sudo password to install system dependencies. It **reuses** an existing complete `~/AI/tts/kokoro` setup and never overwrites its `server.py`.

Re-running the same command starts the service if stopped; if healthy it avoids launching another server. A shortcut command is also installed at `~/.local/bin/kokoro-cai`:

```bash
~/.local/bin/kokoro-cai           # start / reuse
~/.local/bin/kokoro-cai status    # check API
~/.local/bin/kokoro-cai stop      # stop only launcher-managed process
~/.local/bin/kokoro-cai restart   # restart the managed process
```

If you already manually started the server, stop it with Ctrl+C before using `restart`. The launcher does not kill processes it doesn't manage. Server logs: `~/.local/share/character-ai-kokoro/server.log`. Check `http://127.0.0.1:8880/health`.

If `git` or `curl` is not available, install those first using `sudo apt install git curl`. You can alternatively clone and inspect the repository and run `bash install.sh` from the clone. For full details see [installation guide](docs/INSTALL.md) and [manual server setup](docs/SERVER-SETUP.md).

## Optional foreground launcher: `start-kokoro`

For users who prefer the original interactive server workflow (`cd ~/AI/tts/kokoro && source .venv/bin/activate && uvicorn server:app --host 127.0.0.1 --port 8880`), the installer now also creates a **`start-kokoro`** shortcut.

```bash
start-kokoro                     # run Uvicorn in the current terminal
# Press Ctrl+C to stop.
```

The launcher selects your existing `~/AI/tts/kokoro` runtime or the installer-created runtime, activates its virtual environment and starts the local API on port 8880. It checks for an already healthy service before starting another instance. To verify the shortcut:

```bash
command -v start-kokoro
curl -fsS http://127.0.0.1:8880/health
```

If your shell says `start-kokoro: command not found`, open a new terminal or run `source ~/.bashrc`. If your copy says `Permission denied`, run `chmod +x ~/.local/bin/start-kokoro` (or reinstall the shortcut). The reusable setup helper is `bash scripts/install-shortcut.sh`, which safely copies the shortcut to `~/.local/bin`, enables execute permission and adds that directory to `~/.bashrc` once.

**Choose one startup mode:** `start-kokoro` runs in the foreground until Ctrl+C, whereas `kokoro-cai` runs in the background. If a server was manually started already, `kokoro-cai stop` will not kill it. See [installation instructions](docs/INSTALL.md#interactive-foreground-start-kokoro-shortcut).

## Brave extension and userscript import (required once)

The shell installer **cannot install or enable browser extensions**. Complete these browser-side steps:

1. Install **[Tampermonkey](https://www.tampermonkey.net/)** from the Chrome Web Store into **Brave**. No second extension is required.
2. In Brave open `brave://extensions` → **Tampermonkey** → **Details** → enable **Allow User Scripts**. Allow Tampermonkey **site access** on `character.ai`.
3. Click Tampermonkey → **Dashboard** → **Utilities** → **Import from file**. Select:
   `~/.local/share/character-ai-kokoro/character-ai-kokoro.user.js`
   (this file is placed by the installer). Alternatively download [the userscript](character-ai-kokoro.user.js) from GitHub and import it.
4. On the Tampermonkey confirmation page select **Install**. Disable any older copies of the bridge to prevent double playback.
5. Reload [Character.AI](https://character.ai/). Click **Test voice**, then send a message and let the character reply.

The imported userscript runs in Brave; **the Python service runs locally on your laptop**. If the Tampermonkey button appears but nothing plays, inspect Brave's console (`Ctrl+Shift+J`) and see [troubleshooting](docs/TROUBLESHOOTING.md). Keep the service bound to `127.0.0.1`; don't expose it on your network.

## How it works

```text
Character.AI streaming reply
  complete sentence followed by next text → synthesize that sentence
  new paragraph begins → synthesize previous paragraph
  following speech blocks → synthesize while prior audio plays
  unfinished last sentence → wait for completed-message + 650 ms
     → synthesize the remaining text
  playback queue → always play in original order
```

The bridge polls `#chat-messages` every 180 ms and identifies bot messages using the known message alignment and `data-testid` structure. A paragraph break or sentence-ending punctuation followed by more text marks a safe synthesis boundary. The unfinished tail waits until the complete reply settles for 650 ms. Multiple active synthesis requests are capped at **two**. A reply with no punctuation or paragraph break still waits for completion.

**Playback and synthesis are independent:** audio begins as soon as the first block is ready, while the next block may still be generating. Browser playback is serialized to avoid overlapping voices. If a new character reply is detected, playback stops immediately and the bridge discards stale responses. The Kokoro server uses a synthesis lock, so requests are generated sequentially server-side; a cancelled HTTP request may still occupy CPU briefly.

Long blocks exceeding the server's 2,000-character limit are split at word boundaries. Already loaded history is ignored, and no login credentials are collected.

**Limitations:** Character.AI's HTML can change. The app does not necessarily expose every paragraph boundary early. Brief pauses can occur if the next paragraph has not finished generating by the time the previous audio ends. This is sentence/paragraph-level pipelining, not true low-latency phoneme streaming. Character.AI may revise earlier text, forcing a queue reset. The project is unofficial and should be used in accordance with applicable website terms.

## v0.5 audiobook preview (experimental feature branch)

This version introduces a **single-voice audiobook pipeline** for Character.AI roleplay messages. The **same Kokoro voice** reads both `*stage directions*` and quoted dialogue, but they are queued as separate speech segments.

A line such as:

```text
*She takes a breath.* "Don't leave." *She whispers in a low voice.*
```

is queued as narration → dialogue → narration. The following `*whispers*` cue applies to the preceding dialogue; the narrator segments retain neutral pacing. Recognized narration cues (whispers, groans, jagged breathing, shouting, etc.) also carry over to later dialogue until a new direction is detected. Roleplay vocalizations such as `mhm`, `mmff`, and `nghh` are normalized before synthesis.

**What it can do now:** preserve the spoken narrative, avoid saying literal asterisks or quotation marks, detect basic voice directions, adjust **speech speed** in Kokoro requests, and delay quoted lines until a following stage direction can be read. Existing audio prefetch/playback ordering and interruption are preserved.

**Expressive backend now available (experimental):** The opt-in [Qwen3-TTS backend](docs/EXPRESSIVE-TTS.md) adds actual per-line voice-direction instructions using a stable Qwen speaker for narration and dialogue. It runs in a separate Python environment on port `8881`; the existing Kokoro service on `8880` is retained for fallback. Kokoro by itself still only adjusts speed; neither engine guarantees realistic grunts or gasps. On an 8 GB NVIDIA GPU, the expressive model's performance and ability to fit in VRAM require real testing.

**Latency tradeoff:** with RP markup, the bridge waits for the closing `*...` stage direction before committing a quoted line. This can make dialogue start later than v0.4.1 but avoids speaking it before a trailing voice instruction arrives. Without RP markup, normal sentence pipelining is retained.

**Testing on a separate branch:**

```bash
cd ~/Documents/git/character-ai-kokoro-bridge
git fetch origin
git switch --track origin/feat/scene-aware-audiobook-v05
node --test tests/*.test.cjs
start-kokoro
```

Import the branch's `character-ai-kokoro.user.js` into Tampermonkey and disable the previous script first. The `start-kokoro` launcher itself does not need to be updated. For reliable A/B comparison, keep the old userscript disabled while testing. Main remains stable.

## Optional expressive Qwen3-TTS engine

For actual style-conditioned dialogue (soft whisper, strained breathing, urgent delivery) install the separate [Qwen3-TTS expressive backend](docs/EXPRESSIVE-TTS.md). **This is opt-in; it does not replace Kokoro or require updating your `start-kokoro` shortcut.**

The userscript in this experimental branch prefers the Qwen API on `127.0.0.1:8881` and automatically falls back to Kokoro on `127.0.0.1:8880` if Qwen is not available. Both narration and dialogue use the same Qwen speaker (default: Serena), with different natural-language delivery prompts. Qwen may be too memory-intensive for an 8 GB GPU. `USE_EXPRESSIVE = false` at the top of the userscript forces Kokoro.

## Development and tests

Run `node --check character-ai-kokoro.user.js` for JavaScript syntax validation, and `node --test tests/*.test.cjs` for the mocked DOM/playback regression suite. Tests cover early paragraph and sentence generation, ordered playback, single-paragraph completion, interruption, and Test voice. Manual testing in Brave with Character.AI and Kokoro remains necessary.

## Configuration

At the top of the userscript body, edit:

```js
const ENDPOINT = 'http://127.0.0.1:8880/speak';
const VOICE = 'af_heart';
```

Voice examples include `af_heart`, `af_bella`, `am_michael`, and `am_adam` (availability depends on your voice pack).

## Troubleshooting

| Symptom | Check |
|---|---|
| No overlay | Tampermonkey enabled, Allow User Scripts enabled, script matches `character.ai`, reload page |
| Test voice fails | Kokoro service running, `GET /health`, browser console logs, Tampermonkey `@connect 127.0.0.1` |
| Test voice works, auto voice fails | Character.AI markup changed; inspect `#chat-messages` and `data-testid` message elements |
| Nothing on `http://127.0.0.1:8880/` | Expected: FastAPI root `/` is not defined; use `/health` or `/docs` |
| Browser `fetch` gets CORS error | The bridge uses `GM_xmlhttpRequest`, not ordinary page `fetch`; plain console `fetch` is not a reliable test |
| Reply silently skipped | Check browser console for message selectors and Kokoro request errors |
| Two voices overlap | Disable older bridge versions in Tampermonkey |

More details: [troubleshooting](docs/TROUBLESHOOTING.md).

## Privacy and security

- Text is sent from the browser to a **loopback-only** (`127.0.0.1`) service, not a hosted TTS API.
- Keep the FastAPI server bound to `127.0.0.1`. Do **not** expose this unauthenticated endpoint to a network.
- The script runs on `character.ai` and has permission to connect only to `127.0.0.1`.
- A page-level `fetch` may fail CORS by design; the userscript uses Tampermonkey's privileged transport.
- Use responsibly and follow the website's applicable terms.

## Contributing

Issues and PRs are welcome. Please avoid sharing private conversations, session tokens, or personal data in logs/issues. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
