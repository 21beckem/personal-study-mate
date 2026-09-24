import { createId } from './ids.js';

const FORMAT = 'personal-study-mate';
const VERSION = 1;
const CONSTRUCTION_TOKEN = Symbol('model-construction-token');

const makeId = (prefix) => createId(prefix);
const now = () => new Date().toISOString();

export class WordTiming {
  constructor({ text, start, end, interpolated = false }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('WordTiming must be created with WordTiming.fromObject().');
    this.text = String(text ?? '');
    this.start = Number.isFinite(start) ? start : 0;
    this.end = Number.isFinite(end) ? end : this.start;
    this.interpolated = Boolean(interpolated);
  }

  static fromObject(value = {}) {
    return new WordTiming(value, CONSTRUCTION_TOKEN);
  }

  toObject() {
    return { text: this.text, start: this.start, end: this.end, interpolated: this.interpolated };
  }
}

export class Paragraph {
  constructor({ id, number = null, text, start = 0, end = 0, words = [], play = true }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('Paragraph must be created with Paragraph.fromObject().');
    this.id = id;
    this.number = number;
    this.text = String(text ?? '').trim();
    this.start = Number.isFinite(start) ? start : 0;
    this.end = Number.isFinite(end) ? end : this.start;
    this.words = words;
    this.play = Boolean(play);
  }

  static fromObject(value = {}) {
    const words = Array.isArray(value.words) ? value.words.map((word) => WordTiming.fromObject(word)) : [];
    return new Paragraph({ ...value, id: value.id || makeId('paragraph'), words }, CONSTRUCTION_TOKEN);
  }

  static splitText(text) {
    return String(text ?? '').split(/\r?\n\s*\r?\n|\r?\n/).map((part) => part.trim()).filter(Boolean)
      .map((part) => Paragraph.fromObject({ text: part }));
  }

  toObject() {
    return {
      id: this.id,
      number: this.number,
      text: this.text,
      start: this.start,
      end: this.end,
      play: this.play,
      words: this.words.map((word) => word.toObject()),
    };
  }
}

export class StudyItem {
  constructor({ id, type, title, sourceUrl = '', text = '', paragraphs = [], audioFileName = '', audioBlobId = null, status = 'draft', processing = null, playbackSelection = null, createdAt, updatedAt }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('StudyItem must be created with StudyItem.fromObject().');
    this.id = id;
    this.type = type;
    this.title = title;
    this.sourceUrl = sourceUrl;
    this.text = text;
    this.paragraphs = paragraphs;
    this.audioFileName = audioFileName;
    this.audioBlobId = audioBlobId;
    this.status = status;
    this.processing = processing;
    this.playbackSelection = playbackSelection;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromObject(value = {}) {
    const text = String(value.text ?? '').trim();
    const legacySelection = value.playbackSelection ? PlaybackSelection.fromObject(value.playbackSelection) : null;
    const rawParagraphs = Array.isArray(value.paragraphs) && value.paragraphs.length ? value.paragraphs : null;
    const paragraphs = rawParagraphs ? rawParagraphs.map((paragraph) => Paragraph.fromObject(paragraph)) : Paragraph.splitText(text);
    const migratedParagraphs = paragraphs.map((paragraph, index) => {
      const rawParagraph = rawParagraphs?.[index];
      const play = typeof rawParagraph?.play === 'boolean' ? rawParagraph.play : (legacySelection ? legacySelection.playAll || legacySelection.paragraphIds.includes(paragraph.id) : true);
      return Paragraph.fromObject({ ...paragraph.toObject(), play });
    });
    return new StudyItem({
      ...value,
      id: value.id || makeId('item'),
      type: value.type === 'tts' ? 'tts' : 'audio',
      title: String(value.title || 'Untitled item'),
      text,
      paragraphs: migratedParagraphs,
      status: value.status || 'draft',
      processing: value.processing ? ProcessingMetadata.fromObject(value.processing) : null,
      playbackSelection: value.playbackSelection ? PlaybackSelection.fromObject(value.playbackSelection) : null,
      createdAt: value.createdAt || now(),
      updatedAt: value.updatedAt || now(),
    }, CONSTRUCTION_TOKEN);
  }

  withParagraphs(paragraphs, processing) {
    return StudyItem.fromObject({ ...this.toObject(), paragraphs, processing, status: 'ready', updatedAt: now() });
  }

  toObject() {
    return {
      id: this.id, type: this.type, title: this.title, sourceUrl: this.sourceUrl, text: this.text,
      paragraphs: this.paragraphs.map((paragraph) => paragraph.toObject()),
      audioFileName: this.audioFileName, audioBlobId: this.audioBlobId, status: this.status,
      processing: this.processing?.toObject() || null, playbackSelection: this.playbackSelection?.toObject() || null,
      createdAt: this.createdAt, updatedAt: this.updatedAt,
    };
  }
}

export class AudioAttachment {
  constructor({ id = null, blob, fileName, mimeType = '', size = 0 }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AudioAttachment must be created with AudioAttachment.fromObject().');
    this.id = id;
    this.blob = blob;
    this.fileName = String(fileName || 'audio');
    this.mimeType = String(mimeType || blob?.type || '');
    this.size = Number(size || blob?.size || 0);
  }

