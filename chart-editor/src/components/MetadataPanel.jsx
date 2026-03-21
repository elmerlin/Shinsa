import { useState } from 'react';

export default function MetadataPanel({ metadata, activeChart, onUpdateMetadata, onUpdateChartMeta }) {
  const [bpmText, setBpmText] = useState('');

  if (!metadata) return null;

  const handleField = (field, value) => {
    onUpdateMetadata({ [field]: value });
  };

  const handleChartField = (field, value) => {
    onUpdateChartMeta({ [field]: value });
  };

  return (
    <div className="w-64 bg-piu-card border-l border-piu-border overflow-y-auto p-3 shrink-0">
      <h3 className="text-sm font-display font-bold text-piu-accent mb-3 uppercase tracking-wider">
        Song Info
      </h3>

      <div className="space-y-2">
        <Field label="Title" value={metadata.title || ''} onChange={v => handleField('title', v)} />
        <Field label="Subtitle" value={metadata.subtitle || ''} onChange={v => handleField('subtitle', v)} />
        <Field label="Artist" value={metadata.artist || ''} onChange={v => handleField('artist', v)} />
        <Field label="Music File" value={metadata.music || ''} onChange={v => handleField('music', v)} />

        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Offset (s)</label>
          <input
            type="number"
            step="0.001"
            value={metadata.offset || 0}
            onChange={e => handleField('offset', parseFloat(e.target.value) || 0)}
            className="w-full bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
          />
        </div>

        {/* BPM List */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">BPMs</label>
          <div className="space-y-1">
            {(metadata.bpms || []).map((bpm, i) => (
              <div key={i} className="flex gap-1 items-center">
                <input
                  type="number"
                  step="0.001"
                  value={bpm.beat}
                  onChange={e => {
                    const newBpms = [...metadata.bpms];
                    newBpms[i] = { ...newBpms[i], beat: parseFloat(e.target.value) || 0 };
                    handleField('bpms', newBpms);
                  }}
                  className="w-16 bg-piu-dark border border-piu-border rounded px-1 py-0.5 text-xs"
                  placeholder="Beat"
                />
                <span className="text-xs text-gray-600">=</span>
                <input
                  type="number"
                  step="0.1"
                  value={bpm.bpm}
                  onChange={e => {
                    const newBpms = [...metadata.bpms];
                    newBpms[i] = { ...newBpms[i], bpm: parseFloat(e.target.value) || 120 };
                    handleField('bpms', newBpms);
                  }}
                  className="w-20 bg-piu-dark border border-piu-border rounded px-1 py-0.5 text-xs"
                  placeholder="BPM"
                />
                {metadata.bpms.length > 1 && (
                  <button
                    onClick={() => {
                      const newBpms = metadata.bpms.filter((_, j) => j !== i);
                      handleField('bpms', newBpms);
                    }}
                    className="text-red-500 text-xs hover:text-red-400"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => {
                const lastBeat = metadata.bpms.length > 0 ? metadata.bpms[metadata.bpms.length - 1].beat + 4 : 0;
                const lastBpm = metadata.bpms.length > 0 ? metadata.bpms[metadata.bpms.length - 1].bpm : 120;
                handleField('bpms', [...metadata.bpms, { beat: lastBeat, bpm: lastBpm }]);
              }}
              className="text-xs text-piu-blue hover:text-blue-400"
            >
              + Add BPM change
            </button>
          </div>
        </div>
      </div>

      {/* Chart-specific info */}
      {activeChart && (
        <>
          <h3 className="text-sm font-display font-bold text-piu-accent mt-4 mb-3 uppercase tracking-wider">
            Chart Info
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Type</label>
              <select
                value={activeChart.type}
                onChange={e => handleChartField('type', e.target.value)}
                className="w-full bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
              >
                <option value="pump-single">Pump Single (5)</option>
                <option value="pump-double">Pump Double (10)</option>
                <option value="pump-halfdouble">Pump Half-Double (6)</option>
                <option value="dance-single">Dance Single (4)</option>
                <option value="dance-double">Dance Double (8)</option>
              </select>
            </div>
            <Field
              label="Description"
              value={activeChart.description || ''}
              onChange={v => handleChartField('description', v)}
            />
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Difficulty</label>
              <select
                value={activeChart.difficulty}
                onChange={e => handleChartField('difficulty', e.target.value)}
                className="w-full bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
              >
                {['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge', 'Edit'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Meter (Level)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={activeChart.meter || 1}
                onChange={e => handleChartField('meter', parseInt(e.target.value) || 1)}
                className="w-full bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
              />
            </div>

            {/* Note count stats */}
            <div className="mt-2 pt-2 border-t border-piu-border">
              <p className="text-xs text-gray-500">
                Notes: {activeChart.notes?.filter(n => n.type === 'tap').length || 0} taps,{' '}
                {activeChart.notes?.filter(n => n.type === 'hold_head').length || 0} holds,{' '}
                {activeChart.notes?.filter(n => n.type === 'mine').length || 0} mines
              </p>
              <p className="text-xs text-gray-500">
                Total events: {activeChart.notes?.length || 0}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-piu-dark border border-piu-border rounded px-2 py-1 text-sm"
      />
    </div>
  );
}
