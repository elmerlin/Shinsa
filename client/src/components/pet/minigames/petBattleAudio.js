let _ctx = null;
let _muted = false;
let _started = false;
let _musicNodes = null;
const BATTLE_TRACKS = [
  '/fun-assets/audio/battle/battle0.mp3',
  '/fun-assets/audio/battle/battle1.mp3',
  '/fun-assets/audio/battle/battle2.mp3',
  '/fun-assets/audio/battle/battle3.mp3',
  '/fun-assets/audio/battle/battle4.mp3',
  '/fun-assets/audio/battle/battle5.mp3',
  '/fun-assets/audio/battle/battle6.mp3',
];

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

export function setMuted(muted) {
  _muted = Boolean(muted);
  if (_musicNodes?.audio) {
    _musicNodes.audio.muted = _muted;
    _musicNodes.audio.volume = _muted ? 0 : 0.55;
  }
}

export function isMuted() { return _muted; }
export function isStarted() { return _started; }

function synth(freq, endFreq, type = 'square', dur = 0.1, vol = 0.08) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), c.currentTime + dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + dur + 0.03);
  } catch (e) { /* audio unavailable */ }
}

function synthAt(time, freq, endFreq, type = 'square', dur = 0.1, vol = 0.06, destination = null, ignoreMuted = false) {
  if ((!ignoreMuted && _muted) || !_started) return null;
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), time + dur);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain).connect(destination || c.destination);
    osc.start(time);
    osc.stop(time + dur + 0.03);
    return osc;
  } catch (e) {
    return null;
  }
}

function noise(duration, vol = 0.04) {
  if (_muted || !_started) return;
  try {
    const c = ctx();
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const gain = c.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, c.currentTime);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter).connect(gain).connect(c.destination);
    source.start();
    source.stop(c.currentTime + duration + 0.02);
  } catch (e) { /* audio unavailable */ }
}

export function playSpawn() {
  synth(420, 760, 'square', 0.07, 0.055);
  synth(220, 260, 'triangle', 0.09, 0.03);
}

export function playMeleeHit() {
  synth(180, 90, 'square', 0.05, 0.05);
  noise(0.03, 0.03);
}

export function playRangedShot() {
  synth(700, 1200, 'square', 0.05, 0.04);
}

export function playEnemyHit() {
  synth(250, 160, 'triangle', 0.06, 0.05);
}

export function playEnemyDeath() {
  synth(240, 520, 'square', 0.08, 0.05);
  noise(0.05, 0.04);
}

export function playBossAppear() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  synthAt(t, 140, 120, 'sawtooth', 0.18, 0.08);
  synthAt(t + 0.15, 110, 95, 'sawtooth', 0.22, 0.08);
  synthAt(t + 0.3, 90, 80, 'triangle', 0.28, 0.08);
}

export function playBossDefeat() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  synthAt(t, 220, 420, 'triangle', 0.12, 0.08);
  synthAt(t + 0.12, 330, 660, 'square', 0.12, 0.07);
  synthAt(t + 0.24, 440, 880, 'triangle', 0.16, 0.07);
  synthAt(t + 0.4, 660, 1320, 'square', 0.18, 0.06);
  noise(0.18, 0.07);
}

export function playBaseHit() {
  synth(120, 70, 'sawtooth', 0.12, 0.08);
  noise(0.08, 0.05);
}

export function playAuraUpgrade() {
  synth(500, 780, 'triangle', 0.09, 0.05);
  setTimeout(() => synth(740, 1100, 'square', 0.08, 0.04), 80);
}

export function playStageClear() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  synthAt(t, 392, 392, 'square', 0.08, 0.05);
  synthAt(t + 0.1, 523, 523, 'square', 0.08, 0.05);
  synthAt(t + 0.22, 659, 659, 'triangle', 0.12, 0.05);
  synthAt(t + 0.36, 784, 784, 'triangle', 0.18, 0.04);
}

export function playGameOverWin() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  synthAt(t, 523, 659, 'triangle', 0.14, 0.07);
  synthAt(t + 0.18, 659, 784, 'triangle', 0.14, 0.07);
  synthAt(t + 0.36, 784, 1046, 'square', 0.24, 0.07);
}

export function playGameOverLoss() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  synthAt(t, 392, 330, 'triangle', 0.16, 0.08);
  synthAt(t + 0.16, 330, 262, 'triangle', 0.16, 0.07);
  synthAt(t + 0.32, 262, 196, 'sawtooth', 0.24, 0.07);
}

export function playCountdown(n) {
  const freq = n <= 0 ? 988 : 494;
  synth(freq, freq * 1.05, 'square', 0.07, 0.07);
}

function createShuffledPlaylist() {
  const tracks = [...BATTLE_TRACKS];
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  return tracks;
}

function playPlaylistIndex(index) {
  if (!_musicNodes?.audio) return;
  const track = _musicNodes.playlist[index % _musicNodes.playlist.length];
  _musicNodes.index = index % _musicNodes.playlist.length;
  _musicNodes.audio.src = track;
  _musicNodes.audio.currentTime = 0;
  _musicNodes.audio.play().catch(() => {});
}

export function startMusic() {
  if (_musicNodes || !_started || typeof Audio === 'undefined' || !BATTLE_TRACKS.length) return;
  try {
    const audio = new Audio();
    const playlist = createShuffledPlaylist();
    audio.preload = 'auto';
    audio.muted = _muted;
    audio.volume = _muted ? 0 : 0.55;
    const handleEnded = () => {
      if (!_musicNodes) return;
      playPlaylistIndex(_musicNodes.index + 1);
    };
    audio.addEventListener('ended', handleEnded);
    _musicNodes = { audio, playlist, index: 0, handleEnded };
    playPlaylistIndex(0);
  } catch (e) {
    stopMusic();
  }
}

export function stopMusic() {
  if (!_musicNodes) return;
  try {
    _musicNodes.audio.pause();
    _musicNodes.audio.currentTime = 0;
    _musicNodes.audio.removeEventListener('ended', _musicNodes.handleEnded);
    _musicNodes.audio.src = '';
    _musicNodes.audio.load();
  } catch (e) { /* ignore */ }
  _musicNodes = null;
}
