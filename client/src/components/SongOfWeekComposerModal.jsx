import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSongs, getJacketMap, saveMySongOfWeek } from '../utils/api';
import PiuChartJacket, { resolveChartJacketUrl } from './PiuChartJacket';

const MODE_OPTIONS = ['all', 'Single', 'Double', 'CoOp'];
const MAX_RESULTS = 80;

function matchesSearch(song, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    String(song.title || '').toLowerCase().includes(q) ||
    String(song.artist || '').toLowerCase().includes(q)
  );
}

export default function SongOfWeekComposerModal({
  open,
  existingPick,
  onClose,
  onSaved,
}) {
  const [songs, setSongs] = useState([]);
  const [jacketLookup, setJacketLookup] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [selectedChart, setSelectedChart] = useState(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setLoading(true);
    Promise.all([getSongs(), getJacketMap().catch(() => ({}))])
      .then(([songList, jackets]) => {
        setSongs(Array.isArray(songList) ? songList : []);
        setJacketLookup(jackets || {});
      })
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (existingPick) {
      setSelectedChart({
        id: existingPick.chart_id,
        title: existingPick.song_title_snapshot,
        artist: existingPick.artist_snapshot,
        mode: existingPick.mode,
        level: existingPick.level,
        jacket_url: existingPick.jacket_url_snapshot,
      });
      setCaption(existingPick.caption || '');
    } else {
      setSelectedChart(null);
      setCaption('');
    }
    setSearch('');
    setModeFilter('all');
    setTimeout(() => searchInputRef.current?.focus(), 40);
  }, [open, existingPick]);

  const filtered = useMemo(() => {
    if (!songs.length) return [];
    let list = songs;
    if (modeFilter !== 'all') list = list.filter((s) => s.mode === modeFilter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((s) => matchesSearch(s, q));
    } else {
      return [];
    }
    return list.slice(0, MAX_RESULTS);
  }, [songs, search, modeFilter]);

  if (!open) return null;

  const handleSave = async () => {
    if (!selectedChart) {
      setError('Pick a chart first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveMySongOfWeek({
        chart_id: selectedChart.id,
        caption: caption.trim(),
      });
      if (onSaved) onSaved(saved);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectedJacketUrl = selectedChart
    ? resolveChartJacketUrl({
        title: selectedChart.title,
        mode: selectedChart.mode,
        level: selectedChart.level,
        jacketLookup,
        jacketUrl: selectedChart.jacket_url,
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-2xl bg-piu-card border border-piu-border/50 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/30">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-piu-accent font-display font-bold">
              Song of the Week
            </p>
            <h2 className="text-sm font-display font-bold text-white">
              {existingPick ? 'Edit this week\u2019s pick' : 'Pick this week\u2019s song'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white text-lg font-display"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {selectedChart && (
            <div className="flex items-center gap-3 rounded-lg border border-piu-accent/40 bg-piu-accent/5 p-2">
              <PiuChartJacket
                title={selectedChart.title}
                mode={selectedChart.mode}
                level={selectedChart.level}
                jacketUrl={selectedJacketUrl}
                size="wide"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-piu-accent font-display">
                  Selected
                </p>
                <p className="text-sm font-display font-bold text-white truncate">
                  {selectedChart.title}
                </p>
                {selectedChart.artist && (
                  <p className="text-[11px] text-gray-400 truncate">{selectedChart.artist}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedChart(null)}
                className="text-[10px] text-gray-500 hover:text-white font-display"
              >
                Change
              </button>
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-display font-bold">
              Caption (optional)
            </label>
            <textarea
              className="input-field text-xs w-full mt-1"
              rows={2}
              maxLength={280}
              placeholder="Why this one? (max 280 chars)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                className="input-field text-xs flex-1"
                placeholder="Search charts by title or artist"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="input-field text-xs"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
              >
                {MODE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 'all' ? 'All modes' : m}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="text-[11px] text-gray-500">Loading charts...</p>
            ) : !search.trim() ? (
              <p className="text-[11px] text-gray-500">Start typing to search charts.</p>
            ) : filtered.length === 0 ? (
              <p className="text-[11px] text-gray-500">No charts match your search.</p>
            ) : (
              <div className="divide-y divide-piu-border/20 border border-piu-border/20 rounded-lg">
                {filtered.map((song) => {
                  const jacketUrl = resolveChartJacketUrl({
                    title: song.title,
                    mode: song.mode,
                    level: song.level,
                    jacketLookup,
                    jacketUrl: song.jacket_url,
                  });
                  const isSelected = selectedChart && selectedChart.id === song.id;
                  return (
                    <button
                      type="button"
                      key={song.id}
                      onClick={() => setSelectedChart(song)}
                      className={`w-full flex items-center gap-3 px-2 py-2 text-left hover:bg-piu-accent/10 transition-colors ${
                        isSelected ? 'bg-piu-accent/15' : ''
                      }`}
                    >
                      <PiuChartJacket
                        title={song.title}
                        mode={song.mode}
                        level={song.level}
                        jacketUrl={jacketUrl}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold text-white truncate">
                          {song.title}
                        </p>
                        {song.artist && (
                          <p className="text-[10px] text-gray-400 truncate">{song.artist}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-piu-border/30 flex items-center gap-2">
          {error && <p className="text-[11px] text-red-400 flex-1">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white font-display ml-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedChart || saving}
            className="btn-primary text-xs disabled:opacity-40"
          >
            {saving ? 'Saving...' : existingPick ? 'Update Pick' : 'Save Pick'}
          </button>
        </div>
      </div>
    </div>
  );
}
