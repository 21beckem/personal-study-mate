import { EventEmitterMixin } from '../modules.js';
import { AudioAttachment, Paragraph, Playlist, StudyItem, StudyPackage } from '../models.js';
import { EditorEvent } from './editor-events.js';

const CONSTRUCTION_TOKEN = Symbol('editor-session-construction-token');

export class PlaylistEditorSession extends EventEmitterMixin(Object) {
  constructor({ packageData, database, store, activePlaylistId }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaylistEditorSession must be created with PlaylistEditorSession.fromObject().');
    this.packageData = packageData;
    this.database = database;
    this.store = store;
    this.activePlaylistId = activePlaylistId || packageData.playlists[0]?.id || null;
    this.activeItemId = this.activePlaylist?.itemIds[0] || null;
    this.attachments = new Map();
    this.dirty = false;
  }

  static fromObject(value) { return new PlaylistEditorSession(value, CONSTRUCTION_TOKEN); }

  get activePlaylist() { return this.packageData.playlists.find((playlist) => playlist.id === this.activePlaylistId) || null; }
  get activeItems() { return this.activePlaylist ? this.activePlaylist.itemIds.map((id) => this.findItem(id)).filter(Boolean) : []; }
  get activeItem() { return this.findItem(this.activeItemId); }
  findItem(id) { return this.packageData.items.find((item) => item.id === id) || null; }
  async getAttachment(item) {
    if (!item) return null;
    const draft = this.attachments.get(item.id);
    if (draft) return draft;
    if (!item.audioBlobId) return null;
    const record = await this.database.getAudio(item.audioBlobId);
    return record ? AudioAttachment.fromObject({ blob: record.blob, fileName: record.fileName || item.audioFileName, mimeType: record.blob.type, size: record.blob.size }) : null;
  }

  selectPlaylist(id) {
    if (!this.packageData.playlists.some((playlist) => playlist.id === id)) return;
    this.activePlaylistId = id;
    this.activeItemId = this.activePlaylist?.itemIds[0] || null;
    this.emit('playlist-selected', EditorEvent.fromObject({ kind: 'playlist-selected', entity: this.activePlaylist }));
    this.emit('item-selected', EditorEvent.fromObject({ kind: 'item-selected', entity: this.activeItem }));
  }

  selectItem(id) {
    if (!this.activePlaylist?.itemIds.includes(id)) return;
    this.activeItemId = id;
    this.emit('item-selected', EditorEvent.fromObject({ kind: 'item-selected', entity: this.activeItem }));
  }

  createPlaylist() {
    const playlist = Playlist.fromObject({ title: 'New playlist' });
    this.#replacePackage(StudyPackage.fromObject({ playlists: [...this.packageData.playlists, playlist], items: this.packageData.items }));
    this.activePlaylistId = playlist.id;
    this.activeItemId = null;
    this.#markDirty();
    this.emit('playlist-selected', EditorEvent.fromObject({ kind: 'playlist-selected', entity: playlist }));
    return playlist;
  }

  deleteActivePlaylist() {
    if (!this.activePlaylist) return;
    const remaining = this.packageData.playlists.filter((playlist) => playlist.id !== this.activePlaylist.id);
    this.#replacePackage(StudyPackage.fromObject({ playlists: remaining, items: this.packageData.items }));
    this.activePlaylistId = remaining[0]?.id || null;
    this.activeItemId = this.activePlaylist?.itemIds[0] || null;
    this.#markDirty();
    this.emit('playlist-selected', EditorEvent.fromObject({ kind: 'playlist-selected', entity: this.activePlaylist }));
  }

  updatePlaylist(playlist) {
    this.#replacePackage(StudyPackage.fromObject({ playlists: this.packageData.playlists.map((entry) => entry.id === playlist.id ? playlist : entry), items: this.packageData.items }));
    this.#markDirty();
    this.emit('playlist-changed', EditorEvent.fromObject({ kind: 'playlist-changed', entity: playlist }));
  }

  addItem(type = 'tts') {
    if (!this.activePlaylist) return null;
    const item = StudyItem.fromObject({ type, title: type === 'tts' ? 'New reading' : 'New recording', text: '' });
    const playlist = Playlist.fromObject({ ...this.activePlaylist.toObject(), itemIds: [...this.activePlaylist.itemIds, item.id] });
    this.#replacePackage(StudyPackage.fromObject({ playlists: this.packageData.playlists.map((entry) => entry.id === playlist.id ? playlist : entry), items: [...this.packageData.items, item] }));
    this.activeItemId = item.id;
    this.#markDirty();
    this.emit('item-selected', EditorEvent.fromObject({ kind: 'item-selected', entity: item }));
    return item;
  }

