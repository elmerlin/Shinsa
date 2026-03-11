import React, { useEffect, useMemo, useState } from 'react';
import { getAdminMissingSongDurations, updateAdminSongDuration } from '../utils/api';

function formatDuration(seconds) {
  const total = parseInt(seconds, 10) || 0;
  if (total <= 0) return '--';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function parseDurationInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = parseInt(raw, 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  const parts = raw.split(':').map((part) => part.trim());
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
    return (minutes * 60) + seconds;
  }

  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes >= 60 || seconds >= 60) {
      return null;
    }
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return null;
}

export default function AdminSongsTab() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState([]);
  const [coverage, setCoverage] = useState({ total_songs: 0, with_duration: 0, missing_duration: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [inputs, setInputs] = useState({});
  const [savingKey, setSavingKey] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await getAdminMissingSongDurations({
          q: trimmed || undefined,
          page,
          limit: 50,
        });
        if (cancelled) return;
        const nextResults = Array.isArray(payload?.results) ? payload.results : [];
        setResults(nextResults);
        setCoverage(payload?.coverage || { total_songs: 0, with_duration: 0, missing_duration: 0 });
        setTotal(parseInt(payload?.total, 10) || 0);
        setTotalPages(parseInt(payload?.total_pages, 10) || 0);
        setInputs((prev) => {
          const next = { ...prev };
          for (const row of nextResults) {
            if (typeof next[row.song_group_key] !== 'string') next[row.song_group_key] = '';
          }
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        setCoverage({ total_songs: 0, with_duration: 0, missing_duration: 0 });
        setTotal(0);
        setTotalPages(0);
        setError(err?.message || 'Failed to load missing song durations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, query, refreshKey]);

  const summaryItems = useMemo(() => ([
    { label: 'Songs', value: coverage.total_songs || 0 },
    { label: 'With Duration', value: coverage.with_duration || 0 },
    { label: 'Missing', value: coverage.missing_duration || 0 },
  ]), [coverage]);

  const handleSave = async (row) => {
    const rawValue = inputs[row.song_group_key];
    const durationSeconds = parseDurationInput(rawValue);
    if (!durationSeconds) {
      setError(`Invalid duration for ${row.title}. Use seconds or mm:ss.`);
      setMessage('');
      return;
    }

    setSavingKey(row.song_group_key);
    setError('');
    setMessage('');
    try {
      await updateAdminSongDuration({
        song_group_key: row.song_group_key,
        duration_seconds: durationSeconds,
      });
      setInputs((prev) => ({ ...prev, [row.song_group_key]: '' }));
      setMessage(`Saved ${formatDuration(durationSeconds)} for ${row.title}.`);
      if (results.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        setRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      setError(err?.message || `Failed to save duration for ${row.title}`);
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="font-display font-bold text-piu-accent">Song Durations</h3>
            <p className="text-sm text-gray-400 mt-1">
              Missing song lengths after PIU Center import. Save once and the duration is applied to every chart for that song.
            </p>
          </div>

          <div className="w-full lg:w-72">
            <label className="text-[11px] font-display font-bold uppercase tracking-wide text-gray-500">Search</label>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="input-field mt-1"
              placeholder="Song or artist"
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-piu-border/60 bg-piu-dark/40 px-3 py-2.5">
              <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">{item.label}</p>
              <p className="mt-1 text-xl font-display font-bold text-white">{item.value}</p>
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 border-b border-piu-border/50 pb-3">
          <div>
            <p className="text-[11px] font-display font-bold uppercase tracking-wide text-gray-500">Missing Duration Queue</p>
            <p className="text-sm text-gray-400 mt-1">{total} song{total === 1 ? '' : 's'} currently need a duration.</p>
          </div>
          {loading ? <p className="text-xs text-gray-500">Loading...</p> : null}
        </div>

        <div className="mt-4 space-y-3">
          {!loading && results.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No songs are missing duration.</p>
          ) : null}

          {results.map((row) => (
            <div
              key={row.song_group_key}
              className="rounded-xl border border-piu-border/60 bg-piu-dark/35 px-3 py-3"
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-piu-border/60 bg-piu-dark shrink-0">
                    {row.jacket_url ? (
                      <img src={row.jacket_url} alt={row.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600 font-display">No Jacket</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-display font-bold text-white truncate">{row.title}</p>
                    <p className="text-sm text-gray-400 truncate">{row.artist || 'Unknown artist'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Array.isArray(row.chart_labels) ? row.chart_labels.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-0.5 rounded-md border border-piu-border/60 bg-piu-dark text-[11px] text-gray-300"
                        >
                          {label}
                        </span>
                      )) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center xl:min-w-[22rem] xl:justify-end">
                  <input
                    type="text"
                    value={inputs[row.song_group_key] || ''}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [row.song_group_key]: e.target.value }))}
                    className="input-field sm:w-32"
                    placeholder="2:03 or 123"
                  />
                  <button
                    type="button"
                    onClick={() => handleSave(row)}
                    disabled={savingKey === row.song_group_key}
                    className="btn-primary text-sm sm:min-w-[6.5rem] disabled:opacity-60"
                  >
                    {savingKey === row.song_group_key ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-piu-border/50 pt-3">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
