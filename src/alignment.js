import { Paragraph, WordTiming } from './models.js';

const normalize = (word) => word.toLowerCase().replace(/[^a-z0-9']/g, '');
const tokenize = (text) => String(text || '').match(/[A-Za-z0-9']+/g) || [];
const CONSTRUCTION_TOKEN = Symbol('alignment-construction-token');

export class TranscriptAligner {
  constructor(token) { if (token !== CONSTRUCTION_TOKEN) throw new Error('TranscriptAligner must be created with TranscriptAligner.fromObject().'); }

  static fromObject() {
    return new TranscriptAligner(CONSTRUCTION_TOKEN);
  }

  align(transcript, paragraphs) {
    const paragraphWords = [];
    paragraphs.forEach((paragraph, paragraphIndex) => tokenize(paragraph.text).forEach((raw, indexInParagraph) => paragraphWords.push({ raw, norm: normalize(raw), paragraphIndex, indexInParagraph })));
    const sttWords = transcript.chunks.map((chunk) => ({ norm: normalize(chunk.text), start: chunk.timestamp[0], end: chunk.timestamp[1] }));
    const n = paragraphWords.length;
    const m = sttWords.length;
    const MATCH = 2; const MISMATCH = -1; const GAP = -2;
    const score = new Int32Array((n + 1) * (m + 1));
    const trace = new Uint8Array((n + 1) * (m + 1));
    const index = (i, j) => i * (m + 1) + j;
    for (let i = 0; i <= n; i++) score[index(i, 0)] = i * GAP;
    for (let j = 0; j <= m; j++) score[index(0, j)] = j * GAP;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const diagonal = score[index(i - 1, j - 1)] + (paragraphWords[i - 1].norm === sttWords[j - 1].norm ? MATCH : MISMATCH);
      const up = score[index(i - 1, j)] + GAP; const left = score[index(i, j - 1)] + GAP;
      let best = diagonal; let direction = 0;
      if (up > best) { best = up; direction = 1; }
      if (left > best) { best = left; direction = 2; }
      score[index(i, j)] = best; trace[index(i, j)] = direction;
    }
    const matched = Array(n).fill(null);
    let i = n; let j = m;
    while (i > 0 || j > 0) {
      const direction = i > 0 && j > 0 ? trace[index(i, j)] : (i > 0 ? 1 : 2);
      if (direction === 0) { matched[i - 1] = { start: sttWords[j - 1].start, end: sttWords[j - 1].end }; i--; j--; }
      else if (direction === 1) { i--; } else { j--; }
    }
    const interpolated = matched.map((value) => value);
    let gapStart = -1;
    for (let cursor = 0; cursor <= n; cursor++) {
      const isGap = cursor < n && interpolated[cursor] === null;
      if (isGap && gapStart === -1) gapStart = cursor;
      if (!isGap && gapStart !== -1) {
        const before = gapStart > 0 ? interpolated[gapStart - 1] : null;
        const after = cursor < n ? interpolated[cursor] : null;
        const beforeTime = before ? before.end : (after ? after.start : 0);
        const afterTime = after ? after.start : beforeTime;
        const span = cursor - gapStart;
        for (let offset = 0; offset < span; offset++) interpolated[gapStart + offset] = { start: span === 1 ? beforeTime : beforeTime + ((afterTime - beforeTime) * (offset + 1)) / (span + 1), end: span === 1 ? beforeTime : beforeTime + ((afterTime - beforeTime) * (offset + 1)) / (span + 1), interpolated: true };
        gapStart = -1;
      }
    }
    const results = paragraphs.map((paragraph) => Paragraph.fromObject({ id: paragraph.id, number: paragraph.number, text: paragraph.text, words: [] }));
    paragraphWords.forEach((word, globalIndex) => results[word.paragraphIndex].words.push(WordTiming.fromObject({ text: word.raw, ...interpolated[globalIndex] })));
    results.forEach((paragraph) => {
      paragraph.start = paragraph.words[0]?.start || 0;
      paragraph.end = paragraph.words.at(-1)?.end || paragraph.start;
    });
    results.slice(0, -1).forEach((paragraph, index) => { paragraph.end = results[index + 1].start; });
    return results;
  }
}
