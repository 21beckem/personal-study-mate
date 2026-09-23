# Native transcription test

This measures native `faster-whisper` processing for the sample recording used by the app.

From the project root, install the dependency and run:

```powershell
py -m pip install faster-whisper
py native-transcription-test\transcribe.py
```

The first run downloads the Whisper base model. The output separates model-loading time from transcription time and reports the transcription realtime factor.
