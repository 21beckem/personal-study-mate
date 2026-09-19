const waitFor = async (predicate, timeoutMs = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The article content did not finish loading.');
};

const textOf = (element) => String(element?.innerText || '').replace(/\s+/g, ' ').trim();

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
};

const titleOf = () => textOf(document.querySelector('article header h1, article header h2'))
  || document.querySelector('meta[property="og:title"]')?.content?.trim()
  || document.title.trim()
  || 'Untitled item';

const scripturePage = () => /\/study\/scriptures\//i.test(location.pathname)
  || Boolean(document.querySelector('article .body-block .verse-number'));

const standardParagraphs = () => [...document.querySelectorAll(`
  article .body-block > p,
  article .body-block > section > p,
  article .body-block .poetry
`)].map((element) => ({ number: null, text: textOf(element) })).filter((paragraph) => paragraph.text);

const scriptureParagraphs = () => {
  const headers = [...document.querySelectorAll('article header > *')]
    .map((element) => ({ number: null, text: textOf(element) }))
    .filter((paragraph) => paragraph.text);
  const verses = [...document.querySelectorAll('article .body-block > p')].map((paragraph) => {
    const marker = paragraph.querySelector('.verse-number') || paragraph.firstElementChild;
    const markerText = textOf(marker);
    let text = textOf(paragraph);
    if (markerText) {
      const markerIndex = text.indexOf(markerText);
      if (markerIndex >= 0 && markerIndex < 12) text = text.slice(markerIndex + markerText.length).trim();
    }
    const numberMatch = markerText.match(/\d+/);
    return { number: numberMatch ? Number(numberMatch[0]) : null, text };
  }).filter((paragraph) => paragraph.text);
  return [...headers, ...verses];
};

const audioSourceOf = async () => {
  try {
    document.querySelector('button[class*="AudioPlayer"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const audio = await waitFor(() => document.querySelector('audio')?.currentSrc, 2500);
    if (!audio) return null;
    if (!audio.startsWith('blob:')) return { url: audio, inline: null };
    try {
      const response = await fetch(audio);
      const blob = await response.blob();
      return { url: audio, inline: { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: blob.type || 'audio/mpeg', fileName: 'recording.mp3' } };
    } catch { return { url: audio, inline: null }; }
  } catch {
    return null;
  }
};

const scrape = async () => {
  await waitFor(() => document.querySelector('article .body-block'));
  const isScripture = scripturePage();
  return {
    title: titleOf(),
    sourceUrl: location.href,
    paragraphs: isScripture ? scriptureParagraphs() : standardParagraphs(),
    audioSource: await audioSourceOf(),
  };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'scrape-page') return false;
  scrape().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});
