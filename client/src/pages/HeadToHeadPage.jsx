import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getFollowing, getSongHeadToHead, searchUsers } from '../utils/api';

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

function getModeKey(mode) {
  if (mode === 'Singles') return 'single';
  if (mode === 'Doubles') return 'double';
  return 'both';
}

function levelBadge(mode, level) {
  const isSingle = String(mode || '').toLowerCase().startsWith('s');
  return (
    <span className={`inline-flex items-center justify-center rounded-full min-w-[34px] h-8 px-2 border text-white font-display font-black text-sm ${
      isSingle
        ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
        : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
    }`}>
      {level}
    </span>
  );
}

function metricWinnerLabel(a, b, biggerWins = true) {
  if (a === b) return 'Tie';
  if (biggerWins) return a > b ? 'A' : 'B';
  return a < b ? 'A' : 'B';
}

function PlayerAvatar({ player, fallbackName, size = 'w-10 h-10' }) {
  const name = player?.username || fallbackName || '?';
  if (player?.avatar) {
    return <img src={getAvatarUrl(player.avatar)} alt={name} className={`${size} rounded-full object-cover border border-piu-border`} />;
  }
  return (
    <div className={`${size} rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs`}>
      {name[0].toUpperCase()}
    </div>
  );
}

function CompetitiveValue({ entry, prefix, levelColorClass }) {
  if (!entry?.level) return <span className="text-gray-500">-</span>;
  return (
    <div className="text-right">
      <p className={`font-display font-black text-base ${levelColorClass}`}>{prefix}{entry.level}</p>
      <p className={`text-xs font-display font-bold ${getGradeColor(entry.average_grade, entry.average_score)}`}>{entry.average_grade || '-'}</p>
      <p className="text-[10px] text-gray-400">Avg {formatNumber(entry.average_score || 0)}</p>
    </div>
  );
}

