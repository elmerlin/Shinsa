import { SNAP_DIVISIONS, NOTE_TYPE_NAMES } from '../lib/constants.js';

export default function Toolbar({
  playing,
  onTogglePlay,
  audioLoaded,
  currentBeat,
  currentTime,
  duration,
  playbackRate,
  onSetPlaybackRate,
  zoom,
  onSetZoom,
  snapDivision,
  onSetSnapDivision,
  noteType,
  onSetNoteType,
  onUndo,
  onRedo,
  dirty,
  onSave,
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-piu-card border-b border-piu-border shrink-0 flex-wrap">
      {/* Playback controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          disabled={!audioLoaded}
          className={`px-3 py-1.5 rounded font-display font-semibold text-sm
            ${playing
              ? 'bg-piu-accent text-white'
              : audioLoaded
                ? 'bg-piu-blue text-white hover:bg-blue-500'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          title="Space"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>

        {/* Speed */}
        <select
          value={playbackRate}
          onChange={e => onSetPlaybackRate(parseFloat(e.target.value))}
          className="bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
        >
          {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
            <option key={r} value={r}>{r}x</option>
          ))}
        </select>
      </div>

      {/* Position info */}
      <div className="text-xs text-gray-400 font-mono min-w-[120px]">
        Beat {currentBeat.toFixed(2)} | {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-piu-border" />

      {/* Snap division */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Snap</span>
        <select
          value={snapDivision}
          onChange={e => onSetSnapDivision(parseInt(e.target.value))}
          className="bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
        >
          {SNAP_DIVISIONS.map(d => (
            <option key={d} value={d}>1/{d}</option>
          ))}
        </select>
      </div>

      {/* Note type */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">Note</span>
        {Object.entries(NOTE_TYPE_NAMES).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSetNoteType(key)}
            className={`px-2 py-1 rounded text-xs font-semibold
              ${noteType === key
                ? 'bg-piu-accent text-white'
                : 'bg-piu-dark text-gray-400 hover:text-white border border-piu-border'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-piu-border" />

      {/* Zoom */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Zoom</span>
        <input
          type="range"
          min="0.25"
          max="4"
          step="0.25"
          value={zoom}
          onChange={e => onSetZoom(parseFloat(e.target.value))}
          className="w-20 accent-piu-accent"
        />
        <span className="text-xs text-gray-400 w-8">{zoom}x</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-piu-border" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-1">
        <button onClick={onUndo} className="px-2 py-1 rounded text-xs bg-piu-dark border border-piu-border text-gray-400 hover:text-white" title="Ctrl+Z">
          Undo
        </button>
        <button onClick={onRedo} className="px-2 py-1 rounded text-xs bg-piu-dark border border-piu-border text-gray-400 hover:text-white" title="Ctrl+Shift+Z">
          Redo
        </button>
      </div>

      {/* Save */}
      <button
        onClick={onSave}
        className={`ml-auto px-3 py-1.5 rounded font-display font-semibold text-sm
          ${dirty
            ? 'bg-piu-green text-black hover:bg-green-400'
            : 'bg-piu-dark text-gray-500 border border-piu-border'
          }`}
      >
        Export .sm
      </button>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
