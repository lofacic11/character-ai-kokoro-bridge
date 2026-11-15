cd ~/AI/tts/kokoro
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8880