  removeItem(id) {
    const playlist = this.activePlaylist;
    if (!playlist) return;
    const item = this.findItem(id);
    const updatedPlaylist = Playlist.fromObject({ ...playlist.toObject(), itemIds: playlist.itemIds.filter((itemId) => itemId !== id) });
    this.#replacePackage(StudyPackage.fromObject({ playlists: this.packageData.playlists.map((entry) => entry.id === playlist.id ? updatedPlaylist : entry), items: this.packageData.items.filter((entry) => entry.id !== id) }));
    this.attachments.delete(id);
    this.activeItemId = updatedPlaylist.itemIds[0] || null;
    this.#markDirty();
    this.emit('item-removed', EditorEvent.fromObject({ kind: 'item-removed', entity: item }));
    this.emit('item-selected', EditorEvent.fromObject({ kind: 'item-selected', entity: this.activeItem }));
  }

  updateItem(item) {
    this.#replacePackage(StudyPackage.fromObject({ playlists: this.packageData.playlists, items: this.packageData.items.map((entry) => entry.id === item.id ? item : entry) }));
    this.#markDirty();
    this.emit('item-changed', EditorEvent.fromObject({ kind: 'item-changed', entity: item }));
  }

  updateItemText(item, text) {
    const updated = StudyItem.fromObject({ ...item.toObject(), text, paragraphs: Paragraph.splitText(text), status: 'draft', processing: null, playbackSelection: null });
    this.updateItem(updated);
  }

  updateParagraphs(item, paragraphs) {
    const preservesProcessing = item.paragraphs.length === paragraphs.length && item.paragraphs.every((previous, index) => sameParagraphContent(previous, paragraphs[index]));
    this.updateItem(StudyItem.fromObject({
      ...item.toObject(),
      paragraphs,
      status: preservesProcessing ? item.status : 'draft',
      processing: preservesProcessing ? item.processing?.toObject() || null : null,
      playbackSelection: null,
    }));
  }

  attachAudio(item, attachment) {
    this.attachments.set(item.id, attachment);
    this.updateItem(StudyItem.fromObject({ ...item.toObject(), audioFileName: attachment.fileName, audioBlobId: item.id, status: 'draft', processing: null }));
  }

  removeAudio(item) {
    this.attachments.delete(item.id);
    this.updateItem(StudyItem.fromObject({ ...item.toObject(), audioFileName: '', audioBlobId: null, status: 'draft', processing: null }));
  }

  reorderItems(itemIds) {
    if (!this.activePlaylist) return;
    this.updatePlaylist(Playlist.fromObject({ ...this.activePlaylist.toObject(), itemIds: [...itemIds] }));
  }

  async save() {
    for (const [itemId, attachment] of this.attachments) await this.database.putAudio(itemId, attachment.blob, attachment.fileName);
    await this.database.putPackage(this.packageData);
    this.attachments.clear();
    this.dirty = false;
    this.emit('save-completed', EditorEvent.fromObject({ kind: 'save-completed', entity: this.packageData }));
  }

  async revert() {
    this.packageData = await this.database.readPackage();
    this.store.replacePackage(this.packageData);
    this.activePlaylistId = this.packageData.playlists[0]?.id || null;
    this.activeItemId = this.activePlaylist?.itemIds[0] || null;
    this.attachments.clear();
    this.dirty = false;
    this.emit('reverted', EditorEvent.fromObject({ kind: 'reverted', entity: this.packageData }));
  }

  #replacePackage(packageData) { this.packageData = packageData; this.store.replacePackage(packageData); }
  #markDirty() { if (!this.dirty) { this.dirty = true; this.emit('dirty-changed', EditorEvent.fromObject({ kind: 'dirty-changed', entity: this.packageData })); } }
}

const sameParagraphContent = (left, right) => left && right
  && left.id === right.id
  && left.number === right.number
  && left.text === right.text
  && left.start === right.start
  && left.end === right.end
  && left.words.length === right.words.length
  && left.words.every((word, index) => {
    const other = right.words[index];
    return other
      && word.text === other.text
      && word.start === other.start
      && word.end === other.end
      && word.interpolated === other.interpolated;
  });
