# Personal Study Mate Collector

Load this directory as an unpacked extension in Chrome or Edge while the web app is running at `http://localhost:8000`.

The extension exposes a restricted external messaging port to the web app, opens approved Gospel Library pages in inactive tabs, extracts text and optional audio, and streams the results back in small base64 chunks.

For native audio processing, start the optional server from the project root:

```powershell
python -m pip install -r local-transcription-server\requirements.txt
python local-transcription-server\server.py
```

The extension relays audio to `http://127.0.0.1:2094` and streams transcription progress back to the web app. If the server is not running, the web app falls back to browser transcription.

The playlist editor also exposes **Send to phone** when the extension is detected. The extension sends the current playlist package to the local server, which creates a temporary LAN URL and QR code. Start the server with `--host 0.0.0.0` and `--app-url https://YOUR-APP-URL/` for phone sharing; the phone must be on the same network.
