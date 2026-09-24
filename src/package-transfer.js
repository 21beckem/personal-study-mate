const CONSTRUCTION_TOKEN = Symbol('package-transfer-construction-token');
const TRANSFER_PARAMETER = 'receive-package';

export class PackageTransferReceiver {
  constructor({ onAnnouncement = () => {}, onPackage = async () => {} }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('PackageTransferReceiver must be created with PackageTransferReceiver.fromObject().');
    this.onAnnouncement = onAnnouncement;
    this.onPackage = onPackage;
    this.transferId = new URLSearchParams(window.location.search).get(TRANSFER_PARAMETER);
    this.opener = window.opener;
    this.chunks = [];
    this.expectedChunks = 0;
    this.expectedCharacters = 0;
    this.started = false;
    this.finished = false;
    this.listener = (event) => this.#handleMessage(event);
  }

  static fromObject(value) {
    return new PackageTransferReceiver(value, CONSTRUCTION_TOKEN);
  }

  get active() {
    return Boolean(this.transferId && this.opener);
  }

  start() {
    if (!this.active) return false;
    window.addEventListener('message', this.listener);
    this.opener.postMessage({
      type: 'package-transfer-ready',
      transferId: this.transferId
    }, '*');
    return true;
  }

  destroy() {
    window.removeEventListener('message', this.listener);
  }

  #isMessageFromTransferPage(event) {
    return this.active && event.origin.startsWith('http://') && event.source === this.opener && event.data?.transferId === this.transferId;
  }

  #handleMessage(event) {
    if (!this.#isMessageFromTransferPage(event)) return;
    const message = event.data;

    if (message.type === 'package-transfer-announcement') {
      this.onAnnouncement(message);
      this.opener.postMessage({
        type: 'package-transfer-announcement-ack',
        transferId: this.transferId
      }, event.origin);
      return;
    }

    if (message.type === 'package-transfer-start') {
      if (!Number.isInteger(message.totalChunks) || message.totalChunks < 1 || message.totalChunks > 10000) {
        this.#sendError(event.origin, 'The package has an invalid chunk count.');
        return;
      }
      this.expectedChunks = message.totalChunks;
      this.expectedCharacters = Number(message.totalCharacters) || 0;
      this.chunks = [];
      this.started = true;
      this.finished = false;
      this.opener.postMessage({
        type: 'package-transfer-start-ack',
        transferId: this.transferId
      }, event.origin);
      return;
    }

    if (message.type === 'package-transfer-chunk') {
      if (!this.started || !Number.isInteger(message.sequence) || message.sequence < 0 || message.sequence >= this.expectedChunks || typeof message.data !== 'string') {
        this.#sendError(event.origin, 'The package chunk was invalid or arrived out of order.');
        return;
      }
      this.chunks[message.sequence] = message.data;
      this.opener.postMessage({
        type: 'package-transfer-chunk-ack',
        transferId: this.transferId,
        sequence: message.sequence
      }, event.origin);
      return;
    }

    if (message.type === 'package-transfer-complete') {
      if (!this.started || this.finished || this.chunks.length !== this.expectedChunks || this.chunks.some((chunk) => typeof chunk !== 'string')) {
        this.#sendError(event.origin, 'The package transfer is incomplete.');
        return;
      }
      const packageText = this.chunks.join('');
      if (this.expectedCharacters && packageText.length !== this.expectedCharacters) {
        this.#sendError(event.origin, 'The package length did not match the transfer metadata.');
        return;
      }
      this.finished = true;
      this.#finishTransfer(event.origin, packageText);
    }
  }

  async #finishTransfer(origin, packageText) {
    try {
      await this.onPackage(packageText);
      this.opener.postMessage({
        type: 'package-transfer-accepted',
        transferId: this.transferId
      }, origin);
    } catch (error) {
      this.#sendError(origin, error.message || 'The package could not be imported.');
    }
  }

  #sendError(origin, message) {
    this.opener?.postMessage({
      type: 'package-transfer-error',
      transferId: this.transferId,
      message
    }, origin);
  }
}
