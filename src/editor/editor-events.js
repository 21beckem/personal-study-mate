const CONSTRUCTION_TOKEN = Symbol('editor-event-construction-token');

export class EditorEvent {
  constructor({ kind, entity = null, message = '' }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('EditorEvent must be created with EditorEvent.fromObject().');
    this.kind = kind;
    this.entity = entity;
    this.message = message;
  }

  static fromObject(value = {}) { return new EditorEvent(value, CONSTRUCTION_TOKEN); }
}

export class ProcessingProgress {
  constructor({ phase, message, percent = null, currentSeconds = null, totalSeconds = null, overallPercent = null }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ProcessingProgress must be created with ProcessingProgress.fromObject().');
    this.phase = phase;
    this.message = message;
    this.percent = percent;
    this.currentSeconds = currentSeconds;
    this.totalSeconds = totalSeconds;
    this.overallPercent = overallPercent;
  }

  static fromObject(value = {}) { return new ProcessingProgress(value, CONSTRUCTION_TOKEN); }
}

export class ItemReorder {
  constructor({ from, to }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ItemReorder must be created with ItemReorder.fromObject().');
    this.from = from;
    this.to = to;
  }

  static fromObject(value = {}) { return new ItemReorder(value, CONSTRUCTION_TOKEN); }
}

export class ParagraphMove {
  constructor({ from, to }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('ParagraphMove must be created with ParagraphMove.fromObject().');
    this.from = from;
    this.to = to;
  }

  static fromObject(value = {}) { return new ParagraphMove(value, CONSTRUCTION_TOKEN); }
}
