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
    this.node = Utils.buildDOM(['section', { class: 'editor-section' }]);
    Utils.buildDOM(['h3', 'Original text and paragraphs'], this.node);
    if (!this.item) { Utils.buildDOM(['p', 'Select an item to edit its text.'], this.node); if (parent) parent.append(this.node); return; }
    const locked = this.item.status === 'ready';
    const text = Utils.ui.textarea('Canonical text'); text.value = this.item.text; text.disabled = locked;
    const parse = Utils.ui.button('Parse text into paragraphs'); parse.disabled = locked;
    this.addDOMEventListener(parse, 'click', () => this.emit('text-changed', EditorEvent.fromObject({ kind: 'item-text-changed', message: text.value })));
    this.node.append(Utils.ui.label('Canonical text'), text, parse);
    const list = Utils.buildDOM(['div', { class: 'paragraph-list' }]); this.node.append(list);
    this.item.paragraphs.forEach((paragraph, index) => this.#addParagraph(list, paragraph, index, locked));
    if (parent) parent.append(this.node);
  }

  #addParagraph(list, paragraph, index, locked) {
    const row = Utils.buildDOM(['div', { class: 'paragraph-row' }]);
    const number = Utils.ui.input('number'); number.value = paragraph.number ?? ''; number.disabled = locked;
    const text = Utils.ui.textarea('Paragraph text'); text.value = paragraph.text; text.disabled = locked;
    const up = Utils.ui.button('↑'); const down = Utils.ui.button('↓'); const remove = Utils.ui.button('Remove');
    up.disabled = locked || index === 0; down.disabled = locked || index === this.item.paragraphs.length - 1; remove.disabled = locked;
    const update = () => { const paragraphs = this.item.paragraphs.map((entry, entryIndex) => entryIndex === index ? Paragraph.fromObject({ ...entry.toObject(), number: number.value ? Number(number.value) : null, text: text.value }) : entry); this.emit('paragraphs-changed', EditorEvent.fromObject({ kind: 'paragraphs-changed', entity: paragraphs })); };
    this.addDOMEventListener(number, 'change', update); this.addDOMEventListener(text, 'change', update);
    this.addDOMEventListener(up, 'click', () => this.emit('move', EditorEvent.fromObject({ kind: 'paragraph-move', entity: ParagraphMove.fromObject({ from: index, to: index - 1 }) })));
    this.addDOMEventListener(down, 'click', () => this.emit('move', EditorEvent.fromObject({ kind: 'paragraph-move', entity: ParagraphMove.fromObject({ from: index, to: index + 1 }) })));
    this.addDOMEventListener(remove, 'click', () => this.emit('remove', EditorEvent.fromObject({ kind: 'paragraph-remove', entity: paragraph })));
    row.append(Utils.ui.label('No.', number), text, up, down, remove); list.append(row);
  }
}
