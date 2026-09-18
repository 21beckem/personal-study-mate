import { DOMElement, EventEmitterMixin } from '../modules.js';
import { Paragraph, StudyItem } from '../models.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';
import { AudioAttachmentControl } from './audio-attachment.js';
import { ParagraphEditor } from './paragraph-editor.js';
import { ProcessingPanel } from './processing-panel.js';

const CONSTRUCTION_TOKEN = Symbol('study-item-editor-construction-token');

export class StudyItemEditor extends EventEmitterMixin(DOMElement) {
  constructor({ item, getAttachment, processor }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('StudyItemEditor must be created with StudyItemEditor.fromObject().');
    this.item = item; this.getAttachment = getAttachment; this.processor = processor; this.children = [];
    this.#build();
  }

  static fromObject(value) { return new StudyItemEditor(value, CONSTRUCTION_TOKEN); }
  setItem(item) { this.item = item; this.#destroyChildren(); this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['section', { class: 'study-item-editor' }]);
    Utils.buildDOM(['h3', 'Study item'], this.node);
    if (!this.item) { Utils.buildDOM(['p', 'Add or select an item to edit it.'], this.node); if (parent) parent.append(this.node); return; }
    const title = Utils.ui.input('text', 'Item title'); title.value = this.item.title;
    const source = Utils.ui.input('url', 'Source URL (optional)'); source.value = this.item.sourceUrl;
    const type = Utils.ui.select(); type.append(Utils.ui.option('Text to speech', 'tts'), Utils.ui.option('Pre-recorded audio', 'audio')); type.value = this.item.type;
    const updateCommon = () => { this.item = StudyItem.fromObject({ ...this.item.toObject(), title: title.value || 'Untitled item', sourceUrl: source.value, type: type.value }); this.emit('changed', EditorEvent.fromObject({ kind: 'item-changed', entity: this.item })); };
    this.addDOMEventListener(title, 'input', updateCommon); this.addDOMEventListener(source, 'input', updateCommon); this.addDOMEventListener(type, 'change', updateCommon);
    this.node.append(Utils.ui.label('Title'), title, Utils.ui.label('Source URL'), source, Utils.ui.label('Type'), type);

    const paragraphs = ParagraphEditor.fromObject({ item: this.item }); this.children.push(paragraphs); this.#wireParagraphs(paragraphs); this.node.append(paragraphs.node);
    if (this.item.type === 'audio') {
      const audio = AudioAttachmentControl.fromObject({ attachment: null }); this.children.push(audio); this.#wireAudio(audio); this.node.append(audio.node);
      this.#loadAttachment(audio);
      const processing = ProcessingPanel.fromObject({ item: this.item, getAttachment: this.getAttachment, processor: this.processor }); this.children.push(processing); this.#wireProcessing(processing); this.node.append(processing.node);
    }
    if (parent) parent.append(this.node);
  }

  async #loadAttachment(control) { const attachment = await this.getAttachment(this.item); if (!control.isDestroyed && attachment) control.setAttachment(attachment); }
  #wireParagraphs(component) {
    component.on('text-changed', (event) => { this.item = StudyItem.fromObject({ ...this.item.toObject(), text: event.message, paragraphs: Paragraph.splitText(event.message), status: 'draft', processing: null }); this.emit('text-changed', event); });
    component.on('paragraphs-changed', (event) => { this.item = StudyItem.fromObject({ ...this.item.toObject(), paragraphs: event.entity, status: 'draft', processing: null }); this.emit('paragraphs-changed', event); });
    component.on('move', (event) => this.emit('paragraph-move', event));
    component.on('remove', (event) => this.emit('paragraph-remove', event));
  }
  #wireAudio(component) {
    component.on('attached', (event) => { this.item = StudyItem.fromObject({ ...this.item.toObject(), audioFileName: event.entity.fileName, audioBlobId: this.item.id, status: 'draft', processing: null }); this.emit('audio-attached', event); });
    component.on('removed', (event) => { this.item = StudyItem.fromObject({ ...this.item.toObject(), audioFileName: '', audioBlobId: null, status: 'draft', processing: null }); this.emit('audio-removed', event); });
  }
  #wireProcessing(component) {
    component.on('processed', (item) => { this.item = item; this.emit('processed', EditorEvent.fromObject({ kind: 'item-processed', entity: item })); });
    component.on('unlock', (item) => { this.item = StudyItem.fromObject({ ...item.toObject(), status: 'draft', processing: null }); this.emit('unlock', EditorEvent.fromObject({ kind: 'item-unlock', entity: this.item })); });
  }
  #destroyChildren() { this.children.forEach((child) => child.destroy()); this.children = []; }
  destroy() { this.#destroyChildren(); super.destroy(); }
}
