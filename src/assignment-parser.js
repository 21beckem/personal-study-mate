import { createId } from './ids.js';

const CONSTRUCTION_TOKEN = Symbol('assignment-request-construction-token');
const allowedHosts = new Set(['www.churchofjesuschrist.org', 'churchofjesuschrist.org', 'www.lds.org', 'lds.org']);
const visibleText = (element) => {
  const copy = element?.cloneNode?.(true);
  copy?.querySelectorAll?.('.screenreader-only, .external_link_icon').forEach((node) => node.remove());
  return String(copy?.innerText || copy?.textContent || element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
};

const validUrlFrom = (value) => {
  try {
    const url = new URL(value);
    if (!allowedHosts.has(url.hostname.toLowerCase())) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
};

const inlineTextFrom = (listItem) => {
  const match = visibleText(listItem).match(/^["“]\s*(.*?)["”]\s*(?:\(|$)/);
  return match?.[1]?.trim() || '';
};

export const parseVerseSelection = (label) => {
  const match = String(label || '').match(/:\s*([0-9][0-9\s,–—-]*)\s*$/);
  if (!match) return null;
  const verses = new Set();
  for (const part of match[1].replace(/[–—]/g, '-').split(',')) {
    const values = part.trim().split('-').map((value) => Number.parseInt(value.trim(), 10));
    if (!values.every(Number.isInteger) || values.length > 2 || values[0] < 1 || (values[1] !== undefined && values[1] < values[0])) return null;
    const end = values[1] ?? values[0];
    for (let verse = values[0]; verse <= end; verse++) verses.add(verse);
  }
  return verses.size ? verses : null;
};

export class AssignmentRequest {
  constructor({ id, kind = 'url', label = '', url = '', text = '' }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AssignmentRequest must be created with AssignmentRequest.fromObject().');
    this.id = id;
    this.kind = kind === 'text' ? 'text' : 'url';
    this.label = String(label || '').trim();
    this.url = String(url || '').trim();
    this.text = String(text || '').trim();
  }

  static fromObject(value = {}) {
    return new AssignmentRequest({
      id: value.id || createId('assignment'),
      kind: value.kind,
      label: value.label,
      url: String(value.url || '').trim(),
      text: value.text,
    }, CONSTRUCTION_TOKEN);
  }

  toObject() { return { id: this.id, kind: this.kind, label: this.label, url: this.url, text: this.text }; }

  static parseClipboard(html) {
    const documentFragment = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const seen = new Set();
    const assignments = [];
    const listItems = [...documentFragment.querySelectorAll('li')];
    listItems.forEach((listItem) => {
      const inlineText = inlineTextFrom(listItem);
      if (inlineText) {
        assignments.push(AssignmentRequest.fromObject({ kind: 'text', label: inlineText, text: inlineText }));
        return;
      }
      const anchor = [...listItem.querySelectorAll('a[href]')].find((candidate) => validUrlFrom(candidate.href));
      const url = validUrlFrom(anchor?.href);
      if (!url || seen.has(url)) return;
      seen.add(url);
      assignments.push(AssignmentRequest.fromObject({ label: visibleText(anchor) || visibleText(listItem), url }));
    });
    if (!listItems.length) documentFragment.querySelectorAll('a[href]').forEach((anchor) => {
      const url = validUrlFrom(anchor.href);
      if (!url || seen.has(url)) return;
      seen.add(url);
      assignments.push(AssignmentRequest.fromObject({ label: visibleText(anchor), url }));
    });
    if (!assignments.length) {
      String(html || '').match(/https?:\/\/[^\s<>"']+/g)?.forEach((value) => {
        const normalized = validUrlFrom(value.replace(/[),.;]+$/, ''));
        if (!normalized) return;
        if (!seen.has(normalized)) { seen.add(normalized); assignments.push(AssignmentRequest.fromObject({ url: normalized, label: normalized })); }
      });
    }
    return assignments;
  }
}