  static fromObject(value = {}) { return new AudioAttachment(value, CONSTRUCTION_TOKEN); }

  toObject() {
    return { id: this.id, fileName: this.fileName, mimeType: this.mimeType, size: this.size, blob: this.blob };
  }
}

export class PackageBundle {
  constructor({ studyPackage, attachments = [] }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PackageBundle must be created with PackageBundle.fromObject().');
    this.studyPackage = studyPackage;
    this.attachments = attachments;
  }

  static fromObject(value = {}) {
    const rawPackage = value.studyPackage || value;
    const rawAttachments = value.attachments || value.audio || [];
    const attachments = Array.isArray(rawAttachments)
      ? rawAttachments.map((attachment) => AudioAttachment.fromObject(attachment))
      : [];
    return new PackageBundle({ studyPackage: StudyPackage.fromObject(rawPackage), attachments }, CONSTRUCTION_TOKEN);
  }

  getAttachment(id) { return this.attachments.find((attachment) => attachment.id === id) || null; }

  toObject() {
    return {
      studyPackage: this.studyPackage.toObject(),
      attachments: this.attachments.map((attachment) => attachment.toObject()),
    };
  }
}

export class PlaybackSelection {
  constructor({ paragraphIds = [], playAll = true }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaybackSelection must be created with PlaybackSelection.fromObject().');
    this.paragraphIds = [...paragraphIds];
    this.playAll = Boolean(playAll);
  }

  static fromObject(value = {}) { return new PlaybackSelection(value, CONSTRUCTION_TOKEN); }
  toObject() { return { paragraphIds: [...this.paragraphIds], playAll: this.playAll }; }
}

export class ProcessingMetadata {
  constructor({ modelName = '', alignmentVersion = 1, processedAt = '', warnings = [], matchRatio = null }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ProcessingMetadata must be created with ProcessingMetadata.fromObject().');
    this.modelName = modelName;
    this.alignmentVersion = alignmentVersion;
    this.processedAt = processedAt;
    this.warnings = [...warnings];
    this.matchRatio = matchRatio;
  }

  static fromObject(value = {}) { return new ProcessingMetadata(value, CONSTRUCTION_TOKEN); }
  toObject() { return { modelName: this.modelName, alignmentVersion: this.alignmentVersion, processedAt: this.processedAt, warnings: [...this.warnings], matchRatio: this.matchRatio }; }
}

export class Playlist {
  constructor({ id, title, description = '', itemIds = [], createdAt, updatedAt }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('Playlist must be created with Playlist.fromObject().');
    this.id = id;
    this.title = title;
    this.description = description;
    this.itemIds = itemIds;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromObject(value = {}) {
    return new Playlist({
      ...value,
      id: value.id || makeId('playlist'),
      title: String(value.title || 'Untitled playlist'),
      itemIds: Array.isArray(value.itemIds) ? [...value.itemIds] : [],
      createdAt: value.createdAt || now(),
      updatedAt: value.updatedAt || now(),
    }, CONSTRUCTION_TOKEN);
  }

  toObject() {
    return { id: this.id, title: this.title, description: this.description, itemIds: [...this.itemIds], createdAt: this.createdAt, updatedAt: this.updatedAt };
  }
}

export class StudyPackage {
  constructor({ playlists, items }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('StudyPackage must be created with StudyPackage.fromObject().');
    this.playlists = playlists;
    this.items = items;
  }

  static fromObject(value = {}) {
    const rawPlaylists = Array.isArray(value.playlists) ? value.playlists : [];
    const playlists = rawPlaylists.map((playlist) => Playlist.fromObject(playlist));
    const embeddedItems = Array.isArray(value.items) ? value.items.map((item) => StudyItem.fromObject(item)) : [];
    const items = embeddedItems.length ? embeddedItems : [];
    const byId = new Map(items.map((item) => [item.id, item]));
    const normalizedPlaylists = playlists.map((playlist, index) => {
      const inlineItems = Array.isArray(rawPlaylists[index]?.items) ? rawPlaylists[index].items.map((item) => StudyItem.fromObject(item)) : [];
      inlineItems.forEach((item) => byId.set(item.id, item));
      const itemIds = inlineItems.length ? inlineItems.map((item) => item.id) : playlist.itemIds;
      return Playlist.fromObject({ ...playlist.toObject(), itemIds });
    });
    return new StudyPackage({ playlists: normalizedPlaylists, items: [...byId.values()] }, CONSTRUCTION_TOKEN);
  }

  static empty() {
    return StudyPackage.fromObject({ playlists: [], items: [] });
  }

  toObject() {
    return { format: FORMAT, version: VERSION, playlists: this.playlists.map((playlist) => playlist.toObject()), items: this.items.map((item) => item.toObject()) };
  }
}

export const packageFormat = { format: FORMAT, version: VERSION };
