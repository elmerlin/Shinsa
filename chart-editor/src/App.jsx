import { useState, useCallback, useEffect, useRef } from 'react';
import { parseSM } from './lib/smParser.js';
import { serializeSM } from './lib/smSerializer.js';
import { useChartState } from './hooks/useChartState.js';
import { useAudioSync } from './hooks/useAudioSync.js';
import ChartCanvas from './components/ChartCanvas.jsx';
import Toolbar from './components/Toolbar.jsx';
import MetadataPanel from './components/MetadataPanel.jsx';
import ChartSelector from './components/ChartSelector.jsx';
import FileDropZone from './components/FileDropZone.jsx';

export default function App() {
  const { state, activeChart, dispatch, undo, redo } = useChartState();
  const audio = useAudioSync(state.metadata);

  const [scrollBeat, setScrollBeat] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [snapDivision, setSnapDivision] = useState(16);
  const [noteType, setNoteType] = useState('tap');
  const [fileLoaded, setFileLoaded] = useState(false);
  const holdStartRef = useRef(null);

  // Sync scroll to audio playback position
  useEffect(() => {
    if (audio.playing) {
      setScrollBeat(audio.currentBeat);
    }
  }, [audio.playing, audio.currentBeat]);

  // Load .sm file
  const handleLoadSM = useCallback((text) => {
    if (text === null) {
      // New chart
      dispatch({
        type: 'LOAD_FILE',
        payload: {
          metadata: {
            title: 'New Song',
            artist: 'Unknown',
            music: '',
            offset: 0,
            bpms: [{ beat: 0, bpm: 120 }],
            stops: [],
          },
          charts: [{
            type: 'pump-single',
            description: '',
            difficulty: 'Edit',
            meter: 1,
            grooveRadar: '0,0,0,0,0',
            notes: [],
          }],
        },
      });
      setFileLoaded(true);
      setScrollBeat(0);
      return;
    }

    try {
      const data = parseSM(text);
      dispatch({ type: 'LOAD_FILE', payload: data });
      setFileLoaded(true);
      setScrollBeat(0);
    } catch (err) {
      console.error('Failed to parse .sm file:', err);
      alert('Failed to parse .sm file: ' + err.message);
    }
  }, [dispatch]);

  // Load audio file
  const handleLoadAudio = useCallback(async (arrayBuffer, filename) => {
    try {
      await audio.loadAudio(arrayBuffer);
      // Update music filename in metadata
      dispatch({ type: 'UPDATE_METADATA', payload: { music: filename } });
    } catch (err) {
      console.error('Failed to load audio:', err);
      alert('Failed to load audio: ' + err.message);
    }
  }, [audio, dispatch]);

  // Export / save .sm file
  const handleSave = useCallback(() => {
    try {
      const smText = serializeSM(state);
      const blob = new Blob([smText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.metadata.title || 'chart'}.sm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
      alert('Failed to export .sm file: ' + err.message);
    }
  }, [state]);

  // Place / delete note handlers
  const handlePlaceNote = useCallback((beat, column, type) => {
    dispatch({ type: 'PLACE_NOTE', payload: { beat, column, noteType: type } });
  }, [dispatch]);

  const handleDeleteNote = useCallback((beat, column) => {
    dispatch({ type: 'DELETE_NOTE', payload: { beat, column } });
  }, [dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          audio.togglePlay();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setScrollBeat(prev => Math.max(0, prev + 4 / snapDivision));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setScrollBeat(prev => Math.max(0, prev - 4 / snapDivision));
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case 'q':
          setNoteType('tap');
          break;
        case 'w':
          setNoteType('hold');
          break;
        case 'e':
          setNoteType('roll');
          break;
        case 'r':
          setNoteType('mine');
          break;
        case 'Escape':
          // Cancel hold placement
          holdStartRef.current = null;
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [audio, snapDivision, undo, redo]);

  if (!fileLoaded) {
    return (
      <div className="h-full flex flex-col">
        <FileDropZone onLoadSM={handleLoadSM} onLoadAudio={handleLoadAudio} hasFile={false} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* File controls */}
      <FileDropZone onLoadSM={handleLoadSM} onLoadAudio={handleLoadAudio} hasFile={true} />

      {/* Chart selector */}
      <ChartSelector
        charts={state.charts}
        activeIndex={state.activeChartIndex}
        onSelect={(i) => dispatch({ type: 'SET_ACTIVE_CHART', payload: i })}
        onAdd={() => dispatch({ type: 'ADD_CHART', payload: { type: activeChart?.type || 'pump-single' } })}
        onDelete={(i) => dispatch({ type: 'DELETE_CHART', payload: i })}
      />

      {/* Toolbar */}
      <Toolbar
        playing={audio.playing}
        onTogglePlay={audio.togglePlay}
        audioLoaded={audio.audioLoaded}
        currentBeat={audio.playing ? audio.currentBeat : scrollBeat}
        currentTime={audio.currentTime}
        duration={audio.duration}
        playbackRate={audio.playbackRate}
        onSetPlaybackRate={audio.setPlaybackRate}
        zoom={zoom}
        onSetZoom={setZoom}
        snapDivision={snapDivision}
        onSetSnapDivision={setSnapDivision}
        noteType={noteType}
        onSetNoteType={setNoteType}
        onUndo={undo}
        onRedo={redo}
        dirty={state.dirty}
        onSave={handleSave}
      />

      {/* Main area: canvas + metadata panel */}
      <div className="flex-1 flex overflow-hidden">
        {activeChart && (
          <ChartCanvas
            chart={activeChart}
            metadata={state.metadata}
            scrollBeat={scrollBeat}
            onScrollBeatChange={setScrollBeat}
            zoom={zoom}
            snapDivision={snapDivision}
            noteType={noteType}
            onPlaceNote={handlePlaceNote}
            onDeleteNote={handleDeleteNote}
            playing={audio.playing}
            currentBeat={audio.currentBeat}
            holdStartRef={holdStartRef}
          />
        )}

        <MetadataPanel
          metadata={state.metadata}
          activeChart={activeChart}
          onUpdateMetadata={(updates) => dispatch({ type: 'UPDATE_METADATA', payload: updates })}
          onUpdateChartMeta={(updates) => dispatch({ type: 'UPDATE_CHART_META', payload: updates })}
        />
      </div>
    </div>
  );
}
