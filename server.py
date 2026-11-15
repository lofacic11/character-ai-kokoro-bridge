"""Loopback-only Kokoro ONNX speech API for the browser bridge."""

import asyncio
import io
import wave

import numpy as np
from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from kokoro_onnx import Kokoro

app = FastAPI(title="Local Kokoro TTS")
tts = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
synthesis_lock = asyncio.Lock()


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = "af_heart"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


def pcm16(samples):
    return (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()


@app.get("/health")
def health():
    return {"status": "ready", "model": "kokoro-82m"}


@app.post("/speak")
async def speak(req: SpeechRequest):
    async with synthesis_lock:
        audio, rate = await asyncio.to_thread(
            tts.create,
            req.text,
            voice=req.voice,
            speed=req.speed,
            lang="en-us",
        )

    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm16(audio))

    return Response(content=output.getvalue(), media_type="audio/wav")


@app.post("/stream")
async def stream(req: SpeechRequest):
    async def generate():
        async with synthesis_lock:
            async for audio, rate in tts.create_stream(
                req.text, voice=req.voice, speed=req.speed, lang="en-us"
            ):
                yield pcm16(audio)

    return StreamingResponse(
        generate(),
        media_type="application/octet-stream",
        headers={
            "X-Audio-Format": "pcm_s16le",
            "X-Sample-Rate": "24000",
            "X-Channels": "1",
        },
    )
