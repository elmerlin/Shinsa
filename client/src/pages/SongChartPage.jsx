import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { getSongChartDetail, getUserLists, addListItem, createList, setChartYoutubeLink, removeChartYoutubeLink } from '../utils/api';

const GRADE_THRESHOLDS = [
  { min: 0,      grade: 'F' },
  { min: 450000, grade: 'D' },
  { min: 550000, grade: 'C' },
  { min: 650000, grade: 'B' },
  { min: 750000, grade: 'A' },
  { min: 825000, grade: 'A+' },
  { min: 900000, grade: 'AA' },
  { min: 925000, grade: 'AA+' },
  { min: 950000, grade: 'AAA' },
  { min: 960000, grade: 'AAA+' },
  { min: 970000, grade: 'S' },
  { min: 975000, grade: 'S+' },
  { min: 980000, grade: 'SS' },
  { min: 985000, grade: 'SS+' },
  { min: 990000, grade: 'SSS' },
  { min: 995000, grade: 'SSS+' },
];

function gradeFromScore(score) {
  const s = parseInt(score, 10) || 0;
  for (let i = GRADE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (s >= GRADE_THRESHOLDS[i].min) return GRADE_THRESHOLDS[i].grade;
  }
  return 'F';
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function normalizeOverRankingSongTitleForLink(songTitle) {
  const normalized = String(songTitle || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const compact = normalized.toLowerCase();
  if (compact === 'yog-sothoth - short cut -' || compact === 'yog-sothoth- short cut -') {
    return 'Yog-Sothoth - SHORT CUT -';
  }
  return normalized;
}

function buildOverRankingChartKeyForLink(songTitle, mode, level) {
  const title = normalizeOverRankingSongTitleForLink(songTitle);
  const chartMode = String(mode || '').trim();
  const chartLevel = parseInt(level, 10) || 0;
  if (!title || !chartMode || chartLevel <= 0) return '';
  return `${title}|${chartMode}|${chartLevel}`;
}

function parseDateMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\//g, '-');
  const direct = Date.parse(normalized.includes('T') ? normalized : normalized.replace(' ', 'T') + 'Z');
  if (!Number.isNaN(direct)) return direct;

  const ymd = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!ymd) return 0;
  const ms = Date.parse(`${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : ms;
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

function levelBadge(mode, level) {
  const isSingle = mode === 'Single';
  return (
    <span className={`inline-flex items-center justify-center rounded-full min-w-[36px] h-9 px-2 border text-white font-display font-black text-lg ${
      isSingle
        ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
        : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
    }`}>
      {level}
    </span>
  );
}

const JUDGMENT_COLORS = {
  PERFECT: 'text-sky-400',
  GREAT: 'text-green-400',
  GOOD: 'text-yellow-300',
  BAD: 'text-fuchsia-400',
  MISS: 'text-red-400',
};

function hasJudgments(row) {
  return (parseInt(row?.perfect, 10) || 0)
    + (parseInt(row?.great, 10) || 0)
    + (parseInt(row?.good, 10) || 0)
    + (parseInt(row?.bad, 10) || 0)
    + (parseInt(row?.miss, 10) || 0) > 0;
}

function JudgmentStrip({ row }) {
  if (!hasJudgments(row)) return null;

  const items = [
    { key: 'PERFECT', value: parseInt(row?.perfect, 10) || 0 },
    { key: 'GREAT', value: parseInt(row?.great, 10) || 0 },
    { key: 'GOOD', value: parseInt(row?.good, 10) || 0 },
    { key: 'BAD', value: parseInt(row?.bad, 10) || 0 },
    { key: 'MISS', value: parseInt(row?.miss, 10) || 0 },
  ];

  return (
    <div className="rounded-xl border border-piu-border/70 bg-black/65 px-2 py-1.5 mt-2">
      <div className="grid grid-cols-5 gap-1 text-center">
        {items.map((item) => (
          <div key={item.key}>
            <p className={`text-[10px] font-display font-bold ${JUDGMENT_COLORS[item.key]}`}>{item.key}</p>
            <p className="text-sm font-mono text-white leading-tight">{formatNumber(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryModal({ open, chart, rows, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">CLEAR HISTORY (Highest to Lowest)</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-3 space-y-3">
          {(rows || []).map((row, index) => {
            const rowGrade = row.grade || getRank(row.score).label;
            return (
              <div key={`${row.id}-${index}`} className="relative rounded-xl overflow-hidden border border-piu-border/60">
                {chart.jacket_url ? (
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${chart.jacket_url})` }} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#10253f] to-[#132b49]" />
                )}
                <div className="absolute inset-0 bg-black/58" />

                <div className="relative p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xl font-display font-black leading-tight truncate">{chart.title}</p>
                      <p className="text-sm text-gray-200">{row.date_played ? String(row.date_played).slice(0, 10) : '-'}</p>
                    </div>
                    {levelBadge(chart.mode, chart.level)}
                  </div>

                  <div className="flex items-center justify-between gap-3 mt-2">
                    <p className={`text-3xl font-display font-black ${row.is_stage_break ? 'text-red-400' : 'text-white'}`}>
                      {row.is_stage_break ? 'STAGE BREAK' : formatNumber(row.score)}
                    </p>
                    <div className="text-right">
                      <p className={`text-2xl font-display font-black ${getGradeColor(rowGrade, row.score)}`}>{rowGrade}</p>
                      <p className="text-xs font-mono text-piu-gold">R {formatNumber(row.rating || 0)}</p>
                    </div>
                  </div>

                  <JudgmentStrip row={row} />
                </div>
              </div>
            );
          })}

          {(rows || []).length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">No historical runs synced yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FriendJudgmentModal({ open, chart, entry, onClose }) {
  if (!open || !entry) return null;

  const grade = entry.grade || getRank(entry.score).label;

  return (
    <div className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">Friend Score Details</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="p-4">
          <div className="relative rounded-xl overflow-hidden border border-piu-border/60">
            {chart?.jacket_url ? (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${chart.jacket_url})` }} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#10253f] to-[#132b49]" />
            )}
            <div className="absolute inset-0 bg-black/58" />

            <div className="relative p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-display font-bold truncate">{entry.username}</p>
                  <p className="text-[11px] text-gray-300">{entry.date_played ? String(entry.date_played).slice(0, 10) : '-'}</p>
                </div>
                {levelBadge(chart?.mode, chart?.level)}
              </div>

              <div className="flex items-center justify-between gap-3 mt-2">
                <p className={`text-3xl font-display font-black ${entry.is_stage_break ? 'text-red-400' : 'text-white'}`}>
                  {entry.is_stage_break ? 'STAGE BREAK' : formatNumber(entry.score)}
                </p>
                <p className={`text-2xl font-display font-black ${getGradeColor(grade, entry.score)}`}>{grade}</p>
              </div>

              <JudgmentStrip row={entry} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SongChartPage() {
  const { chartId } = useParams();
  const { user } = useAuth();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedFriendRecord, setSelectedFriendRecord] = useState(null);

  // ── YouTube link state ──
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [youtubeInputValue, setYoutubeInputValue] = useState('');
  const [youtubeSaving, setYoutubeSaving] = useState(false);

  // ── Add-to-list state ──
  const [showListMenu, setShowListMenu] = useState(false);
  const [addedToast, setAddedToast] = useState('');
  const [userLists, setUserLists] = useState([]);
  const [inlineCreateName, setInlineCreateName] = useState('');
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const listMenuRef = useRef(null);

  useEffect(() => {
    function handleDocClick(e) {
      if (listMenuRef.current && !listMenuRef.current.contains(e.target)) {
        setShowListMenu(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // Fetch user's lists when the dropdown opens
  useEffect(() => {
    if (!showListMenu || !user) return;
    getUserLists().then(data => setUserLists(data.lists || [])).catch(() => {});
  }, [showListMenu, user]);

  const handleAddToList = async (listId, listName) => {
    const chart = detail?.chart;
    const personalBest = detail?.user_summary?.best || null;
    if (!chart) return;

    const currentScore = parseInt(personalBest?.score, 10) || 0;
    const currentGrade = gradeFromScore(currentScore);
    const hasPass = personalBest ? !personalBest.is_stage_break : false;

    let defaultTarget = 'PASS';
    if (hasPass && currentScore > 0) {
      const currentIdx = GRADE_THRESHOLDS.findIndex(g => g.grade === currentGrade);
      if (currentIdx >= 0 && currentIdx < GRADE_THRESHOLDS.length - 1) {
        defaultTarget = GRADE_THRESHOLDS[currentIdx + 1].grade;
      } else if (currentIdx === GRADE_THRESHOLDS.length - 1) {
        defaultTarget = currentGrade;
      }
    }

    try {
      await addListItem(listId, {
        chartId: chart.chart_id,
        songTitle: chart.title,
        artist: chart.artist || '',
        mode: chart.mode,
        level: chart.level,
        jacketUrl: chart.jacket_url || '',
        originalScore: currentScore,
        originalGrade: currentGrade,
        hadPass: hasPass,
        target: defaultTarget,
        addedAt: Date.now(),
      });
      setAddedToast(`Added to "${listName}"`);
    } catch (err) {
      setAddedToast(err.message === 'Chart already in list' ? 'Already in this list' : 'Failed to add');
    }
    setTimeout(() => setAddedToast(''), 2000);
    setShowListMenu(false);
  };

  const handleSaveYoutube = async () => {
    const url = youtubeInputValue.trim();
    if (!url || !detail?.chart) return;
    setYoutubeSaving(true);
    try {
      await setChartYoutubeLink(detail.chart.chart_id, url);
      setYoutubeUrl(url);
      setShowYoutubeInput(false);
      setYoutubeInputValue('');
    } catch {
      setAddedToast('Invalid YouTube URL');
      setTimeout(() => setAddedToast(''), 2000);
    } finally {
      setYoutubeSaving(false);
    }
  };

  const handleRemoveYoutube = async () => {
    if (!detail?.chart) return;
    setYoutubeSaving(true);
    try {
      await removeChartYoutubeLink(detail.chart.chart_id);
      setYoutubeUrl('');
    } catch { /* ignore */ } finally {
      setYoutubeSaving(false);
    }
  };

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
        setYoutubeUrl(payload.user_youtube_url || '');
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

  const rawProgression = useMemo(() => {
    if (!Array.isArray(detail?.progression)) return [];
    return detail.progression.map((row, index) => ({
      idx: index + 1,
      label: row.label || `Run ${index + 1}`,
      score: parseInt(row.score, 10) || 0,
      is_stage_break: !!row.is_stage_break,
      grade: row.grade || '',
      date_played: row.date_played || '',
    }));
  }, [detail?.progression]);

  const progression = useMemo(() => {
    const improvements = [];
    let bestScore = -1;

    for (const row of rawProgression) {
      if (row.is_stage_break) continue;
      if (row.score <= bestScore) continue;
      bestScore = row.score;
      improvements.push({
        ...row,
        i: improvements.length + 1,
      });
    }

    return improvements;
  }, [rawProgression]);

  const progressionDomain = useMemo(() => {
    if (progression.length === 0) return [0, 1000000];
    const scores = progression.map((row) => row.score).filter((value) => value > 0);
    if (scores.length === 0) return [0, 1000000];

    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    let domainMin = Math.max(0, Math.floor((minScore - 15000) / 5000) * 5000);
    let domainMax = Math.min(1000000, Math.ceil((maxScore + 15000) / 5000) * 5000);

    if (domainMax - domainMin < 30000) {
      const mid = Math.round((domainMin + domainMax) / 2);
      domainMin = Math.max(0, mid - 15000);
      domainMax = Math.min(1000000, mid + 15000);
    }
    return [domainMin, domainMax];
  }, [progression]);

  const historyByScore = useMemo(() => {
    if (!Array.isArray(detail?.history)) return [];
    return [...detail.history].sort((a, b) => {
      const scoreDiff = (parseInt(b.score, 10) || 0) - (parseInt(a.score, 10) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const dateDiff = parseDateMs(b.date_played) - parseDateMs(a.date_played);
      if (dateDiff !== 0) return dateDiff;
      return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
    });
  }, [detail?.history]);

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
  const personalBest = userSummary?.best || null;
  const personalBestGrade = personalBest?.grade || getRank(personalBest?.score).label;
  const overTop100Link = (() => {
    const level = parseInt(chart?.level, 10) || 0;
    if (level < 20) return '';
    const params = new URLSearchParams();
    params.set('tab', 'over20');
    params.set('level', String(level));
    params.set('song', String(chart?.title || ''));
    params.set('mode', String(chart?.mode || ''));
    const chartKey = buildOverRankingChartKeyForLink(chart?.title, chart?.mode, chart?.level);
    if (chartKey) params.set('chart_key', chartKey);
    return `/leaderboards?${params.toString()}`;
  })();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/songs" className="text-sm text-piu-accent hover:underline">Back to Songs</Link>
        {user && (
          <div ref={listMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowListMenu(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 border border-violet-200/30 text-white font-display font-bold text-xs tracking-wide shadow-lg shadow-violet-900/30 hover:brightness-110 transition-all whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add to List
            </button>
            {showListMenu && (
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-piu-border bg-[#0b1324] shadow-xl overflow-hidden">
                {userLists.map(list => {
                  const alreadyIn = (list.items || []).some(i => i.chartId === chart.chart_id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => !alreadyIn && handleAddToList(list.id, list.name)}
                      disabled={alreadyIn}
                      className={`w-full text-left px-3 py-2 text-sm font-display border-b border-piu-border/20 last:border-0 transition-colors ${
                        alreadyIn
                          ? 'text-gray-500 cursor-not-allowed'
                          : 'hover:bg-piu-dark/70 text-white'
                      }`}
                    >
                      <span className="truncate block">{list.name}</span>
                      {alreadyIn && <span className="text-[10px] text-gray-600">Already added</span>}
                    </button>
                  );
                })}
                {/* Inline create new list */}
                <div className="border-t border-piu-border/30 px-2 py-2">
                  {showInlineCreate ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={inlineCreateName}
                        onChange={e => setInlineCreateName(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && inlineCreateName.trim()) {
                            try {
                              const newList = await createList(inlineCreateName.trim());
                              setUserLists(prev => [...prev, { ...newList, items: newList.items || [] }]);
                              setInlineCreateName('');
                              setShowInlineCreate(false);
                              handleAddToList(newList.id, newList.name);
                            } catch { /* ignore */ }
                          }
                          if (e.key === 'Escape') { setShowInlineCreate(false); setInlineCreateName(''); }
                        }}
                        placeholder="List name..."
                        className="bg-piu-dark border border-piu-border rounded text-xs py-1 px-2 text-gray-200 focus:outline-none focus:border-violet-400/50 flex-1 min-w-0"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={!inlineCreateName.trim()}
                        onClick={async () => {
                          if (!inlineCreateName.trim()) return;
                          try {
                            const newList = await createList(inlineCreateName.trim());
                            setUserLists(prev => [...prev, { ...newList, items: newList.items || [] }]);
                            setInlineCreateName('');
                            setShowInlineCreate(false);
                            handleAddToList(newList.id, newList.name);
                          } catch { /* ignore */ }
                        }}
                        className="text-[11px] font-display font-bold text-violet-400 hover:text-violet-300 disabled:opacity-40 px-1"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowInlineCreate(true)}
                      className="w-full text-left text-xs font-display text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      New list
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {addedToast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-violet-600 text-white text-sm font-display px-4 py-2 shadow-lg animate-fade-in">
          {addedToast}
        </div>
      )}

      <section className="relative rounded-2xl overflow-hidden border border-piu-border/70 shadow-2xl">
        {chart.jacket_url ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${chart.jacket_url})` }} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#10253f] to-[#132b49]" />
        )}
        <div className="absolute inset-0 bg-black/55" />

        <div className="relative p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="overflow-x-auto">
                <h1 className="text-[clamp(0.95rem,4.4vw,2.75rem)] font-display font-black tracking-wide leading-tight whitespace-nowrap">
                  {chart.title}
                </h1>
              </div>
              <p className="text-sm text-gray-200 break-words whitespace-normal">{chart.artist || 'Unknown artist'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(chart.skills || []).map((skill) => (
                  <Link
                    key={skill.slug}
                    to={`/skill/${encodeURIComponent(skill.slug)}`}
                    className="inline-flex items-center px-2 py-1 rounded-full text-[11px] border border-emerald-300/45 bg-emerald-500/15 text-emerald-200 font-display font-bold hover:border-emerald-200/60 hover:bg-emerald-500/25 transition-colors"
                  >
                    {skill.name}
                  </Link>
                ))}
                {(chart.skills || []).length === 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] border border-piu-border/40 bg-piu-dark/55 text-gray-400">
                    No skills tagged yet
                  </span>
                )}
              </div>
            </div>
            {levelBadge(chart.mode, chart.level)}
          </div>

          <div className="mt-3">
            <p className={`text-4xl sm:text-5xl font-display font-black ${personalBest?.is_stage_break ? 'text-red-400' : 'text-white'}`}>
              {personalBest?.is_stage_break
                ? 'STAGE BREAK'
                : personalBest
                  ? formatNumber(personalBest.score)
                  : 'NO SCORE'}
            </p>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              <p className="text-lg sm:text-2xl text-gray-200">{personalBest?.date_played ? String(personalBest.date_played).slice(0, 10) : '-'}</p>
              {personalBest && (
                <p className={`text-2xl sm:text-3xl font-display font-black ${getGradeColor(personalBestGrade, personalBest.score)}`}>
                  {personalBestGrade}
                </p>
              )}
              {personalBest?.plate && (
                <p className="text-base sm:text-lg font-display font-bold text-gray-100 tracking-wide">{personalBest.plate}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
          <p className="text-[10px] text-gray-500">Rating</p>
          <p className="font-mono text-base text-piu-gold">{formatNumber(personalBest?.rating || 0)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2 text-left hover:border-emerald-400/40 transition-colors flex items-center flex-1"
          >
            <span className="inline-flex items-center justify-center rounded-md border border-emerald-300/45 bg-emerald-500/15 text-emerald-200 px-2 py-1 text-[11px] font-display font-bold w-fit">
              Clear History
            </span>
          </button>
          {user && (
            youtubeUrl ? (
              <div className="flex items-center gap-1">
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-400/40 bg-red-500/15 hover:bg-red-500/30 transition-colors"
                  title="Watch on YouTube"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={handleRemoveYoutube}
                  disabled={youtubeSaving}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-piu-border/50 bg-piu-dark/60 hover:border-red-400/40 hover:text-red-400 text-gray-500 transition-colors"
                  title="Remove YouTube link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setShowYoutubeInput(true); setYoutubeInputValue(''); }}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-piu-border/50 bg-piu-dark/60 hover:border-red-400/40 hover:text-red-400 text-gray-500 transition-colors"
                title="Add YouTube link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </button>
            )
          )}
        </div>
      </section>

      {overTop100Link && (
        <section className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2">
          <Link
            to={overTop100Link}
            className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 6v12M12 6v12M17 6v12" />
            </svg>
            View Top 100 Rankings For This Chart
          </Link>
        </section>
      )}

      {showYoutubeInput && (
        <section className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-3">
          <p className="text-[11px] font-display font-bold text-gray-400 mb-2">YouTube Link</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={youtubeInputValue}
              onChange={(e) => setYoutubeInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveYoutube(); if (e.key === 'Escape') setShowYoutubeInput(false); }}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 min-w-0 bg-black/40 border border-piu-border rounded-lg text-sm py-1.5 px-3 text-gray-200 focus:outline-none focus:border-red-400/50"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveYoutube}
              disabled={!youtubeInputValue.trim() || youtubeSaving}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/40 text-red-300 text-xs font-display font-bold hover:bg-red-500/30 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowYoutubeInput(false)}
              className="px-2 py-1.5 text-gray-500 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-display font-bold text-piu-accent">SCORE PROGRESSION</h2>
          <p className="text-[10px] text-gray-500">Improvement points only</p>
        </div>

        {progression.length > 0 ? (
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progression} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="i" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={progressionDomain} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px' }}
                  labelStyle={{ color: '#d1d5db' }}
                  formatter={(value, _name, ctx) => [formatNumber(value), ctx?.payload?.grade || 'Score']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return row?.label || `Improvement ${label}`;
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
          <p className="text-sm text-gray-500 py-4">No score improvements found yet.</p>
        )}
      </section>

      <section className="card">
        <h2 className="text-sm font-display font-bold text-piu-accent mb-3">FRIEND BESTS ON THIS CHART</h2>
        {(detail.friend_records || []).length > 0 ? (
          <div className="space-y-2">
            {detail.friend_records.map((entry) => {
              const grade = entry.best.grade || getRank(entry.best.score).label;
              return (
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
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      {hasJudgments(entry.best) ? (
                        <button
                          type="button"
                          onClick={() => setSelectedFriendRecord({
                            ...entry.best,
                            username: entry.user.username,
                          })}
                          className={`text-sm font-display font-bold ${entry.best.is_stage_break ? 'text-red-400' : 'text-white'} hover:text-piu-accent transition-colors`}
                          title="View judgment details"
                        >
                          {entry.best.is_stage_break ? 'STAGE BREAK' : formatNumber(entry.best.score)}
                        </button>
                      ) : (
                        <p className={`text-sm font-display font-bold ${entry.best.is_stage_break ? 'text-red-400' : 'text-white'}`}>
                          {entry.best.is_stage_break ? 'STAGE BREAK' : formatNumber(entry.best.score)}
                        </p>
                      )}
                      <p className={`text-xs font-display font-bold ${getGradeColor(grade, entry.best.score)}`}>{grade}</p>
                    </div>
                    {entry.youtube_url && (
                      <a
                        href={entry.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-red-400/30 bg-red-500/10 hover:bg-red-500/25 transition-colors"
                        title="Watch on YouTube"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No followed players have a record on this chart yet.</p>
        )}
      </section>

      <HistoryModal
        open={showHistoryModal}
        chart={chart}
        rows={historyByScore}
        onClose={() => setShowHistoryModal(false)}
      />

      <FriendJudgmentModal
        open={!!selectedFriendRecord}
        chart={chart}
        entry={selectedFriendRecord}
        onClose={() => setSelectedFriendRecord(null)}
      />
    </div>
  );
}
