const PROTOCOL_VERSION = 1;
const CHUNK_BYTES = 512 * 1024;
const allowedAppOrigins = new Set(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:5500', 'http://127.0.0.1:5500']);
const allowedHosts = ['churchofjesuschrist.org', 'lds.org'];
const jobs = new Map();

const isAllowedHost = (hostname) => allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
const isAllowedUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isAllowedHost(url.hostname.toLowerCase());
  } catch { return false; }
};

const send = (port, message) => port.postMessage({ protocol: PROTOCOL_VERSION, ...message });

const bytesToBase64 = (bytes) => {
  let result = '';
  const binaryChunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += binaryChunkSize) result += String.fromCharCode(...bytes.subarray(index, index + binaryChunkSize));
  return btoa(result);
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

const fetchAudio = async (audioUrl) => {
  if (!audioUrl || !isAllowedUrl(audioUrl)) return null;
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`Audio request failed with ${response.status}.`);
  const blob = await response.blob();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'audio/mpeg', fileName: fileNameFor(audioUrl, blob.type || '') };
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
      if (!isAllowedUrl(assignment.url)) throw new Error(`Unsupported assignment URL: ${assignment.url}`);
      send(port, { type: 'item-start', jobId: job.id, requestId: assignment.id, title: assignment.label, sourceUrl: assignment.url });
      send(port, { type: 'job-progress', jobId: job.id, completed: index, total: assignments.length, message: `Opening ${assignment.label || assignment.url}` });
      const tab = await chrome.tabs.create({ url: assignment.url, active: false });
      try {
        const scraped = await scrapeTab(tab.id);
        let audio = null;
        if (scraped.audioUrl) {
          try { audio = await fetchAudio(scraped.audioUrl); } catch (error) { send(port, { type: 'item-error', jobId: job.id, requestId: assignment.id, message: `Audio unavailable: ${error.message}` }); }
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
  if (!allowedAppOrigins.has(origin) || port.name !== 'personal-study-mate-v1') { port.disconnect(); return; }
  port.onMessage.addListener((message) => {
    if (!message || message.protocol !== PROTOCOL_VERSION) return;
    if (message.type === 'hello') { send(port, { type: 'hello-response' }); return; }
    if (message.type === 'collect-start') { collect(port, message); return; }
    const job = jobs.get(port);
    if (message.type === 'collect-cancel' && job?.id === message.jobId) { job.cancelled = true; return; }
    if (message.type === 'audio-chunk-ack' && job?.id === message.jobId) {
      const pending = job.pending.get(`${message.requestId}:${message.sequence}`);
      if (pending) { job.pending.delete(`${message.requestId}:${message.sequence}`); pending.resolve(); }
    }
  });
  port.onDisconnect.addListener(() => {
    const job = jobs.get(port);
    if (!job) return;
    job.cancelled = true;
    job.pending.forEach(({ reject }) => reject(new Error('The web app disconnected.')));
    jobs.delete(port);
  });
});
