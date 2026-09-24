import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('library-view-construction-token');

const sanitizeClipboard = (html) => {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  parsed.querySelectorAll('script, iframe, object, embed, style, link, meta').forEach((element) => element.remove());
  parsed.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
      if (attribute.name.toLowerCase() === 'href' && /^\s*javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name);
    });
  });
  return [...parsed.body.childNodes].map((node) => document.importNode(node, true));
};

const serializeChildren = (element) => [...element.childNodes].map((node) => new XMLSerializer().serializeToString(node)).join('');

export class LibraryView extends EventEmitterMixin(DOMElement) {
  constructor({ target, store, onNew, onOpen, onEdit, onDelete, onImport, extensionAvailable = false, onCollect }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('LibraryView must be created with LibraryView.fromObject().');
    this.target = target; this.store = store; this.onNew = onNew; this.onOpen = onOpen; this.onEdit = onEdit; this.onDelete = onDelete; this.onImport = onImport; this.extensionAvailable = extensionAvailable; this.onCollect = onCollect; this.packageListener = () => this.render(); this.store.on('package-changed', this.packageListener);
  }

  static fromObject(value) { return new LibraryView(value, CONSTRUCTION_TOKEN); }

  render() {
    const parent = this.node?.parentNode || this.target;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'app-screen screen-library' }]);
    const header = Utils.buildDOM(['header', { class: 'screen-header' }]);
    Utils.buildDOM(['h1', 'Library'], header);
    const newButton = Utils.ui.button('New playlist'); newButton.className = 'text-button';
    newButton.prepend(Utils.buildDOM(['i', { class: 'fa-solid fa-plus', 'aria-hidden': 'true' }]));
    const importButton = Utils.ui.button('Import package'); importButton.className = 'text-button utility-button';
    this.addDOMEventListener(newButton, 'click', this.onNew);
    const importInput = Utils.ui.input('file'); importInput.accept = '.json,application/json'; importInput.hidden = true;
    this.addDOMEventListener(importButton, 'click', () => importInput.click()); this.addDOMEventListener(importInput, 'change', () => { if (importInput.files[0]) this.onImport(importInput.files[0]); importInput.value = ''; });
    header.append(newButton, importButton, importInput); this.node.append(header);
    if (this.extensionAvailable) this.#renderCollector();
    const content = Utils.buildDOM(['div', { class: 'screen-content' }]);
    const list = Utils.buildDOM(['div', { class: 'playlist-list' }]); content.append(list); this.node.append(content);
    this.store.packageData.playlists.forEach((playlist) => {
      const card = Utils.buildDOM(['div', { class: 'playlist-row' }]);
      const accent = Utils.buildDOM(['span', { class: 'playlist-row__accent accent-sage', 'aria-hidden': 'true' }]);
      const body = Utils.buildDOM(['span', { class: 'playlist-row__body' }]);
      Utils.buildDOM(['strong', playlist.title], body); Utils.buildDOM(['small', `${playlist.itemIds.length} item(s)`], body);
      const actions = Utils.buildDOM(['span', { class: 'row-actions' }]);
      const open = Utils.ui.button('Open in Player'); open.className = 'icon-button'; open.title = 'Open in Player'; open.setAttribute('aria-label', 'Open in Player'); open.append(Utils.buildDOM(['i', { class: 'fa-solid fa-play' }]));
      const edit = Utils.ui.button('Edit'); edit.className = 'icon-button'; edit.title = 'Edit playlist'; edit.setAttribute('aria-label', 'Edit playlist'); edit.append(Utils.buildDOM(['i', { class: 'fa-solid fa-pen' }]));
      const remove = Utils.ui.button('Delete'); remove.className = 'icon-button danger'; remove.title = 'Delete playlist'; remove.setAttribute('aria-label', 'Delete playlist'); remove.append(Utils.buildDOM(['i', { class: 'fa-solid fa-trash-can' }]));
      this.addDOMEventListener(open, 'click', () => this.onOpen(playlist.id)); this.addDOMEventListener(edit, 'click', () => this.onEdit(playlist.id)); this.addDOMEventListener(remove, 'click', () => this.onDelete(playlist.id));
      this.addDOMEventListener(body, 'click', () => this.onEdit(playlist.id));
      actions.append(open, edit, remove); card.append(accent, body, actions); list.append(card);
    });
    const nav = Utils.buildDOM(['nav', { class: 'bottom-nav', 'aria-label': 'Primary navigation' }]);
    nav.append(this.#navLink('library', 'folder', 'Library', true), this.#navLink('player', 'play', 'Player'), this.#navLink('pins', 'thumbtack', 'Pins'));
    this.node.append(nav);
    parent.append(this.node);
  }

  #navLink(view, icon, label, active = false) {
    const link = Utils.buildDOM(['button', { class: `bottom-nav__item${active ? ' is-active' : ''}` }]);
    const iconContainer = Utils.buildDOM(['span']);
    iconContainer.append(Utils.buildDOM(['i', { class: `fa-solid fa-${icon}` }]));
    link.append(iconContainer, document.createTextNode(label));
    if (view !== 'pins') this.addDOMEventListener(link, 'click', () => view === 'library' ? null : this.onOpen(this.store.activePlaylistId));
    return link;
  }

  #renderCollector() {
    const section = Utils.buildDOM(['section', { class: 'card collection-panel' }]);
    Utils.buildDOM(['h3', 'Collect Gospel Library assignments'], section);
    Utils.buildDOM(['p', 'Paste the assignment list copied from your course page. Links to ChurchofJesusChrist.org will be collected in the background.'], section);
    const title = Utils.ui.input('text', 'Playlist title'); title.value = 'Collected assignments';
    const description = Utils.ui.input('text', 'Playlist description');
    const pasted = Utils.buildDOM(['div', { class: 'assignment-paste-area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true' }]);
    const collect = Utils.ui.button('Collect assignments');
    this.addDOMEventListener(pasted, 'paste', (event) => {
      const html = event.clipboardData?.getData('text/html') || '';
      if (!html) return;
      event.preventDefault();
      pasted.replaceChildren(...sanitizeClipboard(html));
    });
    this.addDOMEventListener(collect, 'click', () => this.onCollect({ title: title.value, description: description.value, html: serializeChildren(pasted), button: collect }));
    section.append(title, description, pasted, collect); this.node.append(section);
  }

  destroy() { this.store.off('package-changed', this.packageListener); super.destroy(); }
}
