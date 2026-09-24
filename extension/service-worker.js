const PROTOCOL_VERSION = 1;
const CHUNK_BYTES = 512 * 1024;
const TRANSCRIPTION_SERVER_URL = 'http://127.0.0.1:2094';
const SHARE_SERVER_URL = TRANSCRIPTION_SERVER_URL;
const allowedAppOrigins = new Set(['http://localhost:8000', 'http://localhost:5500', 'https://21beckem.github.io']);
const jobs = new Map();
const transcriptionJobs = new Map();
const shareJobs = new Map();

const send = (port, message) => port.postMessage({ protocol: PROTOCOL_VERSION, ...message });

const bytesToBase64 = (bytes) => {
  let result = '';
  const binaryChunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += binaryChunkSize) result += String.fromCharCode(...bytes.subarray(index, index + binaryChunkSize));
  return btoa(result);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const fileNameFor = (url, mimeType) => {
  try {
    const pathName = new URL(url).pathname.split('/').pop();
    if (pathName?.includes('.')) return pathName.split('?')[0];
  } catch {}
  const extension = mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'audio';
  return `recording.${extension}`;
};

const waitForTab = (tabId) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('The page load timed out.')); }, 30000);
  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
    clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve();
  };
  chrome.tabs.onUpdated.addListener(listener);
});

const scrapeTab = async (tabId) => {
  await waitForTab(tabId);
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'scrape-page' });
      if (result?.error) throw new Error(result.error);
      return result;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error('Unable to communicate with the page scraper.');
};

const fetchAudio = async (audioSource) => {
  if (!audioSource?.url) return null;
  if (audioSource.inline?.base64) {
    const bytes = base64ToBytes(audioSource.inline.base64);
    return { bytes, mimeType: audioSource.inline.mimeType || 'audio/mpeg', fileName: audioSource.inline.fileName || 'recording.mp3' };
  }
  try {
    const response = await fetch(audioSource.url);
    if (!response.ok) throw new Error(`Audio request failed with ${response.status}.`);
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'audio/mpeg', fileName: fileNameFor(audioSource.url, blob.type || '') };
  } catch (error) {
    throw new Error(`Failed to fetch audio: ${error.message}`);
  }
};

const bytesFromChunks = (chunks) => {
  const decoded = chunks.map((chunk) => base64ToBytes(chunk));
  const total = decoded.reduce((size, bytes) => size + bytes.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  decoded.forEach((bytes) => { result.set(bytes, offset); offset += bytes.length; });
  return result;
};

const readTranscriptionStream = async (port, job, response) => {
  if (!response.body) throw new Error('The transcription server returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const handleLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'progress') {
      if (!job.detached) send(port, { type: 'transcribe-progress', jobId: job.id, phase: event.phase, message: event.message, percent: event.percent, currentSeconds: event.currentSeconds, totalSeconds: event.totalSeconds });
    } else if (event.type === 'complete') {
      completed = true;
      if (!job.detached) send(port, { type: 'transcribe-complete', jobId: job.id, transcript: event.transcript });
    } else if (event.type === 'error') {
      throw new Error(event.message || 'The transcription server failed.');
    }
  };
  while (true) {
    if (job.cancelled) throw new Error('Transcription cancelled.');
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(handleLine);
    if (done) break;
  }
  if (buffer.trim()) handleLine(buffer);
  if (!completed) throw new Error('The transcription server closed before completing.');
};

const startTranscriptionKeepAlive = () => {
  const keepAlive = () => {
    try { chrome.runtime.getPlatformInfo(() => {}); } catch {}
  };
  keepAlive();
  const timer = setInterval(keepAlive, 20 * 1000);
  return () => clearInterval(timer);
};

const startShareKeepAlive = () => {
  const keepAlive = () => {
    try { chrome.runtime.getPlatformInfo(() => {}); } catch {}
  };
  keepAlive();
  const timer = setInterval(keepAlive, 20 * 1000);
  return () => clearInterval(timer);
};

