import { EventEmitterMixin } from '../modules.js';
import { ProcessingMetadata, StudyItem } from '../models.js';
import { ProcessingProgress } from './editor-events.js';
import { LocalTranscriber } from '../transcription.js';

const CONSTRUCTION_TOKEN = Symbol('item-processor-construction-token');

export class StudyItemProcessor extends EventEmitterMixin(Object) {
  constructor({ aligner }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('StudyItemProcessor must be created with StudyItemProcessor.fromObject().');
    this.aligner = aligner;
    this.transcriber = null;
  }

  static fromObject(value) { return new StudyItemProcessor(value, CONSTRUCTION_TOKEN); }

  async process(item, attachment) {
    if (!attachment?.blob) throw new Error('Choose an audio file before processing.');
    if (!item.text.trim()) throw new Error('Add the original text before processing.');
    this.#progress('loading', 'Loading local transcription model...', 5);
    if (!this.transcriber) {
      const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm');
      this.transcriber = LocalTranscriber.fromObject({ pipelineFactory: module.pipeline });
    }
    const transcript = await this.transcriber.transcribe(attachment.blob, { onStatus: (message) => this.#progress('transcribing', message, 50) });
    this.#progress('aligning', 'Aligning speech to the original text...', 80);
    const paragraphs = this.aligner.align(transcript, item.paragraphs);
    const processed = StudyItem.fromObject({ ...item.toObject(), paragraphs, status: 'ready', processing: ProcessingMetadata.fromObject({ modelName: 'onnx-community/whisper-base_timestamped', alignmentVersion: 1, processedAt: new Date().toISOString() }) });
    this.#progress('complete', 'Processing complete.', 100);
    this.emit('processed', processed);
    return processed;
  }

  #progress(phase, message, percent) { this.emit('progress', ProcessingProgress.fromObject({ phase, message, percent })); }
}
