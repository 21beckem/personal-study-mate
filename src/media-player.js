import { DOMElement, EventEmitterMixin } from './modules.js';
import { Utils } from './utils.js';

const CONSTRUCTION_TOKEN = Symbol('media-player-construction-token');

export class PlaybackSegment {
  constructor({ paragraphIndex, start, end, timelineStart = 0 }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PlaybackSegment must be created with PlaybackSegment.fromObject().');
    this.paragraphIndex = Number(paragraphIndex);
    this.start = Math.max(0, Number(start) || 0);
    this.end = Math.max(this.start, Number(end) || this.start);
    this.timelineStart = Math.max(0, Number(timelineStart) || 0);
  }

  static fromObject(value = {}) {
    return new PlaybackSegment(value, CONSTRUCTION_TOKEN);
  }

  get duration() { return this.end - this.start; }
  get timelineEnd() { return this.timelineStart + this.duration; }
}

export const buildAudioPlaybackSegments = (item) => {
  const hasTiming = item.paragraphs.some((paragraph) => paragraph.end > paragraph.start);
  if (!hasTiming) return null;

  let timelineStart = 0;
  return item.paragraphs
    .map((paragraph, paragraphIndex) => ({ paragraph, paragraphIndex }))
    .filter(({ paragraph }) => paragraph.play && paragraph.end > paragraph.start)
    .map(({ paragraph, paragraphIndex }) => {
      const segment = PlaybackSegment.fromObject({ paragraphIndex, start: paragraph.start, end: paragraph.end, timelineStart });
      timelineStart = segment.timelineEnd;
      return segment;
    });
};

class AudioMediaSource extends EventEmitterMixin(Object) {
  constructor({ blob, segments = null }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('AudioMediaSource must be created with AudioMediaSource.fromObject().');
    if (!blob) throw new Error('An audio Blob is required.');
    this.element = Utils.buildDOM(['audio', { preload: 'metadata' }]);
    this.element.hidden = true;
    this.element.src = URL.createObjectURL(blob);
    this.segments = segments === null ? null : segments.map((segment) => PlaybackSegment.fromObject(segment));
    this.duration = this.segments === null ? 0 : this.segments.at(-1)?.timelineEnd || 0;
    this.currentTime = 0;
    this.playing = false;
    this.ended = false;
    this.playbackRate = 1;
    this.#bindEvents();
  }

  static fromObject(value) { return new AudioMediaSource(value, CONSTRUCTION_TOKEN); }

  #seeking = false;
  #listeners = [];