const transcribe = async (port, job, request) => {
  const stopKeepAlive = startTranscriptionKeepAlive();
  try {
    const bytes = bytesFromChunks(job.chunks);
    const response = await fetch(`${TRANSCRIPTION_SERVER_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': request.mimeType || 'application/octet-stream',
        'X-Audio-Filename': request.fileName || 'recording.audio'
      },
      body: bytes,
      signal: job.controller.signal
    });
    if (!response.ok) throw new Error(`Local transcription server returned HTTP ${response.status}.`);
    await readTranscriptionStream(port, job, response);
  } catch (error) {
    if (!job.cancelled && !job.detached) send(port, { type: 'transcribe-error', jobId: job.id, message: error.message });
  } finally {
    stopKeepAlive();
    transcriptionJobs.delete(port);
  }
};

const share = async (port, job) => {
  const stopKeepAlive = startShareKeepAlive();
  try {
    const packageText = job.chunks.join('');
    const response = await fetch(`${SHARE_SERVER_URL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: packageText,
    });
    if (!response.ok) throw new Error(`Local sharing server returned HTTP ${response.status}.`);
    const result = await response.json();
    send(port, { type: 'share-complete', jobId: job.id, url: result.url, token: result.token, expiresIn: result.expiresIn });
  } catch (error) {
    if (!job.detached) send(port, { type: 'share-error', jobId: job.id, message: error.message });
  } finally {
    stopKeepAlive();
    shareJobs.delete(port);
  }
};

const sendAudio = async (port, job, requestId, audio) => {
  if (!audio) return;
  const total = Math.ceil(audio.bytes.length / CHUNK_BYTES);
  for (let sequence = 0; sequence < total; sequence++) {
    if (job.cancelled) throw new Error('Collection cancelled.');
    const pendingKey = `${requestId}:${sequence}`;
    const acknowledged = new Promise((resolve, reject) => { job.pending.set(pendingKey, { resolve, reject }); });
    const start = sequence * CHUNK_BYTES;
    send(port, { type: 'audio-chunk', jobId: job.id, requestId, sequence, total, data: bytesToBase64(audio.bytes.subarray(start, Math.min(start + CHUNK_BYTES, audio.bytes.length))) });
    await acknowledged;
  }
};

const collect = async (port, request) => {
  const job = { id: request.jobId, cancelled: false, pending: new Map() };
  jobs.set(port, job);
  const assignments = Array.isArray(request.assignments) ? request.assignments : [];
  try {
    for (let index = 0; index < assignments.length; index++) {
      if (job.cancelled) throw new Error('Collection cancelled.');
      const assignment = assignments[index];
      send(port, { type: 'item-start', jobId: job.id, requestId: assignment.id, title: assignment.label, sourceUrl: assignment.url });
      send(port, { type: 'job-progress', jobId: job.id, completed: index, total: assignments.length, message: `Opening ${assignment.label || assignment.url}` });
      const tab = await chrome.tabs.create({ url: assignment.url, active: false });
      try {
        const scraped = await scrapeTab(tab.id);
        let audio = null;
        if (scraped.audioSource) {
          try { audio = await fetchAudio(scraped.audioSource); } catch (error) { send(port, { type: 'item-error', jobId: job.id, requestId: assignment.id, message: `Audio unavailable: ${error.message}` }); }
        }
        send(port, { type: 'item-metadata', jobId: job.id, requestId: assignment.id, title: scraped.title || assignment.label, sourceUrl: scraped.sourceUrl || assignment.url, paragraphs: scraped.paragraphs || [], audio: audio ? { fileName: audio.fileName, mimeType: audio.mimeType, size: audio.bytes.length } : null });
        await sendAudio(port, job, assignment.id, audio);
        send(port, { type: 'item-complete', jobId: job.id, requestId: assignment.id });
      } finally {
        await chrome.tabs.remove(tab.id).catch(() => {});
      }
      send(port, { type: 'job-progress', jobId: job.id, completed: index + 1, total: assignments.length, message: `Collected ${index + 1} of ${assignments.length}` });
    }
    send(port, { type: 'job-complete', jobId: job.id });
  } catch (error) {
    job.pending.forEach(({ reject }) => reject(error));
    send(port, { type: 'job-error', jobId: job.id, message: error.message });
  } finally { jobs.delete(port); }
};

