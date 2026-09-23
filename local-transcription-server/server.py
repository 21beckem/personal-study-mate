import hashlib
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

from faster_whisper import WhisperModel


HOST = "127.0.0.1"
PORT = 8765
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
MODEL_CACHE_NAME = "".join(character if character.isalnum() or character in "-_" else "_" for character in MODEL_NAME)
CACHE_DIR = Path(__file__).parent / "cache"
MODEL = None
MODEL_LOCK = Lock()


def send_event(handler, event):
    if not handler.client_connected:
        return
    try:
        handler.wfile.write((json.dumps(event) + "\n").encode("utf-8"))
        handler.wfile.flush()
    except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError, OSError):
        handler.client_connected = False


def load_model():
    global MODEL
    if MODEL is None:
        with MODEL_LOCK:
            if MODEL is None:
                print(f"Loading faster-whisper model: {MODEL_NAME}", flush=True)
                MODEL = WhisperModel(MODEL_NAME, device="auto", compute_type="default")
    return MODEL


class TranscriptionHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        self.client_connected = True
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404, "Not found")
            return
        body = json.dumps({"ok": True, "model": MODEL_NAME}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404, "Not found")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0:
                self.send_error(400, "Audio body is empty.")
                return
            audio = self.rfile.read(size)
            self.process(audio)
        except Exception as error:
            print(f"Transcription request failed: {error}", flush=True)
            try:
                send_event(self, {"type": "error", "message": str(error)})
            except Exception:
                pass

    def process(self, audio):
        digest = hashlib.sha256(audio).hexdigest()
        cache_path = CACHE_DIR / f"{digest}-{MODEL_CACHE_NAME}.json"
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.close_connection = True
        self.end_headers()

        if cache_path.exists():
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            send_event(self, {"type": "progress", "phase": "cached", "message": "Loaded cached transcript.", "percent": 100, "currentSeconds": cached.get("duration", 0), "totalSeconds": cached.get("duration", 0)})
            cached["cached"] = True
            send_event(self, {"type": "complete", "transcript": cached})
            print(f"Cache hit: {digest[:12]}", flush=True)
            return

        send_event(self, {"type": "progress", "phase": "loading", "message": "Loading local transcription model...", "percent": 0})
        model = load_model()
        file_name = Path(self.headers.get("X-Audio-Filename", "recording.audio")).name
        suffix = Path(file_name).suffix or ".audio"
        with tempfile.TemporaryDirectory() as directory:
            audio_path = Path(directory) / f"recording{suffix}"
            audio_path.write_bytes(audio)
            send_event(self, {"type": "progress", "phase": "transcribing", "message": "Transcribing audio...", "percent": 0})
            segments, info = model.transcribe(str(audio_path), word_timestamps=True)
            duration = float(info.duration or 0)
            chunks = []
            for segment in segments:
                for word in segment.words or []:
                    if word.start is None or word.end is None:
                        continue
                    chunks.append({"text": word.word, "timestamp": [float(word.start), float(word.end)]})
                current = min(duration, float(segment.end or 0))
                percent = round(current / duration * 100, 2) if duration else 0
                send_event(self, {"type": "progress", "phase": "transcribing", "message": f"Transcribing audio ({current:.1f}s of {duration:.1f}s)...", "percent": percent, "currentSeconds": current, "totalSeconds": duration})

        transcript = {"chunks": chunks, "duration": duration, "modelName": f"faster-whisper/{MODEL_NAME}", "cached": False}
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(transcript), encoding="utf-8")
        send_event(self, {"type": "complete", "transcript": transcript})
        print(f"Transcribed {digest[:12]} with {len(chunks)} word timestamps.", flush=True)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)


def main():
    server = ThreadingHTTPServer((HOST, PORT), TranscriptionHandler)
    print(f"Local transcription server listening on http://{HOST}:{PORT}", flush=True)
    print(f"Using faster-whisper model: {MODEL_NAME}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local transcription server.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
