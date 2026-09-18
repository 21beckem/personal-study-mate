import { DOMElement, EventEmitterMixin } from '../modules.js';
import { AudioAttachment } from '../models.js';
import { EditorEvent } from './editor-events.js';
import { Utils } from '../utils.js';

const CONSTRUCTION_TOKEN = Symbol('audio-attachment-control-construction-token');

export class AudioAttachmentControl extends EventEmitterMixin(DOMElement) {
  constructor({ attachment = null }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AudioAttachmentControl must be created with AudioAttachmentControl.fromObject().');
    this.attachment = attachment; this.objectUrl = null; this.#build();
  }

  static fromObject(value) { return new AudioAttachmentControl(value, CONSTRUCTION_TOKEN); }

  setAttachment(attachment) { this.attachment = attachment; this.#build(); }

  #build() {
    const parent = this.node?.parentNode || null;
    if (this.node) this.reset();
    this.node = Utils.buildDOM(['div', { class: 'audio-attachment' }]);
    const input = Utils.ui.input('file'); input.accept = 'audio/*';
    this.addDOMEventListener(input, 'change', () => { const file = input.files[0]; if (file) this.emit('attached', EditorEvent.fromObject({ kind: 'audio-attached', entity: AudioAttachment.fromObject({ blob: file, fileName: file.name, mimeType: file.type, size: file.size }) })); });
    this.node.append(Utils.ui.label('Audio file'), input);
    if (this.attachment) {
      Utils.buildDOM(['span', ` ${this.attachment.fileName} (${Math.round(this.attachment.size / 1024)} KB)`], this.node);
      const remove = Utils.ui.button('Remove audio');
      this.addDOMEventListener(remove, 'click', () => this.emit('removed', EditorEvent.fromObject({ kind: 'audio-removed' })));
      this.node.append(remove);
    }
    if (parent) parent.append(this.node);
  }

  destroy() { if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); super.destroy(); }
}