chrome.runtime.onConnectExternal.addListener((port) => {
  const origin = port.sender?.url ? new URL(port.sender.url).origin : '';
  const isReplitOrigin = /^https:\/\/([a-z0-9-]+\.)?replit\.(app|dev)$/i.test(origin);
  if ((!allowedAppOrigins.has(origin) && !isReplitOrigin) || port.name !== 'personal-study-mate-v1') { port.disconnect(); return; }
  port.onMessage.addListener((message) => {
    if (!message || message.protocol !== PROTOCOL_VERSION) return;
    if (message.type === 'hello') { send(port, { type: 'hello-response' }); return; }
    if (message.type === 'collect-start') { collect(port, message); return; }
    if (message.type === 'transcribe-start') {
      const job = { id: message.jobId, totalChunks: message.totalChunks, chunks: [], cancelled: false, detached: false, started: false, controller: new AbortController(), request: message };
      transcriptionJobs.set(port, job);
      return;
    }
    if (message.type === 'transcribe-audio-chunk') {
      const job = transcriptionJobs.get(port);
      if (!job || job.id !== message.jobId) return;
      job.chunks[message.sequence] = message.data || '';
      send(port, { type: 'transcribe-audio-ack', jobId: job.id, sequence: message.sequence });
      if (!job.started && job.chunks.filter(Boolean).length === job.totalChunks) {
        job.started = true;
        transcribe(port, job, job.request);
      }
      return;
    }
    if (message.type === 'transcribe-cancel') {
      const job = transcriptionJobs.get(port);
      if (job?.id === message.jobId) { job.cancelled = true; job.controller.abort(); transcriptionJobs.delete(port); }
      return;
    }
    if (message.type === 'share-start') {
      const job = { id: message.jobId, totalChunks: message.totalChunks, chunks: [], cancelled: false, detached: false, started: false };
      shareJobs.set(port, job);
      return;
    }
    if (message.type === 'share-package-chunk') {
      const job = shareJobs.get(port);
      if (!job || job.id !== message.jobId || !Number.isInteger(message.sequence)) return;
      job.chunks[message.sequence] = message.data || '';
      send(port, { type: 'share-package-chunk-ack', jobId: job.id, sequence: message.sequence });
      return;
    }
    if (message.type === 'share-complete') {
      const job = shareJobs.get(port);
      if (!job || job.id !== message.jobId || job.started || job.chunks.length !== job.totalChunks || job.chunks.some((chunk) => typeof chunk !== 'string')) return;
      job.started = true;
      share(port, job);
      return;
    }
    if (message.type === 'share-cancel') {
      const job = shareJobs.get(port);
      if (job?.id === message.jobId) { job.cancelled = true; shareJobs.delete(port); }
      return;
    }
    const job = jobs.get(port);
    if (message.type === 'collect-cancel' && job?.id === message.jobId) { job.cancelled = true; return; }
    if (message.type === 'audio-chunk-ack' && job?.id === message.jobId) {
      const pending = job.pending.get(`${message.requestId}:${message.sequence}`);
      if (pending) { job.pending.delete(`${message.requestId}:${message.sequence}`); pending.resolve(); }
    }
  });
  port.onDisconnect.addListener(() => {
    const job = jobs.get(port);
    if (job) {
      job.cancelled = true;
      job.pending.forEach(({ reject }) => reject(new Error('The web app disconnected.')));
      jobs.delete(port);
    }
    const transcriptionJob = transcriptionJobs.get(port);
    if (transcriptionJob) { transcriptionJob.detached = true; transcriptionJobs.delete(port); }
    const shareJob = shareJobs.get(port);
    if (shareJob) { shareJob.detached = true; shareJobs.delete(port); }
  });
});
