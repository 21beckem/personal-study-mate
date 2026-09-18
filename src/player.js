import { LocalTranscriber } from './transcription.js';
import { Utils } from './utils.js';

const CONSTRUCTION_TOKEN = Symbol('player-construction-token');

export class PlayerController {
  constructor({ database, aligner, tts, status }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlayerController must be created with PlayerController.fromObject().');
    this.database = database;
    this.aligner = aligner;
    this.tts = tts;
    this.status = status;
    this.audio = null;
    this.transcriber = null;
  }

  static fromObject(value) { return new PlayerController(value, CONSTRUCTION_TOKEN); }

  async loadAudio(item, controls) {
    const record = await this.database.getAudio(item.audioBlobId);
    if (!record) { controls.textContent = 'Audio file is missing.'; return null; }
    this.audio?.pause();
    const audio = Utils.buildDOM(['audio', { controls: 'controls' }]);
    audio.src = URL.createObjectURL(record.blob);
    audio._studyBlob = record.blob;
    this.audio = audio;
    controls.append(audio);
    return audio;
  }

  async process(item, blob, onComplete) {
    try {
      this.status('Transcription is starting...');
      if (!this.transcriber) {
        const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm');
        this.transcriber = LocalTranscriber.fromObject({ pipelineFactory: module.pipeline });
      }
      const transcript = await this.transcriber.transcribe(blob, { onStatus: this.status });
      const aligned = this.aligner.align(transcript, item.paragraphs);
      onComplete(item.withParagraphs(aligned, { modelName: 'onnx-community/whisper-base_timestamped', alignmentVersion: 1, processedAt: new Date().toISOString() }));
      this.status('Processing complete.');
    } catch (error) { this.status(error.message, true); }
  }

  speak(item, callbacks) { this.tts.speak(item.text, callbacks); }
  pauseSpeech() { this.tts.pause(); }
  resumeSpeech() { this.tts.resume(); }
  stopSpeech() { this.tts.stop(); }
}
