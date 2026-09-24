import { DOMElement, EventEmitterMixin } from '../modules.js';
import { StudyItem } from '../models.js';
import { PlaylistEditorSession } from '../editor/editor-session.js';
import { StudyItemProcessor } from '../editor/item-processor.js';
import { PlaylistDetailsForm } from '../editor/playlist-details-form.js';
import { ItemList } from '../editor/item-list.js?ui=2';
import { StudyItemEditor } from '../editor/study-item-editor.js?ui=4';
import { EditorToolbar } from '../editor/editor-toolbar.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('playlist-editor-view-construction-token');

export class PlaylistEditorView extends EventEmitterMixin(DOMElement) {
  constructor({
    target,
    store,
    database,
    aligner,
    extensionBridge,
    extensionAvailable = false,
    onExport,
    onShare,
    onStatus,
    onBack,
    onPlayer
  }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaylistEditorView must be created with PlaylistEditorView.fromObject().');
    this.target = target;
    this.store = store;
    this.database = database;
    this.extensionAvailable = extensionAvailable;
    this.onExport = onExport;
    this.onShare = onShare;
    this.onStatus = onStatus;
    this.onBack = onBack;
    this.onPlayer = onPlayer;
    this.editingItem = false;
    this.session = PlaylistEditorSession.fromObject({
      packageData: store.packageData,
      database,
      store,
      activePlaylistId: store.activePlaylistId
    });
    this.processor = StudyItemProcessor.fromObject({
      aligner,
      extensionBridge
    });
    this.children = [];
    this.sessionListeners = [];
  }

  static fromObject(value) {
    return new PlaylistEditorView(value, CONSTRUCTION_TOKEN);
  }

  render() {
    this.node = Utils.buildDOM(['section', {
      class: 'app-screen screen-playlist-edit'
    }]);
    const header = Utils.buildDOM(['header', {
      class: 'screen-header screen-header--editor'
    }]);
    const back = Utils.buildDOM(['button', {
      class: 'back-link',
      type: 'button',
      'aria-label': 'Back to Library'
    }]);
    back.append(Utils.buildDOM(['i', {
      class: 'fa-solid fa-chevron-left'
    }]));
    const heading = Utils.buildDOM(['h1', 'Edit playlist']);
    header.append(back, heading);
    const actions = Utils.buildDOM(['div', { class: 'screen-header__actions' }]);
    const exportButton = Utils.ui.button('Export playlist');
    exportButton.className = 'text-button utility-button';
    this.addDOMEventListener(exportButton, 'click', () => this.onExport?.(this.session.activePlaylist?.id));
    actions.append(exportButton);
    if (this.extensionAvailable) {
      const shareButton = Utils.ui.button('Send to phone');
      shareButton.className = 'text-button utility-button';
      this.addDOMEventListener(shareButton, 'click', async () => {
        shareButton.disabled = true;
        try {
          await this.onShare?.(this.session.activePlaylist?.id, shareButton);
        } finally {
          shareButton.disabled = false;
        }
      });
      actions.append(shareButton);
    }
    header.append(actions);
    this.addDOMEventListener(back, 'click', () => this.#goBack(back, heading));
    this.node.append(header);
    const content = Utils.buildDOM(['div', {
      class: 'screen-content editor-content'
    }]);
    this.node.append(content);
    const toolbar = EditorToolbar.fromObject({
      dirty: this.session.dirty
    });
    this.children.push(toolbar);
    content.append(toolbar.node);
    const columns = Utils.buildDOM(['div', {
      class: 'editor-columns'
    }]);
    const left = Utils.buildDOM(['div', {
      class: 'editor-sidebar'
    }]);
    const right = Utils.buildDOM(['div', {
      class: 'editor-main'
    }]);
    columns.append(left, right);
    content.append(columns);
    const details = PlaylistDetailsForm.fromObject({
      playlist: this.session.activePlaylist
    });
    const items = ItemList.fromObject({
      items: this.session.activeItems,
      activeItemId: this.session.activeItemId
    });
    const itemEditor = StudyItemEditor.fromObject({
      item: this.session.activeItem,
      getAttachment: (item) => this.session.getAttachment(item),
      processor: this.processor
    });
    this.children.push(details, items, itemEditor);
    left.append(details.node, items.node);
    right.append(itemEditor.node);
    this.#wire(toolbar, details, items, itemEditor, back);
    const nav = Utils.buildDOM(['nav', {
      class: 'bottom-nav',
      'aria-label': 'Primary navigation'
    }]);
    nav.append(this.#navButton('library', 'folder', 'Library'), this.#navButton('player', 'play', 'Player'), this.#navButton('pins', 'thumbtack', 'Pins'));
    this.node.append(nav);
    this.target.append(this.node);
    return this;
  }

  #navButton(view, icon, label) {
    const button = Utils.buildDOM(['button', {
      class: 'bottom-nav__item',
      type: 'button'
    }]);
    const iconContainer = Utils.buildDOM(['span']);
    iconContainer.append(Utils.buildDOM(['i', {
      class: `fa-solid fa-${icon}`
    }]));
    button.append(iconContainer, document.createTextNode(label));
    if (view === 'library') this.addDOMEventListener(button, 'click', this.onBack);
    if (view === 'player') this.addDOMEventListener(button, 'click', this.onPlayer);
    return button;
  }

  #goBack(back, heading) {
    if (this.editingItem) {
      this.editingItem = false;
      this.node.classList.remove('is-item-editing');
      heading.textContent = 'Edit playlist';
      back?.setAttribute('aria-label', 'Back to Library');
      return;
    }
    this.onBack();
  }

