import { LocalTranscriber } from './transcription.js';
import { AudioMediaSource, TtsMediaSource, buildAudioPlaybackSegments } from './media-player.js';

const CONSTRUCTION_TOKEN = Symbol('player-construction-token');

export class PlayerController {
  constructor({ database, aligner, tts, status }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlayerController must be created with PlayerController.fromObject().');
    this.database = database;
    this.aligner = aligner;
    this.tts = tts;
    this.status = status;
    this.transcriber = null;
  }

  static fromObject(value) { return new PlayerController(value, CONSTRUCTION_TOKEN); }

  async createAudioSource(item) {
    const record = await this.database.getAudio(item.audioBlobId);
    if (!record) throw new Error('Audio file is missing.');
    return AudioMediaSource.fromObject({ blob: record.blob, segments: buildAudioPlaybackSegments(item) });
  }

  createTtsSource(item) { return TtsMediaSource.fromObject({ tts: this.tts, paragraphs: item.paragraphs }); }

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

}
