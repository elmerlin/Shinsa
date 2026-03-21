import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioEngine } from '../lib/audioEngine.js';
import { timeToBeat, beatToTime } from '../lib/timing.js';

export function useAudioSync(metadata) {
  const engineRef = useRef(null);
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
    };
  }, []);

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
      if (metadata?.bpms) {
        const songTime = time - (metadata.offset || 0);
        const beat = timeToBeat(Math.max(0, songTime), metadata.bpms, metadata.stops || []);
        setCurrentBeat(beat);
      }
    });
  }, [metadata]);

  const togglePlay = useCallback(() => {
    if (!engineRef.current || !audioLoaded) return;
    if (playing) {
      engineRef.current.stop();
      setPlaying(false);
    } else {
      engineRef.current.play();
      setPlaying(true);
    }
  }, [playing, audioLoaded]);

  const seekToBeat = useCallback((beat) => {
    if (!engineRef.current || !metadata?.bpms) return;
    const time = beatToTime(beat, metadata.bpms, metadata.stops || []) + (metadata.offset || 0);
    engineRef.current.seek(Math.max(0, time));
    setCurrentTime(Math.max(0, time));
    setCurrentBeat(beat);
  }, [metadata]);

  const seekToTime = useCallback((time) => {
    if (!engineRef.current) return;
    engineRef.current.seek(time);
    setCurrentTime(time);
    if (metadata?.bpms) {
      const songTime = time - (metadata.offset || 0);
      setCurrentBeat(timeToBeat(Math.max(0, songTime), metadata.bpms, metadata.stops || []));
    }
  }, [metadata]);

  const setPlaybackRate = useCallback((rate) => {
    if (!engineRef.current) return;
    engineRef.current.setRate(rate);
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
