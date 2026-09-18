import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('player-view-construction-token');

export class PlayerView extends EventEmitterMixin(DOMElement) {
  constructor({ target, store, controller, onItemChange }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlayerView must be created with PlayerView.fromObject().');
    this.target = target; this.store = store; this.controller = controller; this.onItemChange = onItemChange; this.currentItemId = store.activeItemId; this.packageListener = () => this.render(); this.store.on('package-changed', this.packageListener);
  }

  static fromObject(value) { return new PlayerView(value, CONSTRUCTION_TOKEN); }

  render() {
    const parent = this.node?.parentNode || this.target;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['div', { class: 'player-view' }]);
    const playlist = this.store.activePlaylist;
    Utils.buildDOM(['h2', playlist ? `Player: ${playlist.title}` : 'Player'], this.node);
    if (!playlist) { Utils.buildDOM(['p', 'No playlists saved yet.'], this.node); parent.append(this.node); return; }
    const select = Utils.ui.select(); const controls = Utils.buildDOM(['div', { 'data-controls': 'true' }]); const text = Utils.buildDOM(['div', { 'data-text': 'true' }]);
    this.store.activeItems.forEach((item) => { const option = Utils.ui.option(item.title, item.id); option.selected = item.id === this.currentItemId || (!this.currentItemId && item.id === this.store.activeItems[0]?.id); select.append(option); });
    this.node.append(select, controls, text); parent.append(this.node);
    const selected = this.store.activeItems.find((item) => item.id === select.value) || this.store.activeItems[0];
    if (selected) { this.currentItemId = selected.id; this.store.selectItem(selected.id); this.renderItem(selected); }
    this.addDOMEventListener(select, 'change', () => { const item = this.store.activeItems.find((entry) => entry.id === select.value); if (!item) return; this.currentItemId = item.id; this.onItemChange(item.id); this.renderItem(item); });
  }

  async renderItem(item) {
    const controls = this.node?.querySelector('[data-controls]'); const text = this.node?.querySelector('[data-text]');
    if (!controls || !text) return;
    controls.replaceChildren(); text.replaceChildren();
    let audio = null;
    if (item.type === 'audio') audio = await this.controller.loadAudio(item, controls);
    if (audio) this.addDOMEventListener(audio, 'timeupdate', () => {
      if (!this.#skipUnselectedAudio(item, audio))
        this.updateHighlight(item, audio.currentTime);
    });
    if (item.type === 'tts') {
      const playableParagraphs = item.paragraphs.filter((paragraph) => paragraph.play);
      const speechText = playableParagraphs.map((paragraph) => paragraph.text).join('\n\n');
      controls.append(button('Speak', () => { if (!speechText.trim()) { this.controller.status('Enable at least one paragraph before speaking.', true); return; } this.controller.speakText(speechText, { onBoundary: (index) => this.updateTtsHighlight(index), onEnd: () => this.controller.status('TTS finished.'), onError: () => this.controller.status('TTS failed.', true) }); }), button('Pause', () => this.controller.pauseSpeech()), button('Resume', () => this.controller.resumeSpeech()), button('Stop', () => this.controller.stopSpeech()));
    }
    this.renderText(item, text, audio);
  }

  renderText(item, target, audio) {
    let audioCharacterIndex = 0;
    let speechCharacterIndex = 0;
    let selectedParagraphCount = 0;
    item.paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphElement = Utils.buildDOM(['p', { class: 'paragraph' }]);
      const paragraphIsPlayable = item.type !== 'tts' || paragraph.play;
      if (item.type === 'tts' && paragraphIsPlayable) {
        if (selectedParagraphCount > 0) speechCharacterIndex += 2;
        selectedParagraphCount++;
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
          if (audio && paragraph.words[wordIndex]) {
            this.addDOMEventListener(word, 'click', () => {
              audio.currentTime = paragraph.words[wordIndex].start;
              audio.play();
            });
          }
          paragraphElement.append(word);
          return;
        }

        paragraphElement.append(Utils.buildDOM(['span', token]).firstChild);
        if (item.type === 'tts' && paragraphIsPlayable) speechCharacterIndex += token.length;
        if (item.type !== 'tts') audioCharacterIndex += token.length;
      });
      target.append(paragraphElement);
      paragraphElement.dataset.paragraphIndex = paragraphIndex;
    });
  }

  updateHighlight(item, time) { item.paragraphs.forEach((paragraph, index) => { const element = this.node.querySelectorAll('.paragraph')[index]; const active = paragraph.play && time >= paragraph.start && time <= paragraph.end; element?.classList.toggle('current', active); element?.querySelectorAll('.word').forEach((word, wordIndex) => word.classList.toggle('current', active && Boolean(paragraph.words[wordIndex] && time >= paragraph.words[wordIndex].start && time <= paragraph.words[wordIndex].end))); }); }
  updateTtsHighlight(index) { this.node.querySelectorAll('.word').forEach((word) => word.classList.toggle('current', Number(word.dataset.charStart) <= index && index < Number(word.dataset.charEnd))); }
  #skipUnselectedAudio(item, audio) {
    if (!item.paragraphs.some((paragraph) => paragraph.end > paragraph.start))
      return false;
    const time = audio.currentTime;
    const paragraph = item.paragraphs.find((entry) => time >= entry.start && time < entry.end);
    if (!paragraph || paragraph.play)
      return false;
    const next = item.paragraphs.find((entry) => entry.play && entry.start > time);
    audio.currentTime = next ? next.start : (audio.duration || item.paragraphs.at(-1)?.end || time);
    return true;
  }
  destroy() { this.store.off('package-changed', this.packageListener); this.controller.stopSpeech(); super.destroy(); }
}

const button = (label, onclick) => { const element = Utils.ui.button(label); element.onclick = onclick; return element; };
