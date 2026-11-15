# Troubleshooting

## No button in Character.AI

In Brave, open `brave://extensions` → Tampermonkey → Details → **Allow User Scripts**. Confirm the script is enabled, Tampermonkey has `character.ai` site access, and reload the chat.

## Button shows, but no audio

1. Start the server: `cd ~/AI/tts/kokoro && source .venv/bin/activate && uvicorn server:app --host 127.0.0.1 --port 8880`.
2. Check `http://127.0.0.1:8880/health` returns HTTP 200.
3. Click **Test voice** in the Character.AI overlay.
4. Look for `POST /speak` in the server terminal and `[c.ai Kokoro]` errors in the Brave console (`Ctrl+Shift+J`).
5. If audio is blocked, interact with the page once and retry.

## Test voice works, but character replies stay silent

The service and audio path work. Check the page DOM: the script currently expects `#chat-messages` containing `div.group` rows and a character-aligned `[data-testid="completed-message"]` with a `.prose` descendant. Character.AI may change those selectors at any time. A new message must be sent after the script is loaded; history is intentionally ignored.

## CORS on plain browser `fetch`

A manual `fetch()` from `https://character.ai` to localhost may fail with a CORS error because the FastAPI server does not expose the required headers. The userscript uses `GM_xmlhttpRequest` with `@connect 127.0.0.1`; test via the **Test voice** button rather than a plain page fetch.

## Long response ignored

The v0.3 script sends one request for each completed reply and refuses messages longer than 2,000 characters. This avoids truncation and unexpected synthesis splitting. To support longer replies, change both the server input validation and browser length limit after testing model stability.

## Two voices playing

Keep just one enabled instance of the userscript in Tampermonkey. Disable v0.1 and v0.2.

## Debugging without exposing private chats

Share console error messages, DOM selectors and counts, HTTP status and Python tracebacks. Do not publish your chat content, cookies, access tokens, or full browser HTML dumps in public issues.
