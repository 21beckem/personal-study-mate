# Personal Study Mate

Personal Study Mate is a local-first browser app for playing study assignments as audio while displaying the corresponding text. The current MVP supports manually supplied JSON playlists, local audio files, browser-native TTS, and local Whisper transcription/alignment for pre-recorded audio.

## Source structure

```text
/
  index.html
  src/
    app.js
    router.js
    db.js
    models.js
    import-export.js
    transcription.js
    alignment.js
    tts.js
    player.js
    views/
      player-view.js
      library-view.js
      playlist-editor-view.js
  public/
    styles.css
```

`app.js` is the composition root only. Navigation, playback, persistence, processing, and view rendering each have separate modules.

## Run the MVP

Serve this folder from a local HTTP server. ES modules and browser storage are not reliable from a `file://` URL.

```powershell
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in Chrome or Edge.

The first transcription may download the browser model. No user audio or text is sent to an application server.

The Playlist Editor is UI-driven: create playlists, add TTS or pre-recorded items, attach audio, enter canonical text, split/edit paragraphs, choose which paragraphs play, process recordings, and save changes locally. JSON import/export remains available for backup and migration, but is no longer the normal editing interface.

## Use the MVP

1. Open **Library** and create a playlist.
2. Press **Edit** on a playlist to open its editor.
3. Add TTS or pre-recorded items. For audio, attach the local recording and enter its canonical text.
4. Split the text into paragraphs, assign optional paragraph numbers, and enable or disable paragraphs as needed.
5. For pre-recorded items, process the recording in the editor to transcribe and align it.
6. Save the playlist, then open it in **Player**.
7. Use the browser speech controls for TTS items or the audio controls for recordings.

The data model supports version 2 package files containing playlist metadata, study items, paragraphs, and embedded audio. Use **Export package** and **Import package** in the Library to move a complete playlist between browser profiles.

## Gospel Library collector extension

The optional Manifest V3 extension is in [`extension/`](extension/). To use it during local development:

1. Run the app with `python -m http.server 8000`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, and select the `extension` folder.
4. Refresh the Personal Study Mate page.
5. In Library, paste the assignment list into the collector panel and choose **Collect assignments**.

The extension opens approved ChurchofJesusChrist.org and legacy lds.org pages in inactive tabs, extracts article or scripture paragraphs, downloads available audio, and streams the results back to the web app. The web app normalizes the collected data, processes audio locally, and stores the final playlist in IndexedDB.

## JSON shape

```json
{
  "format": "personal-study-mate",
  "version": 2,
  "playlists": [{
    "title": "My study playlist",
    "items": [{
      "type": "tts",
      "title": "Reading assignment",
      "text": "Text to read aloud."
    }]
  }],
  "audio": []
}
```

## Architecture rule

Application data uses class instances (`Playlist`, `StudyItem`, `Paragraph`, `WordTiming`, and `StudyPackage`). Classes enforce construction through their static `fromObject()` factories; direct external constructor calls are rejected.
