# Character.AI → Local Kokoro TTS Bridge

A lightweight Tampermonkey userscript that automatically reads **Character.AI replies paragraph by paragraph** aloud using your own **local Kokoro ONNX TTS server**. No Character.AI credentials or unofficial API required.

> **Status:** v0.4.0 (feature branch). Tested by the project creator in Brave on Ubuntu with a local Kokoro server. This is an independent, unofficial project; not affiliated with Character.AI or Kokoro.

## Features

- 🔊 Starts synthesizing a paragraph **when the next paragraph appears**; plays ready paragraphs in sequence while subsequent paragraphs synthesize. A single paragraph waits for reply completion.
- 🧠 Uses local Kokoro ONNX TTS; default English voice `af_heart`.
- 🚀 Prefetches up to two audio blocks while keeping playback strictly ordered.
- ⏹️ Interrupts the previous audio when a newer character reply arrives.
- 🔁 Ignores already-loaded chat history to avoid speaking old messages.
- 🎛️ On/off, **Test voice**, and **Stop** controls in the browser.
- 🔒 Talks only to your local `127.0.0.1:8880` server.

## Requirements

- Linux (tested on Ubuntu) or another OS with a compatible Kokoro API.
- Brave/Chrome with Tampermonkey and **Allow User Scripts** enabled.
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) and a local FastAPI server compatible with [`docs/API.md`](docs/API.md).
- Your local server must be running at `http://127.0.0.1:8880`.

## Quick start

1. Set up the local TTS server using [Kokoro server setup](docs/SERVER-SETUP.md).
2. Test it: visit `http://127.0.0.1:8880/health` (expect `{ "status": "ready", "model": "kokoro-82m" }`).
3. Install [Tampermonkey](https://www.tampermonkey.net/) in Brave. In `brave://extensions`, open Tampermonkey details and enable **Allow User Scripts**. Permit the extension on `character.ai`.
4. Import [`character-ai-kokoro.user.js`](character-ai-kokoro.user.js) in Tampermonkey (Dashboard → Utilities → Import from file), or paste the source into a new script and save.
5. **Disable previous versions** of this bridge, especially v0.1/v0.2, to prevent duplicate playback.
6. Open [Character.AI](https://character.ai/), refresh the chat, and click **Test voice**. Then send a new message; multi-paragraph replies can start speaking before Character.AI completes the final paragraph.

If your browser blocks downloads of `.user.js`, use the archived script in [`dist/`](dist/) and extract it locally.

## How it works

```text
Character.AI streaming reply
  paragraph 1 completed (paragraph 2 starts)
     → synthesize paragraph 1 immediately
  paragraph 2 completed (paragraph 3 starts)
     → synthesize paragraph 2 while paragraph 1 plays
  final paragraph
     → wait for completed-message + 650 ms settle
     → synthesize final paragraph
  playback queue → always play in original order
```

The bridge polls `#chat-messages` every 180 ms and identifies bot messages using the known message alignment and `data-testid` structure. A paragraph is treated as complete only after a following non-empty paragraph appears, or after the complete reply settles for 650 ms. Multiple active synthesis requests are capped at **two**. A response with no paragraph break still waits for completion.

**Playback and synthesis are independent:** audio begins as soon as the first block is ready, while the next block may still be generating. Browser playback is serialized to avoid overlapping voices. If a new character reply is detected, playback stops immediately and the bridge discards stale responses. The Kokoro server uses a synthesis lock, so requests are generated sequentially server-side; a cancelled HTTP request may still occupy CPU briefly.

Long blocks exceeding the server's 2,000-character limit are split at word boundaries. Already loaded history is ignored, and no login credentials are collected.

**Limitations:** Character.AI's HTML can change. The app does not necessarily expose every paragraph boundary early. Brief pauses can occur if the next paragraph has not finished generating by the time the previous audio ends. This is paragraph-level pipelining, not true low-latency phoneme streaming. The project is unofficial and should be used in accordance with applicable website terms.

## Development and tests

Run `node --check character-ai-kokoro.user.js` for JavaScript syntax validation, and `node --test tests/*.test.cjs` for the mocked DOM/playback regression suite. Tests cover early paragraph generation, ordered playback, single-paragraph completion, interruption, and Test voice. Manual testing in Brave with Character.AI and Kokoro remains necessary.

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
| Reply silently skipped | Check console for the 2,000-character limit or changed DOM selectors |
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
