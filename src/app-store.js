import { EventEmitterMixin } from './modules.js';
import { Playlist, StudyPackage } from './models.js';

const CONSTRUCTION_TOKEN = Symbol('app-store-construction-token');

export class AppStore extends EventEmitterMixin(Object) {
  constructor({ database, packageData }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AppStore must be created with AppStore.fromObject().');
    this.database = database;
    this.packageData = packageData;
    this.activePlaylistId = packageData.playlists[0]?.id || null;
    this.activeItemId = null;
  }

  static async fromObject({ database }) {
    return new AppStore({ database, packageData: await database.readPackage() }, CONSTRUCTION_TOKEN);
  }

  get activePlaylist() { return this.packageData.playlists.find((playlist) => playlist.id === this.activePlaylistId) || null; }
  get activeItems() { return this.activePlaylist ? this.activePlaylist.itemIds.map((id) => this.packageData.items.find((item) => item.id === id)).filter(Boolean) : []; }
  get activeItem() { return this.packageData.items.find((item) => item.id === this.activeItemId) || null; }

  selectPlaylist(id) {
    if (!this.packageData.playlists.some((playlist) => playlist.id === id)) return;
    this.activePlaylistId = id;
    this.activeItemId = this.packageData.playlists.find((playlist) => playlist.id === id)?.itemIds[0] || null;
    this.emit('selection-changed', this);
  }

  selectItem(id) {
    if (this.activeItems.some((item) => item.id === id)) { this.activeItemId = id; this.emit('selection-changed', this); }
  }

  replacePackage(packageData) {
    this.packageData = packageData;
    this.emit('package-changed', this);
  }

  createPlaylist() {
    const playlist = Playlist.fromObject({ title: 'New playlist' });
    this.replacePackage(StudyPackage.fromObject({ playlists: [...this.packageData.playlists, playlist], items: this.packageData.items }));
    this.selectPlaylist(playlist.id);
    return playlist;
  }

  async save() {
    await this.database.putPackage(this.packageData);
    this.emit('saved', this);
  }

  async deletePlaylist(id) {
    await this.database.deletePlaylist(id);
    this.packageData = await this.database.readPackage();
    if (this.activePlaylistId === id) { this.activePlaylistId = this.packageData.playlists[0]?.id || null; this.activeItemId = this.activePlaylist?.itemIds[0] || null; }
    this.emit('package-changed', this);
  }

  async reload() {
    this.packageData = await this.database.readPackage();
    if (!this.activePlaylist) this.activePlaylistId = this.packageData.playlists[0]?.id || null;
    this.activeItemId = this.activePlaylist?.itemIds[0] || null;
    this.emit('package-changed', this);
  }
}
