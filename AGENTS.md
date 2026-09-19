# Personal Study Mate — Agent Context

## Product vision

Personal Study Mate is intended to help people listen to scripture, conference talks, magazine articles, and other study assignments instead of reading them. A playlist can combine browser-generated TTS with user-supplied recordings, while the Player displays the text currently being spoken, highlights the active words when timing data exists, and lets the user jump to a point by selecting a word.

The long-term experience should make it easy to gather reading assignments, organize them into playlists, choose specific paragraphs, and listen continuously with accurate text synchronization. Keep this vision in mind when making MVP changes, but do not add future functionality prematurely.

## MVP boundary

The current MVP is web-app only. It supports local playlists, TTS, user-supplied audio, canonical text, paragraph selection, local transcription/alignment, playback, and IndexedDB persistence. The future Gospel Library scraping extension is not part of the MVP.

User data is stored locally in IndexedDB. Audio files are supplied by the user and stored as local Blobs. JSON import/export is available for backup and migration. Do not introduce server-side storage or scraping into the MVP.

## Architecture

- `src/app.js` is the composition root. It creates the database, store, services, router, and views, then wires top-level navigation.
- `src/app-store.js` is the shared source of truth for the current `StudyPackage`, active playlist, and active item. It emits `package-changed`; views should react to that event instead of reloading data themselves.
- `src/router.js` mounts one view at a time. `src/views/` contains `LibraryView`, `PlaylistEditorView`, and `PlayerView`.
- Library owns playlist creation, deletion, export, and navigation to Player or Editor. The Editor edits only the selected playlist. Player selects and plays items from the shared store.
- `src/editor/` contains focused editor components. `PlaylistEditorSession` coordinates editor state and persistence; smaller components own their DOM and emit typed editor events.
- `src/db.js` wraps IndexedDB. `src/player.js`, `src/tts.js`, `src/transcription.js`, and `src/alignment.js` provide playback, TTS, transcription, and canonical-text alignment services.

## Future additions and plans

These plans are intentionally outside the MVP. Use this section as the starting context when a later task explicitly begins extension or broader product work.

### Gospel Library browser extension

The planned extension will support Chrome/Edge desktop browsers. Given one or more `churchofjesuschrist.org` Gospel Library links—such as conference talks, magazine articles, scriptures, or other documents—it should open the pages in the background, scrape the available full text, locate a downloadable audio file when one exists, and send the collected results to the local web app after all links finish processing.

The extension should be an import/collection layer, not the source of truth for playlists. The web app should remain responsible for normalizing the scraped data, letting the user review or edit it, storing it locally, and adding it to playlists. The future integration should preserve source URLs and tolerate pages without downloadable audio; those items can still become TTS items when text is available.

### Broader product direction

Future work may add richer playlist editing, automatic playlist advancement, portable exports containing audio, better processing progress and cancellation, and mobile-friendly refinement. Any future feature should preserve local-first behavior, accurate text/audio alignment, and the ability to choose individual paragraphs.

## Data and playback flow

`LocalDatabase` loads a `StudyPackage` into `AppStore`. Editor changes update the session and store immediately; Save persists the package and audio Blobs. Player observes the store, renders the selected item, and does not require a refresh after edits.

`Paragraph.play` is the per-paragraph playback flag and defaults to `true`. TTS builds speech text from enabled paragraphs only. Processed audio uses paragraph timings to skip disabled sections and seek to the next enabled section. Changing only playback flags must not invalidate processed audio alignment.

## Required coding conventions

- Application data, editor events, and service payloads use model/class instances, not ad hoc object literals passed between modules.
- Classes must be constructed through their static `fromObject()` factory. Direct `new` calls are limited to the implementation of those factory methods.
- Classes that manage behavior and DOM should extend/use `DOMElement` and `EventEmitterMixin` from `src/modules.js`.
- Create DOM only with `Utils.buildDOM()` or helpers under `Utils.ui` in `src/utils.js`. Do not use `innerHTML` or raw HTML strings.
- Keep modules focused: `app.js` composes; views render; editor components own their UI; services handle processing/playback.
- Keep CSS minimal and functional for the MVP.

Run locally with `python -m http.server 8000`, then open `http://localhost:8000` in Chrome or Edge.
