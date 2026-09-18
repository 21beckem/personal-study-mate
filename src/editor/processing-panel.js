import { DOMElement, EventEmitterMixin } from '../modules.js';
import { ProcessingProgress } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('processing-panel-construction-token');

export class ProcessingPanel extends EventEmitterMixin(DOMElement) {
  constructor({ item, getAttachment, processor }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ProcessingPanel must be created with ProcessingPanel.fromObject().');
    this.item = item; this.getAttachment = getAttachment; this.processor = processor; this.progressListener = (progress) => this.#setProgress(progress); this.processor.on('progress', this.progressListener); this.#build();
  }

  static fromObject(value) { return new ProcessingPanel(value, CONSTRUCTION_TOKEN); }
  setItem(item) { this.item = item; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]);
    Utils.buildDOM(['h3', 'Audio processing'], this.node);
    if (!this.item || this.item.type !== 'audio') { Utils.buildDOM(['p', 'Processing is available for pre-recorded audio items.'], this.node); if (parent) parent.append(this.node); return; }
    const message = Utils.ui.status(); message.dataset.processingMessage = 'true';
    const process = Utils.ui.button(this.item.status === 'ready' ? 'Processed' : 'Process audio'); process.disabled = this.item.status === 'ready';
    const unlock = Utils.ui.button('Unlock and reprocess'); unlock.disabled = this.item.status !== 'ready';
    this.addDOMEventListener(process, 'click', async () => { try { const attachment = await this.getAttachment(this.item); const processed = await this.processor.process(this.item, attachment); this.emit('processed', processed); } catch (error) { message.textContent = error.message; } });
    this.addDOMEventListener(unlock, 'click', () => this.emit('unlock', this.item));
    this.node.append(message, process, unlock);
    if (this.item.processing) Utils.buildDOM(['p', `Processed: ${this.item.processing.processedAt}`], this.node);
    if (parent) parent.append(this.node);
  }

  #setProgress(progress) { if (!(progress instanceof ProcessingProgress)) return; const message = this.node?.querySelector('[data-processing-message]'); if (message) message.textContent = progress.percent === null ? progress.message : `${progress.message} (${progress.percent}%)`; }
  destroy() { this.processor.off('progress', this.progressListener); super.destroy(); }
}
