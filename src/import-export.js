import { StudyPackage } from './models.js';
const CONSTRUCTION_TOKEN = Symbol('codec-construction-token');

export class PackageCodec {
  constructor(token) { if (token !== CONSTRUCTION_TOKEN) throw new Error('PackageCodec must be created with PackageCodec.fromObject().'); }

  static fromObject() {
    return new PackageCodec(CONSTRUCTION_TOKEN);
  }

  parseJson(text) {
    const raw = JSON.parse(text);
    if (raw.format && raw.format !== 'personal-study-mate') throw new Error('This JSON is not a Personal Study Mate package.');
    if (raw.version && raw.version !== 1) throw new Error(`Unsupported package version: ${raw.version}`);
    return StudyPackage.fromObject(raw);
  }

  serialize(studyPackage) {
    return JSON.stringify(studyPackage.toObject(), null, 2);
  }
}
