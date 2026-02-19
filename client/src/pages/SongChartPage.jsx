import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { getFollowing, getSongChartDetail, getSongHeadToHead } from '../utils/api';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatBest(record) {
  if (!record) return '-';
  if (record.is_stage_break) return 'STAGE BREAK';
  return `${formatNumber(record.score)} (${record.grade || ''})`;
}

function modeTag(mode, level) {
  const isSingle = mode === 'Single';
  return (
    <span className={`px-2 py-1 rounded text-xs font-display font-bold ${isSingle ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
      {isSingle ? 'S' : 'D'}{level}
    </span>
  );
}

function MetricRow({ label, left, right }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1 border-b border-piu-border/30 last:border-0">
      <div className="text-right font-display font-bold text-sm">{left}</div>
      <div className="px-2 text-[10px] text-gray-500 uppercase tracking-wide text-center">{label}</div>
      <div className="text-left font-display font-bold text-sm">{right}</div>
    </div>
  );
}

function competitiveLabel(entry, prefix) {
  if (!entry?.level) return '-';
  const grade = entry.average_grade ? ` ${entry.average_grade}` : '';
  return `${prefix}${entry.level}${grade}`;
}

export default function SongChartPage() {
  const { chartId } = useParams();
  const { user } = useAuth();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const [following, setFollowing] = useState([]);
  const [compareUserId, setCompareUserId] = useState('');
  const [compareMode, setCompareMode] = useState('Both');
  const [compareLevel, setCompareLevel] = useState('');
  const [headToHead, setHeadToHead] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await getSongChartDetail(chartId, {
          ...(user?.id ? { user_id: user.id, follow_from_user_id: user.id } : {}),
        });
        if (cancelled) return;
        setDetail(payload);
        if (payload?.chart?.mode) {
          setCompareMode(payload.chart.mode === 'Single' ? 'Single' : 'Double');
        }
        if (payload?.chart?.level) {
          setCompareLevel(String(payload.chart.level));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load chart data');
        setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [chartId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setFollowing([]);
      setCompareUserId('');
      return () => { cancelled = true; };
    }

    getFollowing(user.id)
      .then((list) => {
        if (cancelled) return;
        setFollowing(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (cancelled) return;
        setFollowing([]);
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const progression = useMemo(() => {
    if (!Array.isArray(detail?.progression)) return [];
    return detail.progression.map((row, i) => ({
      i: i + 1,
      label: row.label || `Run ${i + 1}`,
      score: row.score || 0,
      is_stage_break: !!row.is_stage_break,
      grade: row.grade || '',
    }));
  }, [detail?.progression]);

  const runComparison = async () => {
    if (!user?.id || !compareUserId) return;
    setCompareLoading(true);
    setCompareError('');
    try {
      const payload = await getSongHeadToHead({
        user_a_id: user.id,
        user_b_id: compareUserId,
        mode: compareMode,
        ...(compareLevel ? { level: compareLevel } : {}),
      });
      setHeadToHead(payload);
    } catch (err) {
      setCompareError(err.message || 'Comparison failed');
      setHeadToHead(null);
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-500">Loading chart...</div>;
  }

  if (error || !detail?.chart) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-4">
        <div className="card border-red-500/40 bg-red-900/20 text-red-200">{error || 'Chart not found'}</div>
        <Link to="/songs" className="text-piu-accent hover:underline text-sm">Back to Songs</Link>
      </div>
    );
  }

  const chart = detail.chart;
  const userSummary = detail.user_summary || null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
        {modeTag(chart.mode, chart.level)}
      </div>

      <section className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          {chart.jacket_url ? (
            <img src={chart.jacket_url} alt={chart.title} className="w-full sm:w-44 h-28 sm:h-28 rounded-lg object-cover border border-piu-border/50" />
          ) : (
            <div className="w-full sm:w-44 h-28 rounded-lg bg-piu-dark border border-piu-border/50 flex items-center justify-center text-gray-500">No image</div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold leading-tight truncate">{chart.title}</h1>
            <p className="text-sm text-gray-400 truncate">{chart.artist || 'Unknown artist'}</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Your Best Score</p>
                <p className="font-display font-bold text-sm text-white">{formatBest(userSummary?.best)}</p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Best Rating</p>
                <p className="font-mono text-sm text-piu-gold">{formatNumber(userSummary?.best?.rating || 0)}</p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
                <p className="text-[10px] text-gray-500">Total Logged Runs</p>
                <p className="font-mono text-sm text-gray-200">{Array.isArray(detail.history) ? detail.history.length : 0}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-bold text-piu-accent">SCORE PROGRESSION</h2>
          <button onClick={() => setShowHistory((v) => !v)} className="text-xs text-piu-accent hover:underline">
            {showHistory ? 'Hide historical scores' : 'Show historical previous scores (incl. fails)'}
          </button>
        </div>

        {progression.length > 0 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progression} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="i" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 1000000]} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px' }}
                  labelStyle={{ color: '#d1d5db' }}
                  formatter={(value, _name, ctx) => {
                    if (ctx?.payload?.is_stage_break) return ['STAGE BREAK', 'Result'];
                    return [formatNumber(value), 'Score'];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return row?.label || `Run ${label}`;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3aaaff"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: '#67e8f9' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">No historical runs synced yet.</p>
        )}
      </section>

      {showHistory && (
        <section className="card">
          <h3 className="text-sm font-display font-bold text-piu-accent mb-3">CLEAR HISTORY</h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {(detail.history || []).map((row, index) => (
              <div key={`${row.id}-${index}`} className="rounded-lg border border-piu-border/40 bg-piu-dark/40 px-3 py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-300">{row.date_played || 'Unknown date'}</p>
                  <p className={`text-sm font-display font-bold ${row.is_stage_break ? 'text-red-400' : 'text-white'}`}>
                    {row.is_stage_break ? 'STAGE BREAK' : formatNumber(row.score)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-display font-bold text-gray-200">{row.grade || '-'}</p>
                  <p className="text-xs font-mono text-piu-gold">R {formatNumber(row.rating || 0)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="text-sm font-display font-bold text-piu-accent mb-3">FRIEND BESTS ON THIS CHART</h2>
        {(detail.friend_records || []).length > 0 ? (
          <div className="space-y-2">
            {detail.friend_records.map((entry) => (
              <div key={entry.user.id} className="rounded-lg border border-piu-border/40 bg-piu-dark/40 px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {entry.user.avatar ? (
                    <img src={getAvatarUrl(entry.user.avatar)} alt={entry.user.username} className="w-9 h-9 rounded-full object-cover border border-piu-border" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-piu-card border border-piu-border flex items-center justify-center text-xs font-display font-bold">
                      {(entry.user.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-display font-bold truncate">{entry.user.username}</p>
                    <p className="text-[10px] text-gray-500 truncate">{entry.best.date_played || 'Unknown date'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-display font-bold ${entry.best.is_stage_break ? 'text-red-400' : 'text-white'}`}>
                    {entry.best.is_stage_break ? 'STAGE BREAK' : formatNumber(entry.best.score)}
                  </p>
                  <p className="text-xs text-gray-400">{entry.best.grade || '-'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No followed players have a record on this chart yet.</p>
        )}
      </section>

      <section className="card">
        <h2 className="text-sm font-display font-bold text-piu-accent mb-3">HEAD TO HEAD</h2>
        {!user?.id ? (
          <p className="text-sm text-gray-500">Log in to compare head-to-head.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
              <select className="input-field" value={compareUserId} onChange={(e) => setCompareUserId(e.target.value)}>
                <option value="">Select followed player</option>
                {following.map((f) => (
                  <option key={f.id} value={f.id}>{f.username}</option>
                ))}
              </select>

              <select className="input-field" value={compareMode} onChange={(e) => setCompareMode(e.target.value)}>
                <option value="Single">Singles</option>
                <option value="Double">Doubles</option>
                <option value="Both">Both</option>
              </select>

              <select className="input-field" value={compareLevel} onChange={(e) => setCompareLevel(e.target.value)}>
                <option value="">All levels</option>
                {Array.from({ length: 19 }, (_, i) => 10 + i).map((level) => (
                  <option key={level} value={String(level)}>{level}</option>
                ))}
              </select>

              <button
                onClick={runComparison}
                disabled={!compareUserId || compareLoading}
                className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {compareLoading ? 'Comparing...' : 'Run Compare'}
              </button>
            </div>

            {compareError && <p className="text-xs text-red-300 mb-2">{compareError}</p>}

            {headToHead && (
              <div className="space-y-3">
                <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-3">
                  <h3 className="text-xs font-display font-bold text-gray-400 mb-2">HIGHLIGHTED STATS</h3>
                  <MetricRow
                    label="Pumbility"
                    left={formatNumber(headToHead.highlighted_stats?.pumbility?.a)}
                    right={formatNumber(headToHead.highlighted_stats?.pumbility?.b)}
                  />
                  <MetricRow
                    label="Singles Pumbility"
                    left={formatNumber(headToHead.highlighted_stats?.singles_pumbility?.a)}
                    right={formatNumber(headToHead.highlighted_stats?.singles_pumbility?.b)}
                  />
                  <MetricRow
                    label="Doubles Competitive"
                    left={competitiveLabel(headToHead.highlighted_stats?.doubles_competitive_level?.a, 'D')}
                    right={competitiveLabel(headToHead.highlighted_stats?.doubles_competitive_level?.b, 'D')}
                  />
                  <MetricRow
                    label="Singles Competitive"
                    left={competitiveLabel(headToHead.highlighted_stats?.singles_competitive_level?.a, 'S')}
                    right={competitiveLabel(headToHead.highlighted_stats?.singles_competitive_level?.b, 'S')}
                  />
                </div>

                <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-3 text-sm">
                  <h3 className="text-xs font-display font-bold text-gray-400 mb-2">LEVEL / MODE COMPARISON</h3>
                  <p className="text-gray-300">Shared passed charts: <span className="font-mono">{headToHead.comparison?.shared_chart_count || 0}</span></p>
                  <p className="text-gray-300">Song wins: <span className="font-mono">{headToHead.comparison?.wins?.a || 0}</span> - <span className="font-mono">{headToHead.comparison?.wins?.b || 0}</span> (ties {headToHead.comparison?.wins?.ties || 0})</p>
                  <p className="text-gray-300">Level/mode rating: <span className="font-mono">{formatNumber(headToHead.comparison?.rating?.a)}</span> - <span className="font-mono">{formatNumber(headToHead.comparison?.rating?.b)}</span></p>
                  <p className="text-gray-200 mt-1">Clear-cut winner: <span className="font-display font-bold">{
                    headToHead.comparison?.clear_cut_winner
                      ? headToHead.comparison.clear_cut_winner === headToHead.users?.a?.id
                        ? headToHead.users?.a?.username || 'Left'
                        : headToHead.users?.b?.username || 'Right'
                      : 'No clear-cut winner'
                  }</span></p>
                </div>

                {(headToHead.top_song_diffs || []).length > 0 && (
                  <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-3">
                    <h3 className="text-xs font-display font-bold text-gray-400 mb-2">TOP SONG DIFFERENCES</h3>
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {(headToHead.top_song_diffs || []).map((song, i) => (
                        <div key={`${song.chart_id || song.title}-${i}`} className="flex items-center justify-between text-xs border-b border-piu-border/20 py-1 last:border-0">
                          <span className="truncate pr-2">{song.title} ({song.mode === 'Single' ? 'S' : 'D'}{song.level})</span>
                          <span className="font-mono text-gray-300">{formatNumber(song.score_a)} / {formatNumber(song.score_b)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
