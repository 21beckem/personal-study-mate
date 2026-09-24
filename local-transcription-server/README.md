# Local transcription server

This optional server processes uploaded recordings with native `faster-whisper` and temporarily relays playlist packages to a phone on the same local network. The browser extension relays audio and playlist data to it.

From the project root:

```powershell
python -m pip install -r local-transcription-server\requirements.txt
python local-transcription-server\server.py
```

The default server listens only on `127.0.0.1:2094` for transcription. To enable phone sharing, bind it to the local network and provide the HTTPS app URL:

```powershell
python local-transcription-server\server.py --host 0.0.0.0 --app-url https://YOUR-APP-URL/
```

Use `--share-host 192.168.x.x` if the automatically detected LAN address is not the address the phone should use. Windows Firewall may need an inbound rule for port `2094`. The phone and computer must be on the same network.

- `GET /health` checks whether the server is running.
- `POST /transcribe` accepts the raw audio body and returns newline-delimited JSON progress and transcript events.
- `POST /share` stores one playlist package temporarily and returns a short LAN URL.
- `GET /share/<token>` serves the phone transfer page.

Transcripts are cached in `local-transcription-server\cache` using the audio hash and model name. The cache directory is ignored by Git.
Playlist shares are stored in `local-transcription-server\shares`, expire after 30 minutes, and are removed after a successful import. They are temporary transfer data, not the app's source of truth.
