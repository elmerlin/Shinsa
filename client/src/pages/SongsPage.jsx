import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSongAnalytics, getSongLibrary } from '../utils/api';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function ChartBadge({ chart }) {
  const modeLabel = chart.mode === 'Single' ? 'S' : 'D';
  const baseColor = chart.mode === 'Single'
    ? 'from-red-500 to-red-700 border-red-300/50'
    : 'from-green-500 to-emerald-700 border-green-300/50';

  return (
    <Link
      to={`/songs/chart/${chart.chart_id}`}
      className={`inline-flex items-center justify-center min-w-[42px] h-[42px] rounded-full border bg-gradient-to-b ${baseColor} text-white font-display font-black text-sm shadow-md hover:brightness-110 transition-all`}
      title={`${modeLabel}${chart.level}`}
    >
      {chart.level}
    </Link>
  );
}

function ProgressPanel({ title, rows, barClass, toneClass }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-piu-border/60 bg-piu-card/60 p-3">
      <h3 className={`text-xs font-display font-bold tracking-wide mb-2 ${toneClass}`}>{title}</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div key={`${title}-${row.level}`}>
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
              <span className="font-display font-bold">Lv.{row.level}</span>
              <span>{row.cleared_charts}/{row.total_charts} ({row.clear_percentage}%)</span>
              <span className="font-mono text-gray-300">R {formatNumber(row.rating_total)}</span>
            </div>
            <div className="h-2 rounded-full bg-piu-dark overflow-hidden">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, Number(row.clear_percentage) || 0))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SongsPage() {
  const { user } = useAuth();

  const [library, setLibrary] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [libraryData, analyticsData] = await Promise.all([
          getSongLibrary(user?.id ? { user_id: user.id } : {}),
          user?.id ? getSongAnalytics(user.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLibrary(Array.isArray(libraryData?.songs) ? libraryData.songs : []);
        setAnalytics(analyticsData || null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load songs');
        setLibrary([]);
        setAnalytics(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const mode = modeFilter === 'All' ? '' : modeFilter;

    return library
      .map((song) => {
        const matchesSong = !q || `${song.title} ${song.artist}`.toLowerCase().includes(q);
        const charts = (song.charts || []).filter((chart) => {
          if (mode && chart.mode !== mode) return false;
          if (q && !matchesSong) {
            const chartText = `${chart.mode} ${chart.level}`.toLowerCase();
            if (!chartText.includes(q)) return false;
          }
          return true;
        });
        if (!matchesSong && charts.length === 0) return null;
        if (charts.length === 0) return null;
        return { ...song, charts };
      })
      .filter(Boolean);
  }, [library, modeFilter, search]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-gray-500">Loading songs...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">SONGS</h1>
          <p className="text-xs text-gray-500">Phoenix chart database with singles and doubles</p>
        </div>
        <Link to="/" className="text-xs sm:text-sm text-piu-accent hover:underline">Back to Home</Link>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      {analytics && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-piu-border/60 bg-gradient-to-br from-slate-900/80 to-slate-800/50 p-3 space-y-3">
            <h2 className="text-xs font-display font-bold tracking-wide text-piu-accent">PLAYER METRICS</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Pumbility</p>
                <p className="font-display font-bold text-base text-piu-gold">{formatNumber(analytics.pumbility)}</p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Singles PB</p>
                <p className="font-display font-bold text-base text-red-300">{formatNumber(analytics.singles_pumbility)}</p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Single Comp</p>
                <p className="font-display font-bold text-base text-red-400">
                  {analytics.competitive_levels?.single?.level ? `S${analytics.competitive_levels.single.level}` : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Double Comp</p>
                <p className="font-display font-bold text-base text-green-400">
                  {analytics.competitive_levels?.double?.level ? `D${analytics.competitive_levels.double.level}` : '-'}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2 text-[11px]">
              <p className="text-gray-500">Total Rating</p>
              <div className="grid grid-cols-3 gap-1 mt-1 text-center">
                <div>
                  <p className="text-gray-500">Single</p>
                  <p className="font-mono text-red-300">{formatNumber(analytics.totals?.single?.rating_total)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Double</p>
                  <p className="font-mono text-green-300">{formatNumber(analytics.totals?.double?.rating_total)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Both</p>
                  <p className="font-mono text-blue-300">{formatNumber(analytics.totals?.both?.rating_total)}</p>
                </div>
              </div>
            </div>
          </div>

          <ProgressPanel
            title="SINGLES CLEAR % + LEVEL RATING"
            rows={analytics.levels?.single || []}
            toneClass="text-red-300"
            barClass="bg-gradient-to-r from-red-500 to-rose-400"
          />

          <ProgressPanel
            title="DOUBLES CLEAR % + LEVEL RATING"
            rows={analytics.levels?.double || []}
            toneClass="text-green-300"
            barClass="bg-gradient-to-r from-green-500 to-emerald-400"
          />
        </section>
      )}

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Enter search keyword"
            className="input-field flex-1 min-w-[220px]"
          />
          {['All', 'Single', 'Double'].map((mode) => (
            <button
              key={mode}
              onClick={() => setModeFilter(mode)}
              className={`px-3 py-2 rounded-lg text-xs font-display font-bold transition-colors ${
                modeFilter === mode ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filteredSongs.map((song) => (
            <div key={song.song_group_key} className="rounded-xl border border-piu-border/50 bg-gradient-to-r from-[#112947] to-[#1b3554] p-3">
              <div className="flex gap-3">
                {song.jacket_url ? (
                  <img src={song.jacket_url} alt={song.title} className="w-24 h-14 sm:w-28 sm:h-16 rounded object-cover border border-piu-border/40" />
                ) : (
                  <div className="w-24 h-14 sm:w-28 sm:h-16 rounded bg-piu-dark border border-piu-border/40 flex items-center justify-center text-xs text-gray-500">
                    No image
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-display font-bold leading-tight truncate">{song.title}</p>
                  <p className="text-xs text-gray-400 truncate">{song.artist || 'Unknown artist'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {song.charts.map((chart) => (
                  <div key={`${song.song_group_key}-${chart.key}`} className="relative">
                    <ChartBadge chart={chart} />
                    {chart.is_pass && (
                      <span className="absolute -bottom-1 -right-1 text-[9px] px-1 rounded-full bg-piu-dark border border-piu-border text-piu-accent font-mono">
                        {chart.mode === 'Single' ? 'S' : 'D'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredSongs.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-6">No songs found</p>
          )}
        </div>
      </section>
    </div>
  );
}
