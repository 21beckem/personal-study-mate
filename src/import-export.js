import { AudioAttachment, PackageBundle, StudyItem, StudyPackage, Playlist } from './models.js';
const CONSTRUCTION_TOKEN = Symbol('codec-construction-token');

const toBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const remapBundle = (bundle) => {
  const playlistIds = new Map(bundle.studyPackage.playlists.map((playlist) => [playlist.id, crypto.randomUUID()]));
  const itemIds = new Map(bundle.studyPackage.items.map((item) => [item.id, crypto.randomUUID()]));
  const playlists = bundle.studyPackage.playlists.map((playlist) => Playlist.fromObject({
    ...playlist.toObject(),
    id: playlistIds.get(playlist.id),
    itemIds: playlist.itemIds.map((id) => itemIds.get(id) || id),
  }));
  const items = bundle.studyPackage.items.map((item) => StudyItem.fromObject({
    ...item.toObject(),
    id: itemIds.get(item.id),
    audioBlobId: item.audioBlobId ? (itemIds.get(item.audioBlobId) || item.audioBlobId) : null,
  }));
  const attachments = bundle.attachments.map((attachment) => AudioAttachment.fromObject({
    ...attachment.toObject(),
    id: itemIds.get(attachment.id) || attachment.id,
  }));
  return PackageBundle.fromObject({ studyPackage: StudyPackage.fromObject({ playlists, items }), attachments });
};

export class PackageCodec {
  constructor(token) { if (token !== CONSTRUCTION_TOKEN) throw new Error('PackageCodec must be created with PackageCodec.fromObject().'); }

  static fromObject() {
    return new PackageCodec(CONSTRUCTION_TOKEN);
  }

  parseJson(text) {
    const raw = JSON.parse(text);
    if (raw.format && raw.format !== 'personal-study-mate') throw new Error('This JSON is not a Personal Study Mate package.');
    if (raw.version && raw.version !== 1) throw new Error(`Unsupported package version: ${raw.version}`);
    return StudyPackage.fromObject(raw);
  }

  serialize(studyPackage) {
    return JSON.stringify(studyPackage.toObject(), null, 2);
  }

  async serializeBundle(bundle) {
    const raw = bundle.studyPackage.toObject();
    const audio = [];
    for (const attachment of bundle.attachments) {
      if (!attachment.blob) continue;
      audio.push({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        base64: toBase64(new Uint8Array(await attachment.blob.arrayBuffer())),
      });
    }
    return JSON.stringify({ ...raw, version: 2, audio }, null, 2);
  }

  async parseBundle(text) {
    const raw = JSON.parse(text);
    if (raw.format && raw.format !== 'personal-study-mate') throw new Error('This file is not a Personal Study Mate package.');
    if (raw.version && raw.version > 2) throw new Error(`Unsupported package version: ${raw.version}`);
    const attachments = (Array.isArray(raw.audio) ? raw.audio : []).filter((audio) => audio?.base64).map((audio) => {
      const bytes = fromBase64(audio.base64 || '');
      return AudioAttachment.fromObject({
        id: audio.id,
        fileName: audio.fileName,
        mimeType: audio.mimeType,
        size: audio.size || bytes.byteLength,
        blob: new Blob([bytes], { type: audio.mimeType || 'application/octet-stream' }),
      });
    });
    return PackageBundle.fromObject({ studyPackage: raw, attachments });
  }

  importAsNew(bundle) { return remapBundle(bundle); }
}
