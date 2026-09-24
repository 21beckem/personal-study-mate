import hashlib
import json
import os
import re
import secrets
import socket
import tempfile
import time
from argparse import ArgumentParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

from faster_whisper import WhisperModel


PORT = 2094
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
MODEL_CACHE_NAME = "".join(character if character.isalnum() or character in "-_" else "_" for character in MODEL_NAME)
CACHE_DIR = Path(__file__).parent / "cache"
SHARE_DIR = Path(__file__).parent / "shares"
SHARE_TTL_SECONDS = 30 * 60
MAX_SHARE_BYTES = 200 * 1024 * 1024
DEFAULT_APP_URL = "https://21beckem.github.io/personal-study-mate/"
MODEL = None
MODEL_LOCK = Lock()
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


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


def write_response(handler, status, body, content_type="application/json"):
    body = body if isinstance(body, bytes) else body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def cleanup_shares():
    SHARE_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - SHARE_TTL_SECONDS
    for path in SHARE_DIR.glob("*.json"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except FileNotFoundError:
            pass


def share_path(token):
    if not TOKEN_PATTERN.fullmatch(token):
        return None
    return SHARE_DIR / f"{token}.json"


def available_share_path(token):
    path = share_path(token)
    if not path or not path.exists():
        return None
    try:
        if time.time() - path.stat().st_mtime > SHARE_TTL_SECONDS:
            path.unlink()
            return None
    except FileNotFoundError:
        return None
    return path


def detect_share_host(override):
    if override:
        return override
    try:
        connection = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        connection.connect(("8.8.8.8", 80))
        host = connection.getsockname()[0]
        connection.close()
        return host
    except OSError:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip and not local_ip.startswith("127."):
            return local_ip
        return "127.0.0.1"


class TranscriptionHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        self.client_connected = True
        super().__init__(*args, **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path == "/health":
            write_response(self, 200, json.dumps({"ok": True, "model": MODEL_NAME, "sharing": True}))
            return

        parts = path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "share":
            self.send_share_page(parts[1])
            return
        if len(parts) == 3 and parts[0] == "share" and parts[2] == "package":
            self.send_share_package(parts[1])
            return

        self.send_error(404, "Not found")

    def do_POST(self):
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path == "/transcribe":
            self.handle_transcription_request()
            return
        parts = path.strip("/").split("/")
        if path == "/share":
            self.create_share()
            return
        if len(parts) == 3 and parts[0] == "share" and parts[2] == "consume":
            self.consume_share(parts[1])
            return
        self.send_error(404, "Not found")

    def handle_transcription_request(self):
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

    def create_share(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0:
                self.send_error(400, "Package body is empty.")
                return
            if size > MAX_SHARE_BYTES:
                self.send_error(413, "Package is too large to share.")
                return
            package = self.rfile.read(size)
            raw = json.loads(package.decode("utf-8"))
            if not isinstance(raw, dict) or raw.get("format") != "personal-study-mate":
                self.send_error(400, "The package format is invalid.")
                return
            cleanup_shares()
            token = secrets.token_urlsafe(9)
            path = share_path(token)
            SHARE_DIR.mkdir(parents=True, exist_ok=True)
            temporary = SHARE_DIR / f".{token}.tmp"
            temporary.write_bytes(package)
            os.replace(temporary, path)
            share_host = self.server.share_host
            share_url = f"http://{share_host}:{self.server.server_port}/share/{token}"
            write_response(self, 201, json.dumps({"token": token, "url": share_url, "expiresIn": SHARE_TTL_SECONDS}))
            print(f"Created package share {token} ({size} bytes).", flush=True)
        except json.JSONDecodeError:
            self.send_error(400, "The package body is not valid JSON.")
        except Exception as error:
            print(f"Share creation failed: {error}", flush=True)
            self.send_error(500, "Could not create the package share.")

    def send_share_page(self, token):
        if not available_share_path(token):
            self.send_error(404, "Share not found or expired.")
            return
        template_path = Path(__file__).parent / "share-page.html"
        template = template_path.read_text(encoding="utf-8")
        config = json.dumps({
            "token": token,
            "appUrl": self.server.app_url,
            "packageUrl": f"/share/{token}/package",
            "consumeUrl": f"/share/{token}/consume"
        })
        write_response(self, 200, template.replace("__SHARE_CONFIG__", config), "text/html; charset=utf-8")

    def send_share_package(self, token):
        path = available_share_path(token)
        if not path:
            self.send_error(404, "Share not found or expired.")
            return
        write_response(self, 200, path.read_bytes(), "application/json; charset=utf-8")

    def consume_share(self, token):
        path = available_share_path(token)
        if path:
            path.unlink()
        write_response(self, 200, json.dumps({"ok": True}))

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
    parser = ArgumentParser(description="Local transcription and playlist-sharing server")
    parser.add_argument("--host", default=os.environ.get("LOCAL_SERVER_HOST", "127.0.0.1"), help="Address to bind (use 0.0.0.0 for phone sharing).")
    parser.add_argument("--port", type=int, default=int(os.environ.get("LOCAL_SERVER_PORT", PORT)))
    parser.add_argument("--share-host", default=os.environ.get("SHARE_HOST"), help="LAN host/IP to put in generated share URLs.")
    parser.add_argument("--app-url", default=os.environ.get("STUDY_MATE_APP_URL", DEFAULT_APP_URL), help="HTTPS web-app URL opened on the phone.")
    arguments = parser.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", arguments.port), TranscriptionHandler)
    share_host_override = arguments.share_host
    server.share_host = detect_share_host(share_host_override)
    server.app_url = arguments.app_url
    print(f"Local transcription server listening on http://{arguments.host}:{arguments.port}", flush=True)
    print(f"Share URLs will use http://{server.share_host}:{arguments.port}", flush=True)
    print(f"Using faster-whisper model: {MODEL_NAME}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local transcription server.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