export default function HeadToHeadPage() {
  const { user } = useAuth();

  const [following, setFollowing] = useState([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState(null);

  const [mode, setMode] = useState('Both');
  const [trendMode, setTrendMode] = useState('Both');
  const [selectedLevel, setSelectedLevel] = useState('All');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return undefined;

    (async () => {
      try {
        const list = await getFollowing(user.id);
        if (cancelled) return;
        setFollowing(Array.isArray(list) ? list : []);
      } catch {
        if (cancelled) return;
        setFollowing([]);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      const q = query.trim();
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const users = await searchUsers(q);
        if (cancelled) return;
        setSuggestions((Array.isArray(users) ? users : []).filter((item) => item.id !== user?.id));
      } catch {
        if (cancelled) return;
        setSuggestions([]);
      }
    }

    const timer = setTimeout(runSearch, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, user?.id]);

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

  const compareLevels = useMemo(() => {
    if (!result) return [];
    const modeKey = getModeKey(mode);
    const rowsA = result.level_series?.[modeKey]?.a || [];
    const rowsB = result.level_series?.[modeKey]?.b || [];
    const levels = new Set([
      ...rowsA.map((row) => row.level),
      ...rowsB.map((row) => row.level),
    ]);
    return Array.from(levels).sort((a, b) => a - b);
  }, [result, mode]);

  const trendData = useMemo(() => {
    if (!result) return [];
    const modeKey = getModeKey(trendMode);
    const rowsA = result.level_series?.[modeKey]?.a || [];
    const rowsB = result.level_series?.[modeKey]?.b || [];

    const byLevel = new Map();
    for (const row of rowsA) {
      byLevel.set(row.level, {
        level: row.level,
        a_rating: parseInt(row.rating_total, 10) || 0,
        a_average: parseInt(row.average_score, 10) || 0,
        b_rating: 0,
        b_average: 0,
      });
    }
    for (const row of rowsB) {
      const existing = byLevel.get(row.level) || {
        level: row.level,
        a_rating: 0,
        a_average: 0,
        b_rating: 0,
        b_average: 0,
      };
      existing.b_rating = parseInt(row.rating_total, 10) || 0;
      existing.b_average = parseInt(row.average_score, 10) || 0;
      byLevel.set(row.level, existing);
    }

    return Array.from(byLevel.values()).sort((a, b) => a.level - b.level);
  }, [result, trendMode]);

  const trendLevels = useMemo(() => trendData.map((row) => row.level), [trendData]);

  useEffect(() => {
    if (!trendLevels.length) {
      setMinLevel('');
      setMaxLevel('');
      return;
    }
    const low = trendLevels[0];
    const high = trendLevels[trendLevels.length - 1];
    setMinLevel((prev) => {
      const value = parseInt(prev, 10);
      return Number.isFinite(value) && value >= low && value <= high ? String(value) : String(low);
    });
    setMaxLevel((prev) => {
      const value = parseInt(prev, 10);
      return Number.isFinite(value) && value >= low && value <= high ? String(value) : String(high);
    });
  }, [trendLevels]);

  const rangedTrendData = useMemo(() => {
    if (!trendData.length) return [];
    const min = parseInt(minLevel, 10);
    const max = parseInt(maxLevel, 10);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return trendData;

    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return trendData.filter((row) => row.level >= lo && row.level <= hi);
  }, [trendData, minLevel, maxLevel]);

  const trendRatingMax = useMemo(() => {
    if (!rangedTrendData.length) return 100;
    const max = Math.max(
      ...rangedTrendData.map((row) => Math.max(row.a_rating || 0, row.b_rating || 0)),
    );
    return max > 0 ? Math.ceil(max / 100) * 100 : 100;
  }, [rangedTrendData]);

  const displayedSuggestions = useMemo(() => {
    if (query.trim().length >= 2) return suggestions;
    return following.filter((item) => item.id !== user?.id).slice(0, 8);
  }, [following, query, suggestions, user?.id]);

  const handleSelectOpponent = (player) => {
    setSelectedOpponent(player);
    setQuery(player.username || '');
    setShowSuggestions(false);
  };

  const runComparison = async () => {
    if (!user?.id) return;
    if (!selectedOpponent?.id) {
      setError('Choose a player to compare against.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = {
        user_a_id: user.id,
        user_b_id: selectedOpponent.id,
        mode,
      };
      if (selectedLevel !== 'All') params.level = selectedLevel;

      const payload = await getSongHeadToHead(params);
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err.message || 'Failed to run head-to-head comparison');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
        <div className="card text-center text-gray-400">Login required to run head-to-head comparisons.</div>
        <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
      </div>
    );
  }

  const userA = result?.users?.a || {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
  };
  const userB = result?.users?.b || selectedOpponent || null;

  const pumbility = result?.highlighted_stats?.pumbility;
  const singlesPumbility = result?.highlighted_stats?.singles_pumbility;
  const doublesComp = result?.highlighted_stats?.doubles_competitive_level;
  const singlesComp = result?.highlighted_stats?.singles_competitive_level;

  const comparison = result?.comparison;
  const winsA = parseInt(comparison?.wins?.a, 10) || 0;
  const winsB = parseInt(comparison?.wins?.b, 10) || 0;
  const ties = parseInt(comparison?.wins?.ties, 10) || 0;
  const ratingA = parseInt(comparison?.rating?.a, 10) || 0;
  const ratingB = parseInt(comparison?.rating?.b, 10) || 0;

  const scoreWinner = metricWinnerLabel(winsA, winsB, true);
  const ratingWinner = metricWinnerLabel(ratingA, ratingB, true);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wide">HEAD TO HEAD</h1>
          <p className="text-xs text-gray-500">Compare scores, rating, and level performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/songs" className="text-xs sm:text-sm text-piu-accent hover:underline">Songs</Link>
          <Link to="/" className="text-xs sm:text-sm text-piu-accent hover:underline">Back to Home</Link>
        </div>
      </div>

      <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div ref={searchWrapRef} className="relative">
            <label className="text-[11px] text-gray-400 block mb-1">Compare against player</label>
            <input
              value={query}
              onFocus={() => setShowSuggestions(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowSuggestions(true);
              }}
              placeholder="Search player"
              className="input-field w-full"
            />
            {showSuggestions && displayedSuggestions.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                {displayedSuggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectOpponent(entry)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-piu-dark/70 transition-colors border-b border-piu-border/20 last:border-0 text-left"
                  >
                    <PlayerAvatar player={entry} fallbackName={entry.username} size="w-8 h-8" />
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Mode</label>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                className="input-field w-full"
              >
                <option>Both</option>
                <option>Singles</option>
                <option>Doubles</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Level</label>
              <select
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(event.target.value)}
                className="input-field w-full"
              >
                <option value="All">All levels</option>
                {compareLevels.map((level) => (
                  <option key={level} value={String(level)}>Lv.{level}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={runComparison}
            className="px-4 py-2 rounded-lg bg-piu-accent text-white text-sm font-display font-bold hover:brightness-110 transition-all disabled:opacity-60"
          >
            {loading ? 'Comparing...' : 'Run Compare'}
          </button>
        </div>
      </section>

      {error && (
        <div className="card border-red-500/40 bg-red-900/20 text-red-200 text-sm">
          {error}
        </div>
      )}

      {result && (
        <>
          <section className="rounded-xl border border-piu-border/60 bg-gradient-to-r from-[#0f1f37] to-[#172d48] p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <PlayerAvatar player={userA} fallbackName={userA?.username} size="w-10 h-10" />
                  <p className="font-display font-bold text-base truncate">{userA?.username || 'Player A'}</p>
                </div>
              </div>
              <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-3">
                <div className="flex items-center gap-2 justify-end mb-2">
                  <p className="font-display font-bold text-base truncate text-right">{userB?.username || 'Player B'}</p>
                  <PlayerAvatar player={userB} fallbackName={userB?.username} size="w-10 h-10" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-piu-border/50 bg-piu-dark/45 p-2.5 space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <p className="font-display font-black text-piu-gold">{formatNumber(pumbility?.a || 0)}</p>
                <p className="text-[11px] font-display font-bold text-piu-gold">Pumbility</p>
                <p className="font-display font-black text-piu-gold">{formatNumber(pumbility?.b || 0)}</p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                <p className="font-display font-black text-red-300">{formatNumber(singlesPumbility?.a || 0)}</p>
                <p className="text-[11px] font-display font-bold text-red-300">Singles Pumbility</p>
                <p className="font-display font-black text-red-300">{formatNumber(singlesPumbility?.b || 0)}</p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <CompetitiveValue entry={doublesComp?.a} prefix="D" levelColorClass="text-green-400" />
                <p className="text-[11px] font-display font-bold text-green-300 text-center">Doubles Competitive Level</p>
                <CompetitiveValue entry={doublesComp?.b} prefix="D" levelColorClass="text-green-400" />
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <CompetitiveValue entry={singlesComp?.a} prefix="S" levelColorClass="text-red-400" />
                <p className="text-[11px] font-display font-bold text-red-300 text-center">Singles Competitive Level</p>
                <CompetitiveValue entry={singlesComp?.b} prefix="S" levelColorClass="text-red-400" />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-display font-bold text-piu-accent">RATING + AVERAGE SCORE BY LEVEL</h2>
                <p className="text-[11px] text-gray-500">Left axis: average score | Right axis: total rating</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={trendMode} onChange={(event) => setTrendMode(event.target.value)} className="input-field text-sm">
                  <option>Both</option>
                  <option>Singles</option>
                  <option>Doubles</option>
                </select>
                <select value={minLevel} onChange={(event) => setMinLevel(event.target.value)} className="input-field text-sm">
                  {trendLevels.map((level) => (
                    <option key={`min-${level}`} value={String(level)}>From Lv.{level}</option>
                  ))}
                </select>
                <select value={maxLevel} onChange={(event) => setMaxLevel(event.target.value)} className="input-field text-sm">
                  {trendLevels.map((level) => (
                    <option key={`max-${level}`} value={String(level)}>To Lv.{level}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs rounded-lg border border-piu-border/40 bg-piu-dark/40 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <PlayerAvatar player={userA} fallbackName={userA?.username} size="w-6 h-6" />
                <span>{userA?.username || 'Player A'}</span>
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <span className="w-3 h-0.5 bg-rose-400 inline-block" /> Avg
                  <span className="w-3 h-0.5 border-t border-dashed border-rose-300 inline-block" /> Rating
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <PlayerAvatar player={userB} fallbackName={userB?.username} size="w-6 h-6" />
                <span>{userB?.username || 'Player B'}</span>
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Avg
                  <span className="w-3 h-0.5 border-t border-dashed border-cyan-300 inline-block" /> Rating
                </span>
              </div>
            </div>

            {rangedTrendData.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rangedTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="level" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(value) => `Lv.${value}`} />
                    <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 1000000]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, trendRatingMax]} />
                    <Tooltip
                      contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px' }}
                      formatter={(value, name) => {
                        if (String(name).includes('Rating')) return [formatNumber(value), name];
                        return [formatNumber(value), name];
                      }}
                      labelFormatter={(label) => `Lv.${label}`}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="a_average" name={`${userA?.username || 'Player A'} Avg`} stroke="#fb7185" strokeWidth={2} dot={{ r: 2, fill: '#fb7185' }} />
                    <Line yAxisId="left" type="monotone" dataKey="b_average" name={`${userB?.username || 'Player B'} Avg`} stroke="#22d3ee" strokeWidth={2} dot={{ r: 2, fill: '#22d3ee' }} />
                    <Line yAxisId="right" type="monotone" dataKey="a_rating" name={`${userA?.username || 'Player A'} Rating`} stroke="#fda4af" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="b_rating" name={`${userB?.username || 'Player B'} Rating`} stroke="#67e8f9" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">No level series available for this mode.</p>
            )}
          </section>

          <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3 space-y-2">
            <h2 className="text-sm font-display font-bold text-piu-accent">LEVEL COMPARISON</h2>
            <div className="overflow-x-auto rounded-lg border border-piu-border/40">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-[#0f172a] text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Metric</th>
                    <th className="px-3 py-2 text-right">{userA?.username || 'Player A'}</th>
                    <th className="px-3 py-2 text-right">{userB?.username || 'Player B'}</th>
                    <th className="px-3 py-2 text-center">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-piu-border/30">
                    <td className="px-3 py-2">Shared passed charts</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(comparison?.shared_chart_count || 0)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(comparison?.shared_chart_count || 0)}</td>
                    <td className="px-3 py-2 text-center text-gray-400">-</td>
                  </tr>
                  <tr className="border-t border-piu-border/30">
                    <td className="px-3 py-2">Higher score wins</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(winsA)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(winsB)}</td>
                    <td className="px-3 py-2 text-center font-display font-bold">{scoreWinner}</td>
                  </tr>
                  <tr className="border-t border-piu-border/30">
                    <td className="px-3 py-2">Ties</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(ties)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(ties)}</td>
                    <td className="px-3 py-2 text-center text-gray-400">-</td>
                  </tr>
                  <tr className="border-t border-piu-border/30">
                    <td className="px-3 py-2">Rating total</td>
                    <td className="px-3 py-2 text-right font-mono text-piu-gold">{formatNumber(ratingA)}</td>
                    <td className="px-3 py-2 text-right font-mono text-piu-gold">{formatNumber(ratingB)}</td>
                    <td className="px-3 py-2 text-center font-display font-bold">{ratingWinner}</td>
                  </tr>
                  <tr className="border-t border-piu-border/30">
                    <td className="px-3 py-2">Clear-cut winner</td>
                    <td className="px-3 py-2 text-right">{comparison?.clear_cut_winner === userA?.id ? 'Yes' : '-'}</td>
                    <td className="px-3 py-2 text-right">{comparison?.clear_cut_winner === userB?.id ? 'Yes' : '-'}</td>
                    <td className="px-3 py-2 text-center font-display font-bold">
                      {comparison?.clear_cut_winner === userA?.id
                        ? 'A'
                        : comparison?.clear_cut_winner === userB?.id
                          ? 'B'
                          : 'Tie'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-piu-border/60 bg-piu-card/70 p-3 space-y-2">
            <h2 className="text-sm font-display font-bold text-piu-accent">TOP SONG DIFFERENCES</h2>
            <div className="overflow-x-auto rounded-lg border border-piu-border/40">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-[#0f172a] text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Song</th>
                    <th className="px-3 py-2 text-center">Level</th>
                    <th className="px-3 py-2 text-right">{userA?.username || 'Player A'}</th>
                    <th className="px-3 py-2 text-right">{userB?.username || 'Player B'}</th>
                    <th className="px-3 py-2 text-right">Diff</th>
                    <th className="px-3 py-2 text-center">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.top_song_diffs || []).map((row, index) => {
                    const diff = Math.abs((row.score_a || 0) - (row.score_b || 0));
                    const gradeA = row.grade_a || getRank(row.score_a).label;
                    const gradeB = row.grade_b || getRank(row.score_b).label;
                    return (
                      <tr key={`${row.chart_id || row.title}-${index}`} className="border-t border-piu-border/30 hover:bg-piu-dark/35 transition-colors">
                        <td className="px-3 py-2">
                          <Link to={row.chart_id ? `/songs/chart/${row.chart_id}` : '/songs'} className="flex items-center gap-2 min-w-0">
                            {row.jacket_url ? (
                              <img src={row.jacket_url} alt={row.title} title={row.title} className="w-10 h-6 rounded object-cover border border-piu-border/40" />
                            ) : (
                              <div className="w-10 h-6 rounded bg-piu-dark border border-piu-border/40" />
                            )}
                            <p className="truncate font-display font-bold" title={row.title}>{row.title}</p>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center">{levelBadge(row.mode, row.level)}</td>
                        <td className="px-3 py-2 text-right">
                          <p className="font-mono">{formatNumber(row.score_a)}</p>
                          <p className={`font-display font-bold ${getGradeColor(gradeA, row.score_a)}`}>{gradeA}</p>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <p className="font-mono">{formatNumber(row.score_b)}</p>
                          <p className={`font-display font-bold ${getGradeColor(gradeB, row.score_b)}`}>{gradeB}</p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(diff)}</td>
                        <td className="px-3 py-2 text-center font-display font-bold">
                          {row.winner === 'a' ? userA?.username : row.winner === 'b' ? userB?.username : 'Tie'}
                        </td>
                      </tr>
                    );
                  })}
                  {(result?.top_song_diffs || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8">No shared passed charts found for this selection.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
