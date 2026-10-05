# Personal Study Companion

Personal Study Mate is a local-first browser app for playing study assignments as audio while displaying the corresponding text. The current MVP supports manually supplied JSON playlists, local audio files, browser-native TTS, and local Whisper transcription/alignment for pre-recorded audio.

## Instructions for Build and Use

Steps to build and/or run the software:

1. Install `extension` as a unpacked extension
2. run `start-server.bat`
3. run the web server somehow (use live-server, or `python -m http.server 8000`)

Instructions for using the software:

1. Paste in a list of items to be collected on the main screen
2. Click collect
3. Wait for collection and audio processing to finish
4. Click on Player
5. Click play to listen

## Development Environment

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* `Python 3.13.14+`

## Useful Websites to Learn More

I found these websites useful in developing this software:

* [PeerJS](https://peerjs.com/)
* [whisper-word-level-timestamps](https://huggingface.co/spaces/Xenova/whisper-word-level-timestamps/tree/main)

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [ ] The Pins buttons currently don't work. I want to be able to save parts that stand out to me.