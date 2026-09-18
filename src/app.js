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

const app = document.querySelector('#app');
const statusElement = document.querySelector('#status');
const status = (message, error = false) => { statusElement.textContent = message; statusElement.dataset.error = error ? 'true' : 'false'; };
const database = await LocalDatabase.fromObject();
const codec = PackageCodec.fromObject();
const aligner = TranscriptAligner.fromObject();
const controller = PlayerController.fromObject({ database, aligner, tts: BrowserTts.fromObject(), status });
const store = await AppStore.fromObject({ database });
const router = Router.fromObject({ target: app, routes: {
  library: LibraryView,
  editor: PlaylistEditorView,
  player: PlayerView,
} });

const navigate = (name) => {
  if (name === 'library') router.navigate(name, { store, onNew: async () => { store.createPlaylist(); await store.save(); status('Playlist created.'); navigate('library'); }, onOpen: (id) => { store.selectPlaylist(id); navigate('player'); }, onEdit: (id) => { store.selectPlaylist(id); navigate('editor'); }, onDelete: async (id) => { if (confirm('Delete this playlist?')) { await store.deletePlaylist(id); status('Playlist deleted.'); navigate('library'); } }, onExport: () => downloadText('personal-study-mate.json', codec.serialize(store.packageData)) });
  if (name === 'editor') router.navigate(name, { store, database, aligner, onStatus: status });
  if (name === 'player') router.navigate(name, { store, controller, onItemChange: (id) => store.selectItem(id) });
};
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
const downloadText = (name, text) => { const blob = new Blob([text], { type: 'application/json' }); const link = Utils.buildDOM(['a']); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); };
navigate('library');
