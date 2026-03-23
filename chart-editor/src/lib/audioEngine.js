/**
 * Audio engine using Web Audio API for precise playback and timing.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.startTime = 0;      // AudioContext time when playback started
    this.startOffset = 0;    // Song position (seconds) when playback started
    this.playing = false;
    this.playbackRate = 1.0;
    this.offset = 0;         // Chart offset in seconds
    this._onTimeUpdate = null;
    this._rafId = null;
  }

  /**
   * Initialize the AudioContext (must be called from a user gesture).
   */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Load an audio file (ArrayBuffer).
   */
  async loadAudio(arrayBuffer) {
    this.init();
    this.stop();
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
    return this.buffer.duration;
  }

  /**
   * Start or resume playback from a given position.
   * @param {number} position - Start position in seconds
   */
  play(position = null) {
    if (!this.buffer || !this.ctx) return;
    this.init();

    this.stop();

    const pos = position !== null ? position : this.startOffset;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    this.source.connect(this.ctx.destination);

    this.startOffset = Math.max(0, pos);
    this.startTime = this.ctx.currentTime;
    this.source.start(0, this.startOffset);
    this.playing = true;

    this.source.onended = () => {
      if (this.playing) {
        this.playing = false;
        this._stopRAF();
      }
    };

    this._startRAF();
  }

  /**
   * Stop playback.
   */
  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) {}
      this.source.disconnect();
      this.source = null;
    }
    if (this.playing) {
      this.startOffset = this.getCurrentTime();
    }
    this.playing = false;
    this._stopRAF();
  }

  /**
   * Get the current playback position in seconds.
   */
  getCurrentTime() {
    if (!this.playing || !this.ctx) return this.startOffset;
    const elapsed = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    return this.startOffset + elapsed;
  }

  /**
   * Seek to a specific position.
   */
  seek(position) {
    const wasPlaying = this.playing;
    this.stop();
    this.startOffset = Math.max(0, position);
    if (wasPlaying) {
      this.play(this.startOffset);
    }
  }

  /**
   * Set playback rate (0.25 to 2.0).
   */
  setRate(rate) {
    this.playbackRate = Math.max(0.25, Math.min(2.0, rate));
    if (this.source) {
      this.source.playbackRate.value = this.playbackRate;
    }
  }

  /**
   * Set the chart offset.
   */
  setOffset(offset) {
    this.offset = offset;
  }

  /**
   * Get the current song time adjusted by chart offset.
   */
  getSongTime() {
    return this.getCurrentTime() - this.offset;
  }

  /**
   * Register a callback for time updates (called on each animation frame during playback).
   */
  onTimeUpdate(callback) {
    this._onTimeUpdate = callback;
  }

  /**
   * Check if audio is loaded.
   */
  isLoaded() {
    return this.buffer !== null;
  }

  /**
   * Get total duration of loaded audio.
   */
  getDuration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  _startRAF() {
    const tick = () => {
      if (!this.playing) return;
      if (this._onTimeUpdate) {
        this._onTimeUpdate(this.getCurrentTime());
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopRAF() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
