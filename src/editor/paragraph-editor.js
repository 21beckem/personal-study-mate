import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Paragraph } from '../models.js';
import { EditorEvent, ParagraphMove } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('paragraph-editor-construction-token');

export class ParagraphEditor extends EventEmitterMixin(DOMElement) {
  constructor({ item }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ParagraphEditor must be created with ParagraphEditor.fromObject().');
    this.item = item; this.#build();
  }

  static fromObject(value) { return new ParagraphEditor(value, CONSTRUCTION_TOKEN); }
  setItem(item) { this.item = item; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', {
      class: 'editor-section'
    }]);
    Utils.buildDOM(['h3', 'Original text and paragraphs'], this.node);
    if (!this.item) {
      Utils.buildDOM(['p', 'Select an item to edit its text.'], this.node);
      if (parent) parent.append(this.node);
      return;
    }
    const locked = this.item.status === 'ready';
    const text = Utils.ui.textarea('Canonical text');
    text.value = this.item.text;
    text.disabled = locked;
    const parse = Utils.ui.button('Parse clipboard into paragraphs');
    parse.disabled = locked;
    const add = Utils.ui.button('Add paragraph');
    add.className = 'wide-button';
    add.disabled = locked;
    const addParsed = Utils.ui.button('Parse clipboard into paragraphs');
    addParsed.className = 'wide-button';
    addParsed.disabled = locked;
    const enableAll = Utils.ui.button('Enable all');
    const disableAll = Utils.ui.button('Disable all');
    this.addDOMEventListener(parse, 'click', () => this.emit('text-changed', EditorEvent.fromObject({
      kind: 'item-text-changed',
      message: text.value
    })));
    this.addDOMEventListener(add, 'click', () => this.emit('paragraphs-changed', EditorEvent.fromObject({
      kind: 'paragraphs-changed',
      entity: [...this.item.paragraphs, Paragraph.fromObject({
        text: ''
      })]
    })));
    this.addDOMEventListener(enableAll, 'click', () => this.#setAllPlayable(true));
    this.addDOMEventListener(disableAll, 'click', () => this.#setAllPlayable(false));
    this.addDOMEventListener(addParsed, 'click', () => {
      if (locked) return;
      if (confirm('This will replace all existing paragraphs. Are you sure you want to continue?') === false)
        return;

      // get clipboad text and parse into paragraphs
      navigator.clipboard.readText().then((clipText) => {
        this.emit('text-changed', EditorEvent.fromObject({
          kind: 'item-text-changed',
          message: clipText
        }));
      }).catch((error) => {
        console.error('Failed to read clipboard text:', error);
        alert('Failed to read clipboard text. Please try again.');
      });
    });
    this.node.append(Utils.ui.label('Canonical text'), text, parse, enableAll, disableAll);
    const list = Utils.buildDOM(['div', {
      class: 'paragraph-list'
    }]);
    this.node.append(list, add, addParsed);
    this.item.paragraphs.forEach((paragraph, index) => this.#addParagraph(list, paragraph, index, locked));
    if (parent) parent.append(this.node);
  }

  #addParagraph(list, paragraph, index, locked) {
    const row = Utils.buildDOM(['div', {
      class: 'paragraph-row',
      'data-paragraph-id': paragraph.id
    }]);
    const play = Utils.ui.checkbox('Play');
    play.input.checked = paragraph.play;
    const number = Utils.ui.input('number');
    number.value = paragraph.number ?? '';
    number.placeholder = '#';
    const text = Utils.ui.textarea('Paragraph text');
    text.value = paragraph.text;
    text.disabled = locked;
    const up = Utils.ui.button('↑');
    const down = Utils.ui.button('↓');
    const remove = Utils.ui.button('Remove');
    up.disabled = locked || index === 0;
    down.disabled = locked || index === this.item.paragraphs.length - 1;
    remove.disabled = locked;
    const update = async () => {
      const paragraphs = this.item.paragraphs.map((entry, entryIndex) => entryIndex === index ? Paragraph.fromObject({
        ...entry.toObject(),
        number: number.value ? Number(number.value) : null,
        text: text.value,
        play: play.input.checked
      }) : entry);
      this.emit('paragraphs-changed', EditorEvent.fromObject({
        kind: 'paragraphs-changed',
        entity: paragraphs
      }));
    };
    this.addDOMEventListener(play.input, 'change', update);
    this.addDOMEventListener(number, 'change', update);
    this.addDOMEventListener(text, 'change', update);
    this.addDOMEventListener(up, 'click', () => this.emit('move', EditorEvent.fromObject({
      kind: 'paragraph-move',
      entity: ParagraphMove.fromObject({
        from: index,
        to: index - 1
      })
    })));
    this.addDOMEventListener(down, 'click', () => this.emit('move', EditorEvent.fromObject({
      kind: 'paragraph-move',
      entity: ParagraphMove.fromObject({
        from: index,
        to: index + 1
      })
    })));
    this.addDOMEventListener(remove, 'click', () => this.emit('remove', EditorEvent.fromObject({
      kind: 'paragraph-remove',
      entity: paragraph
    })));
    Utils.buildDOM([row,
      [text],
      ['div', { class: 'paragraph-controls' },
        [play.input], [number], ['div', { style: 'flex: 1;' }], [up], [down], [remove]
      ]
    ]);
    list.append(row);
  }

  #setAllPlayable(play) {
    this.emit('paragraphs-changed', EditorEvent.fromObject({
      kind: 'paragraphs-changed',
      entity: this.item.paragraphs.map((paragraph) => Paragraph.fromObject({
        ...paragraph.toObject(),
        play
      }))
    }));
  }
}
