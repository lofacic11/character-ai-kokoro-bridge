# Local TTS API contract

The userscript expects a service at `http://127.0.0.1:8880`.

## `GET /health`

Returns `200` JSON:

```json
{"status":"ready","model":"kokoro-82m"}
```

## `POST /speak`

Content type: `application/json`.

```json
{"text":"Hello from Character.AI!","voice":"af_heart","speed":1.0}
```

- `text`: 1–2,000 characters. The browser script refuses longer messages.
- `voice`: default `af_heart` (English).
- `speed`: default `1.0`.

Success: HTTP `200` with binary `audio/wav` response, mono PCM16 at model-generated sample rate (typically 24 kHz). Errors: normal FastAPI HTTP status codes. The userscript requests binary data with Tampermonkey `GM_xmlhttpRequest` and uses `new Audio(blobURL)` to play it.

`POST /stream` is available in the supplied server for other applications but is **not used** by this bridge; Character.AI is read only after its entire reply completes.

The browser console's regular `fetch('http://127.0.0.1:8880/health')` may be blocked by CORS. That alone does not imply the userscript's privileged transport is broken.
