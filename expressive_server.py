"""Local Qwen3-TTS expressive bridge for Character.AI audiobook mode.

Run on 127.0.0.1:8881 in a separate virtual environment. Kokoro remains on 8880.
Model loads lazily on first request; startup only checks dependencies.
"""
import asyncio
import io
import os
import wave
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
SPEAKER = os.getenv("QWEN_TTS_SPEAKER", "serena").strip().lower()
INFERENCE_LOCK = asyncio.Lock()
_model = None

DIRECTIONS = {
    "neutral": "Speak naturally, clear and engaging, like an audiobook narrator.",
    "soft": "Speak softly in a low, gentle whisper with intimate, breathy delivery.",
    "strained": "Speak in a weak, breathless, tense and strained voice, with hesitant pauses.",
    "urgent": "Speak urgently and emotionally, with intense energy and rising tension.",
}
NARRATION = "Narrate this passage with natural audiobook pacing and vivid but controlled expression."


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    kind: str = Field(default="narration", pattern="^(narration|dialogue)$")
    direction: str = Field(default="neutral", pattern="^(neutral|soft|strained|urgent)$")
    # Same schema as Kokoro for compatibility. Qwen controls delivery by instruction.
    voice: str = Field(default="af_heart", max_length=64)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


def instruction(kind: str, direction: str) -> str:
    return DIRECTIONS[direction] if kind == "dialogue" else NARRATION


def _load_model():
    global _model
    if _model is None:
        if not torch.cuda.is_available():
            raise RuntimeError("Qwen expressive mode requires CUDA. Start Kokoro instead.")
        from qwen_tts import Qwen3TTSModel
        # Turing RTX GPUs do not support bfloat16. float16 + SDPA is the portable option.
        _model = Qwen3TTSModel.from_pretrained(
            MODEL_ID,
            device_map="cuda:0",
            dtype=torch.float16,
            attn_implementation="sdpa",
        )
        speakers = _model.get_supported_speakers()
        if SPEAKER not in speakers:
            _model = None
            raise RuntimeError(f"Unsupported speaker {SPEAKER!r}. Available: {speakers}")
    return _model


def _wav_bytes(samples, rate: int) -> bytes:
    clipped = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(int(rate))
        file.writeframes((clipped * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def _synthesize(request: SpeechRequest):
    model = _load_model()
    waveforms, rate = model.generate_custom_voice(
        text=request.text,
        language="English",
        speaker=SPEAKER,
        instruct=instruction(request.kind, request.direction),
    )
    return _wav_bytes(waveforms[0], rate)


app = FastAPI(title="Local Expressive Audiobook TTS")


@app.get("/health")
def health():
    return {
        "status": "ready",
        "engine": "qwen3-tts",
        "model": MODEL_ID,
        "loaded": _model is not None,
        "cuda": bool(torch.cuda.is_available()),
        "speaker": SPEAKER,
    }


@app.post("/speak")
async def speak(request: SpeechRequest):
    try:
        async with INFERENCE_LOCK:
            output = await asyncio.to_thread(_synthesize, request)
    except RuntimeError as exc:
        # Fail safely and clearly; browser will retry the same segment via Kokoro.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Expressive inference failed: {type(exc).__name__}") from exc
    return Response(output, media_type="audio/wav")
