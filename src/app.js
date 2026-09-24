import { LocalDatabase } from './db.js';
import { PackageCodec } from './import-export.js';
import { TranscriptAligner } from './alignment.js';
import { BrowserTts } from './tts.js';
import { Router } from './router.js';
import { PlayerController } from './player.js';
import { LibraryView } from './views/library-view.js';
import { PlaylistEditorView } from './views/playlist-editor-view.js?ui=3';
import { PlayerView } from './views/player-view.js?ui=3';
import { Utils } from './utils.js';
import { AppStore } from './app-store.js';
import { AudioAttachment, PackageBundle, Paragraph, Playlist, StudyItem, StudyPackage } from './models.js';
import { AssignmentRequest, parseVerseSelection } from './assignment-parser.js';
import { discoverExtensionId, ExtensionBridge } from './extension-bridge.js';
import { StudyItemProcessor } from './editor/item-processor.js';
import { PackageTransferReceiver } from './package-transfer.js';
import { PlaylistShareDialog } from './playlist-share-dialog.js';
import { createId } from './ids.js';

const app = document.querySelector('#app');
const status = (message, isError=false) => {
  if (isError) {
    console.error(message);
  } else {
    console.log(message);
  }
  return Utils.toast(message, isError, isError ? 5000 : 1000);
};
window.statusbar = status; // Expose for debugging
let shareDialog = null;
const database = await LocalDatabase.fromObject();
window.database = database; // Expose for debugging
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

const storedBundleForPlaylist = async (playlistId) => {
  const playlist = store.packageData.playlists.find((entry) => entry.id === playlistId);
  if (!playlist) throw new Error('Choose a playlist before exporting it.');
  const items = playlist.itemIds
    .map((id) => store.packageData.items.find((item) => item.id === id))
    .filter(Boolean);
  const attachments = [];
  for (const item of items) {
    if (!item.audioBlobId) continue;
    const record = await database.getAudio(item.audioBlobId);
    if (record?.blob) attachments.push(AudioAttachment.fromObject({
      id: item.audioBlobId,
      blob: record.blob,
      fileName: record.fileName || item.audioFileName,
      mimeType: record.blob.type,
      size: record.blob.size
    }));
  }
  return PackageBundle.fromObject({
    studyPackage: StudyPackage.fromObject({ playlists: [playlist], items }),
    attachments
  });
};

const exportPlaylist = async (playlistId) => {
  try {
    const playlist = store.packageData.playlists.find((entry) => entry.id === playlistId);
    const text = await codec.serializeBundle(await storedBundleForPlaylist(playlistId));
    const safeTitle = (playlist?.title || 'playlist').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'playlist';
    downloadText(`${safeTitle}.psm.json`, text);
    status('Playlist exported.');
  } catch (error) {
    status(error.message, true);
  }
};

const sharePlaylist = async (playlistId) => {
  try {
    await store.save();
    const playlist = store.packageData.playlists.find((entry) => entry.id === playlistId);
    if (!playlist) throw new Error('Choose a playlist before sending it.');
    const packageText = await codec.serializeBundle(await storedBundleForPlaylist(playlistId));
    status(`Preparing “${playlist.title}” for phone transfer...`);
    const result = await extensionBridge.sharePackage(packageText, {
      onProgress: ({ completed, total }) => status(`Sending package to local server (${completed} of ${total} chunks)...`)
    });
    status('Package ready. Scan the QR code with the phone.');
    shareDialog?.destroy();
    shareDialog = PlaylistShareDialog.fromObject({ target: document.body, url: result.url, title: playlist.title });
  } catch (error) {
    status(error.message, true);
  }
};

const importBundleFile = async (file) => {
  try {
    const imported = codec.importAsNew(await codec.parseBundle(await file.text()));
    await store.importBundle(imported);
    status(`Imported ${imported.studyPackage.playlists.length} playlist(s).`);
    navigate('library');
  } catch (error) {
    status(error.message, true);
  }
};

