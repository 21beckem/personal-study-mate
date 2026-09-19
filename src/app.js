import { LocalDatabase } from './db.js';
import { PackageCodec } from './import-export.js';
import { TranscriptAligner } from './alignment.js';
import { BrowserTts } from './tts.js';
import { Router } from './router.js';
import { PlayerController } from './player.js';
import { LibraryView } from './views/library-view.js';
import { PlaylistEditorView } from './views/playlist-editor-view.js';
import { PlayerView } from './views/player-view.js';
import { Utils } from './utils.js';
import { AppStore } from './app-store.js';
import { AudioAttachment, PackageBundle, Paragraph, Playlist, StudyItem, StudyPackage } from './models.js';
import { AssignmentRequest, parseVerseSelection } from './assignment-parser.js';
import { discoverExtensionId, ExtensionBridge } from './extension-bridge.js';
import { StudyItemProcessor } from './editor/item-processor.js';

const app = document.querySelector('#app');
const statusElement = document.querySelector('#status');
const status = (message, error = false) => { statusElement.textContent = message; statusElement.dataset.error = error ? 'true' : 'false'; };
const database = await LocalDatabase.fromObject();
const codec = PackageCodec.fromObject();
const aligner = TranscriptAligner.fromObject();
const controller = PlayerController.fromObject({ database, aligner, tts: BrowserTts.fromObject(), status });
const store = await AppStore.fromObject({ database });
const extensionId = await discoverExtensionId();
const extensionBridge = ExtensionBridge.fromObject({ extensionId });
const extensionAvailable = await extensionBridge.detect();
const router = Router.fromObject({ target: app, routes: {
  library: LibraryView,
  editor: PlaylistEditorView,
  player: PlayerView,
} });

const storedBundle = async () => {
  const attachments = [];
  for (const item of store.packageData.items) {
    if (!item.audioBlobId) continue;
    const record = await database.getAudio(item.audioBlobId);
    if (record?.blob) attachments.push(AudioAttachment.fromObject({ id: item.audioBlobId, blob: record.blob, fileName: record.fileName || item.audioFileName, mimeType: record.blob.type, size: record.blob.size }));
  }
  return PackageBundle.fromObject({ studyPackage: store.packageData, attachments });
};

const importBundleFile = async (file) => {
  try {
    const imported = codec.importAsNew(await codec.parseBundle(await file.text()));
    await store.importBundle(imported);
    status(`Imported ${imported.studyPackage.playlists.length} playlist(s).`);
    navigate('library');
  } catch (error) { status(error.message, true); }
};

const collectAssignments = async ({ title, description, html, button }) => {
  const assignments = AssignmentRequest.parseClipboard(html);
  if (!assignments.length) { status('No assignment links or inline reading text were found.', true); return; }
  button.disabled = true;
  try {
    const urlAssignments = assignments.filter((assignment) => assignment.kind === 'url');
    const result = urlAssignments.length ? await extensionBridge.collect({
      playlist: { title: title || 'Collected assignments', description },
      assignments: urlAssignments,
      onProgress: (progress) => status(progress.message || `Collected ${progress.completed} of ${progress.total} assignments.`),
    }) : { items: [] };
    const collectedById = new Map(result.items.map((item) => [item.requestId, item]));
    const itemValues = [];
    const attachments = [];
    const itemIds = [];
    for (const assignment of assignments) {
      const itemId = `item-${crypto.randomUUID()}`;
      const collected = assignment.kind === 'text' ? null : collectedById.get(assignment.id);
      if (assignment.kind === 'url' && !collected) continue;
      const selectedVerses = parseVerseSelection(assignment.label);
      const hasVerseNumbers = collected?.paragraphs.some((paragraph) => Number.isInteger(paragraph.number));
      const paragraphs = assignment.kind === 'text'
        ? [Paragraph.fromObject({ text: assignment.text })]
        : collected.paragraphs.map((paragraph) => Paragraph.fromObject({ number: paragraph.number, text: paragraph.text, play: !selectedVerses || !hasVerseNumbers || paragraph.number === null || selectedVerses.has(paragraph.number) }));
      const attachment = collected?.audio?.blob ? AudioAttachment.fromObject({ id: itemId, blob: collected.audio.blob, fileName: collected.audio.fileName, mimeType: collected.audio.mimeType, size: collected.audio.size }) : null;
      const titleForItem = assignment.kind === 'text' ? assignment.text.slice(0, 80) : collected.title;
      const item = StudyItem.fromObject({
        id: itemId,
        type: attachment ? 'audio' : 'tts',
        title: titleForItem,
        sourceUrl: collected?.sourceUrl || '',
        text: paragraphs.map((paragraph) => paragraph.text).join('\n\n'),
        paragraphs,
        audioBlobId: attachment ? itemId : null,
        audioFileName: attachment?.fileName || '',
        status: attachment ? 'draft' : 'ready',
      });
      itemIds.push(itemId); itemValues.push(item); if (attachment) attachments.push(attachment);
    }
    if (!itemValues.length) throw new Error('The extension did not return any readable assignments.');
    let finalItems = itemValues;
    if (attachments.length) {
      const processor = StudyItemProcessor.fromObject({ aligner });
      try {
        for (let index = 0; index < finalItems.length; index++) {
          const item = finalItems[index];
          if (item.type !== 'audio') continue;
          status(`Processing audio ${index + 1} of ${finalItems.length} locally...`);
          const processed = await processor.process(item, attachments.find((attachment) => attachment.id === item.id));
          finalItems = finalItems.map((entry) => entry.id === processed.id ? processed : entry);
        }
      } finally { processor.destroy(); }
    }
    const playlist = Playlist.fromObject({ title: title || 'Collected assignments', description, itemIds });
    const bundle = PackageBundle.fromObject({ studyPackage: StudyPackage.fromObject({ playlists: [playlist], items: finalItems }), attachments });
    await store.importBundle(codec.importAsNew(bundle));
    status(`Collected ${finalItems.length} assignment(s) into “${playlist.title}”.`);
    navigate('library');
  } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
};

const navigate = (name) => {
  if (name === 'library') router.navigate(name, { store, extensionAvailable, onCollect: collectAssignments, onImport: importBundleFile, onNew: async () => { store.createPlaylist(); await store.save(); status('Playlist created.'); navigate('library'); }, onOpen: (id) => { store.selectPlaylist(id); navigate('player'); }, onEdit: (id) => { store.selectPlaylist(id); navigate('editor'); }, onDelete: async (id) => { if (confirm('Delete this playlist?')) { await store.deletePlaylist(id); status('Playlist deleted.'); navigate('library'); } }, onExport: async () => { try { const text = await codec.serializeBundle(await storedBundle()); downloadText('personal-study-mate.psm.json', text); status('Package exported.'); } catch (error) { status(error.message, true); } } });
  if (name === 'editor') router.navigate(name, { store, database, aligner, onStatus: status });
  if (name === 'player') router.navigate(name, { store, controller, onItemChange: (id) => store.selectItem(id) });
};
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
const downloadText = (name, text) => { const blob = new Blob([text], { type: 'application/json' }); const link = Utils.buildDOM(['a']); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); };
navigate('library');
