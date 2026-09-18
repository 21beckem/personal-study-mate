import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('library-view-construction-token');

export class LibraryView extends EventEmitterMixin(DOMElement) {
  constructor({ target, store, onNew, onOpen, onEdit, onDelete, onExport }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LibraryView must be created with LibraryView.fromObject().');
    this.target = target; this.store = store; this.onNew = onNew; this.onOpen = onOpen; this.onEdit = onEdit; this.onDelete = onDelete; this.onExport = onExport; this.packageListener = () => this.render(); this.store.on('package-changed', this.packageListener);
  }

  static fromObject(value) { return new LibraryView(value, CONSTRUCTION_TOKEN); }

  render() {
    const parent = this.node?.parentNode || this.target;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['div', { class: 'library-view' }]);
    Utils.buildDOM(['h2', 'Library'], this.node);
    const newButton = Utils.ui.button('New playlist'); const exportButton = Utils.ui.button('Export JSON');
    this.addDOMEventListener(newButton, 'click', this.onNew); this.addDOMEventListener(exportButton, 'click', this.onExport);
    this.node.append(newButton, exportButton);
    const list = Utils.buildDOM(['div', { class: 'library-list' }]); this.node.append(list);
    this.store.packageData.playlists.forEach((playlist) => {
      const card = Utils.buildDOM(['section', { class: 'card' }]);
      Utils.buildDOM(['h3', playlist.title], card); Utils.buildDOM(['p', `${playlist.itemIds.length} item(s)`], card);
      const open = Utils.ui.button('Open in Player'); const edit = Utils.ui.button('Edit'); const remove = Utils.ui.button('Delete');
      this.addDOMEventListener(open, 'click', () => this.onOpen(playlist.id)); this.addDOMEventListener(edit, 'click', () => this.onEdit(playlist.id)); this.addDOMEventListener(remove, 'click', () => this.onDelete(playlist.id));
      card.append(open, edit, remove); list.append(card);
    });
    parent.append(this.node);
  }

  destroy() { this.store.off('package-changed', this.packageListener); super.destroy(); }
}
