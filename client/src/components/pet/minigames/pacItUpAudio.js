// ─── Pac It Up! audio (Web Audio synthesis) ─────────────────────

let _ctx = null;
let _muted = false;
let _started = false;
let _sirenOsc = null;
let _sirenGain = null;

function ctx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function startAudio() { _started = true; ctx(); }
export function setMuted(m) {
  _muted = m;
  if (_sirenGain) _sirenGain.gain.value = m ? 0 : 0.04;
}
export function isMuted() { return _muted; }
export function isStarted() { return _started; }

function synth(freq, endFreq, type = 'sine', dur = 0.1, vol = 0.08) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch (_) {}
}

function noise(dur = 0.08, vol = 0.06) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(gain).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  } catch (_) {}
}

function synthAt(time, freq, endFreq, type, dur, vol) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.linearRampToValueAtTime(endFreq, time + dur);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  } catch (_) {}
}

// ─── SFX ─────────────────────────────────────────────────────────

export function playChomp() {
  synth(260, 180, 'square', 0.06, 0.06);
}

export function playPowerUp() {
  if (_muted || !_started) return;
  const t = ctx().currentTime;
  synthAt(t, 330, 440, 'square', 0.1, 0.08);
  synthAt(t + 0.1, 440, 660, 'square', 0.1, 0.08);
  synthAt(t + 0.2, 660, 880, 'sine', 0.15, 0.06);
}

export function playGhostEat() {
  synth(600, 200, 'sawtooth', 0.15, 0.08);
  noise(0.05, 0.04);
}

export function playMineHit() {
  synth(200, 80, 'sawtooth', 0.2, 0.1);
  noise(0.12, 0.08);
}

export function playShieldPickup() {
  if (_muted || !_started) return;
  const t = ctx().currentTime;
  synthAt(t, 440, 660, 'sine', 0.1, 0.06);
  synthAt(t + 0.08, 660, 880, 'sine', 0.1, 0.06);
}

export function playShieldBreak() {
  synth(500, 200, 'triangle', 0.15, 0.08);
  noise(0.08, 0.06);
}

export function playLifeLost() {
  if (_muted || !_started) return;
  const t = ctx().currentTime;
  synthAt(t, 440, 330, 'sawtooth', 0.2, 0.08);
  synthAt(t + 0.25, 330, 220, 'triangle', 0.2, 0.06);
  synthAt(t + 0.5, 220, 110, 'sine', 0.3, 0.05);
}

export function playStageClear() {
  if (_muted || !_started) return;
  const t = ctx().currentTime;
  synthAt(t, 440, 660, 'square', 0.12, 0.07);
  synthAt(t + 0.15, 550, 880, 'square', 0.12, 0.07);
  synthAt(t + 0.3, 660, 990, 'sine', 0.2, 0.06);
}

export function playGameOver() {
  if (_muted || !_started) return;
  const t = ctx().currentTime;
  synthAt(t, 440, 330, 'sawtooth', 0.25, 0.07);
  synthAt(t + 0.3, 330, 220, 'sawtooth', 0.25, 0.06);
  synthAt(t + 0.6, 220, 110, 'triangle', 0.4, 0.05);
}

export function playCountdown(isGo) {
  synth(isGo ? 880 : 440, isGo ? 880 : 440, 'square', 0.1, 0.06);
}

// ─── Siren (background loop) ────────────────────────────────────

export function startSiren(mode) {
  stopSiren();
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    const baseFreq = mode === 'frightened' ? 180 : 120;
    const range = mode === 'frightened' ? 40 : 20;
    const speed = mode === 'frightened' ? 6 : 3;
    osc.frequency.setValueAtTime(baseFreq, c.currentTime);
    // Modulate with LFO
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = speed;
    lfoGain.gain.value = range;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start();
    gain.gain.value = _muted ? 0 : 0.04;
    osc.connect(gain).connect(c.destination);
    osc.start();
    _sirenOsc = osc;
    _sirenGain = gain;
    _sirenOsc._lfo = lfo;
  } catch (_) {}
}

export function stopSiren() {
  try {
    if (_sirenOsc) {
      _sirenOsc._lfo?.stop();
      _sirenOsc.stop();
    }
  } catch (_) {}
  _sirenOsc = null;
  _sirenGain = null;
}

export function stopAll() {
  stopSiren();
}
