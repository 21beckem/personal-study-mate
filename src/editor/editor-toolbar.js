import { DOMElement, EventEmitterMixin } from '../modules.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('editor-toolbar-construction-token');

export class EditorToolbar extends EventEmitterMixin(DOMElement) {
  constructor({ dirty = false }, token) { super(); if (token !== CONSTRUCTION_TOKEN) throw new Error('EditorToolbar must be created with EditorToolbar.fromObject().'); this.dirty = dirty; this.#build(); }
  static fromObject(value) { return new EditorToolbar(value, CONSTRUCTION_TOKEN); }
  setDirty(dirty) { this.dirty = dirty; const label = this.node?.querySelector('[data-dirty]'); if (label) label.textContent = dirty ? 'Unsaved changes' : 'Saved'; }
  #build() { this.node = Utils.buildDOM(['div', { class: 'editor-toolbar' }]); const save = Utils.ui.button('Save'); const revert = Utils.ui.button('Revert'); const dirty = Utils.buildDOM(['span', { 'data-dirty': 'true' }, this.dirty ? 'Unsaved changes' : 'Saved']); this.addDOMEventListener(save, 'click', () => this.emit('save', EditorEvent.fromObject({ kind: 'save-requested' }))); this.addDOMEventListener(revert, 'click', () => this.emit('revert', EditorEvent.fromObject({ kind: 'revert-requested' }))); this.node.append(save, revert, dirty); }
}
