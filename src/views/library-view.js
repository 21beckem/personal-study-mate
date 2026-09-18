import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('library-view-construction-token');

export class LibraryView {
  constructor({ target, packageData, onRefresh, onOpen, onEdit, onDelete, onExport }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LibraryView must be created with LibraryView.fromObject().');
    Object.assign(this, { target, packageData, onRefresh, onOpen, onEdit, onDelete, onExport });
  }

  static fromObject(value) { return new LibraryView(value, CONSTRUCTION_TOKEN); }

  render() {
    this.target.replaceChildren();
    Utils.buildDOM(['h2', 'Library'], this.target);
    const refresh = Utils.ui.button('Refresh'); refresh.dataset.action = 'refresh'; refresh.onclick = this.onRefresh;
    const exportButton = Utils.ui.button('Export JSON'); exportButton.dataset.action = 'export'; exportButton.onclick = this.onExport;
    const list = Utils.buildDOM(['div']);
    this.target.append(refresh, exportButton, list);
    this.packageData.playlists.forEach((playlist) => {
      const card = Utils.buildDOM(['section', { class: 'card' }]);
      Utils.buildDOM(['h3', playlist.title], card);
      Utils.buildDOM(['p', `${playlist.itemIds.length} item(s)`], card);
      const open = button('Open in Player', () => this.onOpen(playlist.id));
      const edit = button('Edit JSON', () => this.onEdit(playlist.id));
      const remove = button('Delete', () => this.onDelete(playlist.id));
      card.append(open, edit, remove); list.append(card);
    });
  }
}

const button = (label, onclick) => { const element = Utils.ui.button(label); element.onclick = onclick; return element; };
