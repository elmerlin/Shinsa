let _ctx = null;
let _muted = false;
let _started = false;
let _musicNodes = null;

const BOMBER_TRACKS = [
  '/fun-assets/audio/bomb/Bomberman.mp3',
  '/fun-assets/audio/bomb/Bomberman1.mp3',
  '/fun-assets/audio/bomb/Bomberman2.mp3',
  '/fun-assets/audio/bomb/Bomberman3.mp3',
  '/fun-assets/audio/bomb/Bomberman4.mp3',
  '/fun-assets/audio/bomb/Bomberman5.mp3',
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
    _musicNodes.audio.volume = _muted ? 0 : 0.5;
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

export function playBombPlace() {
  synth(200, 120, 'triangle', 0.08, 0.06);
}

export function playExplosion() {
  synth(120, 50, 'sawtooth', 0.15, 0.07);
  noise(0.12, 0.06);
}

export function playPickup() {
  synth(600, 900, 'square', 0.06, 0.05);
  synth(300, 450, 'triangle', 0.08, 0.03);
}

export function playKill() {
  synth(350, 150, 'sawtooth', 0.12, 0.07);
  noise(0.08, 0.05);
}

export function playDeath() {
  synth(280, 100, 'triangle', 0.2, 0.08);
  noise(0.15, 0.06);
}

export function playCountdown(n) {
  const freq = n <= 0 ? 988 : 494;
  synth(freq, freq * 1.05, 'square', 0.07, 0.07);
}

export function playRoundWin() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.12);
    gain.gain.setValueAtTime(0.06, t + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.14);
    osc.connect(gain).connect(c.destination);
    osc.start(t + i * 0.12);
    osc.stop(t + i * 0.12 + 0.16);
  });
}

export function playRoundLoss() {
  if (_muted || !_started) return;
  const c = ctx();
  const t = c.currentTime;
  [392, 330, 262].forEach((f, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.14);
    gain.gain.setValueAtTime(0.07, t + i * 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(t + i * 0.14);
    osc.stop(t + i * 0.14 + 0.2);
  });
}

export function playSuddenDeath() {
  synth(140, 120, 'sawtooth', 0.18, 0.08);
  setTimeout(() => synth(110, 95, 'sawtooth', 0.22, 0.07), 150);
}

function createShuffledPlaylist() {
  const tracks = [...BOMBER_TRACKS];
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
  if (_musicNodes || !_started || typeof Audio === 'undefined' || !BOMBER_TRACKS.length) return;
  try {
    const audio = new Audio();
    const playlist = createShuffledPlaylist();
    audio.preload = 'auto';
    audio.muted = _muted;
    audio.volume = _muted ? 0 : 0.5;
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
