import { DOMElement, EventEmitterMixin } from '../modules.js';
import { PlaybackSelection } from '../models.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('playback-selection-editor-construction-token');

export class PlaybackSelectionEditor extends EventEmitterMixin(DOMElement) {
  constructor({ item }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaybackSelectionEditor must be created with PlaybackSelectionEditor.fromObject().');
    this.item = item; this.#build();
  }

  static fromObject(value) { return new PlaybackSelectionEditor(value, CONSTRUCTION_TOKEN); }
  setItem(item) { this.item = item; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]); Utils.buildDOM(['h3', 'Playback selection'], this.node);
    if (!this.item) { if (parent) parent.append(this.node); return; }
    const selection = this.item.playbackSelection || PlaybackSelection.fromObject({ playAll: true });
    const all = Utils.ui.checkbox('Play all paragraphs'); all.input.checked = selection.playAll; this.addDOMEventListener(all.input, 'change', () => this.emit('changed', EditorEvent.fromObject({ kind: 'selection-changed', entity: PlaybackSelection.fromObject({ playAll: all.input.checked, paragraphIds: [] }) })));
    this.node.append(all);
    this.item.paragraphs.forEach((paragraph) => { const checkbox = Utils.ui.checkbox(paragraph.number ? `Paragraph ${paragraph.number}` : 'Paragraph'); checkbox.input.checked = !selection.playAll && selection.paragraphIds.includes(paragraph.id); checkbox.input.disabled = selection.playAll; this.addDOMEventListener(checkbox.input, 'change', () => { const ids = [...this.node.querySelectorAll('input[type="checkbox"][data-paragraph-id]')].filter((input) => input.checked).map((input) => input.dataset.paragraphId); this.emit('changed', EditorEvent.fromObject({ kind: 'selection-changed', entity: PlaybackSelection.fromObject({ playAll: false, paragraphIds: ids }) })); }); checkbox.input.dataset.paragraphId = paragraph.id; this.node.append(checkbox); });
    if (parent) parent.append(this.node);
  }
}
