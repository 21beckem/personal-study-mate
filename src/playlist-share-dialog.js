import { DOMElement } from './modules.js';
import { Utils } from './utils.js';

const CONSTRUCTION_TOKEN = Symbol('playlist-share-dialog-construction-token');

export class PlaylistShareDialog extends DOMElement {
  constructor({ target, url, title = 'Playlist' }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaylistShareDialog must be created with PlaylistShareDialog.fromObject().');
    this.target = target;
    this.url = url;
    this.title = title;
    this.#build();
  }

  static fromObject(value) {
    return new PlaylistShareDialog(value, CONSTRUCTION_TOKEN);
  }

  async #renderQr(canvas, fallback) {
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      const qrCode = module.default || module;
      await qrCode.toCanvas(canvas, this.url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
        color: { dark: '#14213d', light: '#f8f7ee' }
      });
      fallback.hidden = false;
    } catch (error) {
      fallback.hidden = false;
      fallback.textContent = `QR code could not be generated. Open this link instead: ${this.url}`;
      console.warn('[study-mate transfer] QR code generation failed.', error);
    }
  }

  #build() {
    const overlay = Utils.buildDOM(['div', { class: 'share-dialog-backdrop' }]);
    const dialog = Utils.buildDOM(['section', { class: 'share-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Send playlist to phone' }]);
    const heading = Utils.buildDOM(['h2', `Send “${this.title}” to phone`]);
    const instructions = Utils.buildDOM(['p', 'Scan this code with the phone. Keep this page and the local server running until the transfer finishes.']);
    const canvas = Utils.buildDOM(['canvas', { width: '280', height: '280', 'aria-label': 'Playlist transfer QR code' }]);
    const fallback = Utils.buildDOM(['p', { class: 'share-dialog__fallback', hidden: 'true' }, this.url]);
    const close = Utils.ui.button('Close'); close.className = 'text-button';
    this.addDOMEventListener(close, 'click', () => this.destroy());
    dialog.append(heading, instructions, canvas, fallback, close);
    overlay.append(dialog);
    this.node = overlay;
    this.target.append(this.node);
    this.#renderQr(canvas, fallback);
  }
}
