# Experimental expressive audiobook backend (Qwen3-TTS)

This feature is under development in [PR #4](https://github.com/lofacic11/character-ai-kokoro-bridge/pull/4). The main Kokoro installation and `start-kokoro` shortcut are **not replaced**.

## Why this model?

We use [Qwen3-TTS 1.7B CustomVoice](https://github.com/QwenLM/Qwen3-TTS) because its `generate_custom_voice(text, speaker, language, instruct)` API provides *actual style instructions*, instead of only adjusting speech speed. The default speaker `Serena` is used for **both narration and dialogue**. A whisper or a strained delivery is a different instruction with the *same* selected speaker. It may not sound identical to the existing Kokoro voice.

On the user's 8 GB RTX 2070 Super Max-Q, this configuration is **experimental**: the 1.7B model may exceed available VRAM or be slow. We use `torch.float16` and `sdpa` rather than bfloat16/FlashAttention 2 (Turing-compatible). No GPU or audio latency claim is made without a real local benchmark.

## Requirements

- Linux Ubuntu, NVIDIA driver, CUDA-capable PyTorch, supported Python (prefer **Python 3.12**), disk space for the large Qwen model and its dependencies.
- Existing working Kokoro TTS on `127.0.0.1:8880`, retained as fallback.
- Brave/Tampermonkey with the experimental userscript installed; disable previous userscript versions.

## Install (separate environment)

```bash
cd ~/Documents/git/character-ai-kokoro-bridge
git fetch origin
git switch feat/scene-aware-audiobook-v05 || git switch --track origin/feat/scene-aware-audiobook-v05
git pull --ff-only

# If your system's default Python is newer than supported:
PYTHON_BIN=python3.12 bash scripts/install-expressive.sh
```

The installer creates `~/.local/share/character-ai-expressive-tts/.venv`. It does **not** alter `~/AI/tts/kokoro`, your existing Python venv or the original `start-kokoro` shortcut.

Depending on your Python/Torch packages, CUDA-enabled PyTorch may need additional setup. Inspect `torch.cuda.is_available()` from the expressive venv before continuing. Model weights download when the first synthesis is requested; allow ample disk space and download time. The first request may exceed the browser timeout; retry after the download finishes.

## Start both APIs in separate terminals

Terminal 1, fallback:

```bash
start-kokoro
```

Terminal 2, expressive:

```bash
cd ~/Documents/git/character-ai-kokoro-bridge
bash scripts/start-expressive.sh
```

In a third terminal, inspect API readiness (this does not preload the model):

```bash
curl -fsS http://127.0.0.1:8881/health
```

To trigger and benchmark the first inference and model download manually, run:

```bash
curl --max-time 600 -fSs -X POST http://127.0.0.1:8881/speak \
  -H 'Content-Type: application/json' \
  -d '{"text":"Please, stay with me.","kind":"dialogue","direction":"soft"}' \
  -o /tmp/qwen-rp-test.wav
```

Then play it using your audio player, for example `ffplay -autoexit /tmp/qwen-rp-test.wav` if installed. Compare `soft`, `strained`, `urgent`, and `neutral` by changing the direction in the request.

## Use in Tampermonkey

Import the branch's **`character-ai-kokoro.user.js`** into Tampermonkey and disable all old copies. With both servers running, the userscript sends speech to Qwen on `127.0.0.1:8881`, with its `kind` (`narration` or `dialogue`) and `direction`. If Qwen fails, it retries the affected segment through Kokoro at `127.0.0.1:8880`, retaining original playback order. After a Qwen failure it attempts Kokoro directly for 60 seconds, then tries Qwen again.

You can force the stable voice by setting `USE_EXPRESSIVE = false` at the top of the userscript.

**Important limitations:**

- This backend provides *style-conditioned speech*, not guaranteed emotional realism or natural breath/gasp effects.
- Stage directions like `*She gasps*` are currently narrated. There is no separate nonverbal audio generator yet.
- A fallback segment uses a different timbre (`af_heart`) than Qwen's `Serena`.
- The parser relies on RP markup and heuristic cues. It does not correctly interpret all literary constructions.
- Model loading and inference can require substantial VRAM; the existing 8 GB GPU is not confirmed sufficient.
- **All voice synthesis runs locally** after model files are downloaded. Bind both servers to `127.0.0.1` only; neither API includes authentication.

## If it fails

1. Run `~/.local/share/character-ai-expressive-tts/.venv/bin/python -c 'import torch; print(torch.cuda.is_available()); print(torch.__version__)'`.
2. If the first request fails while downloading weights, inspect the server terminal and try again once downloads finish.
3. For CUDA OOM, close other GPU-heavy programs, stop the Qwen server, and use Kokoro. Do not set global environment variables that change the existing Kokoro runtime.
4. For user-facing speech and to isolate failures, set `USE_EXPRESSIVE = false` in Tampermonkey; no restart of Kokoro is needed.
5. Gather browser console `[c.ai Audiobook]` logs and the expressive server terminal output without private chat transcripts.
