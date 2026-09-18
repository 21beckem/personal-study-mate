const CONSTRUCTION_TOKEN = Symbol('transcription-construction-token');

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
    const result = await this.transcriber(decoded.getChannelData(0), { chunk_length_s: 30, stride_length_s: 5, return_timestamps: 'word' });
    
    // apply slight offset to timestamps to correct for minor misalignment
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      chunk.timestamp = [chunk.timestamp[0] - 0.3, chunk.timestamp[1] - 0.3];
    }
    
    await context.close();
    return result;
  }
}
