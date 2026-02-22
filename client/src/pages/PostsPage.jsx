import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserPosts, createPost, deletePost, getPiugameRecentlyPlayed, getJacketMap, getPostDrafts, deletePostDraft } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import PostCard from '../components/PostCard';
import ImageEditor from '../components/ImageEditor';
import SessionSummaryCard from '../components/SessionSummaryCard';
import { calculateClearRating } from '../utils/clearRating';
import { serializeSessionSummaryMarker } from '../utils/sessionSummaryMarker';

// Common emoji sets for quick insert
const EMOJI_GROUPS = [
  { label: 'Faces', emojis: ['😀','😂','🤣','😊','😎','🤩','😍','🥳','🤔','😱','😤','😭','🙄','😴','🤮'] },
  { label: 'Hands', emojis: ['👍','👎','👏','🙌','💪','✌️','🤞','🤘','👊','✊','🫡','🫶'] },
  { label: 'PIU', emojis: ['🎵','🎶','🎤','🎮','🕹️','🏆','🥇','🥈','🥉','🔥','⭐','💥','💯','🚀','⚡'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖'] },
];

const SLASH_COMMANDS = {
  summary: {
    trigger: '/summary',
    buttonLabel: 'Generate session summary',
  },
};

const SUMMARY_SESSION_GAP_MS = 90 * 60 * 1000;
const SUMMARY_KCAL_PER_SONG = 18;
const SUMMARY_TOP_SONGS = 3;

function getRankLabel(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return 'SSS+';
  if (s >= 990000) return 'SSS';
  if (s >= 985000) return 'SS+';
  if (s >= 980000) return 'SS';
  if (s >= 975000) return 'S+';
  if (s >= 970000) return 'S';
  if (s >= 960000) return 'AAA+';
  if (s >= 950000) return 'AAA';
  if (s >= 925000) return 'AA+';
  if (s >= 900000) return 'AA';
  if (s >= 825000) return 'A+';
  if (s >= 750000) return 'A';
  if (s >= 650000) return 'B';
  if (s >= 550000) return 'C';
  if (s >= 450000) return 'D';
  return 'F';
}

function getGradeColorClass(grade) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS')) return 'text-piu-gold';
  if (normalized.includes('S')) return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-piu-silver';
  if (normalized.includes('AA')) return 'text-piu-bronze';
  if (normalized === 'A+' || normalized === 'A') return 'text-amber-500';
  if (normalized === 'B') return 'text-gray-300';
  if (normalized === 'C') return 'text-gray-400';
  if (normalized === 'D' || normalized === 'F') return 'text-gray-500';
  return 'text-gray-300';
}

function parsePlayedAt(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/[./]/g, '-');
  const ymd = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
  );
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const hh = parseInt(ymd[4] || '0', 10);
    const mm = parseInt(ymd[5] || '0', 10);
    const ss = parseInt(ymd[6] || '0', 10);
    return new Date(y, m, d, hh, mm, ss);
  }

  const ymdLoose = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdLoose) {
    const y = parseInt(ymdLoose[1], 10);
    const m = parseInt(ymdLoose[2], 10) - 1;
    const d = parseInt(ymdLoose[3], 10);
    const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))(?::(\d{2}))?\s*([APap][Mm])?/);
    let hh = parseInt(timeMatch?.[1] || '0', 10);
    const mm = parseInt(timeMatch?.[2] || '0', 10);
    const ss = parseInt(timeMatch?.[3] || '0', 10);
    const meridiem = String(timeMatch?.[4] || '').toUpperCase();
    if (meridiem === 'PM' && hh < 12) hh += 12;
    if (meridiem === 'AM' && hh === 12) hh = 0;
    return new Date(y, m, d, hh, mm, ss);
  }

  const md = normalized.match(/^(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (md) {
    const year = new Date().getFullYear();
    const m = parseInt(md[1], 10) - 1;
    const d = parseInt(md[2], 10);
    const hh = parseInt(md[3] || '0', 10);
    const mm = parseInt(md[4] || '0', 10);
    return new Date(year, m, d, hh, mm, 0);
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parsePlayDayKey(value) {
  const parsed = parsePlayedAt(value);
  if (parsed) return toDayKey(parsed);

  const fallback = String(value || '').trim().replace(/[./]/g, '-');
  const m = fallback.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSlashCommand(text, trigger) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(trigger)}\\b`, 'i');
  return pattern.test(String(text || ''));
}

function stripSlashCommand(text, trigger) {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(trigger)}\\b`, 'gi');
  return String(text || '')
    .replace(pattern, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sortRecentPlays(plays) {
  const rows = Array.isArray(plays) ? plays : [];
  return rows
    .map((play, index) => {
      const parsedAt = parsePlayedAt(play?.date_played);
      return {
        ...play,
        _index: index,
        _playedAt: parsedAt,
        _playedAtMs: parsedAt ? parsedAt.getTime() : null,
        _dayKey: parsedAt ? toDayKey(parsedAt) : parsePlayDayKey(play?.date_played),
      };
    })
    .sort((a, b) => {
      if (a._playedAtMs !== null && b._playedAtMs !== null && a._playedAtMs !== b._playedAtMs) {
        return b._playedAtMs - a._playedAtMs;
      }
      if (a._playedAtMs !== null) return -1;
      if (b._playedAtMs !== null) return 1;
      return b._index - a._index;
    });
}

function getMostRecentSession(sortedRows) {
  if (!Array.isArray(sortedRows) || sortedRows.length === 0) return [];
  const session = [sortedRows[0]];
  const sessionDayKey = sortedRows[0]._dayKey;

  for (let i = 1; i < sortedRows.length; i++) {
    const prev = session[session.length - 1];
    const current = sortedRows[i];

    if (prev._playedAtMs !== null && current._playedAtMs !== null) {
      const gap = prev._playedAtMs - current._playedAtMs;
      if (gap <= SUMMARY_SESSION_GAP_MS) {
        session.push(current);
        continue;
      }
      break;
    }

    if (sessionDayKey && current._dayKey === sessionDayKey) {
      session.push(current);
      continue;
    }
    break;
  }

  return session;
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatDurationLabel(totalMinutes) {
  const minutes = Math.max(0, parseInt(totalMinutes, 10) || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
}

function normalizeSongKey(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getJacketForPlay(play, jacketLookup) {
  const norm = normalizeSongKey(play?.song_title);
  const exactKey = `${norm}|${play?.mode || ''}|${play?.level || ''}`;
  return jacketLookup?.[exactKey] || jacketLookup?.[norm] || '';
}

function toScore(play) {
  return parseInt(play?.score, 10) || 0;
}

function toLevel(play) {
  return parseInt(play?.level, 10) || 0;
}

function getPlayRating(play) {
  return calculateClearRating(play?.level, play?.grade, play?.score);
}

function buildSessionSummary(sessionRows, jacketLookup = {}) {
  if (!Array.isArray(sessionRows) || sessionRows.length === 0) return null;

  const enrichedRows = sessionRows.map((play) => {
    const score = toScore(play);
    const level = toLevel(play);
    const rating = getPlayRating(play);
    return {
      ...play,
      _score: score,
      _level: level,
      _rating: rating,
      _jacketUrl: getJacketForPlay(play, jacketLookup),
      _grade: play?.grade || getRankLabel(score),
    };
  });

  let singleCount = 0;
  let doubleCount = 0;
  let otherCount = 0;
  let stageBreakCount = 0;
  let scoredCount = 0;
  let scoreTotal = 0;
  let levelCount = 0;
  let levelTotal = 0;
  let totalSteps = 0;
  let judgedSongCount = 0;

  const judgmentTotals = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

  for (const play of enrichedRows) {
    if (play.mode === 'Single') singleCount += 1;
    else if (play.mode === 'Double') doubleCount += 1;
    else otherCount += 1;

    const score = play._score;
    if (score > 0) {
      scoredCount += 1;
      scoreTotal += score;
    } else {
      stageBreakCount += 1;
    }

    const level = play._level;
    if (level > 0) {
      levelCount += 1;
      levelTotal += level;
    }

    const perfect = parseInt(play.perfect, 10) || 0;
    const great = parseInt(play.great, 10) || 0;
    const good = parseInt(play.good, 10) || 0;
    const bad = parseInt(play.bad, 10) || 0;
    const miss = parseInt(play.miss, 10) || 0;
    const steps = perfect + great + good + bad + miss;
    if (steps > 0) judgedSongCount += 1;
    totalSteps += steps;
    judgmentTotals.perfect += perfect;
    judgmentTotals.great += great;
    judgmentTotals.good += good;
    judgmentTotals.bad += bad;
    judgmentTotals.miss += miss;
  }

  const songCount = enrichedRows.length;
  const clearCount = songCount - stageBreakCount;
  const clearRate = songCount > 0 ? Math.round((clearCount / songCount) * 100) : 0;
  const averageScore = scoredCount > 0 ? Math.round(scoreTotal / scoredCount) : 0;
  const averageLevel = levelCount > 0 ? (levelTotal / levelCount) : 0;
  const estimatedKcal = songCount * SUMMARY_KCAL_PER_SONG;
  const perfectRate = totalSteps > 0 ? Math.round((judgmentTotals.perfect / totalSteps) * 100) : 0;

  const sortedByScore = [...enrichedRows]
    .sort((a, b) => b._score - a._score);
  const topSongsByScore = sortedByScore.filter(play => play._score > 0).slice(0, SUMMARY_TOP_SONGS);
  const topSongsByRating = [...enrichedRows]
    .filter(play => play._score > 0)
    .sort((a, b) => {
      if (b._rating !== a._rating) return b._rating - a._rating;
      return b._score - a._score;
    })
    .slice(0, SUMMARY_TOP_SONGS);
  const bestPlay = topSongsByScore[0] || null;

  const newest = enrichedRows[0]?._playedAt || parsePlayedAt(enrichedRows[0]?.date_played);
  const oldest = enrichedRows[enrichedRows.length - 1]?._playedAt || parsePlayedAt(enrichedRows[enrichedRows.length - 1]?.date_played);
  const sessionDateLabel = newest
    ? newest.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Recent session';
  const sessionTimeRange = newest && oldest
    ? `${oldest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${newest.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  const sessionDurationMinutes = newest && oldest
    ? Math.max(0, Math.round((newest.getTime() - oldest.getTime()) / 60000))
    : 0;
  const sessionDurationLabel = formatDurationLabel(sessionDurationMinutes);
  const sessionMachineName = enrichedRows
    .map((play) => String(play?.machine_name || '').trim())
    .find(Boolean) || '';

  const modeTotal = Math.max(1, singleCount + doubleCount + otherCount);
  const singlePct = Math.round((singleCount / modeTotal) * 100);
  const doublePct = Math.round((doubleCount / modeTotal) * 100);
  const otherPct = Math.max(0, 100 - singlePct - doublePct);
  const judgmentCoverageLabel = judgedSongCount < songCount
    ? ` (${judgedSongCount}/${songCount} songs with data)`
    : '';

  const postLines = [
    '📊 **Session Summary**',
    `🗓️ ${sessionDateLabel}${sessionTimeRange ? ` • ${sessionTimeRange}` : ''}${sessionDurationLabel ? ` • ${sessionDurationLabel}` : ''}`,
    sessionMachineName ? `🕹️ Machine: **${sessionMachineName}**` : '',
    `🎵 **${songCount} songs** | 🏁 Clears: **${clearCount}/${songCount}** (${clearRate}%)`,
    `🦶 Judged steps: **${totalSteps.toLocaleString()}**${judgmentCoverageLabel}`,
    `🔥 Estimated calories: **~${estimatedKcal.toLocaleString()} kcal**`,
    '',
    `🎛️ Mode split: S ${singleCount} | D ${doubleCount}${otherCount > 0 ? ` | X ${otherCount}` : ''}`,
    averageLevel > 0 ? `📈 Avg level: **Lv.${averageLevel.toFixed(1)}**` : '',
    averageScore > 0 ? `🎯 Avg score: **${averageScore.toLocaleString()}**` : '',
    bestPlay
      ? `🏆 Best chart: **${bestPlay.song_title}** (${modeShort(bestPlay.mode)}${bestPlay.level || '?'}) • ${(bestPlay.grade || getRankLabel(bestPlay._score))} ${formatNumber(bestPlay._score)}`
      : '',
    '',
    `🧮 Judgment totals: P ${judgmentTotals.perfect.toLocaleString()} | G ${judgmentTotals.great.toLocaleString()} | Good ${judgmentTotals.good.toLocaleString()} | Bad ${judgmentTotals.bad.toLocaleString()} | Miss ${judgmentTotals.miss.toLocaleString()} | ${perfectRate}% Perfects!`,
    '',
    '🏆 Top 3 by score:',
    ...(topSongsByScore.length > 0
      ? topSongsByScore.map((play, idx) => `${idx + 1}. ${play.song_title} | ${modeShort(play.mode)}${play.level || '?'} | ${play._grade} ${formatNumber(play._score)}`)
      : ['No scored songs in this session']),
    '',
    '⭐ Top 3 by rating:',
    ...(topSongsByRating.length > 0
      ? topSongsByRating.map((play, idx) => `${idx + 1}. ${play.song_title} | ${modeShort(play.mode)}${play.level || '?'} | Rating ${formatNumber(play._rating)}`)
      : ['No rated songs in this session']),
  ].filter(Boolean);

  return {
    songCount,
    clearCount,
    clearRate,
    totalSteps,
    estimatedKcal,
    singleCount,
    doubleCount,
    otherCount,
    singlePct,
    doublePct,
    otherPct,
    averageScore,
    averageLevel,
    judgedSongCount,
    judgmentTotals,
    perfectRate,
    topSongsByScore,
    topSongsByRating,
    sessionDateLabel,
    sessionTimeRange,
    sessionDurationMinutes,
    sessionDurationLabel,
    sessionMachineName,
    postText: postLines.join('\n'),
  };
}

function SummaryStat({ label, value, subvalue = '' }) {
  return (
    <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
      <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">{label}</p>
      <p className="text-sm font-display font-bold text-gray-100">{value}</p>
      {subvalue ? (
        <p className="text-[10px] text-gray-500 mt-0.5">{subvalue}</p>
      ) : null}
    </div>
  );
}

function SummarySongJacket({ play }) {
  const isSingle = play?.mode === 'Single';
  const isDouble = play?.mode === 'Double';
  const badgeColor = isSingle ? 'bg-red-600' : isDouble ? 'bg-green-600' : 'bg-blue-600';
  const level = play?._level || play?.level || '?';

  return (
    <div className="relative shrink-0">
      {play?._jacketUrl ? (
        <img src={play._jacketUrl} alt="" className="w-12 h-12 rounded object-cover border border-piu-border/50" />
      ) : (
        <div className="w-12 h-12 rounded bg-piu-dark border border-piu-border/50 flex items-center justify-center font-display font-bold text-sm text-gray-500">
          {(play?.song_title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 min-w-[18px] h-[16px] px-1 rounded text-[9px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </div>
  );
}

function SummarySongTable({ title, rows, type }) {
  return (
    <div className="rounded-lg border border-piu-border/40 bg-piu-dark/35 overflow-hidden">
      <div className="px-3 py-2 border-b border-piu-border/30 bg-piu-dark/40">
        <p className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-500">No scored songs in this session.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-500 border-b border-piu-border/25">
              <th className="text-left px-2 py-1 font-display font-bold w-6">#</th>
              <th className="text-left px-2 py-1 font-display font-bold">Song</th>
              {type === 'score' ? (
                <>
                  <th className="text-right px-2 py-1 font-display font-bold">Score</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Grade</th>
                </>
              ) : (
                <>
                  <th className="text-right px-2 py-1 font-display font-bold">Rating</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Score</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((play, idx) => (
              <tr key={`${type}-${idx}-${play.song_title}-${play.mode}-${play.level}`} className="border-b border-piu-border/20 last:border-0">
                <td className="px-2 py-1.5 text-gray-400 font-mono align-top">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-start gap-2">
                    <SummarySongJacket play={play} />
                    <div className="min-w-0">
                      <p className="text-gray-200 font-display font-bold truncate max-w-[170px]">{play.song_title}</p>
                      <p className="text-[10px] text-gray-500">{modeShort(play.mode)}{play._level || play.level || '?'}</p>
                    </div>
                  </div>
                </td>
                {type === 'score' ? (
                  <>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(play._score)}</td>
                    <td className={`px-2 py-1.5 text-right font-display font-bold ${getGradeColorClass(play._grade)}`}>{play._grade}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1.5 text-right font-mono text-cyan-300">{play._rating.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(play._score)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PostComposer({ onPost }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [summaryPreview, setSummaryPreview] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);
  const summaryCommand = SLASH_COMMANDS.summary;
  const hasSummaryCommand = hasSlashCommand(content, summaryCommand.trigger);
  const sanitizedContent = stripSlashCommand(content, summaryCommand.trigger);
  const canSubmit = !!(sanitizedContent.trim() || images.length > 0 || youtubeUrl.trim() || summaryPreview);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files).slice(0, 9 - images.length);
    const newImages = [...images, ...files].slice(0, 9);
    setImages(newImages);

    // Generate previews
    const newPreviews = [];
    for (const f of newImages) {
      newPreviews.push(URL.createObjectURL(f));
    }
    // Clean up old previews
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newPreviews);
  };

  const removeImage = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    setImages(imgs => imgs.filter((_, i) => i !== idx));
    setPreviews(prevs => prevs.filter((_, i) => i !== idx));
  };

  const insertEmoji = (emoji) => {
    const textarea = textRef.current;
    if (!textarea) {
      setContent(c => c + emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + emoji + content.slice(end);
    setContent(newContent);
    // Move cursor after emoji
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }, 0);
  };

  const applyFormat = (prefix, suffix) => {
    const textarea = textRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
      textarea.focus();
    }, 0);
  };

  const handleGenerateSummary = async () => {
    if (!user?.id || summaryLoading) return;
    setSummaryError('');
    setSummaryLoading(true);
    try {
      const [data, jacketLookup] = await Promise.all([
        getPiugameRecentlyPlayed(user.id),
        getJacketMap().catch(() => ({})),
      ]);
      const sortedRows = sortRecentPlays(data?.plays || []);
      const sessionRows = getMostRecentSession(sortedRows);
      if (sessionRows.length === 0) {
        throw new Error('No recently played data found. Sync recently played first.');
      }
      const summary = buildSessionSummary(sessionRows, jacketLookup || {});
      if (!summary) {
        throw new Error('Failed to build session summary from recently played data.');
      }
      setSummaryPreview(summary);
      setContent(prev => stripSlashCommand(prev, summaryCommand.trigger));
    } catch (err) {
      setSummaryError(err.message || 'Failed to generate session summary.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSubmit = async () => {
    const summaryMarker = summaryPreview ? serializeSessionSummaryMarker(summaryPreview) : '';
    const finalText = [sanitizedContent.trim(), summaryMarker].filter(Boolean).join('\n\n');
    if (!finalText && images.length === 0 && !youtubeUrl.trim()) return;

    setPosting(true);
    try {
      const post = await createPost(finalText, images, youtubeUrl.trim() || undefined, commentsDisabled || undefined);
      setContent('');
      setImages([]);
      previews.forEach(p => URL.revokeObjectURL(p));
      setPreviews([]);
      setYoutubeUrl('');
      setShowYoutubeInput(false);
      setCommentsDisabled(false);
      setSummaryPreview(null);
      setSummaryError('');
      onPost(post);
    } catch (err) {
      alert(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="card mb-6">
      <div className="flex items-start gap-3 mb-3">
        {user.avatar ? (
          <img src={getAvatarUrl(user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm shrink-0">
            {user.username[0].toUpperCase()}
          </div>
        )}
        <textarea
          ref={textRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What's on your mind? Try /summary"
          className="input-field flex-1 resize-none min-h-[80px]"
          rows={3}
        />
      </div>

      {hasSummaryCommand && !summaryPreview && (
        <div className="mb-3 rounded-lg border border-piu-accent/30 bg-piu-accent/10 p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-display font-bold text-piu-accent">{summaryCommand.trigger} command detected</p>
            <p className="text-[11px] text-gray-400">Build a post-ready recap from your most recent recently-played session.</p>
          </div>
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading}
            className="btn-primary px-3 py-1.5 text-[11px] disabled:opacity-50"
          >
            {summaryLoading ? 'Generating...' : summaryCommand.buttonLabel}
          </button>
        </div>
      )}

      {summaryPreview && (
        <SessionSummaryCard
          summary={summaryPreview}
          title="Session Summary Preview"
          className="mb-3"
          actions={(
            <>
              <button
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
                className="px-2 py-1 rounded border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 text-[10px] font-display font-bold disabled:opacity-50"
              >
                {summaryLoading ? 'Generating...' : 'Regenerate'}
              </button>
              <button
                onClick={() => { setSummaryPreview(null); setSummaryError(''); }}
                className="px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10 text-[10px] font-display font-bold"
              >
                Remove
              </button>
            </>
          )}
        />
      )}

      {summaryError && (
        <p className="text-xs text-red-400 mb-3">{summaryError}</p>
      )}

      {/* YouTube URL input */}
      {showYoutubeInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            className="input-field text-xs py-1.5 flex-1"
            placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
          />
          <button onClick={() => { setShowYoutubeInput(false); setYoutubeUrl(''); }} className="text-gray-500 hover:text-red-400 text-xs">&#10005;</button>
        </div>
      )}

      {/* Image previews — WeChat grid style */}
      {previews.length > 0 && (
        <div className={`grid gap-1.5 mb-3 ${previews.length === 1 ? 'grid-cols-1 max-w-[120px]' : previews.length <= 4 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-3 max-w-[280px]'}`}>
          {previews.map((src, i) => (
            <div key={i} className="relative group">
              <img src={src} alt="" className="w-full aspect-square rounded-lg object-cover" />
              <button
                onClick={() => setEditingIndex(i)}
                className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80 transition-colors"
                title="Edit image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image Editor Modal */}
      {editingIndex !== null && images[editingIndex] && (
        <ImageEditor
          file={images[editingIndex]}
          onDone={(editedFile) => {
            const newImages = [...images];
            newImages[editingIndex] = editedFile;
            setImages(newImages);
            // Regenerate previews
            const newPreviews = newImages.map(f => URL.createObjectURL(f));
            previews.forEach(p => URL.revokeObjectURL(p));
            setPreviews(newPreviews);
            setEditingIndex(null);
          }}
          onCancel={() => setEditingIndex(null)}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between border-t border-piu-border/30 pt-2">
        <div className="flex items-center gap-1">
          {/* Bold */}
          <button
            onClick={() => applyFormat('**', '**')}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm font-bold"
            title="Bold"
          >
            B
          </button>
          {/* Italic */}
          <button
            onClick={() => applyFormat('*', '*')}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm italic"
            title="Italic"
          >
            I
          </button>
          {/* Strikethrough */}
          <button
            onClick={() => applyFormat('~~', '~~')}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm line-through"
            title="Strikethrough"
          >
            S
          </button>

          <div className="w-px h-5 bg-piu-border/30 mx-1" />

          {/* Emoji picker */}
          <div className="relative" ref={emojiRef}>
            <button
              onClick={() => setShowEmojis(!showEmojis)}
              className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-[18px] leading-none"
              title="Emoji"
            >
              &#9786;
            </button>
            {showEmojis && (
              <div className="absolute left-0 top-full mt-1 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 p-3 w-72">
                {EMOJI_GROUPS.map(group => (
                  <div key={group.label} className="mb-2">
                    <p className="text-[10px] text-gray-500 font-display mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => insertEmoji(e)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors text-base"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image upload */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors"
            title="Attach images (max 9)"
            disabled={images.length >= 9}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* YouTube link */}
          <button
            onClick={() => setShowYoutubeInput(!showYoutubeInput)}
            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors ${showYoutubeInput || youtubeUrl ? 'text-red-400' : 'text-gray-400 hover:text-white'}`}
            title="Attach YouTube video"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
            </svg>
          </button>

          <div className="w-px h-5 bg-piu-border/30 mx-1" />

          {/* Disable comments toggle */}
          <button
            onClick={() => setCommentsDisabled(!commentsDisabled)}
            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors ${commentsDisabled ? 'text-red-400' : 'text-gray-400 hover:text-white'}`}
            title={commentsDisabled ? 'Comments disabled' : 'Disable comments'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={commentsDisabled
                ? "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                : "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              } />
            </svg>
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={posting || !canSubmit}
          className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {posting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

export default function PostsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getUserPosts(user.id, 1),
      getPostDrafts().catch(() => []),
    ]).then(([postData, draftData]) => {
      setPosts(postData);
      setHasMore(postData.length >= 20);
      setDrafts(draftData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const handleNewPost = (post) => {
    setPosts(prev => [{ ...post, username: user.username, avatar: user.avatar }, ...prev]);
  };

  const handleUseDraft = (draft) => {
    // Copy draft content to clipboard or directly load into composer via a prompt
    navigator.clipboard?.writeText(draft.content).catch(() => {});
    alert('Draft content copied to clipboard! Paste it into the composer above.');
  };

  const handleDeleteDraft = async (id) => {
    setDeletingDraftId(id);
    try {
      await deletePostDraft(id);
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingDraftId(null);
    }
  };

  const handleDelete = (id) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      await deletePost(confirmDeleteId);
      setPosts(prev => prev.filter(p => p.id !== confirmDeleteId));
      setConfirmDeleteId(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const loadMore = async () => {
    const nextPage = page + 1;
    const data = await getUserPosts(user.id, nextPage);
    setPosts(prev => [...prev, ...data]);
    setPage(nextPage);
    setHasMore(data.length >= 20);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="font-display font-bold text-xl mb-4">Posts</h2>
        <p className="text-gray-400 mb-4">Log in to create and view your posts.</p>
        <Link to="/login" className="btn-primary inline-block">Login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-xl">My Posts</h2>
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-piu-accent/30 bg-piu-accent/10 text-xs font-display font-bold text-piu-accent hover:bg-piu-accent hover:text-white transition-colors"
        >
          Activity Feed
        </Link>
      </div>

      <PostComposer onPost={handleNewPost} />

      {/* Drafts section */}
      {drafts.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="flex items-center gap-2 text-sm font-display font-bold text-gray-400 hover:text-gray-200 transition-colors mb-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${showDrafts ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Drafts ({drafts.length})
          </button>
          {showDrafts && (
            <div className="space-y-2">
              {drafts.map(draft => (
                <div key={draft.id} className="rounded-lg border border-piu-border/40 bg-piu-dark/30 p-3">
                  <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-4">{draft.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-gray-500">
                      {new Date(draft.updated_at || draft.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUseDraft(draft)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-display font-bold border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(draft.id)}
                        disabled={deletingDraftId === draft.id}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-display font-bold border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {deletingDraftId === draft.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No posts yet</p>
          <p className="text-gray-500 text-sm">Create your first post above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              showAuthor={true}
              onDelete={handleDelete}
              isOwner={true}
            />
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-sm text-piu-accent hover:text-white font-display font-bold transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !deletingId && setConfirmDeleteId(null)}
        >
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg text-red-400 mb-2">Delete post?</h3>
            <p className="text-sm text-gray-300">
              This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={!!deletingId}
                className="px-3 py-1.5 text-xs font-display font-bold rounded-lg border border-piu-border text-gray-300 hover:text-white hover:bg-piu-dark/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="px-3 py-1.5 text-xs font-display font-bold rounded-lg bg-red-500/90 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deletingId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