  #wire(toolbar, details, items, itemEditor, back) {
    this.#listen(this.session, 'dirty-changed', () => toolbar.setDirty(true));
    this.#listen(this.session, 'save-completed', () => {
      toolbar.setDirty(false);
      this.onStatus('Playlist saved locally.');
    });
    this.#listen(this.session, 'reverted', () => {
      toolbar.setDirty(false);
      this.#refresh(details, items, itemEditor);
      this.onStatus('Unsaved changes reverted.');
    });
    this.#listen(details, 'changed', (event) => {
      this.session.updatePlaylist(event.entity);
      this.#updateHeading();
    });
    this.#listen(items, 'selected', (event) => {
      this.session.selectItem(event.entity.id);
      this.editingItem = true;
      this.node.classList.add('is-item-editing');
      back?.setAttribute('aria-label', 'Back to playlist');
      this.#refreshItem(items, itemEditor);
      this.node.querySelector('h1').textContent = 'Edit item';
    });
    this.#listen(items, 'add', (event) => {
      this.session.addItem(event.message);
      this.#refreshItemList(items);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(items, 'remove', (event) => {
      if (confirm(`Remove ${event.entity.title}?`)) {
        this.session.removeItem(event.entity.id);
        this.#refreshItemList(items);
        this.#refreshItem(items, itemEditor);
        this.#onSave();
      }
    });
    this.#listen(items, 'reorder', (event) => {
      const ids = [...this.session.activePlaylist.itemIds];
      const [moved] = ids.splice(event.entity.from, 1);
      ids.splice(event.entity.to, 0, moved);
      this.session.reorderItems(ids);
      this.#refreshItemList(items);
      this.#onSave();
    });
    this.#listen(itemEditor, 'changed', (event) => {
      this.session.updateItem(event.entity);
      this.#onSave();
    });
    this.#listen(itemEditor, 'text-changed', (event) => {
      this.session.updateItemText(this.session.activeItem, event.message);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'paragraphs-changed', (event) => {
      this.session.updateParagraphs(this.session.activeItem, event.entity);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'paragraph-move', (event) => {
      const paragraphs = [...this.session.activeItem.paragraphs];
      const [moved] = paragraphs.splice(event.entity.from, 1);
      paragraphs.splice(event.entity.to, 0, moved);
      this.session.updateParagraphs(this.session.activeItem, paragraphs);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'paragraph-remove', (event) => {
      this.session.updateParagraphs(this.session.activeItem, this.session.activeItem.paragraphs.filter((paragraph) => paragraph.id !== event.entity.id));
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'audio-attached', (event) => {
      this.session.attachAudio(this.session.activeItem, event.entity);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'audio-removed', () => {
      this.session.removeAudio(this.session.activeItem);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'processed', (event) => {
      this.session.updateItem(event.entity);
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'unlock', (event) => {
      this.session.updateItem(StudyItem.fromObject({
        ...event.entity.toObject(),
        status: 'draft',
        processing: null
      }));
      this.#refreshItem(items, itemEditor);
      this.#onSave();
    });
    this.#listen(itemEditor, 'remove-item', (event) => {
      if (confirm(`Remove ${event.entity.title}?`)) {
        this.session.removeItem(event.entity.id);
        this.editingItem = false;
        this.node.classList.remove('is-item-editing');
        this.#refresh(details, items, itemEditor);
        this.#onSave();
      }
    });
    this.#listen(toolbar, 'save', () => this.#onSave());
    this.#listen(toolbar, 'revert', async () => {
      if (!this.session.dirty || confirm('Revert unsaved changes?')) await this.session.revert();
    });
  }

  async #onSave() {
    try {
      await this.session.save();
    } catch (error) {
      this.onStatus(error.message, true);
    }
  }
  #updateHeading() {
    const heading = this.node?.querySelector('h1');
    if (heading) heading.textContent = 'Edit playlist';
  }
  #refresh(details, items, itemEditor) {
    details.setPlaylist(this.session.activePlaylist);
    items.setItems(this.session.activeItems, this.session.activeItemId);
    itemEditor.setItem(this.session.activeItem);
    this.#updateHeading();
  }
  #refreshItem(items, itemEditor) {
    items.setItems(this.session.activeItems, this.session.activeItemId);
    itemEditor.setItem(this.session.activeItem);
  }
  #refreshItemList(items) {
    items.setItems(this.session.activeItems, this.session.activeItemId);
  }
  #listen(source, event, listener) {
    source.on(event, listener);
    this.sessionListeners.push({
      source,
      event,
      listener
    });
  }
  destroy() {
    this.sessionListeners.forEach(({
      source,
      event,
      listener
    }) => source.off(event, listener));
    this.children.forEach((child) => child.destroy());
    this.processor.destroy();
    this.session.destroy();
    super.destroy();
  }
}
