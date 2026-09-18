import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('player-view-construction-token');

export class PlayerView {
  constructor({ target, playlist, items, controller, onItemChange, onItemProcessed }, token) {
    if (token !== CONSTRUCTION_TOKEN)
      throw new Error('PlayerView must be created with PlayerView.fromObject().');
    Object.assign(this, {
      target,
      playlist,
      items,
      controller,
      onItemChange,
      onItemProcessed
    });
  }

  static fromObject(value) {
    return new PlayerView(value, CONSTRUCTION_TOKEN);
  }

  render() {
    this.target.replaceChildren();
    Utils.buildDOM(['h2', this.playlist ? `Player: ${this.playlist.title}` : 'Player'], this.target);
    if (!this.playlist) {
      Utils.buildDOM(['p', 'No playlists saved yet.'], this.target);
      return;
    }
    const select = Utils.buildDOM(['select', {
      'data-item': 'true'
    }]);
    const controls = Utils.buildDOM(['div', {
      'data-controls': 'true'
    }]);
    const text = Utils.buildDOM(['div', {
      'data-text': 'true'
    }]);
    this.target.append(select, controls, text);
    this.items.forEach((item) => {
      const option = Utils.buildDOM(['option', item.title]);
      option.value = item.id;
      select.append(option);
    }
    );
    select.onchange = () => this.onItemChange(select.value);
    const item = this.items[0];
    if (item)
      this.renderItem(item);
  }

  async renderItem(item) {
    const controls = this.target.querySelector('[data-controls]');
    controls.replaceChildren();
    const text = this.target.querySelector('[data-text]');
    text.replaceChildren();
    if (item.type === 'audio') {
      const audio = await this.controller.loadAudio(item, controls);
      if (audio) {
        audio.addEventListener('timeupdate', () => this.updateHighlight(item, audio.currentTime));
        controls.append(button('Process / Reprocess', () => this.controller.process(item, audio._studyBlob, this.onItemProcessed)));
      }
    } else {
      controls.append(button('Speak', () => this.controller.speak(item, {
        onBoundary: (index) => this.updateTtsHighlight(index),
        onEnd: () => this.controller.status('TTS finished.'),
        onError: () => this.controller.status('TTS failed.', true)
      })), button('Pause', () => this.controller.pauseSpeech()), button('Resume', () => this.controller.resumeSpeech()), button('Stop', () => this.controller.stopSpeech()));
    }
    this.renderText(item, text);
  }

  renderText(item, target) {
    let characterIndex = 0;
    item.paragraphs.forEach((paragraph) => {
      const paragraphElement = Utils.buildDOM(['p', {
        class: 'paragraph'
      }]);
      (paragraph.text.match(/[A-Za-z0-9']+|[^A-Za-z0-9']+/g) || []).forEach((token) => {
        if (/^[A-Za-z0-9']+$/.test(token)) {
          const word = Utils.buildDOM(['span', {
            class: 'word'
          }, token]);
          word.dataset.charStart = characterIndex;
          characterIndex += token.length;
          word.dataset.charEnd = characterIndex;
          
          const audio = this.target.querySelector('audio');
          word.addEventListener('click', () => {
            const wordIdx = Array.from(paragraphElement.querySelectorAll('.word')).indexOf(word);
            audio.currentTime = paragraph.words[wordIdx].start;
            audio.play();
          });
          paragraphElement.append(word);
        } else {
          paragraphElement.append(Utils.buildDOM(['span', token]).firstChild);
          characterIndex += token.length;
        }
      });
      target.append(paragraphElement);
    });
  }

  updateHighlight(item, time) {
    item.paragraphs.forEach((paragraph, index) => {
      const element = this.target.querySelectorAll('.paragraph')[index];
      element?.classList.toggle('current', time >= paragraph.start && time <= paragraph.end);
      element?.querySelectorAll('.word').forEach((word, wordIndex) => word.classList.toggle('current', Boolean(paragraph.words[wordIndex] && time >= paragraph.words[wordIndex].start && time <= paragraph.words[wordIndex].end)));
    }
    );
  }
  updateTtsHighlight(index) {
    this.target.querySelectorAll('.word').forEach((word) => word.classList.toggle('current', Number(word.dataset.charStart) <= index && index < Number(word.dataset.charEnd)));
  }
}

const button = (label, onclick) => {
  const element = Utils.ui.button(label);
  element.onclick = onclick;
  return element;
}