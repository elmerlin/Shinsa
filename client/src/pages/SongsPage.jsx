import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getSongAnalytics, getSongLibrary } from '../utils/api';

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

function ChartBadge({ chart, compact = false }) {
  const isSingle = chart.mode === 'Single';
  const baseColor = isSingle
    ? 'from-red-500 to-red-700 border-red-300/50'
    : 'from-green-500 to-emerald-700 border-green-300/50';

  const sizeClass = compact
    ? 'min-w-[34px] h-[34px] text-xs'
    : 'min-w-[42px] h-[42px] text-sm';

  return (
    <Link
      to={`/songs/chart/${chart.chart_id}`}
      className={`inline-flex items-center justify-center ${sizeClass} rounded-full border bg-gradient-to-b ${baseColor} text-white font-display font-black shadow-md hover:brightness-110 transition-all`}
      title={`${isSingle ? 'S' : 'D'}${chart.level}`}
    >
      {chart.level}
    </Link>
  );
}

function PumbilityBreakdownModal({ open, title, rows, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">{title}</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="sticky top-0 bg-[#0f172a] border-b border-piu-border/60 z-10">
              <tr className="text-left text-gray-400">
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Song</th>
                <th className="px-3 py-2 w-20">Chart</th>
                <th className="px-3 py-2 w-28 text-right">Score</th>
                <th className="px-3 py-2 w-20 text-right">Grade</th>
                <th className="px-3 py-2 w-24 text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row, index) => {
                const grade = row.grade || getRank(row.score).label;
                return (
                  <tr key={`${row.chart_id}-${index}`} className="border-b border-piu-border/30 hover:bg-piu-dark/40 transition-colors">
                    <td className="px-3 py-2 text-gray-400">{index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {row.jacket_url ? (
                          <img src={row.jacket_url} alt={row.title} className="w-10 h-6 rounded object-cover border border-piu-border/40" />
                        ) : (
                          <div className="w-10 h-6 rounded bg-piu-dark border border-piu-border/40" />
                        )}
                        <div className="min-w-0">
                          <p className="font-display font-bold truncate">{row.title}</p>
                          <p className="text-[10px] text-gray-500 truncate">{row.artist || 'Unknown artist'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1">
                        <span className={`text-[10px] font-display font-bold ${row.mode === 'Single' ? 'text-red-300' : 'text-green-300'}`}>
                          {row.mode === 'Single' ? 'S' : 'D'}
                        </span>
                        <span className="font-mono text-gray-200">{row.level}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(row.score)}</td>
                    <td className={`px-3 py-2 text-right font-display font-bold ${getGradeColor(grade, row.score)}`}>{grade}</td>
                    <td className="px-3 py-2 text-right font-mono text-piu-gold">{formatNumber(row.rating)}</td>
                  </tr>
                );
              })}
              {(rows || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-8">No rated songs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CompetitiveLevelCard({
  title,
  modePrefix,
  modeColorClass,
  rows,
  cursor,
  onCursorChange,
  competitiveLevel,
}) {
  const selectedRow = rows[cursor] || null;
  const selectedLevel = selectedRow?.level || null;
  const selectedGrade = selectedRow?.average_grade || '';
  const selectedAverage = selectedRow?.average_score || 0;
  const selectedPassed = selectedRow?.cleared_charts || 0;
  const selectedTotal = selectedRow?.total_charts || 0;

  const qualifies = selectedGrade
    ? (GRADE_INDEX[selectedGrade] || 0) >= (GRADE_INDEX.S || 0)
    : false;

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-dark/55 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-display font-bold tracking-wide text-gray-300">{title}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={rows.length <= 1}
            onClick={() => onCursorChange((prev) => (prev <= 0 ? rows.length - 1 : prev - 1))}
            className="w-6 h-6 rounded bg-piu-card border border-piu-border/60 text-gray-300 hover:text-white disabled:opacity-40"
            aria-label={`Previous ${title} level`}
          >
            &#8592;
          </button>
          <button
            type="button"
            disabled={rows.length <= 1}
            onClick={() => onCursorChange((prev) => (prev >= rows.length - 1 ? 0 : prev + 1))}
            className="w-6 h-6 rounded bg-piu-card border border-piu-border/60 text-gray-300 hover:text-white disabled:opacity-40"
            aria-label={`Next ${title} level`}
          >
            &#8594;
          </button>
        </div>
      </div>

      <div className="rounded-md border border-piu-border/40 bg-[#0b1324]/70 p-2">
        <p className="text-[10px] text-gray-500">Current viewed level</p>
        <div className="flex items-baseline justify-between gap-2">
          <p className={`font-display font-black text-lg ${modeColorClass}`}>
            {selectedLevel ? `${modePrefix}${selectedLevel}` : '-'}
          </p>
          <p className={`text-xs font-display font-bold ${selectedGrade ? getGradeColor(selectedGrade, selectedAverage) : 'text-gray-500'}`}>
            {selectedGrade || '-'}
          </p>
        </div>
        <p className="text-[11px] text-gray-300 mt-1">Average score: <span className="font-mono">{selectedAverage ? formatNumber(selectedAverage) : '-'}</span></p>
        <p className="text-[11px] text-gray-300">Hypothetical grade: <span className={`font-display font-bold ${selectedGrade ? getGradeColor(selectedGrade, selectedAverage) : 'text-gray-500'}`}>{selectedGrade || '-'}</span></p>
        <p className="text-[11px] text-gray-400">Passes at this level: {selectedPassed}/{selectedTotal}</p>
        <p className={`text-[10px] mt-1 ${qualifies ? 'text-emerald-300' : 'text-gray-500'}`}>
          {qualifies ? 'This level meets S-or-better threshold.' : 'Below S threshold for competitive level.'}
        </p>
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed">
        Competitive level is the highest level where the average grade across your passed charts at that level is <span className="font-display font-bold">S</span> or better.
      </p>

      <div className="text-[10px] text-gray-400 rounded-md border border-piu-border/40 bg-piu-card/50 px-2 py-1.5">
        <span className="text-gray-500">Computed competitive level: </span>
        <span className={`font-display font-bold ${modeColorClass}`}>
          {competitiveLevel?.level ? `${modePrefix}${competitiveLevel.level}` : '-'}
        </span>
        {competitiveLevel?.average_grade && (
          <>
            <span className="text-gray-500"> | Grade </span>
            <span className={`font-display font-bold ${getGradeColor(competitiveLevel.average_grade, competitiveLevel.average_score)}`}>
              {competitiveLevel.average_grade}
            </span>
            <span className="text-gray-500"> | Avg </span>
            <span className="font-mono text-gray-200">{formatNumber(competitiveLevel.average_score || 0)}</span>
          </>
        )}
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
  const [progressMode, setProgressMode] = useState('Combined');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [openBreakdown, setOpenBreakdown] = useState('');
  const searchWrapRef = useRef(null);

  const [singleCursor, setSingleCursor] = useState(0);
  const [doubleCursor, setDoubleCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [libraryResult, analyticsResult] = await Promise.allSettled([
          getSongLibrary(user?.id ? { user_id: user.id } : {}),
          user?.id ? getSongAnalytics(user.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (libraryResult.status === 'fulfilled') {
          const libraryData = libraryResult.value;
          setLibrary(Array.isArray(libraryData?.songs) ? libraryData.songs : []);
        } else {
          setLibrary([]);
          setError(libraryResult.reason?.message || 'Failed to load songs');
        }

        if (analyticsResult.status === 'fulfilled') {
          setAnalytics(analyticsResult.value || null);
        } else {
          setAnalytics(null);
        }
      } catch (err) {
        if (cancelled) return;
        setLibrary([]);
        setAnalytics(null);
        setError(err.message || 'Failed to load songs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const singleLevels = analytics?.levels?.single || [];
  const doubleLevels = analytics?.levels?.double || [];

  useEffect(() => {
    const targetLevel = analytics?.competitive_levels?.single?.level;
    if (!singleLevels.length) {
      setSingleCursor(0);
      return;
    }
    if (!targetLevel) {
      setSingleCursor(0);
      return;
    }
    const idx = singleLevels.findIndex((row) => row.level === targetLevel);
    setSingleCursor(idx >= 0 ? idx : 0);
  }, [analytics?.competitive_levels?.single?.level, singleLevels]);

  useEffect(() => {
    const targetLevel = analytics?.competitive_levels?.double?.level;
    if (!doubleLevels.length) {
      setDoubleCursor(0);
      return;
    }
    if (!targetLevel) {
      setDoubleCursor(0);
      return;
    }
    const idx = doubleLevels.findIndex((row) => row.level === targetLevel);
    setDoubleCursor(idx >= 0 ? idx : 0);
  }, [analytics?.competitive_levels?.double?.level, doubleLevels]);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;

    return library
      .map((song) => {
        const songMatches = `${song.title} ${song.artist}`.toLowerCase().includes(q);
        const charts = (song.charts || []).filter((chart) => {
          if (songMatches) return true;
          const chartText = `${chart.mode} ${chart.level}`.toLowerCase();
          return chartText.includes(q);
        });
        if (!songMatches && charts.length === 0) return null;
        return { ...song, charts };
      })
      .filter(Boolean);
  }, [library, search]);

  const songSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const ranked = [];
    for (const song of library) {
      const title = String(song.title || '');
      const artist = String(song.artist || '');
      const titleLower = title.toLowerCase();
      const artistLower = artist.toLowerCase();
      if (!titleLower.includes(q) && !artistLower.includes(q)) continue;

      const startsWithTitle = titleLower.startsWith(q);
      const startsWithArtist = artistLower.startsWith(q);
      ranked.push({
        song_group_key: song.song_group_key,
        title,
        artist,
        priority: startsWithTitle ? 0 : startsWithArtist ? 1 : 2,
      });
    }

    ranked.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    return ranked.slice(0, 8);
  }, [library, search]);

  useEffect(() => {
    function handleDocClick(event) {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const progressRows = useMemo(() => {
    if (!analytics) return [];
    if (progressMode === 'Singles') return analytics.levels?.single || [];
    if (progressMode === 'Doubles') return analytics.levels?.double || [];
    return analytics.levels?.both || [];
  }, [analytics, progressMode]);

  const progressData = useMemo(() => {
    return progressRows.map((row) => ({
      level: row.level,
      clear_percentage: Number(row.clear_percentage) || 0,
      rating_total: parseInt(row.rating_total, 10) || 0,
      cleared_charts: parseInt(row.cleared_charts, 10) || 0,
      total_charts: parseInt(row.total_charts, 10) || 0,
    }));
  }, [progressRows]);

  const ratingMax = useMemo(() => {
    if (!progressData.length) return 100;
    const max = Math.max(...progressData.map((row) => row.rating_total || 0));
    return max > 0 ? Math.ceil(max / 100) * 100 : 100;
  }, [progressData]);

  const breakdownRows = openBreakdown === 'overall'
    ? analytics?.pumbility_breakdown?.overall_top50 || []
    : openBreakdown === 'singles'
      ? analytics?.pumbility_breakdown?.singles_top50 || []
      : [];

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
        <div className="flex items-center gap-2">
          <Link to="/head-to-head" className="text-xs sm:text-sm text-piu-accent hover:underline">Head to Head</Link>
          <Link to="/" className="text-xs sm:text-sm text-piu-accent hover:underline">Back to Home</Link>
        </div>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      {analytics && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <div className="rounded-xl border border-piu-border/60 bg-gradient-to-br from-slate-900/80 to-slate-800/50 p-3 space-y-3">
            <h2 className="text-xs font-display font-bold tracking-wide text-piu-accent">PLAYER METRICS</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <button
                type="button"
                onClick={() => setOpenBreakdown('overall')}
                className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2 hover:border-piu-gold/50 transition-colors"
              >
                <p className="text-[10px] text-gray-500">Pumbility</p>
                <p className="font-display font-bold text-base text-piu-gold">{formatNumber(analytics.pumbility)}</p>
              </button>
              <button
                type="button"
                onClick={() => setOpenBreakdown('singles')}
                className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2 hover:border-red-300/50 transition-colors"
              >
                <p className="text-[10px] text-gray-500">Singles Pumbility</p>
                <p className="font-display font-bold text-base text-red-300">{formatNumber(analytics.singles_pumbility)}</p>
              </button>
            </div>

            <CompetitiveLevelCard
              title="Singles Competitive Level"
              modePrefix="S"
              modeColorClass="text-red-400"
              rows={singleLevels}
              cursor={singleCursor}
              onCursorChange={setSingleCursor}
              competitiveLevel={analytics.competitive_levels?.single}
            />

            <CompetitiveLevelCard
              title="Doubles Competitive Level"
              modePrefix="D"
              modeColorClass="text-green-400"
              rows={doubleLevels}
              cursor={doubleCursor}
              onCursorChange={setDoubleCursor}
              competitiveLevel={analytics.competitive_levels?.double}
            />
          </div>

          <div className="xl:col-span-2 rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-display font-bold tracking-wide text-piu-accent">CLEAR % + LEVEL RATING</h2>
              <div className="flex items-center gap-1 rounded-lg bg-piu-dark border border-piu-border/40 p-1">
                {['Singles', 'Doubles', 'Combined'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProgressMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-display font-bold transition-colors ${
                      progressMode === mode ? 'bg-piu-accent text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={progressData} margin={{ top: 8, right: 16, left: 2, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="level" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(value) => `Lv.${value}`} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    domain={[0, 100]}
                    label={{ value: 'Completion %', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    domain={[0, ratingMax]}
                    label={{ value: 'Rating', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px' }}
                    formatter={(value, name, ctx) => {
                      if (name === 'Completion %') return [`${Number(value).toFixed(2)}%`, name];
                      if (name === 'Rating') return [formatNumber(value), name];
                      return [value, name];
                    }}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload;
                      if (!row) return '';
                      return `Lv.${row.level} | ${row.cleared_charts}/${row.total_charts} cleared`;
                    }}
                  />
                  <Bar yAxisId="left" dataKey="clear_percentage" name="Completion %" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={18} />
                  <Line yAxisId="right" type="monotone" dataKey="rating_total" name="Rating" stroke="#facc15" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#fde047' }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div ref={searchWrapRef} className="relative flex-1 min-w-[220px]">
            <input
              value={search}
              onFocus={() => setShowSuggestions(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowSuggestions(true);
              }}
              placeholder="Search songs"
              className="input-field w-full"
            />
            {showSuggestions && songSuggestions.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden">
                {songSuggestions.map((item) => (
                  <button
                    key={item.song_group_key}
                    type="button"
                    onClick={() => {
                      setSearch(item.title);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-piu-dark/70 transition-colors border-b border-piu-border/20 last:border-0"
                  >
                    <p className="text-sm font-display font-bold truncate">{item.title}</p>
                    <p className="text-[11px] text-gray-500 truncate">{item.artist || 'Unknown artist'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
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

      <PumbilityBreakdownModal
        open={openBreakdown === 'overall' || openBreakdown === 'singles'}
        title={openBreakdown === 'singles' ? 'Singles Pumbility Top Songs' : 'Pumbility Top Songs'}
        rows={breakdownRows}
        onClose={() => setOpenBreakdown('')}
      />
    </div>
  );
}
