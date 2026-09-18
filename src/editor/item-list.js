import { DOMElement, EventEmitterMixin } from '../modules.js';
import { EditorEvent, ItemReorder } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('item-list-construction-token');

export class ItemList extends EventEmitterMixin(DOMElement) {
  constructor({ items, activeItemId }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ItemList must be created with ItemList.fromObject().');
    this.items = items; this.activeItemId = activeItemId; this.#build();
  }

  static fromObject(value) { return new ItemList(value, CONSTRUCTION_TOKEN); }

  setItems(items, activeItemId) { this.items = items; this.activeItemId = activeItemId; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]);
    const heading = Utils.buildDOM(['h3', 'Playlist items']);
    const addTts = Utils.ui.button('Add TTS item'); const addAudio = Utils.ui.button('Add audio item');
    this.addDOMEventListener(addTts, 'click', () => this.emit('add', EditorEvent.fromObject({ kind: 'item-add', message: 'tts' })));
    this.addDOMEventListener(addAudio, 'click', () => this.emit('add', EditorEvent.fromObject({ kind: 'item-add', message: 'audio' })));
    this.node.append(heading, addTts, addAudio);
    this.items.forEach((item, index) => {
      const row = Utils.buildDOM(['div', { class: 'item-row' }]);
      const select = Utils.ui.button(`${item.title} (${item.type})`); select.classList.toggle('active', item.id === this.activeItemId);
      const up = Utils.ui.button('↑'); const down = Utils.ui.button('↓'); const remove = Utils.ui.button('Remove');
      this.addDOMEventListener(select, 'click', () => this.emit('selected', EditorEvent.fromObject({ kind: 'item-selected', entity: item })));
      this.addDOMEventListener(up, 'click', () => this.emit('reorder', EditorEvent.fromObject({ kind: 'item-reorder', entity: ItemReorder.fromObject({ from: index, to: index - 1 }) })));
      this.addDOMEventListener(down, 'click', () => this.emit('reorder', EditorEvent.fromObject({ kind: 'item-reorder', entity: ItemReorder.fromObject({ from: index, to: index + 1 }) })));
      this.addDOMEventListener(remove, 'click', () => this.emit('remove', EditorEvent.fromObject({ kind: 'item-remove', entity: item })));
      up.disabled = index === 0; down.disabled = index === this.items.length - 1;
      row.append(select, up, down, remove); this.node.append(row);
    });
    if (parent) parent.append(this.node);
  }
}
