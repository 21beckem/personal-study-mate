import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('library-view-construction-token');

export class LibraryView extends EventEmitterMixin(DOMElement) {
  constructor({ target, store, onNew, onOpen, onEdit, onDelete, onExport, onImport, extensionAvailable = false, onCollect }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LibraryView must be created with LibraryView.fromObject().');
    this.target = target; this.store = store; this.onNew = onNew; this.onOpen = onOpen; this.onEdit = onEdit; this.onDelete = onDelete; this.onExport = onExport; this.onImport = onImport; this.extensionAvailable = extensionAvailable; this.onCollect = onCollect; this.packageListener = () => this.render(); this.store.on('package-changed', this.packageListener);
  }

  static fromObject(value) { return new LibraryView(value, CONSTRUCTION_TOKEN); }

  render() {
    const parent = this.node?.parentNode || this.target;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['div', { class: 'library-view' }]);
    Utils.buildDOM(['h2', 'Library'], this.node);
    const newButton = Utils.ui.button('New playlist'); const exportButton = Utils.ui.button('Export package'); const importButton = Utils.ui.button('Import package');
    this.addDOMEventListener(newButton, 'click', this.onNew); this.addDOMEventListener(exportButton, 'click', this.onExport);
    const importInput = Utils.ui.input('file'); importInput.accept = '.json,application/json'; importInput.hidden = true;
    this.addDOMEventListener(importButton, 'click', () => importInput.click()); this.addDOMEventListener(importInput, 'change', () => { if (importInput.files[0]) this.onImport(importInput.files[0]); importInput.value = ''; });
    this.node.append(newButton, exportButton, importButton, importInput);
    if (this.extensionAvailable) this.#renderCollector();
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

  #renderCollector() {
    const section = Utils.buildDOM(['section', { class: 'card collection-panel' }]);
    Utils.buildDOM(['h3', 'Collect Gospel Library assignments'], section);
    Utils.buildDOM(['p', 'Paste the assignment list copied from your course page. Links to ChurchofJesusChrist.org will be collected in the background.'], section);
    const title = Utils.ui.input('text', 'Playlist title'); title.value = 'Collected assignments';
    const description = Utils.ui.input('text', 'Playlist description');
    const pasted = Utils.ui.textarea('Paste the assignment list here');
    const collect = Utils.ui.button('Collect assignments');
    pasted.clipboardHtml = '';
    this.addDOMEventListener(pasted, 'paste', (event) => { pasted.clipboardHtml = event.clipboardData?.getData('text/html') || ''; });
    this.addDOMEventListener(collect, 'click', () => this.onCollect({ title: title.value, description: description.value, html: pasted.clipboardHtml || pasted.value, button: collect }));
    section.append(title, description, pasted, collect); this.node.append(section);
  }

  destroy() { this.store.off('package-changed', this.packageListener); super.destroy(); }
}
