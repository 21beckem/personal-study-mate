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
    const addTts = Utils.ui.button('Text'); addTts.className = 'add-button add-button--text'; addTts.prepend(Utils.buildDOM(['i', { class: 'fa-solid fa-quote-left' }]));
    const addAudio = Utils.ui.button('Audio'); addAudio.className = 'add-button add-button--audio'; addAudio.prepend(Utils.buildDOM(['i', { class: 'fa-solid fa-volume-low' }]));
    this.addDOMEventListener(addTts, 'click', () => this.emit('add', EditorEvent.fromObject({ kind: 'item-add', message: 'tts' })));
    this.addDOMEventListener(addAudio, 'click', () => this.emit('add', EditorEvent.fromObject({ kind: 'item-add', message: 'audio' })));
    this.node.append(heading, addTts, addAudio);
    this.items.forEach((item, index) => {
      const row = Utils.buildDOM(['div', { class: 'item-row editor-item' }]);
      const badge = Utils.buildDOM(['span', { class: `type-badge ${item.type === 'audio' ? 'type-audio' : 'type-text'}` }]);
      badge.append(Utils.buildDOM(['i', { class: `fa-solid ${item.type === 'audio' ? 'fa-volume-low' : 'fa-quote-left' }` }]));
      const select = Utils.buildDOM(['button', { type: 'button', class: 'item-title' }]);
      Utils.buildDOM(['strong', item.title], select); Utils.buildDOM(['small', `${item.paragraphs.length} paragraphs`], select); select.classList.toggle('active', item.id === this.activeItemId);
      const up = Utils.ui.button(''); up.className = 'move-button'; up.append(Utils.buildDOM(['i', { class: 'fa-solid fa-arrow-up' }]));
      const down = Utils.ui.button(''); down.className = 'move-button'; down.append(Utils.buildDOM(['i', { class: 'fa-solid fa-arrow-down' }]));
      const remove = Utils.ui.button('Remove'); remove.className = 'remove-item';
      this.addDOMEventListener(select, 'click', () => this.emit('selected', EditorEvent.fromObject({ kind: 'item-selected', entity: item })));
      this.addDOMEventListener(up, 'click', () => this.emit('reorder', EditorEvent.fromObject({ kind: 'item-reorder', entity: ItemReorder.fromObject({ from: index, to: index - 1 }) })));
      this.addDOMEventListener(down, 'click', () => this.emit('reorder', EditorEvent.fromObject({ kind: 'item-reorder', entity: ItemReorder.fromObject({ from: index, to: index + 1 }) })));
      this.addDOMEventListener(remove, 'click', () => this.emit('remove', EditorEvent.fromObject({ kind: 'item-remove', entity: item })));
      up.disabled = index === 0; down.disabled = index === this.items.length - 1;
      row.append(badge, select, up, down, remove); this.node.append(row);
    });
    const addItem = Utils.buildDOM(['div', { class: 'add-item' }]);
    Utils.buildDOM(['strong', 'Add item'], addItem); Utils.buildDOM(['small', 'Choose what you’d like to add to this playlist.'], addItem);
    const addActions = Utils.buildDOM(['div', { class: 'add-item__actions' }]); addActions.append(addTts, addAudio); addItem.append(addActions); this.node.append(addItem);
    if (parent) parent.append(this.node);
  }
}
