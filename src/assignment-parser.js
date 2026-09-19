const CONSTRUCTION_TOKEN = Symbol('assignment-request-construction-token');

export class AssignmentRequest {
  constructor({ id, label = '', url }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AssignmentRequest must be created with AssignmentRequest.fromObject().');
    this.id = id;
    this.label = String(label || '').trim();
    this.url = url;
  }

  static fromObject(value = {}) {
    return new AssignmentRequest({
      id: value.id || `assignment-${crypto.randomUUID()}`,
      label: value.label,
      url: String(value.url || '').trim(),
    }, CONSTRUCTION_TOKEN);
  }

  toObject() { return { id: this.id, label: this.label, url: this.url }; }

  static parseClipboard(html) {
    const documentFragment = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const seen = new Set();
    const assignments = [];
    documentFragment.querySelectorAll('li a[href]').forEach((anchor) => {
      let url;
      try { url = new URL(anchor.href); } catch { return; }
      const host = url.hostname.toLowerCase();
      if (!['www.churchofjesuschrist.org', 'churchofjesuschrist.org', 'www.lds.org', 'lds.org'].includes(host)) return;
      url.hash = '';
      const normalized = url.toString();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      assignments.push(AssignmentRequest.fromObject({ label: anchor.closest('li')?.innerText || anchor.innerText, url: normalized }));
    });
    if (!assignments.length) {
      String(html || '').match(/https?:\/\/[^\s<>"']+/g)?.forEach((value) => {
        let url;
        try { url = new URL(value.replace(/[),.;]+$/, '')); } catch { return; }
        const host = url.hostname.toLowerCase();
        if (!['www.churchofjesuschrist.org', 'churchofjesuschrist.org', 'www.lds.org', 'lds.org'].includes(host)) return;
        url.hash = '';
        const normalized = url.toString();
        if (!seen.has(normalized)) { seen.add(normalized); assignments.push(AssignmentRequest.fromObject({ url: normalized, label: normalized })); }
      });
    }
    return assignments;
  }
}
