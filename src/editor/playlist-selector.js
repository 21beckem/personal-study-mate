import { DOMElement, EventEmitterMixin } from '../modules.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('playlist-selector-construction-token');

export class PlaylistSelector extends EventEmitterMixin(DOMElement) {
  constructor({ playlists, activePlaylistId }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaylistSelector must be created with PlaylistSelector.fromObject().');
    this.playlists = playlists;
    this.activePlaylistId = activePlaylistId;
    this.#build();
  }

  static fromObject(value) { return new PlaylistSelector(value, CONSTRUCTION_TOKEN); }

  setPlaylists(playlists, activePlaylistId) { this.playlists = playlists; this.activePlaylistId = activePlaylistId; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]);
    Utils.buildDOM(['h3', 'Playlist'], this.node);
    const select = Utils.ui.select();
    this.playlists.forEach((playlist) => { const option = Utils.ui.option(playlist.title, playlist.id); option.selected = playlist.id === this.activePlaylistId; select.append(option); });
    const add = Utils.ui.button('New playlist'); const remove = Utils.ui.button('Delete playlist');
    this.addDOMEventListener(select, 'change', () => this.emit('selected', EditorEvent.fromObject({ kind: 'playlist-selected', entity: this.playlists.find((playlist) => playlist.id === select.value) })));
    this.addDOMEventListener(add, 'click', () => this.emit('create', EditorEvent.fromObject({ kind: 'playlist-create' })));
    this.addDOMEventListener(remove, 'click', () => this.emit('delete', EditorEvent.fromObject({ kind: 'playlist-delete' })));
    this.node.append(select, add, remove);
    if (parent) parent.append(this.node);
  }
}
