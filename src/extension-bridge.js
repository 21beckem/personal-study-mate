import { AudioAttachment } from './models.js';

const CONSTRUCTION_TOKEN = Symbol('extension-bridge-construction-token');
const PROTOCOL_VERSION = 1;
const CHUNK_TYPE = 'audio-chunk';

const base64ToBlob = (chunks, mimeType) => {
  const parts = chunks.filter(Boolean).map((chunk) => {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  });
  return new Blob(parts, { type: mimeType || 'application/octet-stream' });
};

export const discoverExtensionId = async (timeoutMs = 900) => {
  if (!globalThis.chrome?.runtime?.connect) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (id) => { if (settled) return; settled = true; window.removeEventListener('message', listener); clearTimeout(timer); resolve(id || null); };
    const listener = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source === 'personal-study-mate-extension' && event.data.type === 'ready') finish(event.data.extensionId);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', listener);
    window.postMessage({ source: 'personal-study-mate-app', type: 'discover-extension' }, window.location.origin);
  });
};

class CollectedItem {
  constructor(value, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('CollectedItem must be created with CollectedItem.fromObject().');
    Object.assign(this, value);
  }

  static fromObject(value = {}) {
    return new CollectedItem({
      requestId: value.requestId,
      title: String(value.title || value.label || 'Untitled item').trim(),
      sourceUrl: String(value.sourceUrl || value.url || ''),
      paragraphs: Array.isArray(value.paragraphs) ? value.paragraphs : [],
      audio: value.audio || null,
    }, CONSTRUCTION_TOKEN);
  }
}

export class ExtensionBridge {
  constructor({ extensionId, timeoutMs = 900 }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ExtensionBridge must be created with ExtensionBridge.fromObject().');
    this.extensionId = extensionId;
    this.timeoutMs = timeoutMs;
    this.port = null;
  }

  static fromObject(value) { return new ExtensionBridge(value, CONSTRUCTION_TOKEN); }

  get supported() { return Boolean(globalThis.chrome?.runtime?.connect && this.extensionId); }

  #connect() {
    if (!this.supported) return null;
    try { return globalThis.chrome.runtime.connect(this.extensionId, { name: 'personal-study-mate-v1' }); } catch { return null; }
  }

  async detect() {
    const port = this.#connect();
    if (!port) return false;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (available) => { if (settled) return; settled = true; clearTimeout(timer); try { port.disconnect(); } catch {} resolve(available); };
      const timer = setTimeout(() => finish(false), this.timeoutMs);
      port.onMessage.addListener((message) => { if (message?.type === 'hello-response' && message.protocol === PROTOCOL_VERSION) finish(true); });
      port.onDisconnect.addListener(() => finish(false));
      try { port.postMessage({ type: 'hello', protocol: PROTOCOL_VERSION }); } catch { finish(false); }
    });
  }

  async collect({ playlist, assignments, onProgress = () => {} }) {
    const port = this.#connect();
    if (!port) throw new Error('The Personal Study Mate extension is not available.');
    this.port = port;
    const items = new Map();
    let resolveJob;
    let rejectJob;
    const job = new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject; });
    const timer = setTimeout(() => rejectJob(new Error('The collection timed out.')), 10 * 60 * 1000);
    const cleanup = () => { clearTimeout(timer); if (this.port === port) this.port = null; try { port.disconnect(); } catch {} };
    port.onMessage.addListener((message) => {
      if (!message || message.protocol !== PROTOCOL_VERSION) return;
      if (message.type === 'job-progress') { onProgress(message); return; }
      if (message.type === 'item-start') {
        items.set(message.requestId, { item: CollectedItem.fromObject(message), chunks: [], audio: message.audio || null });
        return;
      }
      if (message.type === 'item-metadata') {
        const entry = items.get(message.requestId) || { item: CollectedItem.fromObject(message), chunks: [] };
        entry.item = CollectedItem.fromObject({ ...entry.item, ...message });
        entry.audio = message.audio || null;
        items.set(message.requestId, entry);
        return;
      }
      if (message.type === CHUNK_TYPE) {
        const entry = items.get(message.requestId);
        if (!entry) return;
        entry.chunks[message.sequence] = message.data || '';
        try { port.postMessage({ type: 'audio-chunk-ack', protocol: PROTOCOL_VERSION, jobId: message.jobId, requestId: message.requestId, sequence: message.sequence }); } catch {}
        return;
      }
      if (message.type === 'item-complete') {
        const entry = items.get(message.requestId);
        if (!entry) return;
        if (entry.audio && entry.chunks.length) {
          const blob = base64ToBlob(entry.chunks, entry.audio.mimeType);
          entry.item.audio = AudioAttachment.fromObject({ id: message.requestId, blob, fileName: entry.audio.fileName, mimeType: entry.audio.mimeType, size: blob.size });
        }
        return;
      }
      if (message.type === 'item-error') { onProgress(message); return; }
      if (message.type === 'job-error') { cleanup(); rejectJob(new Error(message.message || 'The extension failed to collect the assignments.')); return; }
      if (message.type === 'job-complete') {
        cleanup();
        resolveJob({ playlist, items: assignments.map((assignment) => items.get(assignment.id)?.item).filter(Boolean) });
      }
    });
    port.onDisconnect.addListener(() => {
      if (this.port === port) { clearTimeout(timer); this.port = null; rejectJob(new Error('The extension connection was closed before collection finished.')); }
    });
    try {
      port.postMessage({ type: 'collect-start', protocol: PROTOCOL_VERSION, jobId: `job-${crypto.randomUUID()}`, playlist, assignments: assignments.map((assignment) => assignment.toObject()) });
    } catch (error) { cleanup(); rejectJob(error); }
    return job;
  }

  cancel(jobId) { if (this.port) this.port.postMessage({ type: 'collect-cancel', protocol: PROTOCOL_VERSION, jobId }); }
}