const collectAssignments = async ({
  title,
  description,
  html,
  button
}) => {
  const assignments = AssignmentRequest.parseClipboard(html);
  if (!assignments.length) {
    status('No assignment links or inline reading text were found.', true);
    return;
  }
  button.disabled = true;
  Utils.warnBeforeClosing.enable();
  try {
    const urlAssignments = assignments.filter((assignment) => assignment.kind === 'url');
    const result = urlAssignments.length ? await extensionBridge.collect({
      playlist: {
        title: title || 'Collected assignments',
        description
      },
      assignments: urlAssignments,
      onProgress: (progress) => status(progress.message || `Collected ${progress.completed} of ${progress.total} assignments.`),
    }) : {
      items: []
    };
    const collectedById = new Map(result.items.map((item) => [item.requestId, item]));
    const itemValues = [];
    const attachments = [];
    const itemIds = [];
    for (const assignment of assignments) {
      const itemId = createId('item');
      const collected = assignment.kind === 'text' ? null : collectedById.get(assignment.id);
      if (assignment.kind === 'url' && !collected) continue;
      const selectedVerses = parseVerseSelection(assignment.label);
      const hasVerseNumbers = collected?.paragraphs.some((paragraph) => Number.isInteger(paragraph.number));
      const paragraphs = assignment.kind === 'text' ? [Paragraph.fromObject({
          text: assignment.text
        })] :
        collected.paragraphs.map((paragraph) => Paragraph.fromObject({
          number: paragraph.number,
          text: paragraph.text,
          play: !selectedVerses || !hasVerseNumbers || paragraph.number === null || selectedVerses.has(paragraph.number)
        }));
      const attachment = collected?.audio?.blob ? AudioAttachment.fromObject({
        id: itemId,
        blob: collected.audio.blob,
        fileName: collected.audio.fileName,
        mimeType: collected.audio.mimeType,
        size: collected.audio.size
      }) : null;
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
      itemIds.push(itemId);
      itemValues.push(item);
      if (attachment) attachments.push(attachment);
    }
    if (!itemValues.length) throw new Error('The extension did not return any readable assignments.');
    let finalItems = itemValues;
    if (attachments.length) {
      const processor = StudyItemProcessor.fromObject({
        aligner,
        extensionBridge
      });
      try {
        const audioItems = finalItems.filter((entry) => entry.type === 'audio');
        let audioIndex = 0;
        for (let index = 0; index < finalItems.length; index++) {
          const item = finalItems[index];
          if (item.type !== 'audio') continue;
          const currentAudioIndex = audioIndex++;
          const progressListener = (progress) => {
            const itemPercent = progress.percent ?? 0;
            const overallPercent = ((currentAudioIndex + itemPercent / 100) / audioItems.length) * 100;
            console.info(`[study-mate transcription] Overall ${overallPercent.toFixed(1)}% (${currentAudioIndex + 1}/${audioItems.length})`);
          };
          processor.on('progress', progressListener);
          try {
            status(`Processing audio ${currentAudioIndex + 1} of ${audioItems.length} locally...`);
            const processed = await processor.process(item, attachments.find((attachment) => attachment.id === item.id));
            finalItems = finalItems.map((entry) => entry.id === processed.id ? processed : entry);
          } finally {
            processor.off('progress', progressListener);
          }
        }
      } finally {
        processor.destroy();
      }
    }
    const playlist = Playlist.fromObject({
      title: title || 'Collected assignments',
      description,
      itemIds
    });
    const bundle = PackageBundle.fromObject({
      studyPackage: StudyPackage.fromObject({
        playlists: [playlist],
        items: finalItems
      }),
      attachments
    });
    await store.importBundle(codec.importAsNew(bundle));
    Utils.warnBeforeClosing.disable();
    status(`Collected ${finalItems.length} assignment(s) into “${playlist.title}”.`);
    navigate('library');
  } catch (error) {
    status(error.message, true);
  } finally {
    button.disabled = false;
  }
};

const navigate = (name) => {
  if (name === 'library') router.navigate(name, {
    store,
    extensionAvailable,
    onCollect: collectAssignments,
    onImport: importBundleFile,
    onNew: async () => {
      store.createPlaylist();
      await store.save();
      status('Playlist created.');
      navigate('library');
    },
    onOpen: (id) => {
      store.selectPlaylist(id);
      navigate('player');
    },
    onEdit: (id) => {
      store.selectPlaylist(id);
      navigate('editor');
    },
    onDelete: async (id) => {
      if (confirm('Delete this playlist?')) {
        await store.deletePlaylist(id);
        status('Playlist deleted.');
        navigate('library');
      }
    },
  });
  if (name === 'editor') router.navigate(name, {
    store,
    database,
    aligner,
    extensionBridge,
    extensionAvailable,
    onExport: exportPlaylist,
    onShare: sharePlaylist,
    onStatus: status,
    onBack: () => navigate('library'),
    onPlayer: () => navigate('player')
  });
  if (name === 'player') router.navigate(name, {
    store,
    controller,
    onItemChange: (id) => store.selectItem(id),
    onBack: () => navigate('library')
  });
};
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
const downloadText = (name, text) => {
  const blob = new Blob([text], {
    type: 'application/json'
  });
  const link = Utils.buildDOM(['a']);
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};
const transferReceiver = PackageTransferReceiver.fromObject({
  onAnnouncement: (message) => Utils.toast(`A playlist is coming from ${message.fileName || 'another device'}…`),
  onPackage: async (packageText) => {
    const imported = codec.importAsNew(await codec.parseBundle(packageText));
    const title = imported.studyPackage.playlists[0]?.title || 'this playlist';
    if (!confirm(`Import “${title}” into Personal Study Mate?`)) throw new Error('Import cancelled.');
    await store.importBundle(imported);
    status(`Imported ${imported.studyPackage.playlists.length} playlist(s).`);
    Utils.toast(`Imported “${title}”.`);
    navigate('library');
  }
});
navigate('library');
transferReceiver.start();
