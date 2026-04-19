import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getSongs, getJacketMap, saveMySongOfWeek } from '../utils/api';
import PiuChartJacket, { resolveChartJacketUrl } from './PiuChartJacket';

const MODE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Single', label: 'Single' },
  { value: 'Double', label: 'Double' },
  { value: 'CoOp', label: 'Co-Op' },
];
const MAX_GROUPS = 120;

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return '';
}

function modeTone(mode, selected) {
  const baseActive = 'border-piu-accent bg-piu-accent/30 text-white';
  if (selected) return baseActive;
  if (mode === 'Single') return 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20';
  if (mode === 'Double') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20';
  if (mode === 'CoOp') return 'border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20';
  return 'border-piu-border/40 bg-piu-dark text-gray-300 hover:bg-piu-border/20';
}

function sortCharts(a, b) {
  const modeOrder = { Single: 0, Double: 1, CoOp: 2 };
  const am = modeOrder[a.mode] ?? 99;
  const bm = modeOrder[b.mode] ?? 99;
  if (am !== bm) return am - bm;
  return (a.level || 0) - (b.level || 0);
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

  const grouped = useMemo(() => {
    if (!songs.length) return [];
    const q = search.trim().toLowerCase();
    const map = new Map();
    for (const row of songs) {
      if (!row || !row.title || !row.mode || !row.level) continue;
      if (modeFilter !== 'all' && row.mode !== modeFilter) continue;
      if (q) {
        const hay = `${row.title} ${row.artist || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = `${row.title}|${row.artist || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: row.title,
          artist: row.artist || '',
          jacket_url: row.jacket_url || '',
          charts: [],
          chartKeys: new Set(),
        });
      }
      const group = map.get(key);
      const chartKey = `${row.mode}|${row.level}`;
      if (group.chartKeys.has(chartKey)) continue;
      group.chartKeys.add(chartKey);
      group.charts.push({
        id: row.id,
        title: row.title,
        artist: row.artist || '',
        mode: row.mode,
        level: row.level,
        jacket_url: row.jacket_url || '',
      });
    }
    const groups = Array.from(map.values());
    for (const g of groups) g.charts.sort(sortCharts);
    groups.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    return groups.slice(0, MAX_GROUPS);
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
                <p className="text-[11px] text-gray-300 mt-0.5">
                  {modeShort(selectedChart.mode)}
                  {selectedChart.level || ''}
                </p>
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
              <div className="flex gap-1">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setModeFilter(opt.value)}
                    className={`px-2 py-1 rounded-md text-[10px] font-display font-bold border transition-colors ${
                      modeFilter === opt.value
                        ? 'border-piu-accent bg-piu-accent/20 text-white'
                        : 'border-piu-border/40 bg-piu-dark text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-[11px] text-gray-500">Loading charts...</p>
            ) : grouped.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                {search.trim() ? 'No charts match your search.' : 'No charts available.'}
              </p>
            ) : (
              <div className="divide-y divide-piu-border/20 border border-piu-border/20 rounded-lg">
                {grouped.map((group) => {
                  const jacketUrl = resolveChartJacketUrl({
                    title: group.title,
                    mode: group.charts[0]?.mode,
                    level: group.charts[0]?.level,
                    jacketLookup,
                    jacketUrl: group.jacket_url,
                  });
                  return (
                    <div
                      key={group.key}
                      className="flex items-center gap-3 px-2 py-2"
                    >
                      <PiuChartJacket
                        title={group.title}
                        mode={group.charts[0]?.mode}
                        level={group.charts[0]?.level}
                        jacketUrl={jacketUrl}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold text-white truncate">
                          {group.title}
                        </p>
                        {group.artist && (
                          <p className="text-[10px] text-gray-400 truncate">{group.artist}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {group.charts.map((chart) => {
                            const isSelected = selectedChart?.id === chart.id;
                            return (
                              <button
                                type="button"
                                key={chart.id}
                                onClick={() => setSelectedChart(chart)}
                                className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-display font-black transition-colors ${modeTone(chart.mode, isSelected)}`}
                              >
                                {modeShort(chart.mode)}
                                {chart.level}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {grouped.length >= MAX_GROUPS && (
                  <p className="text-[10px] text-gray-500 text-center py-2">
                    Showing first {MAX_GROUPS} songs &mdash; refine your search to see more.
                  </p>
                )}
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
