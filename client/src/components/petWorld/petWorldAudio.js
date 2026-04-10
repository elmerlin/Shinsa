let audioCtx = null;
let _muted = false;
let _ambientNodes = null;

// --- Mute management ---
try {
  _muted = typeof localStorage !== 'undefined' && localStorage.getItem('petworld-muted') === '1';
} catch { /* noop */ }

export function setMuted(val) {
  _muted = !!val;
  try { localStorage.setItem('petworld-muted', _muted ? '1' : '0'); } catch { /* noop */ }
  if (_muted) stopAmbient();
}

export function isMuted() { return _muted; }

// --- AudioContext ---
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// --- Helpers ---
function tone(freq0, freq1, dur = 0.12, type = 'triangle', vol = 0.05, delay = 0) {
  try {
    if (_muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    osc.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* noop */ }
}

function noiseBurst(dur = 0.08, vol = 0.04, freq = 800, q = 1, delay = 0) {
  try {
    if (_muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  } catch { /* noop */ }
}

// --- Ambient system ---
const BIOME_AMBIENT = {
  grasslands:  { freq: 600,  q: 0.4, vol: 0.025, chirpFreq: 2800, chirpVol: 0.008 },
  forest:      { freq: 350,  q: 0.5, vol: 0.025, chirpFreq: 1800, chirpVol: 0.006 },
  coastal:     { freq: 220,  q: 0.3, vol: 0.03,  chirpFreq: 0,    chirpVol: 0 },
  mountain:    { freq: 1200, q: 0.6, vol: 0.02,  chirpFreq: 0,    chirpVol: 0 },
  desert:      { freq: 800,  q: 0.3, vol: 0.02,  chirpFreq: 400,  chirpVol: 0.004 },
  tropical:    { freq: 500,  q: 0.5, vol: 0.025, chirpFreq: 180,  chirpVol: 0.007 },
  tundra:      { freq: 160,  q: 0.2, vol: 0.02,  chirpFreq: 0,    chirpVol: 0 },
  volcanic:    { freq: 80,   q: 0.4, vol: 0.03,  chirpFreq: 0,    chirpVol: 0 },
};

export function startAmbient(biome) {
  try {
    stopAmbient();
    if (_muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const cfg = BIOME_AMBIENT[biome] || BIOME_AMBIENT.grasslands;

    // Filtered noise drone
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = cfg.freq;
    bp.Q.value = cfg.q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(cfg.vol, ctx.currentTime + 1.5);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    const nodes = { src, gain, stopped: false };

    // Biome-specific secondary layer
    if (cfg.chirpFreq > 0) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = cfg.chirpFreq;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = biome === 'tropical' ? 0.3 : 0.15;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = cfg.chirpVol;
      lfo.connect(lfoGain);
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;
      lfoGain.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start();
      lfo.start();
      nodes.osc = osc;
      nodes.lfo = lfo;
    }

    // Coastal sweep effect
    if (biome === 'coastal') {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      lfo.start();
      nodes.lfo = lfo;
    }

    _ambientNodes = nodes;
  } catch { /* noop */ }
}

export function stopAmbient() {
  try {
    if (!_ambientNodes || _ambientNodes.stopped) return;
    _ambientNodes.stopped = true;
    const ctx = getCtx();
    const t = ctx ? ctx.currentTime : 0;
    if (_ambientNodes.gain && ctx) {
      _ambientNodes.gain.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    }
    const nodes = _ambientNodes;
    setTimeout(() => {
      try { nodes.src?.stop(); } catch { /* noop */ }
      try { nodes.osc?.stop(); } catch { /* noop */ }
      try { nodes.lfo?.stop(); } catch { /* noop */ }
    }, 1000);
    _ambientNodes = null;
  } catch { /* noop */ }
}

// --- Sound effects ---

export function playBuildSound() {
  // Rising two-note chime
  tone(440, 660, 0.1, 'triangle', 0.04);
  tone(660, 880, 0.12, 'triangle', 0.035, 0.1);
}

export function playClearSound() {
  // Crunchy impact
  noiseBurst(0.1, 0.05, 600, 2);
  tone(220, 120, 0.14, 'sine', 0.035, 0.02);
}

export function playExpandSound() {
  // Triumphant rising chord
  tone(330, 440, 0.18, 'sine', 0.035);
  tone(415, 554, 0.18, 'sine', 0.03, 0.04);
  tone(495, 660, 0.2, 'sine', 0.03, 0.08);
}

export function playUpgradeSound() {
  // Fast ascending arpeggio sparkle
  tone(520, 540, 0.06, 'sine', 0.03);
  tone(660, 680, 0.06, 'sine', 0.03, 0.06);
  tone(784, 810, 0.06, 'sine', 0.03, 0.12);
  tone(1048, 1080, 0.1, 'triangle', 0.025, 0.18);
}

export function playDemolishSound() {
  // Crumbling: descending noise + low thud
  noiseBurst(0.18, 0.045, 1200, 0.8);
  noiseBurst(0.12, 0.04, 400, 0.6, 0.08);
  tone(90, 45, 0.22, 'sine', 0.04, 0.05);
}

export function playTradeSound() {
  // Metallic coin ping
  tone(1320, 1340, 0.08, 'sine', 0.03);
  tone(1760, 1780, 0.1, 'sine', 0.025, 0.09);
}

export function playSelectSound() {
  // Subtle click blip
  tone(680, 700, 0.04, 'sine', 0.02);
}

export function playErrorSound() {
  // Subtle low buzz
  tone(140, 120, 0.1, 'square', 0.02);
}

export function playBreedSound() {
  // Happy ascending 3-note melody
  tone(523, 530, 0.1, 'triangle', 0.03);
  tone(659, 666, 0.1, 'triangle', 0.03, 0.11);
  tone(784, 800, 0.14, 'triangle', 0.03, 0.22);
}
