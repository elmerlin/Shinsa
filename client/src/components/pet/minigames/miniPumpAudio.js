/**
 * Mini-Pump Audio System
 * 16-bit chiptune-style percussion + FX via Web Audio API
 * Bass-snare cadence cues, shot/hit/miss/bonk sounds
 */

let _ctx = null;
let _muted = false;
let _started = false;

function ctx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function startAudio() {
  _started = true;
  ctx(); // initialize on user gesture
}

export function setMuted(m) { _muted = m; }
export function isMuted() { return _muted; }
export function isStarted() { return _started; }

// ─── Synthesis helpers ───────────────────────────────
function noise(duration, vol = 0.06) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const sr = c.sampleRate;
    const len = sr * duration;
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(gain).connect(c.destination);
    src.start();
    src.stop(c.currentTime + duration + 0.01);
  } catch (e) { /* audio unavailable */ }
}

function synth(freq, endFreq, type = 'sine', dur = 0.1, vol = 0.08) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.connect(gain).connect(c.destination);
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + dur + 0.02);
  } catch (e) { /* audio unavailable */ }
}

function synthAt(time, freq, endFreq, type = 'sine', dur = 0.1, vol = 0.08) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.connect(gain).connect(c.destination);
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  } catch (e) { /* audio unavailable */ }
}

// ─── Cadence cues ────────────────────────────────────
/** Bass kick — signals cycle start */
export function playBass() {
  synth(120, 40, 'sine', 0.12, 0.12);
  synth(80, 30, 'triangle', 0.08, 0.06);
}

/** Snare hit — signals shoot timing */
export function playSnare() {
  noise(0.08, 0.10);
  synth(280, 140, 'triangle', 0.06, 0.07);
}

// ─── Game FX ─��───────────────────────────────────────
/** Laser shot fired */
export function playShot(color) {
  const freqs = { red: [600, 900], yellow: [700, 1100], blue: [500, 800] };
  const [f1, f2] = freqs[color] || freqs.red;
  synth(f1, f2, 'square', 0.06, 0.07);
  synth(f1 * 1.5, f2 * 1.2, 'sine', 0.04, 0.04);
}

/** Blob explodes — satisfying pop */
export function playHitExplode() {
  synth(800, 1400, 'sine', 0.08, 0.09);
  noise(0.06, 0.08);
  setTimeout(() => synth(1200, 600, 'triangle', 0.06, 0.05), 30);
}

/** Miss — fizz/dud */
export function playMiss() {
  synth(200, 100, 'sawtooth', 0.08, 0.04);
  noise(0.04, 0.03);
}

/** Head bonk — bouncy thud */
export function playBonk() {
  synth(300, 80, 'sine', 0.15, 0.12);
  noise(0.1, 0.07);
  setTimeout(() => synth(150, 60, 'triangle', 0.1, 0.06), 60);
}

/** Countdown tick */
export function playCountdown(n) {
  const freq = n <= 0 ? 880 : 440;
  synth(freq, freq * 1.2, 'square', 0.08, 0.08);
}

/** Round end flourish */
export function playRoundEnd() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 440, 660, 'sine', 0.12, 0.08);
    synthAt(t + 0.12, 660, 880, 'sine', 0.12, 0.08);
    synthAt(t + 0.24, 880, 1320, 'triangle', 0.18, 0.07);
    synthAt(t + 0.42, 1320, 1760, 'sine', 0.22, 0.06);
  } catch (e) { /* audio unavailable */ }
}

/** Streak milestone sound */
export function playStreak() {
  synth(660, 1100, 'sine', 0.1, 0.07);
  setTimeout(() => synth(880, 1400, 'triangle', 0.08, 0.05), 80);
}
