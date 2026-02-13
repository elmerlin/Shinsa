import { useRef, useCallback, useEffect } from 'react';

let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesizes a short percussive "chop" sound using filtered noise with fast decay.
 */
export function useChopSound(volume = 0.7) {
  const play = useCallback(() => {
    const ctx = getAudioContext();
    const duration = 0.15;

    // White noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter for a "thwack" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.8;

    // Fast volume decay envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
  }, [volume]);

  return { play };
}

/**
 * Synthesizes a looping card-shuffle/riffle sound using modulated filtered noise.
 */
export function useShuffleSound(volume = 0.4) {
  const nodesRef = useRef(null);

  const play = useCallback(() => {
    const ctx = getAudioContext();

    // Continuous white noise source
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Highpass filter to give it a papery/airy quality
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 3000;

    // Bandpass for "riffle" texture
    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.value = 5000;
    bpFilter.Q.value = 0.5;

    // LFO to modulate volume for a rhythmic shuffle feel
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    source.connect(hpFilter);
    hpFilter.connect(bpFilter);
    bpFilter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
    lfo.start();

    nodesRef.current = { source, lfo, gain, ctx };
  }, [volume]);

  const stop = useCallback(() => {
    if (!nodesRef.current) return;
    const { source, lfo, gain, ctx } = nodesRef.current;
    // Quick fade out to avoid clicks
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    setTimeout(() => {
      try { source.stop(); } catch {}
      try { lfo.stop(); } catch {}
    }, 60);
    nodesRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { play, stop };
}
