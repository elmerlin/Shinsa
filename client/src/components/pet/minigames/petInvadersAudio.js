/**
 * Pet Invaders Audio System
 * Chiptune-style SFX + looping background music via Web Audio API
 */

let _ctx = null;
let _muted = false;
let _started = false;
let _musicNodes = null; // {gainNode, sources[]}
let _musicPlaying = false;

function ctx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function startAudio() {
  _started = true;
  ctx();
}

export function setMuted(m) {
  _muted = m;
  if (_musicNodes) {
    _musicNodes.gainNode.gain.setValueAtTime(m ? 0 : 0.07, ctx().currentTime);
  }
}
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

// ─── Game SFX ────────────────────────────────────────

/** Player projectile fired */
export function playShoot() {
  synth(800, 1200, 'square', 0.05, 0.06);
  synth(600, 1000, 'sine', 0.03, 0.03);
}

/** Spread shot fired */
export function playSpreadShoot() {
  synth(700, 1400, 'square', 0.06, 0.05);
  synth(900, 1200, 'sine', 0.04, 0.04);
  noise(0.03, 0.03);
}

/** Fodder enemy destroyed */
export function playEnemyDestroy() {
  synth(400, 800, 'sine', 0.08, 0.07);
  noise(0.06, 0.06);
}

/** Enemy hit but not destroyed */
export function playEnemyHit() {
  synth(300, 200, 'square', 0.04, 0.05);
  noise(0.03, 0.04);
}

/** Boss takes damage */
export function playBossHit() {
  synth(200, 400, 'triangle', 0.06, 0.06);
  noise(0.04, 0.05);
}

/** Boss defeated */
export function playBossDefeat() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 300, 600, 'sine', 0.1, 0.08);
    synthAt(t + 0.08, 500, 900, 'sine', 0.1, 0.08);
    synthAt(t + 0.16, 700, 1200, 'triangle', 0.12, 0.07);
    synthAt(t + 0.28, 900, 1500, 'sine', 0.15, 0.07);
    noise(0.3, 0.08);
  } catch (e) { /* audio unavailable */ }
}

/** Player hit by enemy */
export function playPlayerHit() {
  synth(400, 100, 'sawtooth', 0.15, 0.09);
  noise(0.1, 0.08);
  setTimeout(() => synth(200, 80, 'triangle', 0.1, 0.05), 80);
}

/** Player death */
export function playPlayerDeath() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 500, 100, 'sawtooth', 0.2, 0.1);
    synthAt(t + 0.15, 300, 60, 'triangle', 0.25, 0.08);
    synthAt(t + 0.3, 200, 40, 'sine', 0.3, 0.06);
  } catch (e) { /* audio unavailable */ }
  noise(0.4, 0.1);
}

/** Power-up collected */
export function playPowerUp() {
  synth(600, 1200, 'sine', 0.1, 0.07);
  setTimeout(() => synth(900, 1500, 'triangle', 0.08, 0.06), 80);
  setTimeout(() => synth(1200, 1800, 'sine', 0.06, 0.05), 140);
}

/** Wave cleared */
export function playWaveClear() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 440, 660, 'sine', 0.1, 0.07);
    synthAt(t + 0.1, 550, 880, 'sine', 0.1, 0.07);
    synthAt(t + 0.2, 660, 1100, 'triangle', 0.12, 0.06);
  } catch (e) { /* audio unavailable */ }
}

/** Boss incoming warning */
export function playBossWarning() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 150, 100, 'square', 0.15, 0.08);
    synthAt(t + 0.25, 150, 100, 'square', 0.15, 0.08);
    synthAt(t + 0.5, 150, 100, 'square', 0.15, 0.08);
  } catch (e) { /* audio unavailable */ }
}

/** Countdown tick */
export function playCountdown(n) {
  const freq = n <= 0 ? 880 : 440;
  synth(freq, freq * 1.2, 'square', 0.08, 0.08);
}

/** Game over sting */
export function playGameOver() {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const t = c.currentTime;
    synthAt(t, 440, 330, 'sine', 0.15, 0.08);
    synthAt(t + 0.15, 330, 220, 'sine', 0.15, 0.08);
    synthAt(t + 0.3, 220, 110, 'triangle', 0.25, 0.07);
  } catch (e) { /* audio unavailable */ }
}

// ─── Background Music Loop ──────────────────────────
// ~8 bar chiptune loop in C minor, ~60s at 140BPM
// Uses three oscillator channels: bass, lead, arp

const BPM = 140;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// Bass line (C minor pentatonic, root notes)
const BASS_PATTERN = [
  // bar 1-2: Cm
  [0, 'C2', 0.5], [0.5, 'C2', 0.25], [1, 'Eb2', 0.5], [1.5, 'G2', 0.25],
  [2, 'C2', 0.5], [2.5, 'Bb1', 0.25], [3, 'C2', 0.75],
  // bar 3-4: Fm
  [4, 'F2', 0.5], [4.5, 'F2', 0.25], [5, 'Ab2', 0.5], [5.5, 'C3', 0.25],
  [6, 'Bb2', 0.5], [6.5, 'Ab2', 0.25], [7, 'G2', 0.75],
  // bar 5-6: Cm
  [8, 'C2', 0.5], [8.5, 'Eb2', 0.25], [9, 'G2', 0.5], [9.5, 'C3', 0.25],
  [10, 'Bb2', 0.5], [10.5, 'Ab2', 0.25], [11, 'G2', 0.75],
  // bar 7-8: Gm resolve
  [12, 'G2', 0.5], [12.5, 'Bb2', 0.25], [13, 'D3', 0.5], [13.5, 'G2', 0.25],
  [14, 'F2', 0.5], [14.5, 'Eb2', 0.25], [15, 'D2', 0.75],
];

