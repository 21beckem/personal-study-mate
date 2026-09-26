const CONSTRUCTION_TOKEN = Symbol('tts-construction-token');

export class BrowserTts {
  constructor(token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('BrowserTts must be created with BrowserTts.fromObject().');
    this.utterance = null;
  }

  static fromObject() {
    return new BrowserTts(CONSTRUCTION_TOKEN);
  }

  speak(text, { onBoundary = () => {}, onEnd = () => {}, onError = () => {}, rate = 1 } = {}) {
    this.stop();
    if (!('speechSynthesis' in window)) throw new Error('This browser does not provide speech synthesis.');
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = rate;
    this.utterance.onboundary = (event) => onBoundary(event.charIndex);
    this.utterance.onend = onEnd;
    this.utterance.onerror = onError;
    speechSynthesis.speak(this.utterance);
  }

  pause() { speechSynthesis.pause(); }
  resume() { speechSynthesis.resume(); }
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); this.utterance = null; }
}
