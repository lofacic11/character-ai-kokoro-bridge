# Local Kokoro server setup (Ubuntu)

This project uses the [`kokoro-onnx`](https://github.com/thewh1teagle/kokoro-onnx) Python package and a tiny FastAPI wrapper. The default server runs on the CPU, leaving your NVIDIA GPU available for an LLM.

## 1. Install dependencies

```bash
sudo apt update
sudo apt install -y python3.12-venv espeak-ng libespeak-ng1 libsndfile1 portaudio19-dev curl
mkdir -p ~/AI/tts/kokoro
cd ~/AI/tts/kokoro
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install kokoro-onnx sounddevice soundfile numpy fastapi 'uvicorn[standard]'
```

## 2. Download model and voices

```bash
curl -fL --retry 3 -o kokoro-v1.0.onnx \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx
curl -fL --retry 3 -o voices-v1.0.bin \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin
```

## 3. Install server script

Copy [`server.py`](../server.py) into `~/AI/tts/kokoro/server.py`.

```bash
cd ~/AI/tts/kokoro
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8880
```

## 4. Verify

In a second terminal:

```bash
curl -fsS http://127.0.0.1:8880/health
curl -fsS http://127.0.0.1:8880/speak \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, this is a local voice test.","voice":"af_heart"}' \
  -o voice-test.wav
aplay voice-test.wav
```

The server is intentionally unauthenticated **only** on loopback. Do not bind it to `0.0.0.0` without adding appropriate access controls. Keep the model files in the same directory as `server.py`.
