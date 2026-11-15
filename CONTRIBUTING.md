# Contributing

Thanks for improving the Character.AI → Kokoro bridge.

- Test the userscript in a current Chromium/Brave browser against a **new** Character.AI reply.
- Keep the userscript dependency-free, minimize permissions, and retain `127.0.0.1` loopback-only connectivity.
- Avoid undocumented Character.AI API calls and never require session tokens.
- Describe the reproduction steps for bugs, including Character.AI DOM selector counts, browser/version, server response and console errors.
- Do not include private conversation text, authentication cookies or personal information in issues or PRs.
- Validate syntax with `node --check character-ai-kokoro.user.js` and `python -m py_compile server.py`.
