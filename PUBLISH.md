# Publish to GitHub

The GitHub connector currently cannot create a new repository, but you can publish this package directly from Ubuntu using GitHub CLI.

1. Install: `sudo apt install gh git`
2. Authenticate: `gh auth login` (follow the browser/device flow; do not share tokens).
3. Open the extracted project directory: `cd character-ai-kokoro-bridge`
4. Run:

```bash
git init -b main
git add .
git commit -m "Initial release: Character.AI Kokoro bridge v0.3.0"
gh repo create character-ai-kokoro-bridge --public --source=. --remote=origin --push --description "Automatic local Kokoro TTS for completed Character.AI replies"
```

This creates a **public** repository on your authenticated GitHub account, commits the packaged files, sets `origin`, and pushes `main`. For private publication, use `--private` instead of `--public`.

To upload a release asset later:

```bash
git tag v0.3.0
git push origin v0.3.0
gh release create v0.3.0 dist/character-ai-kokoro-v0.3.zip --title "v0.3.0" --notes "Complete-reply synthesis, interruption, local Kokoro integration and basic controls."
```
