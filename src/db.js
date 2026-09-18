import { Playlist, StudyItem, StudyPackage } from './models.js';

const DB_NAME = 'personal-study-mate';
const DB_VERSION = 1;
const CONSTRUCTION_TOKEN = Symbol('database-construction-token');

export class LocalDatabase {
  constructor(database, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LocalDatabase must be created with LocalDatabase.fromObject().');
    this.database = database;
  }

  static async fromObject() {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new LocalDatabase(database, CONSTRUCTION_TOKEN);
  }

  async putPackage(studyPackage) {
    const transaction = this.database.transaction(['playlists', 'items'], 'readwrite');
    studyPackage.playlists.forEach((playlist) => transaction.objectStore('playlists').put(playlist.toObject()));
    studyPackage.items.forEach((item) => transaction.objectStore('items').put(item.toObject()));
    await this.#complete(transaction);
  }

  async putAudio(id, blob, fileName) {
    const transaction = this.database.transaction('audio', 'readwrite');
    transaction.objectStore('audio').put({ id, blob, fileName });
    await this.#complete(transaction);
  }

  async getAudio(id) {
    const transaction = this.database.transaction('audio', 'readonly');
    return this.#request(transaction.objectStore('audio').get(id));
  }

  async readPackage() {
    const [playlists, items] = await Promise.all([this.#all('playlists'), this.#all('items')]);
    return StudyPackage.fromObject({ playlists: playlists.map((entry) => Playlist.fromObject(entry)), items: items.map((entry) => StudyItem.fromObject(entry)) });
  }

  async deletePlaylist(id) {
    const packageData = await this.readPackage();
    const playlist = packageData.playlists.find((entry) => entry.id === id);
    const transaction = this.database.transaction(['playlists', 'items'], 'readwrite');
    transaction.objectStore('playlists').delete(id);
    (playlist?.itemIds || []).forEach((itemId) => transaction.objectStore('items').delete(itemId));
    await this.#complete(transaction);
  }

  async #all(storeName) {
    const transaction = this.database.transaction(storeName, 'readonly');
    return this.#request(transaction.objectStore(storeName).getAll());
  }

  async #request(request) {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }

  async #complete(transaction) {
    return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  }
}
