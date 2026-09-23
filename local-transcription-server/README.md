# Local transcription server

This optional server processes uploaded recordings with native `faster-whisper`. The browser extension relays audio to it and streams progress events back to the web app.

From the project root:

```powershell
python -m pip install -r local-transcription-server\requirements.txt
python local-transcription-server\server.py
```

The server listens only on `127.0.0.1:8765`.

- `GET /health` checks whether the server is running.
- `POST /transcribe` accepts the raw audio body and returns newline-delimited JSON progress and transcript events.

Transcripts are cached in `local-transcription-server\cache` using the audio hash and model name. The cache directory is ignored by Git.