  #bindEvents() {
    const loaded = () => {
      if (this.segments === null) this.duration = Number.isFinite(this.element.duration) ? this.element.duration : 0;
      this.emit('durationchange', this.duration);
      this.#emitTimeUpdate();
    };
    const timeupdate = () => this.#syncFromAudio();
    const ended = () => {
      this.playing = false;
      this.currentTime = this.duration;
      this.#emitTimeUpdate();
      this.#finish();
    };
    const error = () => this.emit('error', this.element.error || new Error('Unable to play audio.'));
    [['loadedmetadata', loaded], ['durationchange', loaded], ['timeupdate', timeupdate], ['ended', ended], ['error', error]].forEach(([type, listener]) => {
      this.element.addEventListener(type, listener);
      this.#listeners.push([type, listener]);
    });
  }

  #findSegmentForRawTime(time) {
    return this.segments?.find((segment) => time >= segment.start && time < segment.end) || null;
  }

  #findSegmentForTimelineTime(time) {
    return this.segments?.find((segment) => time >= segment.timelineStart && time < segment.timelineEnd) || this.segments?.at(-1) || null;
  }

  #timelineTimeForRawTime(rawTime) {
    if (this.segments === null) return Math.min(Math.max(0, rawTime), this.duration);
    const segment = this.#findSegmentForRawTime(rawTime);
    if (segment) return Math.min(this.duration, Math.max(0, segment.timelineStart + rawTime - segment.start));
    const next = this.segments.find((entry) => entry.start > rawTime);
    if (next) return next.timelineStart;
    return this.duration;
  }

  #rawTimeForTimelineTime(time) {
    if (this.segments === null) return Math.min(Math.max(0, time), this.duration);
    const segment = this.#findSegmentForTimelineTime(time);
    if (!segment) return 0;
    return segment.start + Math.min(segment.duration, Math.max(0, time - segment.timelineStart));
  }

  #seekRawTime(rawTime) {
    this.#seeking = true;
    this.element.currentTime = Math.max(0, rawTime);
    this.currentTime = this.#timelineTimeForRawTime(this.element.currentTime);
    this.#seeking = false;
    this.#emitTimeUpdate();
  }

  #syncFromAudio() {
    if (this.#seeking) return;
    const rawTime = this.element.currentTime;
    if (this.segments === null) {
      this.currentTime = this.#timelineTimeForRawTime(rawTime);
      this.#emitTimeUpdate();
      return;
    }

    const segment = this.#findSegmentForRawTime(rawTime);
    if (segment) {
      this.currentTime = Math.min(this.duration, segment.timelineStart + rawTime - segment.start);
      this.#emitTimeUpdate();
      if (rawTime >= segment.end) this.#advanceSegment(segment);
      return;
    }

    const next = this.segments.find((entry) => entry.start > rawTime);
    if (next) {
      this.#seekRawTime(next.start);
      return;
    }
    if (rawTime >= (this.segments.at(-1)?.end || 0)) this.#finish();
  }

  #advanceSegment(segment) {
    const next = this.segments.find((entry) => entry.timelineStart > segment.timelineStart);
    if (next) this.#seekRawTime(next.start);
    else this.#finish();
  }

  #emitTimeUpdate() {
    this.emit('timeupdate', { time: this.currentTime, sourceTime: this.element.currentTime });
  }

  #finish() {
    if (this.ended) return;
    this.ended = true;
    this.playing = false;
    this.currentTime = this.duration;
    this.#emitTimeUpdate();
    this.emit('ended');
  }

  async play() {
    if (this.duration <= 0) {
      this.emit('error', new Error('Enable at least one paragraph before playing.'));
      return;
    }
    if (this.ended || this.currentTime >= this.duration) this.seek(0);
    this.ended = false;
    if (this.segments?.length && !this.#findSegmentForRawTime(this.element.currentTime)) this.#seekRawTime(this.#rawTimeForTimelineTime(this.currentTime));
    try {
      await this.element.play();
      this.playing = true;
    } catch (error) {
      this.emit('error', error);
    }
  }

  pause() {
    this.element.pause();
    this.playing = false;
    this.#syncFromAudio();
  }

  seek(time) {
    const target = Math.min(this.duration, Math.max(0, Number(time) || 0));
    this.ended = false;
    this.#seekRawTime(this.#rawTimeForTimelineTime(target));
  }

  seekToSourceTime(time) {
    this.seek(this.#timelineTimeForRawTime(Number(time) || 0));
  }

  timelineTimeForSourceTime(time) { return this.#timelineTimeForRawTime(Number(time) || 0); }

  getParagraphStartTime(paragraphIndex) {
    return this.segments?.find((segment) => segment.paragraphIndex === paragraphIndex)?.timelineStart ?? null;
  }

  getParagraphIndexAtTime(time) {
    return this.#findSegmentForTimelineTime(Number(time) || 0)?.paragraphIndex ?? null;
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    this.element.playbackRate = rate;
  }

  destroy() {
    this.pause();
    this.#listeners.forEach(([type, listener]) => this.element.removeEventListener(type, listener));
    URL.revokeObjectURL(this.element.src);
    this.element.remove();
    super.destroy();
  }
}

class TtsMediaSource extends EventEmitterMixin(Object) {
  constructor({ tts, paragraphs }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('TtsMediaSource must be created with TtsMediaSource.fromObject().');
    this.tts = tts;
    this.element = Utils.buildDOM(['span', { 'aria-hidden': 'true' }]);
    this.element.hidden = true;
    this.playableParagraphIndices = paragraphs.map((paragraph, index) => paragraph.play && paragraph.text.trim() ? index : -1).filter((index) => index >= 0);
    this.paragraphs = paragraphs.filter((paragraph) => paragraph.play && paragraph.text.trim());
    this.speechText = this.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
    this.ranges = [];
    this.duration = 0;
    let characterStart = 0;
    this.paragraphs.forEach((paragraph, index) => {
      if (index > 0) characterStart += 2;
      const wordCount = paragraph.text.match(/[A-Za-z0-9']+/g)?.length || 1;
      const paragraphDuration = Math.max(0.75, wordCount / 2.5);
      this.ranges.push({ paragraphIndex: this.playableParagraphIndices[index], characterStart, characterEnd: characterStart + paragraph.text.length, timeStart: this.duration, timeEnd: this.duration + paragraphDuration });
      characterStart += paragraph.text.length;
      this.duration += paragraphDuration;
    });
    this.currentTime = 0;
    this.playing = false;
    this.ended = false;
    this.playbackRate = 1;
    this.#timer = null;
    this.#generation = 0;
    this.emit('durationchange', this.duration);
  }

  static fromObject(value) { return new TtsMediaSource(value, CONSTRUCTION_TOKEN); }

  #timer;
  #generation;
  #clockStart = 0;
  #clockTime = 0;
  #started = false;

  #timeForCharacter(index) {
    if (!this.ranges.length) return 0;
    const range = this.ranges.find((entry) => index <= entry.characterEnd) || this.ranges.at(-1);
    const span = Math.max(1, range.characterEnd - range.characterStart);
    return Math.min(this.duration, range.timeStart + Math.max(0, index - range.characterStart) / span * (range.timeEnd - range.timeStart));
  }

  #characterForTime(time) {
    const range = this.ranges.find((entry) => time < entry.timeEnd) || this.ranges.at(-1);
    if (!range) return 0;
    const ratio = (Math.min(range.timeEnd, Math.max(range.timeStart, time)) - range.timeStart) / Math.max(0.001, range.timeEnd - range.timeStart);
    return Math.round(range.characterStart + ratio * (range.characterEnd - range.characterStart));
  }

  timelineTimeForCharacter(index) { return this.#timeForCharacter(Number(index) || 0); }

  getParagraphStartTime(paragraphIndex) {
    return this.ranges.find((range) => range.paragraphIndex === paragraphIndex)?.timeStart ?? null;
  }

  getParagraphIndexAtTime(time) {
    return this.ranges.find((range) => time >= range.timeStart && time < range.timeEnd)?.paragraphIndex ?? this.ranges.at(-1)?.paragraphIndex ?? null;
  }

  seekToCharacter(index) { this.seek(this.#timeForCharacter(Number(index) || 0)); }

  #emitTimeUpdate() { this.emit('timeupdate', { time: this.currentTime, sourceTime: this.currentTime }); }

  #updateClock() {
    if (!this.playing) return;
    this.currentTime = Math.min(this.duration, this.#clockTime + (performance.now() - this.#clockStart) / 1000);
    this.#emitTimeUpdate();
  }

  #startTimer() {
    if (this.#timer) return;
    this.#timer = setInterval(() => this.#updateClock(), 100);
  }

  #stopTimer() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #speakFrom(characterStart) {
    const generation = ++this.#generation;
    this.#started = true;
    this.#clockTime = this.currentTime;
    this.#clockStart = performance.now();
    this.tts.speak(this.speechText.slice(characterStart), {
      rate: this.playbackRate,
      onBoundary: (relativeCharacterIndex) => {
        if (generation !== this.#generation) return;
        const characterIndex = characterStart + relativeCharacterIndex;
        this.currentTime = this.#timeForCharacter(characterIndex);
        this.#clockTime = this.currentTime;
        this.#clockStart = performance.now();
        this.#emitTimeUpdate();
        this.emit('boundary', { characterIndex });
      },
      onEnd: () => {
        if (generation !== this.#generation) return;
        this.playing = false;
        this.ended = true;
        this.#stopTimer();
        this.currentTime = this.duration;
        this.#emitTimeUpdate();
        this.emit('ended');
      },
      onError: (error) => { if (generation === this.#generation) this.emit('error', error); },
    });
  }

  async play() {
    if (!this.speechText.trim()) {
      this.emit('error', new Error('Enable at least one paragraph before playing.'));
      return;
    }
    if (this.ended || this.currentTime >= this.duration) this.seek(0);
    this.ended = false;
    this.playing = true;
    this.#clockTime = this.currentTime;
    this.#clockStart = performance.now();
    this.#startTimer();
    if (this.#started) this.tts.resume();
    else this.#speakFrom(this.#characterForTime(this.currentTime));
  }

  setPlaybackRate(rate) {
    if (this.playbackRate === rate) return;
    this.playbackRate = rate;
    if (!this.playing) return;
    this.#updateClock();
    ++this.#generation;
    this.tts.stop();
    this.#stopTimer();
    this.#started = false;
    this.playing = false;
    this.#speakFrom(this.#characterForTime(this.currentTime));
    this.playing = true;
    this.#startTimer();
  }

  pause() {
    this.#updateClock();
    this.playing = false;
    this.#stopTimer();
    this.tts.pause();
  }

  seek(time) {
    const wasPlaying = this.playing;
    ++this.#generation;
    this.tts.stop();
    this.#stopTimer();
    this.#started = false;
    this.playing = false;
    this.ended = false;
    this.currentTime = Math.min(this.duration, Math.max(0, Number(time) || 0));
    this.#emitTimeUpdate();
    if (wasPlaying) this.play();
  }

  destroy() {
    ++this.#generation;
    this.#stopTimer();
    this.tts.stop();
    this.element.remove();
    super.destroy();
  }
}

export class MediaPlayer extends EventEmitterMixin(DOMElement) {
  constructor({ source, canPrevious = false, canNext = false, onPrevious = () => {}, onNext = () => {}, onRewind = () => {}, onForward = () => {}, playbackRate = 1, keepScreenOn = true }, token) {
    super();
    if (token !== CONSTRUCTION_TOKEN) throw new Error('MediaPlayer must be created with MediaPlayer.fromObject().');
    this.source = source;
    this.onPrevious = onPrevious;
    this.onNext = onNext;
    this.onRewind = onRewind;
    this.onForward = onForward;
    this.canPrevious = false;
    this.keepScreenOn = !!keepScreenOn;
    this.node = Utils.buildDOM(['div', { class: 'media-player' }]);
    this.backButton = Utils.ui.button('Back');
    this.rewindButton = Utils.ui.button('Rewind');
    this.playButton = Utils.ui.button('Play');
    this.forwardButton = Utils.ui.button('Fast-forward');
    this.skipButton = Utils.ui.button('Skip');
    this.slider = Utils.ui.input('range');
    this.slider.min = '0';
    this.slider.step = '0.1';
    this.slider.value = '0';
    this.slider.setAttribute('aria-label', 'Playback position');
    this.currentTimeElement = Utils.buildDOM(['span', '0:00']);
    this.durationElement = Utils.buildDOM(['span', '0:00']);
    this.node.append(this.backButton, this.rewindButton, this.playButton, this.forwardButton, this.skipButton, this.slider, this.currentTimeElement, Utils.buildDOM(['span', ' / ']), this.durationElement, source.element);
    this.setNavigation({ canPrevious, canNext });
    this.setPlaybackRate(playbackRate);
    this.#bindEvents();
    this.#updateDuration();
    this.#updateTime({ time: source.currentTime, sourceTime: source.currentTime });
  }

  static fromObject(value) { return new MediaPlayer(value, CONSTRUCTION_TOKEN); }

  #sourceListeners = [];

  #bindEvents() {
    this.addDOMEventListener(this.playButton, 'click', () => {
      if (this.source.playing) {
        this.source.pause();
        this.#updatePlayLabel();
        return;
      }
      Promise.resolve(this.source.play()).finally(() => this.#updatePlayLabel());
    });
    this.addDOMEventListener(this.rewindButton, 'click', () => this.onRewind());
    this.addDOMEventListener(this.forwardButton, 'click', () => this.onForward());
    this.addDOMEventListener(this.slider, 'input', () => this.source.seek(Number(this.slider.value)));
    this.addDOMEventListener(this.backButton, 'click', () => {
      if (this.source.currentTime <= 5 && this.canPrevious) this.onPrevious();
      else this.source.seek(0);
    });
    this.addDOMEventListener(this.skipButton, 'click', () => this.onNext());
    const listeners = {
      durationchange: () => this.#updateDuration(),
      timeupdate: (event) => this.#updateTime(event),
      ended: () => { this.#updatePlayLabel(); this.emit('ended'); this.onNext(); },
      error: (error) => this.emit('error', error),
      boundary: (event) => this.emit('boundary', event),
    };
    Object.entries(listeners).forEach(([event, listener]) => { this.source.on(event, listener); this.#sourceListeners.push([event, listener]); });
  }

  #updateDuration() {
    const duration = Number(this.source.duration) || 0;
    this.slider.max = String(duration);
    this.slider.disabled = duration <= 0;
    this.durationElement.textContent = formatTime(duration);
  }

  #updateTime(event) {
    const time = Number(event?.time ?? this.source.currentTime) || 0;
    this.slider.value = String(Math.min(Number(this.slider.max) || 0, time));
    this.currentTimeElement.textContent = formatTime(time);
    this.#updatePlayLabel();
    this.emit('timeupdate', event);
  }

  #updatePlayLabel() {
    const playing = Boolean(this.source.playing);
    this.playButton.textContent = playing ? 'Pause' : 'Play';
    this.playButton.classList.toggle('is-playing', playing);
    this.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    
    if (this.keepScreenOn && Utils.keepScreenOn.enabled !== playing)
      Utils.keepScreenOn[playing ? 'enable' : 'disable']();
  }

  setNavigation({ canPrevious = false, canNext = false } = {}) {
    this.canPrevious = canPrevious;
    this.backButton.disabled = false;
    this.skipButton.disabled = !canNext;
  }

  seekToSourceTime(time) { this.source.seekToSourceTime?.(time); }
  seekToCharacter(index) { this.source.seekToCharacter?.(index); }
  seek(time) { this.source.seek(time); }
  getParagraphStartTime(index) { return this.source.getParagraphStartTime?.(index) ?? null; }
  getParagraphIndexAtTime(time) { return this.source.getParagraphIndexAtTime?.(time) ?? null; }
  play() { return Promise.resolve(this.source.play()).finally(() => this.#updatePlayLabel()); }
  pause() { this.source.pause(); this.#updatePlayLabel(); }
  get currentTime() { return this.source.currentTime; }
  get duration() { return this.source.duration; }
  setPlaybackRate(rate) { this.source.setPlaybackRate?.(rate); }

  destroy() {
    this.#sourceListeners.forEach(([event, listener]) => this.source.off(event, listener));
    this.source.destroy();
    super.destroy();
  }
}

const formatTime = (value) => {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export { AudioMediaSource, TtsMediaSource };
