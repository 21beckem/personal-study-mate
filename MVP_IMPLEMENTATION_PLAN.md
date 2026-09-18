# Personal Study Mate — MVP Implementation Plan

Status: In progress

This document is the implementation checklist for the local-first MVP. Update each item as it is completed.

## Architectural rules

- [x] Web-app only for v1; do not implement the browser extension yet.
- [x] All user data and processing stay local to the browser.
- [x] Use IndexedDB for persistence, including audio Blobs.
- [x] Provide simple import/export functionality.
- [x] Use a JSON text area as the primary playlist/item input workflow.
- [x] Support Chrome and Edge on desktop and mobile where browser APIs permit.
- [x] Use browser-native `speechSynthesis` for TTS.
- [x] Keep styling strictly functional and minimal.
- [x] Preserve extension-ready source metadata and import boundaries.
- [x] Public application data is represented by class instances, never ad hoc object literals.
- [x] Classes are created only through static `fromObject()` factories; application code never calls `new` directly.
- [x] Keep `app.js` as a composition root; put routing, playback, and view rendering in their own modules.
- [x] Build application DOM only through `Utils.buildDOM()` or `Utils.ui` helpers; never use raw HTML injection.

## Data model and storage

- [x] Define `Playlist`, `StudyItem`, `Paragraph`, and `WordTiming` classes.
- [x] Define defaults, IDs, timestamps, and serialization for each class.
- [x] Add IndexedDB persistence through a small wrapper.
- [x] Store audio files as Blobs in a dedicated object store.
- [ ] Add safe deletion of unreferenced audio Blobs.

## Import and export

- [x] Define versioned JSON import schema.
- [x] Implement JSON parsing and validation.
- [x] Implement audio-file attachment by filename/reference.
- [x] Save imported playlists and items through the storage layer.
- [ ] Implement portable ZIP export containing manifest and audio files.
- [ ] Implement ZIP import with ID remapping and validation.
- [x] Implement metadata-only JSON export.

## Processing

- [x] Extract browser Whisper transcription into a reusable service.
- [ ] Cache/reuse the transcription model during the session.
- [ ] Add progress, cancellation, and failure states.
- [x] Extract canonical-text alignment into a reusable service.
- [x] Store processing/model/alignment version metadata.
- [ ] Mark processed items locked until audio/text changes or reprocessing occurs.

## Playback

- [x] Implement pre-recorded audio playback.
- [x] Implement paragraph and word highlighting.
- [x] Implement clickable word seeking.
- [x] Implement native TTS playback.
- [x] Implement best-effort TTS highlighting with a segment fallback.
- [ ] Implement playlist previous/next/automatic advancement behavior.

## Views

- [x] Implement minimal single-page navigation.
- [x] Implement Library view.
- [x] Implement Playlist Editor JSON workflow.
- [x] Implement Player view.
- [x] Add minimal functional error/status messaging.

## Verification

- [ ] Test valid and invalid JSON import.
- [ ] Test persistence across reloads.
- [ ] Test audio attachment and playback.
- [ ] Test transcription and alignment on existing proof-of-concept samples.
- [ ] Test export/import round trip.
- [ ] Test TTS in Chrome and Edge where available.
- [ ] Test desktop and mobile layouts/functionality.
- [ ] Update README with run/use instructions.

## Playlist Editor UI

- [x] Add editor-specific model classes and typed event payloads.
- [x] Add reusable editor UI helpers to `Utils.ui`.
- [x] Add `PlaylistEditorSession` state coordinator.
- [x] Replace raw JSON editor with playlist management UI.
- [x] Add playlist details and item list controls.
- [x] Add TTS item editor and preview controls.
- [x] Add pre-recorded audio attachment and preview controls.
- [x] Add paragraph parsing/editing and numbering controls.
- [x] Add processing, locking, warnings, and reprocessing controls.
- [x] Add paragraph playback selection controls.
- [x] Add save/revert/dirty-state workflow.
- [ ] Verify component destruction and event-listener cleanup in a browser.
