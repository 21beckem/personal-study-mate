import { LocalDatabase } from './db.js';
import { PackageCodec } from './import-export.js';
import { TranscriptAligner } from './alignment.js';
import { BrowserTts } from './tts.js';
import { Router } from './router.js';
import { PlayerController } from './player.js';
import { LibraryView } from './views/library-view.js';
import { PlaylistEditorView } from './views/playlist-editor-view.js';
import { PlayerView } from './views/player-view.js';
import { StudyPackage } from './models.js';
import { Utils } from './utils.js';

const app = document.querySelector('#app');
const statusElement = document.querySelector('#status');
const status = (message, error = false) => { statusElement.textContent = message; statusElement.dataset.error = error ? 'true' : 'false'; };
const database = await LocalDatabase.fromObject();
const codec = PackageCodec.fromObject();
const aligner = TranscriptAligner.fromObject();
const controller = PlayerController.fromObject({ database, aligner, tts: BrowserTts.fromObject(), status });
let packageData = await database.readPackage(); let activePlaylistId = packageData.playlists[0]?.id || null; let activeItemId = null;

const refresh = async () => { packageData = await database.readPackage(); };
const router = Router.fromObject({ target: app, routes: {
  library: LibraryView,
  editor: PlaylistEditorView,
  player: PlayerView,
} });

const navigate = (name) => {
  if (name === 'library') router.navigate(name, { packageData, onRefresh: async () => { await refresh(); navigate('library'); }, onOpen: (id) => { activePlaylistId = id; navigate('player'); }, onEdit: (id) => { activePlaylistId = id; navigate('editor'); }, onDelete: async (id) => { if (confirm('Delete this playlist?')) { await database.deletePlaylist(id); await refresh(); navigate('library'); } }, onExport: () => downloadText('personal-study-mate.json', codec.serialize(packageData)) });
  if (name === 'editor') router.navigate(name, { packageData, database, aligner, onStatus: status });
  if (name === 'player') { const playlist = packageData.playlists.find((entry) => entry.id === activePlaylistId) || packageData.playlists[0]; const items = playlist ? playlist.itemIds.map((id) => packageData.items.find((item) => item.id === id)).filter(Boolean) : []; router.navigate(name, { playlist, items, controller, onItemChange: (id) => { activeItemId = id; }, onItemProcessed: async (processed) => { packageData = StudyPackage.fromObject({ playlists: packageData.playlists, items: packageData.items.map((item) => item.id === processed.id ? processed : item) }); await database.putPackage(packageData); await refresh(); navigate('player'); } }); }
};
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
const downloadText = (name, text) => { const blob = new Blob([text], { type: 'application/json' }); const link = Utils.buildDOM(['a']); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); };
navigate('library');