// Lead melody (synth square wave)
const LEAD_PATTERN = [
  [0, 'G4', 0.25], [0.5, 'Eb4', 0.25], [1, 'C4', 0.5],
  [2, 'D4', 0.25], [2.5, 'Eb4', 0.25], [3, 'G4', 0.5],
  [4, 'Ab4', 0.25], [4.5, 'G4', 0.25], [5, 'F4', 0.5],
  [6, 'Eb4', 0.25], [6.5, 'D4', 0.25], [7, 'C4', 0.5],
  [8, 'G4', 0.25], [8.5, 'Bb4', 0.25], [9, 'C5', 0.5],
  [10, 'Bb4', 0.25], [10.5, 'Ab4', 0.25], [11, 'G4', 0.5],
  [12, 'D4', 0.25], [12.5, 'F4', 0.25], [13, 'G4', 0.5],
  [14, 'F4', 0.25], [14.5, 'Eb4', 0.25], [15, 'D4', 0.75],
];

// Arp pattern (fast arpeggios)
const ARP_PATTERN = [];
for (let bar = 0; bar < 16; bar++) {
  const beat = bar;
  const chords = {
    0: ['C4','Eb4','G4'], 1: ['C4','Eb4','G4'], 2: ['C4','Eb4','G4'], 3: ['C4','Eb4','G4'],
    4: ['F4','Ab4','C5'], 5: ['F4','Ab4','C5'], 6: ['Bb3','D4','F4'], 7: ['Bb3','D4','F4'],
    8: ['C4','Eb4','G4'], 9: ['C4','Eb4','G4'], 10: ['Ab3','C4','Eb4'], 11: ['Ab3','C4','Eb4'],
    12: ['G3','Bb3','D4'], 13: ['G3','Bb3','D4'], 14: ['G3','Bb3','D4'], 15: ['G3','Bb3','D4'],
  };
  const notes = chords[bar] || ['C4','Eb4','G4'];
  for (let i = 0; i < 4; i++) {
    ARP_PATTERN.push([beat + i * 0.25, notes[i % notes.length], 0.12]);
  }
}

// Note name → frequency
const NOTE_FREQS = {};
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
for (let oct = 1; oct <= 7; oct++) {
  NOTE_NAMES.forEach((name, i) => {
    NOTE_FREQS[`${name}${oct}`] = 440 * Math.pow(2, (oct - 4) + (i - 9) / 12);
  });
}

function scheduleNote(c, masterGain, time, noteName, dur, type, vol) {
  const freq = NOTE_FREQS[noteName];
  if (!freq) return null;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.setValueAtTime(vol, time + dur * BEAT * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur * BEAT);
  osc.connect(gain).connect(masterGain);
  osc.start(time);
  osc.stop(time + dur * BEAT + 0.05);
  return osc;
}

export function startMusic() {
  if (_musicPlaying || !_started) return;
  try {
    const c = ctx();
    const masterGain = c.createGain();
    masterGain.gain.setValueAtTime(_muted ? 0 : 0.07, c.currentTime);
    masterGain.connect(c.destination);

    const sources = [];
    const loopDuration = 16 * BEAT; // 16 beats
    let loopStart = c.currentTime + 0.1;

    function scheduleLoop(startTime) {
      BASS_PATTERN.forEach(([beat, note, dur]) => {
        const s = scheduleNote(c, masterGain, startTime + beat * BEAT, note, dur, 'triangle', 0.12);
        if (s) sources.push(s);
      });
      LEAD_PATTERN.forEach(([beat, note, dur]) => {
        const s = scheduleNote(c, masterGain, startTime + beat * BEAT, note, dur, 'square', 0.05);
        if (s) sources.push(s);
      });
      ARP_PATTERN.forEach(([beat, note, dur]) => {
        const s = scheduleNote(c, masterGain, startTime + beat * BEAT, note, dur, 'sine', 0.03);
        if (s) sources.push(s);
      });
    }

    // Schedule first 4 loops ahead (covers ~60s)
    for (let i = 0; i < 4; i++) {
      scheduleLoop(loopStart + i * loopDuration);
    }

    // Re-schedule loop periodically
    const interval = setInterval(() => {
      if (!_musicPlaying) { clearInterval(interval); return; }
      try {
        const now = c.currentTime;
        loopStart += loopDuration;
        if (loopStart < now + loopDuration * 3) {
          loopStart = now + loopDuration;
        }
        scheduleLoop(loopStart + loopDuration * 2);
      } catch (e) { clearInterval(interval); }
    }, loopDuration * 1000 * 0.8);

    _musicNodes = { gainNode: masterGain, sources, interval };
    _musicPlaying = true;
  } catch (e) { /* audio unavailable */ }
}

export function stopMusic() {
  if (!_musicPlaying || !_musicNodes) return;
  try {
    if (_musicNodes.interval) clearInterval(_musicNodes.interval);
    _musicNodes.gainNode.gain.exponentialRampToValueAtTime(0.001, ctx().currentTime + 0.5);
    setTimeout(() => {
      try {
        _musicNodes.sources.forEach(s => { try { s.stop(); } catch (e) {} });
        _musicNodes.gainNode.disconnect();
      } catch (e) {}
      _musicNodes = null;
    }, 600);
  } catch (e) {}
  _musicPlaying = false;
}
