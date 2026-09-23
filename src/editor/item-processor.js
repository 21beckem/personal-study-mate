import { EventEmitterMixin } from '../modules.js';
import { ProcessingMetadata, StudyItem } from '../models.js';
import { ProcessingProgress } from './editor-events.js';
import { LocalTranscriber } from '../transcription.js';

const CONSTRUCTION_TOKEN = Symbol('item-processor-construction-token');

export class StudyItemProcessor extends EventEmitterMixin(Object) {
  constructor({ aligner, extensionBridge = null }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('StudyItemProcessor must be created with StudyItemProcessor.fromObject().');
    this.aligner = aligner;
    this.extensionBridge = extensionBridge;
    this.transcriber = null;
  }

  static fromObject(value) { return new StudyItemProcessor(value, CONSTRUCTION_TOKEN); }

  async process(item, attachment) {
    if (!attachment?.blob) throw new Error('Choose an audio file before processing.');
    if (!item.text.trim()) throw new Error('Add the original text before processing.');
    let transcript = null;
    if (this.extensionBridge?.supported) {
      console.info('[study-mate transcription] Attempting native transcription through the extension relay.');
      this.#progress('loading', 'Checking local transcription server...', 5);
      for (let attempt = 1; attempt <= 2 && !transcript; attempt++) {
        try {
          transcript = await this.extensionBridge.transcribe(attachment, {
            onProgress: (progress) => this.#progress(
              progress.phase || 'transcribing',
              progress.message || 'Transcribing locally...',
              progress.percent ?? null,
              progress.currentSeconds ?? null,
              progress.totalSeconds ?? null
            )
          });
          console.info(`[study-mate transcription] Local server completed${transcript.cached ? ' from cache' : ''}.`);
        } catch (error) {
          if (error.code === 'EXTENSION_DISCONNECTED' && attempt === 1) {
            console.warn('[study-mate transcription] Native relay disconnected; retrying once to recover a completed server transcript.');
            continue;
          }
          console.warn(`[study-mate transcription] Local server unavailable; falling back to browser transcription. ${error.message}`);
        }
      }
    } else {
      console.warn('[study-mate transcription] Extension relay unavailable; using browser transcription.');
    }
    if (!transcript) {
      this.#progress('loading', 'Loading browser transcription model...', 5);
      if (!this.transcriber) {
        const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm');
        this.transcriber = LocalTranscriber.fromObject({ pipelineFactory: module.pipeline });
      }
      transcript = await this.transcriber.transcribe(attachment.blob, { onStatus: (message) => this.#progress('transcribing', message, 50) });
    }
    this.#progress('aligning', 'Aligning speech to the original text...', 95);
    const paragraphs = this.aligner.align(transcript, item.paragraphs);
    const processed = StudyItem.fromObject({ ...item.toObject(), paragraphs, status: 'ready', processing: ProcessingMetadata.fromObject({ modelName: transcript.modelName || 'onnx-community/whisper-base_timestamped', alignmentVersion: 1, processedAt: new Date().toISOString() }) });
    this.#progress('complete', 'Processing complete.', 100);
    this.emit('processed', processed);
    return processed;
  }

  #progress(phase, message, percent, currentSeconds = null, totalSeconds = null) {
    const progress = ProcessingProgress.fromObject({ phase, message, percent, currentSeconds, totalSeconds });
    const suffix = percent === null ? '' : ` (${percent.toFixed(1)}%)`;
    console.info(`[study-mate transcription] ${message}${suffix}`);
    this.emit('progress', progress);
  }
}
