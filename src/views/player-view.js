import { DOMElement, EventEmitterMixin } from '../modules.js';
import { MediaPlayer } from '../media-player.js?ui=2';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('player-view-construction-token');
const PLAYBACK_RATE_KEY = 'personal-study-mate.playback-rate';
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const formatPlayableItemLabel = (item) => {
  if (!item?.paragraphs?.length || item.paragraphs.every((paragraph) => paragraph.play)) return item?.title || 'Untitled item';
  const numberedParagraphs = item.paragraphs.filter((paragraph) => Number.isInteger(paragraph.number));
  if (!numberedParagraphs.length) return item.title;
  const playableNumbers = numberedParagraphs.filter((paragraph) => paragraph.play).map((paragraph) => paragraph.number);
  if (!playableNumbers.length) return item.title;
  const ranges = [];
  let start = playableNumbers[0];
  let end = start;
  playableNumbers.slice(1).forEach((number) => {
    if (number === end + 1) {
      end = number;
      return;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = number;
    end = number;
  });
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return `${item.title}:${ranges.join(',')}`;
};

const readPlaybackRate = () => {
  try {
    const value = Number(localStorage.getItem(PLAYBACK_RATE_KEY));
    return PLAYBACK_RATES.includes(value) ? value : 1;
  } catch {
    return 1;
  }
};

const writePlaybackRate = (rate) => {
  try { localStorage.setItem(PLAYBACK_RATE_KEY, String(rate)); } catch { /* Storage may be unavailable. */ }
};

export class PlayerView extends EventEmitterMixin(DOMElement) {
  constructor({ target, store, controller, onItemChange, onBack }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlayerView must be created with PlayerView.fromObject().');
    this.target = target;
    this.store = store;
    this.controller = controller;
    this.onItemChange = onItemChange;
    this.onBack = onBack;
    this.currentItemId = store.activeItemId;
    this.packageListener = () => this.render();
    this.store.on('package-changed', this.packageListener);
    this.mediaPlayer = null;
    this.renderVersion = 0;
    this.activeWord = null;
    this.playbackRate = readPlaybackRate();
    this.scrollMode = 'normal';
    this.scrollRecoveryTimer = null;
    this.slowScrollTimer = null;
    this.scrollRecoveryFinishTimer = null;
    this.autoScrollIgnoreUntil = 0;
    this.playlistDurations = new Map();
    this.progressPlaylistId = null;
    this.progressPreparationVersion = 0;
    this.playlistDurationsLoading = false;
  }

  static fromObject(value) { return new PlayerView(value, CONSTRUCTION_TOKEN); }

  render() {
    const parent = this.node?.parentNode || this.target;
    this.renderVersion++;
    this.#destroyMediaPlayer();
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'app-screen screen-player' }]);
    const playlist = this.store.activePlaylist;
    const currentItem = this.store.activeItems.find((item) => item.id === this.currentItemId) || this.store.activeItems[0] || null;
    const header = Utils.buildDOM(['header', { class: 'player-context' }]);
    const back = Utils.buildDOM(['button', { class: 'back-link', type: 'button', 'aria-label': 'Back to Library' }]);
    back.append(Utils.buildDOM(['i', { class: 'fa-solid fa-chevron-left' }])); this.addDOMEventListener(back, 'click', this.onBack);
    const artwork = Utils.buildDOM(['span', { class: 'artwork', 'aria-hidden': 'true' }]);
    const copy = Utils.buildDOM(['span', { class: 'player-context__copy' }]);
    Utils.buildDOM(['strong', playlist?.title || 'Player'], copy);
    Utils.buildDOM(['small', { 'data-item-label': 'true' }, currentItem ? formatPlayableItemLabel(currentItem) : 'No item selected'], copy);
    header.append(back, artwork, copy); this.node.append(header);
    const overallProgress = Utils.buildDOM(['div', { class: 'player-overall-progress', 'data-overall-progress': 'true', role: 'progressbar', 'aria-label': 'Playable track progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }]);
    const overallProgressFill = Utils.buildDOM(['div', { class: 'player-overall-progress__fill' }]);
    overallProgress.append(overallProgressFill);
    this.node.append(overallProgress);
    if (!playlist) {
      const empty = Utils.buildDOM(['div', { class: 'screen-content player-content' }]); Utils.buildDOM(['p', 'No playlists saved yet.'], empty); this.node.append(empty); this.#appendNav();
      parent.append(this.node);
      return;
    }

    const select = Utils.ui.select();
    select.className = 'player-item-select'; select.setAttribute('aria-label', 'Choose study item');
    const content = Utils.buildDOM(['div', { class: 'screen-content player-content no-top-padding' }]);
    const controls = Utils.buildDOM(['div', { class: 'player-controls', 'data-controls': 'true' }]);
    const text = Utils.buildDOM(['div', { class: 'transcript-container' },
      ['div', { class: 'transcript', 'data-text': 'true' }]
    ]);
    this.store.activeItems.forEach((item) => {
      const option = Utils.ui.option(item.title, item.id);
      option.selected = item.id === this.currentItemId;
      select.append(option);
    });
    const pin = Utils.buildDOM(['div', { class: 'pin-button-container' }]);
    const pinButton = Utils.buildDOM(['button', { class: 'pin-button', type: 'button', 'aria-label': 'Pin item' }]); pinButton.append(Utils.buildDOM(['i', { class: 'fa-solid fa-thumbtack' }])); pin.append(pinButton);
    const tools = Utils.buildDOM(['div', { class: 'player-tools' }]);
    const speed = Utils.ui.button(''); speed.className = 'player-tool-button'; speed.setAttribute('aria-label', 'Change playback speed');
    const speedValue = Utils.buildDOM(['span', `${this.playbackRate}×`]); Utils.buildDOM(['small', 'Speed'], speedValue); speed.append(speedValue);
    const speedPopup = Utils.buildDOM(['div', { class: 'speed-popup', hidden: 'true', role: 'menu', 'aria-label': 'Playback speed' }]);
    PLAYBACK_RATES.forEach((rate) => {
      const option = Utils.ui.button(`${rate}×`);
      option.className = 'speed-popup__option';
      option.setAttribute('role', 'menuitemradio');
      option.setAttribute('aria-checked', String(rate === this.playbackRate));
      this.addDOMEventListener(option, 'click', () => {
        this.playbackRate = rate;
        writePlaybackRate(rate);
        speedValue.firstChild.textContent = `${rate}×`;
        speedPopup.hidden = true;
        speedPopup.querySelectorAll('[role="menuitemradio"]').forEach((entry) => entry.setAttribute('aria-checked', String(entry === option)));
        this.mediaPlayer?.setPlaybackRate(rate);
      });
      speedPopup.append(option);
    });
    this.addDOMEventListener(speed, 'click', (event) => { event.stopPropagation(); speedPopup.hidden = !speedPopup.hidden; });
    this.addDOMEventListener(document, 'click', () => { speedPopup.hidden = true; });
    speed.append(speedPopup);
    const queue = Utils.buildDOM(['span']);
    queue.append(Utils.buildDOM(['i', { class: 'fa-solid fa-list-ul' }]));
    Utils.buildDOM(['small', 'Queue'], queue);
    tools.append(speed/*, queue */);
    content.append(select, text, pin, controls, tools); this.node.append(content);
    parent.append(this.node);
    this.#bindTranscriptScrolling(text);
    this.#preparePlaylistProgress(playlist);

    const selected = currentItem;
    if (selected) {
      this.currentItemId = selected.id;
      this.store.selectItem(selected.id);
      this.renderItem(selected, false);
    } else {
      Utils.buildDOM(['p', 'This playlist has no items yet.'], text);
    }

    this.addDOMEventListener(select, 'change', () => {
      const item = this.store.activeItems.find((entry) => entry.id === select.value);
      if (!item) return;
      this.currentItemId = item.id;
      this.onItemChange(item.id);
      this.renderItem(item, false);
    });
    this.#appendNav();
  }

  #appendNav() {
    const nav = Utils.buildDOM(['nav', { class: 'bottom-nav', 'aria-label': 'Primary navigation' }]);
    const library = Utils.buildDOM(['button', { class: 'bottom-nav__item', type: 'button' }]);
    library.append(
      Utils.buildDOM(['span',
        ['i', { class: 'fa-solid fa-folder' }]
      ]),
      document.createTextNode('Library')
    );
    this.addDOMEventListener(library, 'click', this.onBack);
    const player = Utils.buildDOM(['button', { class: 'bottom-nav__item is-active', type: 'button' }]);
    player.append(
      Utils.buildDOM(['span',
        ['i', { class: 'fa-solid fa-play' }]
      ]),
      document.createTextNode('Player')
    );
    const pins = Utils.buildDOM(['button', { class: 'bottom-nav__item', type: 'button' }]);
    pins.append(
      Utils.buildDOM(['span',
        ['i', { class: 'fa-solid fa-thumbtack' }]
      ]),
      document.createTextNode('Pins')
    );
    nav.append(library, player, pins);
    this.node.append(nav);
  }

  async renderItem(item, autoPlay) {
    const version = ++this.renderVersion;
    const itemLabel = this.node?.querySelector('[data-item-label]');
    if (itemLabel) itemLabel.textContent = formatPlayableItemLabel(item);
    this.#destroyMediaPlayer();
    const controls = this.node?.querySelector('[data-controls]');
    const text = this.node?.querySelector('[data-text]');
    if (!controls || !text) return;
    controls.replaceChildren();
    text.replaceChildren();

    let source;
    try {
      source = item.type === 'audio'
        ? await this.controller.createAudioSource(item)
        : this.controller.createTtsSource(item);
    } catch (error) {
      Utils.buildDOM(['p', error.message], controls);
      this.renderText(item, text, null);
      return;
    }
    if (version !== this.renderVersion) {
      source.destroy();
      return;
    }

    const itemIndex = this.store.activeItems.findIndex((entry) => entry.id === item.id);
    this.mediaPlayer = MediaPlayer.fromObject({
      source,
      playbackRate: this.playbackRate,
      canPrevious: itemIndex > 0,
      canNext: itemIndex >= 0 && itemIndex < this.store.activeItems.length - 1,
      onPrevious: () => this.#changeItem(-1, true),
      onNext: () => this.#changeItem(1, true),
      onRewind: () => this.#changeParagraph(item, -1),
      onForward: () => this.#changeParagraph(item, 1),
    });
    controls.append(this.mediaPlayer.node);
    this.mediaPlayer.on('timeupdate', (event) => {
      if (item.type === 'audio') this.updateHighlight(item, event?.sourceTime ?? event?.time ?? 0);
      this.#updateOverallProgress();
    });
    this.mediaPlayer.on('boundary', (event) => this.updateTtsHighlight(event.characterIndex));
    this.mediaPlayer.on('error', (error) => this.controller.status(error?.message || 'Playback failed.', true));
    this.renderText(item, text, this.mediaPlayer);
    if (this.mediaPlayer.duration > 0) this.playlistDurations.set(item.id, this.mediaPlayer.duration);
    this.playlistDurationsLoading = this.store.activeItems.some((entry) => !this.playlistDurations.has(entry.id));
    this.#updateOverallProgress();
    if (autoPlay) this.mediaPlayer.play();
  }

  #changeItem(offset, autoPlay) {
    const items = this.store.activeItems;
    const index = items.findIndex((item) => item.id === this.currentItemId);
    const next = items[index + offset];
    if (!next) return;
    this.currentItemId = next.id;
    this.onItemChange(next.id);
    const select = this.node?.querySelector('select');
    if (select) select.value = next.id;
    this.renderItem(next, autoPlay);
  }

  #changeParagraph(item, offset) {
    if (!this.mediaPlayer) return;
    const currentIndex = this.mediaPlayer.getParagraphIndexAtTime(this.mediaPlayer.currentTime);
    if (!Number.isInteger(currentIndex)) return;
    const playableIndexes = item.paragraphs
      .map((paragraph, index) => paragraph.play && paragraph.text.trim() ? index : -1)
      .filter((index) => index >= 0);
    const position = playableIndexes.indexOf(currentIndex);
    if (position < 0) return;
    let targetIndex = playableIndexes[position + offset];
    if (offset < 0) {
      const currentStart = this.mediaPlayer.getParagraphStartTime(currentIndex);
      const withinOpening = Number.isFinite(currentStart) && this.mediaPlayer.currentTime - currentStart <= 3;
      if (!withinOpening || !Number.isInteger(targetIndex)) targetIndex = currentIndex;
    }
    if (!Number.isInteger(targetIndex)) return;
    const startTime = this.mediaPlayer.getParagraphStartTime(targetIndex);
    if (Number.isFinite(startTime)) this.mediaPlayer.seek(startTime);
  }

  async #preparePlaylistProgress(playlist) {
    if (!playlist) return;
    const preparationVersion = ++this.progressPreparationVersion;
    this.progressPlaylistId = playlist.id;
    this.playlistDurations = new Map();
    this.playlistDurationsLoading = true;
    this.#updateOverallProgress();
    await Promise.all(this.store.activeItems.map(async (item) => {
      const duration = await this.#getItemDuration(item);
      if (preparationVersion !== this.progressPreparationVersion) return;
      if (duration !== null) this.playlistDurations.set(item.id, duration);
      this.#updateOverallProgress();
    }));
    if (preparationVersion === this.progressPreparationVersion) {
      this.playlistDurationsLoading = this.store.activeItems.some((item) => !this.playlistDurations.has(item.id));
      this.#updateOverallProgress();
    }
  }

  async #getItemDuration(item) {
    let source;
    try {
      source = item.type === 'audio'
        ? await this.controller.createAudioSource(item)
        : this.controller.createTtsSource(item);
      if (source.duration > 0 || item.type !== 'audio') return source.duration;
      const record = await this.controller.database.getAudio(item.audioBlobId);
      if (!record?.blob) return null;
      const probe = Utils.buildDOM(['audio', { preload: 'metadata' }]);
      const objectUrl = URL.createObjectURL(record.blob);
      probe.src = objectUrl;
      probe.hidden = true;
      document.body.append(probe);
      try {
        const duration = await new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            probe.removeEventListener('loadedmetadata', onMetadata);
            probe.removeEventListener('durationchange', onMetadata);
            probe.removeEventListener('error', onError);
            resolve(Number(value) || 0);
          };
          const onMetadata = () => finish(probe.duration);
          const onError = () => finish(0);
          probe.addEventListener('loadedmetadata', onMetadata);
          probe.addEventListener('durationchange', onMetadata);
          probe.addEventListener('error', onError);
          probe.load();
          setTimeout(() => finish(probe.duration), 5000);
        });
        return duration > 0 ? duration : null;
      } finally {
        URL.revokeObjectURL(objectUrl);
        probe.remove();
      }
    } catch {
      return null;
    } finally {
      source?.destroy();
    }
  }

  #updateOverallProgress() {
    const progress = this.node?.querySelector('[data-overall-progress]');
    const fill = progress?.querySelector('.player-overall-progress__fill');
    if (!progress || !fill) return;
    const items = this.store.activeItems;
    const currentIndex = items.findIndex((item) => item.id === this.currentItemId);
    const currentItem = items[currentIndex];
    const currentDuration = Number(this.mediaPlayer?.duration || this.playlistDurations.get(currentItem?.id)) || 0;
    const currentTime = Math.max(0, Number(this.mediaPlayer?.currentTime) || 0);
    const beforeCurrent = items.slice(0, Math.max(0, currentIndex)).reduce((total, item) => total + (Number(this.playlistDurations.get(item.id)) || 0), 0);
    const total = items.reduce((sum, item) => sum + (Number(this.playlistDurations.get(item.id)) || 0), 0);
    const hasUnknownDuration = items.some((item) => !this.playlistDurations.has(item.id));
    const percent = !hasUnknownDuration && total > 0
      ? Math.min(100, (beforeCurrent + Math.min(currentTime, currentDuration)) / total * 100)
      : 0;
    fill.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
  }

  renderText(item, target, mediaPlayer) {
    this.activeWord = null;
    let audioCharacterIndex = 0;
    let speechCharacterIndex = 0;
    let selectedParagraphCount = 0;
    item.paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphElement = Utils.buildDOM(['p', { class: 'paragraph' }]);
      paragraphElement.classList.toggle('paragraph--not-played', !paragraph.play);
      const paragraphIsPlayable = item.type !== 'tts' || paragraph.play;
      if (item.type === 'tts' && paragraphIsPlayable) {
        if (selectedParagraphCount > 0) speechCharacterIndex += 2;
        selectedParagraphCount++;
      }

      if (paragraph.number !== null) {
        const number = Utils.buildDOM(['span', { class: 'paragraph-number' }, `${paragraph.number} `]);
        paragraphElement.append(number);
      }

      (paragraph.text.match(/[A-Za-z0-9']+|[^A-Za-z0-9']+/g) || []).forEach((token) => {
        const isWord = /^[A-Za-z0-9']+$/.test(token);
        if (isWord) {
          const word = Utils.buildDOM(['span', { class: 'word' }, token]);
          const characterStart = item.type === 'tts' ? speechCharacterIndex : audioCharacterIndex;
          word.dataset.charStart = paragraphIsPlayable ? characterStart : -1;
          if (item.type === 'tts' && paragraphIsPlayable) speechCharacterIndex += token.length;
          if (item.type !== 'tts') audioCharacterIndex += token.length;
          word.dataset.charEnd = paragraphIsPlayable
            ? (item.type === 'tts' ? speechCharacterIndex : audioCharacterIndex)
            : -1;
          const wordIndex = paragraphElement.querySelectorAll('.word').length;
          if (mediaPlayer && paragraphIsPlayable) {
            this.addDOMEventListener(word, 'click', () => {
              this.#resumeAutoScroll();
              if (item.type === 'audio' && paragraph.words[wordIndex]) mediaPlayer.seekToSourceTime(paragraph.words[wordIndex].start);
              if (item.type === 'tts') mediaPlayer.seekToCharacter(Number(word.dataset.charStart));
              mediaPlayer.play();
            });
          }
          paragraphElement.append(word);
          return;
        }

        paragraphElement.append(Utils.buildDOM(['span', { class: 'non-word' }, token]));
        if (item.type === 'tts' && paragraphIsPlayable) speechCharacterIndex += token.length;
        if (item.type !== 'tts') audioCharacterIndex += token.length;
      });
      target.append(paragraphElement);
      paragraphElement.dataset.paragraphIndex = paragraphIndex;
    });
    const firstPlayableParagraph = target.querySelector('.paragraph:not(.paragraph--not-played)');
    if (!firstPlayableParagraph) {
      target.scrollTop = 0;
      return;
    }
    firstPlayableParagraph.firstElementChild.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  updateHighlight(item, time) {
    let nextActiveWord = null;
    item.paragraphs.forEach((paragraph, index) => {
      const element = this.node.querySelectorAll('.paragraph')[index];
      const active = paragraph.play && time >= paragraph.start && time <= paragraph.end;
      element?.classList.toggle('current', active);
      element?.querySelectorAll('.word').forEach((word, wordIndex) => {
        const wordActive = active && Boolean(paragraph.words[wordIndex] && time >= paragraph.words[wordIndex].start && time <= paragraph.words[wordIndex].end);
        word.classList.toggle('current', wordActive);
        if (wordActive) nextActiveWord = word;
      });
    });
    this.#scrollToActiveWord(nextActiveWord);
  }

  updateTtsHighlight(index) {
    let nextActiveWord = null;
    this.node.querySelectorAll('.word').forEach((word) => {
      const wordActive = Number(word.dataset.charStart) <= index && index < Number(word.dataset.charEnd);
      word.classList.toggle('current', wordActive);
      if (wordActive) nextActiveWord = word;
    });
    this.#scrollToActiveWord(nextActiveWord);
  }

  #scrollToActiveWord(word) {
    if (!word) {
      this.activeWord = null;
      return;
    }
    const wasActive = word === this.activeWord;
    this.activeWord = word;
    if (this.scrollMode !== 'normal' || wasActive) return;
    this.autoScrollIgnoreUntil = performance.now() + 1000;
    word.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  #bindTranscriptScrolling(transcript) {
    ['wheel', 'touchstart', 'touchmove', 'pointermove', 'scroll'].forEach((eventName) => {
      this.addDOMEventListener(transcript, eventName, (event) => {
        if (event.type === 'scroll' && performance.now() < this.autoScrollIgnoreUntil) return;
        this.#handleUserTranscriptScroll();
      });
    });
  }

  #handleUserTranscriptScroll() {
    if (!this.mediaPlayer?.source?.playing) return;
    this.#cancelScrollRecovery();
    this.scrollMode = 'paused';
    this.scrollRecoveryTimer = setTimeout(() => this.#beginSlowScroll(), 3000);
  }

  #beginSlowScroll() {
    this.scrollRecoveryTimer = null;
    if (!this.mediaPlayer?.source?.playing) {
      this.scrollMode = 'normal';
      return;
    }
    this.scrollMode = 'slow';
    this.autoScrollIgnoreUntil = performance.now() + 3500;
    this.slowScrollTimer = setInterval(() => {
      if (!this.mediaPlayer?.source?.playing) {
        this.#cancelScrollRecovery();
        return;
      }
      const word = this.activeWord;
      const transcript = this.node?.querySelector('[data-text]');
      if (!word || !transcript) return;
      const paddingTop = parseFloat(getComputedStyle(transcript).paddingTop) || 0;
      const targetTop = Math.max(0, word.offsetTop - paddingTop - transcript.clientHeight / 2);
      transcript.scrollBy({
        top: (targetTop - transcript.scrollTop) > 0 ? 1 : -1,
        behavior: 'smooth'
      });
    }, 25);
    this.scrollRecoveryFinishTimer = setTimeout(() => {
      this.scrollRecoveryFinishTimer = null;
      if (this.scrollMode !== 'slow') return;
      clearInterval(this.slowScrollTimer);
      this.slowScrollTimer = null;
      this.scrollMode = 'normal';
      this.autoScrollIgnoreUntil = performance.now() + 1000;
      if (this.activeWord) this.activeWord.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 3000);
  }

  #cancelScrollRecovery() {
    if (this.scrollRecoveryTimer) clearTimeout(this.scrollRecoveryTimer);
    if (this.slowScrollTimer) clearInterval(this.slowScrollTimer);
    if (this.scrollRecoveryFinishTimer) clearTimeout(this.scrollRecoveryFinishTimer);
    this.scrollRecoveryTimer = null;
    this.slowScrollTimer = null;
    this.scrollRecoveryFinishTimer = null;
  }

  #resumeAutoScroll() {
    this.#cancelScrollRecovery();
    this.scrollMode = 'normal';
    this.autoScrollIgnoreUntil = 0;
  }

  #destroyMediaPlayer() {
    if (this.mediaPlayer) this.mediaPlayer.destroy();
    this.mediaPlayer = null;
  }

  destroy() {
    this.#cancelScrollRecovery();
    this.store.off('package-changed', this.packageListener);
    this.#destroyMediaPlayer();
    super.destroy();
  }
}
