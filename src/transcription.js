const CONSTRUCTION_TOKEN = Symbol('transcription-construction-token');

export class TranscriptChunk {
  constructor({ text, timestamp = [0, 0] }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('TranscriptChunk must be created with TranscriptChunk.fromObject().');
    this.text = String(text ?? '');
    this.timestamp = [Number(timestamp?.[0] ?? 0), Number(timestamp?.[1] ?? timestamp?.[0] ?? 0)];
  }

  static fromObject(value = {}) { return new TranscriptChunk(value, CONSTRUCTION_TOKEN); }
}

export class TranscriptResult {
  constructor({ chunks = [], duration = 0, modelName = '', cached = false }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('TranscriptResult must be created with TranscriptResult.fromObject().');
    this.chunks = chunks.map((chunk) => TranscriptChunk.fromObject(chunk));
    this.duration = Number(duration) || 0;
    this.modelName = String(modelName || '');
    this.cached = Boolean(cached);
  }

  static fromObject(value = {}) { return new TranscriptResult(value, CONSTRUCTION_TOKEN); }
}

export class LocalTranscriber {
  constructor(pipelineFactory, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LocalTranscriber must be created with LocalTranscriber.fromObject().');
    this.pipelineFactory = pipelineFactory;
    this.transcriber = null;
  }

  static fromObject({ pipelineFactory }) {
    return new LocalTranscriber(pipelineFactory, CONSTRUCTION_TOKEN);
  }

  async transcribe(blob, { onStatus = () => {}, signal } = {}) {
    if (!this.transcriber) {
      onStatus('Loading local transcription model...');
      this.transcriber = await this.pipelineFactory('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', { device: 'webgpu' });
    }
    if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');
    onStatus('Decoding audio locally...');
    const buffer = await blob.arrayBuffer();
    const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decoded = await context.decodeAudioData(buffer);
    // Whisper timestamp decoding can collapse at the 30-second boundary for
    // long recordings. Keeping the chunks just under that boundary preserves
    // monotonic word timestamps across the entire recording.
    const result = await this.transcriber(decoded.getChannelData(0), { chunk_length_s: 29, stride_length_s: 5, return_timestamps: 'word' });
    
    // apply slight offset to timestamps to correct for minor misalignment
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      chunk.timestamp = [chunk.timestamp[0] - 0.3, chunk.timestamp[1] - 0.3];
    }
    
    await context.close();
    return TranscriptResult.fromObject({ chunks: result.chunks, duration: decoded.duration, modelName: 'onnx-community/whisper-base_timestamped' });
  }
}
