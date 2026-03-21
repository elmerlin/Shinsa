import { useState, useCallback, useRef } from 'react';

export default function FileDropZone({ onLoadSM, onLoadAudio, hasFile }) {
  const [dragOver, setDragOver] = useState(false);
  const smInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.name.endsWith('.sm') || file.name.endsWith('.ssc')) {
        readTextFile(file).then(text => onLoadSM(text, file.name));
      } else if (isAudioFile(file)) {
        readArrayBuffer(file).then(buf => onLoadAudio(buf, file.name));
      }
    }
  }, [onLoadSM, onLoadAudio]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleSMInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) readTextFile(file).then(text => onLoadSM(text, file.name));
  }, [onLoadSM]);

  const handleAudioInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) readArrayBuffer(file).then(buf => onLoadAudio(buf, file.name));
  }, [onLoadAudio]);

  if (hasFile) {
    // Compact file picker mode
    return (
      <div className="flex items-center gap-2 px-4 py-1 bg-piu-dark border-b border-piu-border shrink-0">
        <button
          onClick={() => smInputRef.current?.click()}
          className="text-xs text-piu-blue hover:text-blue-400"
        >
          Load .sm/.ssc
        </button>
        <button
          onClick={() => audioInputRef.current?.click()}
          className="text-xs text-piu-blue hover:text-blue-400"
        >
          Load Audio
        </button>
        <input ref={smInputRef} type="file" accept=".sm,.ssc" onChange={handleSMInput} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioInput} className="hidden" />
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex-1 flex items-center justify-center
        ${dragOver ? 'bg-piu-card border-2 border-dashed border-piu-accent' : 'bg-piu-bg'}`}
    >
      <div className="text-center p-8">
        <div className="text-6xl mb-4 opacity-30">
          {/* Arrow icon */}
          <svg viewBox="0 0 24 24" className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3v12m0-12L8 7m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-gray-400 mb-2">
          Shinsa Chart Editor
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Drop a .sm/.ssc file and audio here to start editing
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => smInputRef.current?.click()}
            className="px-4 py-2 rounded bg-piu-accent text-white font-display font-semibold hover:bg-pink-500"
          >
            Open .sm/.ssc File
          </button>
          <button
            onClick={() => audioInputRef.current?.click()}
            className="px-4 py-2 rounded bg-piu-blue text-white font-display font-semibold hover:bg-blue-500"
          >
            Load Audio
          </button>
          <button
            onClick={() => onLoadSM(null)}
            className="px-4 py-2 rounded bg-piu-card text-gray-300 font-display font-semibold border border-piu-border hover:text-white"
          >
            New Chart
          </button>
        </div>
        <input ref={smInputRef} type="file" accept=".sm,.ssc" onChange={handleSMInput} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioInput} className="hidden" />
      </div>
    </div>
  );
}

function readTextFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
}

function readArrayBuffer(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

function isAudioFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'].includes(ext);
}
