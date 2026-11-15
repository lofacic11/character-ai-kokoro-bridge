# Character.AI → Local Kokoro TTS Bridge

A lightweight Tampermonkey userscript that automatically reads **completed Character.AI replies** aloud using your own **local Kokoro ONNX TTS server**. No Character.AI credentials or unofficial API required.

> **Status:** v0.3.0. Tested by the project creator in Brave on Ubuntu with a local Kokoro server. This is an independent, unofficial project; not affiliated with Character.AI or Kokoro.

## Features

- 🔊 Reads a complete character reply **after** Character.AI finishes generating it (not sentence-by-sentence).
- 🧠 Uses local Kokoro ONNX TTS; default English voice `af_heart`.
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
6. Open [Character.AI](https://character.ai/), refresh the chat, and click **Test voice**. Then send a new message and wait for the full character reply.

If your browser blocks downloads of `.user.js`, use the archived script in [`dist/`](dist/) and extract it locally.

## How it works

```text
Character.AI DOM (#chat-messages)
   └─ newly added character message
      └─ [data-testid="completed-message"]
         └─ settle for 650 ms
            └─ Tampermonkey GM_xmlhttpRequest POST /speak
               └─ local Kokoro generates WAV
                  └─ browser plays WAV
```

The script polls the DOM every 180 ms, checks message alignment to distinguish characters from users, and waits for a stable completed message. An existing ongoing TTS request/audio is cancelled when a newer character message is detected.

**Limitations:** This bridge depends on Character.AI's current page structure and may break when the website changes. Reply detection only inspects the newest few message groups. Responses longer than 2,000 characters are rejected (not truncated or split), matching the supplied server's input limit. Audio starts only after the entire reply and subsequent local synthesis complete. The script is not an official Character.AI API integration.

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
