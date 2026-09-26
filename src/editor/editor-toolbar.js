import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('editor-toolbar-construction-token');

export class EditorToolbar extends EventEmitterMixin(DOMElement) {
  constructor({ dirty = false }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('EditorToolbar must be created with EditorToolbar.fromObject().');
    this.dirty = dirty;
    this.#build();
  }
  static fromObject(value) {
    return new EditorToolbar(value, CONSTRUCTION_TOKEN);
  }
  setDirty(dirty) {
    this.dirty = dirty;
    const label = this.node?.querySelector('[data-dirty]');
    if (label) label.textContent = dirty ? 'Unsaved changes' : 'Saved';
  }
  #build() {
    this.node = Utils.buildDOM(['div', {
      class: 'editor-toolbar'
    }]);
    const dirty = Utils.buildDOM(['span', {
      'data-dirty': 'true'
    }, this.dirty ? 'Unsaved changes' : 'Saved']);
    this.node.append(dirty);
  }
}
