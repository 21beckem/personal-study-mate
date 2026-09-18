import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Playlist } from '../models.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('playlist-details-form-construction-token');

export class PlaylistDetailsForm extends EventEmitterMixin(DOMElement) {
  constructor({ playlist }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaylistDetailsForm must be created with PlaylistDetailsForm.fromObject().');
    this.playlist = playlist;
    this.#build();
  }

  static fromObject(value) { return new PlaylistDetailsForm(value, CONSTRUCTION_TOKEN); }

  setPlaylist(playlist) { this.playlist = playlist; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]);
    Utils.buildDOM(['h3', 'Playlist details'], this.node);
    if (!this.playlist) { Utils.buildDOM(['p', 'Create or select a playlist.'], this.node); if (parent) parent.append(this.node); return; }
    const title = Utils.ui.input('text', 'Playlist title'); title.value = this.playlist.title;
    const description = Utils.ui.textarea('Optional description'); description.value = this.playlist.description;
    const update = () => this.emit('changed', EditorEvent.fromObject({ kind: 'playlist-changed', entity: Playlist.fromObject({ ...this.playlist.toObject(), title: title.value, description: description.value }) }));
    this.addDOMEventListener(title, 'input', update); this.addDOMEventListener(description, 'input', update);
    this.node.append(Utils.ui.label('Title'), title, Utils.ui.label('Description'), description);
    if (parent) parent.append(this.node);
  }
}
