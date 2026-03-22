import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioEngine } from '../lib/audioEngine.js';
import { timeToBeat, beatToTime } from '../lib/timing.js';

export function useAudioSync(metadata) {
  const engineRef = useRef(null);
  const timerRef = useRef(null);
  const lastTickRef = useRef(null);
  const metadataRef = useRef(metadata);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [audioLoaded, setAudioLoaded] = useState(false);

  useEffect(() => {
    engineRef.current = new AudioEngine();
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
      }
    };
  }, []);

  // Keep metadata ref current
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  // Update offset when metadata changes
  useEffect(() => {
    if (engineRef.current && metadata) {
      engineRef.current.setOffset(metadata.offset || 0);
    }
  }, [metadata?.offset]);

  const loadAudio = useCallback(async (arrayBuffer) => {
    if (!engineRef.current) return;
    const dur = await engineRef.current.loadAudio(arrayBuffer);
    setDuration(dur);
    setAudioLoaded(true);
    setCurrentTime(0);
    setCurrentBeat(0);

    engineRef.current.onTimeUpdate((time) => {
      setCurrentTime(time);
      const md = metadataRef.current;
      if (md?.bpms) {
        const songTime = time - (md.offset || 0);
        const beat = timeToBeat(Math.max(0, songTime), md.bpms, md.stops || []);
        setCurrentBeat(beat);
      }
    });
  }, []);

  // Timer-based beat playback (no audio)
  const startBeatTimer = useCallback(() => {
    lastTickRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      const bpm = metadata?.bpms?.[0]?.bpm || 120;
      const beatsPerMs = (bpm * playbackRate) / 60000;
      const beatDelta = deltaMs * beatsPerMs;

      setCurrentBeat(prev => {
        const next = prev + beatDelta;
        setCurrentTime(beatToTime(next, metadata?.bpms || [{ beat: 0, bpm: 120 }], metadata?.stops || []));
        return next;
      });

      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  }, [metadata, playbackRate]);

  const stopBeatTimer = useCallback(() => {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      if (audioLoaded) {
        engineRef.current?.stop();
      } else {
        stopBeatTimer();
      }
      setPlaying(false);
    } else {
      if (audioLoaded) {
        engineRef.current?.play();
      } else {
        startBeatTimer();
      }
      setPlaying(true);
    }
  }, [playing, audioLoaded, startBeatTimer, stopBeatTimer]);

  const seekToBeat = useCallback((beat) => {
    if (!metadata?.bpms) return;
    const time = beatToTime(beat, metadata.bpms, metadata.stops || []) + (metadata.offset || 0);
    if (audioLoaded && engineRef.current) {
      engineRef.current.seek(Math.max(0, time));
    }
    setCurrentTime(Math.max(0, time));
    setCurrentBeat(beat);
  }, [metadata, audioLoaded]);

  const seekToTime = useCallback((time) => {
    if (audioLoaded && engineRef.current) {
      engineRef.current.seek(time);
    }
    setCurrentTime(time);
    if (metadata?.bpms) {
      const songTime = time - (metadata.offset || 0);
      setCurrentBeat(timeToBeat(Math.max(0, songTime), metadata.bpms, metadata.stops || []));
    }
  }, [metadata, audioLoaded]);

  const setPlaybackRate = useCallback((rate) => {
    if (engineRef.current) {
      engineRef.current.setRate(rate);
    }
    setPlaybackRateState(rate);
  }, []);

  return {
    playing,
    currentBeat,
    currentTime,
    duration,
    playbackRate,
    audioLoaded,
    loadAudio,
    togglePlay,
    seekToBeat,
    seekToTime,
    setPlaybackRate,
  };
}
