import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';
import CommunityBadge from '../components/CommunityBadge';
import { CommunityTagList } from '../components/CommunityTag';
import {
  getCommunityByName, joinCommunity, leaveCommunity,
  getCommunityPosts, createCommunityPost, deleteCommunityPost, pinCommunityPost,
  pumpCommunityPost, getCommunityPostComments, addCommunityPostComment, deleteCommunityPostComment,
  getCommunityMembers, searchCommunityMentions, getPiugameRecentlyPlayed, getJacketMap,
} from '../utils/api';

function timeAgo(dateStr) {
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getActiveMentionQuery(text, cursor) {
  const value = String(text || '');
  const pos = Number.isFinite(cursor) ? cursor : value.length;
  const before = value.slice(0, pos);
  const match = before.match(/(^|[\s(])@([A-Za-z0-9_]{1,30})$/);
  if (!match) return null;
  return {
    query: match[2],
    start: pos - match[2].length - 1,
    end: pos,
  };
}

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
  const scoreRatio = Math.max(0, Math.min(1, toScore(play) / 1000000));
  const levelRatio = Math.max(0, Math.min(1, toLevel(play) / 28));
  const perfect = parseInt(play?.perfect, 10) || 0;
  const great = parseInt(play?.great, 10) || 0;
  const good = parseInt(play?.good, 10) || 0;
  const bad = parseInt(play?.bad, 10) || 0;
  const miss = parseInt(play?.miss, 10) || 0;
  const steps = perfect + great + good + bad + miss;
  const accuracyRatio = steps > 0
    ? (perfect + great * 0.7 + good * 0.4 + bad * 0.1) / steps
    : scoreRatio;
  return (accuracyRatio * 0.65 + scoreRatio * 0.2 + levelRatio * 0.15) * 100;
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

  const modeTotal = Math.max(1, singleCount + doubleCount + otherCount);
  const singlePct = Math.round((singleCount / modeTotal) * 100);
  const doublePct = Math.round((doubleCount / modeTotal) * 100);
  const otherPct = Math.max(0, 100 - singlePct - doublePct);
  const judgmentCoverageLabel = judgedSongCount < songCount
    ? ` (${judgedSongCount}/${songCount} songs with data)`
    : '';

  const postLines = [
    '📊 **Session Summary**',
    `🗓️ ${sessionDateLabel}${sessionTimeRange ? ` • ${sessionTimeRange}` : ''}`,
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
      ? topSongsByRating.map((play, idx) => `${idx + 1}. ${play.song_title} | ${modeShort(play.mode)}${play.level || '?'} | Rating ${play._rating.toFixed(2)}`)
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

export default function CommunityPage() {
  const { communityName } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [postSort, setPostSort] = useState('new');
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSort, setMemberSort] = useState('joined');
  const [postsLoading, setPostsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  // Post composer state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImages, setNewPostImages] = useState([]);
  const [newPostYoutube, setNewPostYoutube] = useState('');
  const [posting, setPosting] = useState(false);
  const [postSummaryPreview, setPostSummaryPreview] = useState(null);
  const [postSummaryLoading, setPostSummaryLoading] = useState(false);
  const [postSummaryError, setPostSummaryError] = useState('');

  // Comment state
  const [expandedComments, setExpandedComments] = useState({});
  const [commentTexts, setCommentTexts] = useState({});
  const [replyTo, setReplyTo] = useState({});

  const loadCommunity = useCallback(async () => {
    setPosts([]);
    setMembers([]);
    setExpandedComments({});
    setLoading(true);
    try {
      const data = await getCommunityByName(communityName);
      setCommunity(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [communityName]);

  const loadPosts = useCallback(async () => {
    if (!community) return;
    setPostsLoading(true);
    try {
      const data = await getCommunityPosts(community.id, { sort: postSort });
      setPosts(data);
    } catch (err) {
      console.error(err);
      setPosts([]);
    }
    finally { setPostsLoading(false); }
  }, [community, postSort]);

  const loadMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const data = await getCommunityMembers(community.id, memberSort);
      setMembers(data);
    } catch (err) {
      console.error(err);
      setMembers([]);
    }
    finally { setMembersLoading(false); }
  }, [community, memberSort]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);
  useEffect(() => { if (community && activeTab === 'posts') loadPosts(); }, [community, activeTab, postSort, loadPosts]);
  useEffect(() => { if (community && activeTab === 'members') loadMembers(); }, [community, activeTab, memberSort, loadMembers]);

  const handleJoin = async () => {
    if (!user) return navigate('/login');
    setJoining(true);
    try {
      const result = await joinCommunity(community.id);
      if (result.status === 'pending') {
        setCommunity(prev => ({ ...prev, user_pending_request: true }));
      } else {
        setCommunity(prev => ({ ...prev, user_role: 'member', member_count: prev.member_count + 1 }));
      }
    } catch (err) { setError(err.message); }
    finally { setJoining(false); }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this community?')) return;
    try {
      await leaveCommunity(community.id);
      setCommunity(prev => ({ ...prev, user_role: null, member_count: prev.member_count - 1 }));
    } catch (err) { setError(err.message); }
  };

  const handleGeneratePostSummary = async () => {
    if (!user?.id || postSummaryLoading) return;
    setPostSummaryError('');
    setPostSummaryLoading(true);
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
      setPostSummaryPreview(summary);
      setNewPostContent(prev => stripSlashCommand(prev, SLASH_COMMANDS.summary.trigger));
    } catch (err) {
      setPostSummaryError(err.message || 'Failed to generate session summary.');
    } finally {
      setPostSummaryLoading(false);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    const sanitizedContent = stripSlashCommand(newPostContent, SLASH_COMMANDS.summary.trigger);
    const finalContent = postSummaryPreview
      ? [sanitizedContent.trim(), postSummaryPreview.postText].filter(Boolean).join('\n\n')
      : sanitizedContent.trim();
    if (!finalContent && newPostImages.length === 0 && !newPostYoutube) return;
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('content', finalContent);
      if (newPostYoutube) formData.append('youtube_url', newPostYoutube);
      for (const f of newPostImages) formData.append('images', f);
      const post = await createCommunityPost(community.id, formData);
      setPosts(prev => [post, ...prev]);
      setNewPostContent('');
      setNewPostImages([]);
      setNewPostYoutube('');
      setPostSummaryPreview(null);
      setPostSummaryError('');
    } catch (err) { setError(err.message); }
    finally { setPosting(false); }
  };

  const handleDeletePost = async (postId) => {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteCommunityPost(community.id, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) { setError(err.message); }
  };

  const handlePinPost = async (postId) => {
    try {
      const result = await pinCommunityPost(community.id, postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: result.pinned ? 1 : 0 } : p));
    } catch (err) { setError(err.message); }
  };

  const handlePumpPost = async (postId) => {
    try {
      const result = await pumpCommunityPost(community.id, postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_pumped: result.pumped, pump_count: result.pump_count } : p));
    } catch (err) { console.error(err); }
  };

  const toggleComments = async (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments(prev => ({ ...prev, [postId]: null }));
      return;
    }
    try {
      const comments = await getCommunityPostComments(community.id, postId);
      setExpandedComments(prev => ({ ...prev, [postId]: comments }));
    } catch (err) { console.error(err); }
  };

  const handleAddComment = async (postId, parentId) => {
    const key = parentId || postId;
    const content = commentTexts[key];
    if (!content?.trim()) return;
    try {
      const comment = await addCommunityPostComment(community.id, postId, content.trim(), parentId);
      setExpandedComments(prev => ({
        ...prev,
        [postId]: [...(prev[postId] || []), comment],
      }));
      setCommentTexts(prev => ({ ...prev, [key]: '' }));
      setReplyTo(prev => ({ ...prev, [postId]: null }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
    } catch (err) { setError(err.message); }
  };

  const handleDeleteComment = async (postId, commentId) => {
    try {
      await deleteCommunityPostComment(community.id, postId, commentId);
      setExpandedComments(prev => ({
        ...prev,
        [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count || 0) - 1) } : p));
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-400 text-lg font-display">{error || 'Community not found'}</p>
        <Link to="/" className="text-piu-accent hover:underline text-sm mt-4 inline-block">Go home</Link>
      </div>
    );
  }

  const isMember = !!community.user_role;
  const isModOrOwner = community.user_role === 'owner' || community.user_role === 'moderator';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Banner */}
      <div className="relative w-full h-36 sm:h-48 overflow-hidden bg-gradient-to-r from-piu-dark via-piu-card to-piu-dark">
        {community.banner && (
          <img src={community.banner} alt="" className="w-full h-full object-cover opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-piu-dark/90 via-transparent to-transparent" />
      </div>

      {/* Community Header */}
      <div className="px-4 sm:px-6 -mt-10 relative z-10">
        <div className="flex items-end gap-4">
          {/* Avatar */}
          {community.avatar ? (
            <img src={community.avatar.startsWith('data:') ? community.avatar : getAvatarUrl(community.avatar)} alt="" className="w-20 h-20 rounded-xl object-cover border-4 border-piu-dark shadow-lg" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-piu-accent to-purple-700 border-4 border-piu-dark shadow-lg flex items-center justify-center">
              <span className="font-display font-bold text-2xl text-white">{community.display_name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-xl sm:text-2xl tracking-wide truncate">{community.display_name}</h1>
              {community.badge_text && (
                <CommunityBadge text={community.badge_text} bgColor={community.badge_color} textColor={community.badge_text_color} />
              )}
              {community.is_invite_only ? (
                <span className="text-[10px] font-display text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">Invite Only</span>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span>{community.member_count} member{community.member_count !== 1 ? 's' : ''}</span>
              <span className="text-gray-600">by</span>
              <Link to={getProfilePath(community.owner_id, community.owner_username)} className="text-piu-accent hover:underline">
                {community.owner_username}
              </Link>
            </div>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <p className="text-sm text-gray-400 mt-3 leading-relaxed">{community.description}</p>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 mt-4">
          {user && !isMember && !community.user_pending_request && (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-5 py-2 bg-piu-accent rounded-lg font-display font-bold text-sm hover:bg-piu-accent/80 transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : (community.is_invite_only ? 'Request to Join' : 'Join')}
            </button>
          )}
          {community.user_pending_request && (
            <span className="px-5 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg font-display font-bold text-sm">
              Request Pending
            </span>
          )}
          {isMember && community.user_role !== 'owner' && (
            <button
              onClick={handleLeave}
              className="px-5 py-2 bg-piu-dark border border-piu-border rounded-lg font-display font-bold text-sm text-gray-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
            >
              Leave
            </button>
          )}
          {isModOrOwner && (
            <Link
              to={`/c/${community.name}/settings`}
              className="ml-auto p-2 text-gray-500 hover:text-white transition-colors"
              title="Community Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}
        </div>

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-5 border-b border-piu-border">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'posts' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'members' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Members
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-6 py-4">
        {activeTab === 'posts' && (
          <PostsTab
            community={community}
            posts={posts}
            loading={postsLoading}
            isMember={isMember}
            isModOrOwner={isModOrOwner}
            user={user}
            postSort={postSort}
            setPostSort={setPostSort}
            newPostContent={newPostContent}
            setNewPostContent={setNewPostContent}
            newPostImages={newPostImages}
            setNewPostImages={setNewPostImages}
            newPostYoutube={newPostYoutube}
            setNewPostYoutube={setNewPostYoutube}
            posting={posting}
            postSummaryPreview={postSummaryPreview}
            postSummaryLoading={postSummaryLoading}
            postSummaryError={postSummaryError}
            onGeneratePostSummary={handleGeneratePostSummary}
            onClearPostSummary={() => { setPostSummaryPreview(null); setPostSummaryError(''); }}
            onCreatePost={handleCreatePost}
            onDeletePost={handleDeletePost}
            onPinPost={handlePinPost}
            onPumpPost={handlePumpPost}
            expandedComments={expandedComments}
            toggleComments={toggleComments}
            commentTexts={commentTexts}
            setCommentTexts={setCommentTexts}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            members={members}
            loading={membersLoading}
            memberSort={memberSort}
            setMemberSort={setMemberSort}
            community={community}
          />
        )}
      </div>
    </div>
  );
}

// ─── Posts Tab ────────────────────────────────────────

function PostsTab({
  community, posts, loading, isMember, isModOrOwner, user,
  postSort, setPostSort,
  newPostContent, setNewPostContent, newPostImages, setNewPostImages,
  newPostYoutube, setNewPostYoutube, posting,
  postSummaryPreview, postSummaryLoading, postSummaryError,
  onGeneratePostSummary, onClearPostSummary, onCreatePost,
  onDeletePost, onPinPost, onPumpPost,
  expandedComments, toggleComments, commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const hasSummaryCommand = hasSlashCommand(newPostContent, SLASH_COMMANDS.summary.trigger);
  const sanitizedContent = stripSlashCommand(newPostContent, SLASH_COMMANDS.summary.trigger);
  const canSubmit = !!(sanitizedContent.trim() || newPostImages.length > 0 || newPostYoutube || postSummaryPreview);

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setPostSort('new')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            postSort === 'new' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          New Posts
        </button>
        <button
          onClick={() => setPostSort('activity')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            postSort === 'activity' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Recent Activity
        </button>
      </div>

      {/* Post Composer */}
      {isMember && (
        <form onSubmit={onCreatePost} className="bg-piu-card border border-piu-border rounded-xl p-4 mb-4">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            className="w-full bg-transparent border-none text-white text-sm resize-none focus:outline-none placeholder-gray-600"
            rows={3}
            placeholder="Share something with the community... Try /summary"
            maxLength={5000}
          />

          {hasSummaryCommand && !postSummaryPreview && (
            <div className="mt-2 rounded-lg border border-piu-accent/30 bg-piu-accent/10 p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-display font-bold text-piu-accent">{SLASH_COMMANDS.summary.trigger} command detected</p>
                <p className="text-[11px] text-gray-400">Build a recap from your latest recently-played session.</p>
              </div>
              <button
                type="button"
                onClick={onGeneratePostSummary}
                disabled={postSummaryLoading}
                className="px-3 py-1.5 bg-piu-accent rounded-lg text-[11px] font-display font-bold hover:bg-piu-accent/80 transition-colors disabled:opacity-50"
              >
                {postSummaryLoading ? 'Generating...' : SLASH_COMMANDS.summary.buttonLabel}
              </button>
            </div>
          )}

          {postSummaryPreview && (
            <div className="mt-2 rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-transparent p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-display font-bold uppercase tracking-wider text-emerald-300">Session summary preview</p>
                  <p className="text-xs text-gray-300">
                    {postSummaryPreview.sessionDateLabel}
                    {postSummaryPreview.sessionTimeRange ? ` • ${postSummaryPreview.sessionTimeRange}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onGeneratePostSummary}
                    disabled={postSummaryLoading}
                    className="px-2 py-1 rounded border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 text-[10px] font-display font-bold disabled:opacity-50"
                  >
                    {postSummaryLoading ? 'Generating...' : 'Regenerate'}
                  </button>
                  <button
                    type="button"
                    onClick={onClearPostSummary}
                    className="px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10 text-[10px] font-display font-bold"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <SummaryStat label="Songs" value={postSummaryPreview.songCount} />
                <SummaryStat label="Clears" value={`${postSummaryPreview.clearCount} (${postSummaryPreview.clearRate}%)`} />
                <SummaryStat label="Steps" value={postSummaryPreview.totalSteps.toLocaleString()} />
                <SummaryStat label="Estimated Calories" value={`~${postSummaryPreview.estimatedKcal.toLocaleString()} kcal`} />
              </div>

              <div className="mt-3 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
                <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Mode split</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-red-500/20 border border-red-500/40">
                    <span className="text-[10px] text-red-300 font-display font-bold">Singles</span>
                    <span className="min-w-[20px] h-[18px] px-1 rounded bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                      {postSummaryPreview.singleCount}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-green-500/20 border border-green-500/40">
                    <span className="text-[10px] text-green-300 font-display font-bold">Doubles</span>
                    <span className="min-w-[20px] h-[18px] px-1 rounded bg-green-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                      {postSummaryPreview.doubleCount}
                    </span>
                  </div>
                  {postSummaryPreview.otherCount > 0 && (
                    <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-blue-500/20 border border-blue-500/40">
                      <span className="text-[10px] text-blue-300 font-display font-bold">Other</span>
                      <span className="min-w-[20px] h-[18px] px-1 rounded bg-blue-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                        {postSummaryPreview.otherCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
                <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Judgment totals</p>
                <p className="mt-1 text-xs">
                  <span className="text-sky-400">P {postSummaryPreview.judgmentTotals.perfect.toLocaleString()}</span>
                  <span className="text-gray-500"> | </span>
                  <span className="text-green-400">G {postSummaryPreview.judgmentTotals.great.toLocaleString()}</span>
                  <span className="text-gray-500"> | </span>
                  <span className="text-yellow-400">Good {postSummaryPreview.judgmentTotals.good.toLocaleString()}</span>
                  <span className="text-gray-500"> | </span>
                  <span className="text-purple-400">Bad {postSummaryPreview.judgmentTotals.bad.toLocaleString()}</span>
                  <span className="text-gray-500"> | </span>
                  <span className="text-red-400">Miss {postSummaryPreview.judgmentTotals.miss.toLocaleString()}</span>
                </p>
                <p className="text-xs font-display font-bold text-emerald-300 mt-1">
                  {postSummaryPreview.perfectRate}% Perfects!
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-cyan-400/25 bg-black/15 p-2.5">
                <p className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide mb-2">Top Plays</p>
                <div className="space-y-2">
                  <SummarySongTable title="Top 3 songs by score" rows={postSummaryPreview.topSongsByScore || []} type="score" />
                  <SummarySongTable title="Top 3 songs by rating" rows={postSummaryPreview.topSongsByRating || []} type="rating" />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-piu-border/30">
                <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Post preview</p>
                <div className="mt-1 text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                  {postSummaryPreview.postText}
                </div>
              </div>
            </div>
          )}

          {postSummaryError && (
            <p className="mt-2 text-xs text-red-400">{postSummaryError}</p>
          )}

          {/* Image previews */}
          {newPostImages.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {newPostImages.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setNewPostImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white"
                  >x</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 border-t border-piu-border/30 pt-3">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer p-1.5 text-gray-500 hover:text-piu-accent transition-colors" title="Add images">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setNewPostImages(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 9))}
                />
              </label>
              <input
                type="text"
                value={newPostYoutube}
                onChange={(e) => setNewPostYoutube(e.target.value)}
                className="bg-transparent border-none text-xs text-gray-400 focus:outline-none placeholder-gray-600 w-40"
                placeholder="YouTube URL"
              />
            </div>
            <button
              type="submit"
              disabled={posting || !canSubmit}
              className="px-4 py-1.5 bg-piu-accent rounded-lg text-xs font-display font-bold hover:bg-piu-accent/80 transition-colors disabled:opacity-40"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {/* Not a member notice */}
      {!isMember && !community.is_invite_only && (
        <div className="text-center py-3 mb-4 text-xs text-gray-500 bg-piu-card/50 rounded-lg border border-piu-border/50">
          Join the community to post, comment, and interact.
        </div>
      )}
      {!isMember && community.is_invite_only && (
        <div className="text-center py-6 mb-4 text-sm text-gray-500 bg-piu-card/50 rounded-lg border border-piu-border/50">
          This community is invite-only. Request to join to see content.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="font-display text-sm">No posts yet</p>
          {isMember && <p className="text-xs mt-1">Be the first to post something!</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <CommunityPostCard
              key={post.id}
              post={post}
              community={community}
              user={user}
              isMember={isMember}
              isModOrOwner={isModOrOwner}
              onDelete={onDeletePost}
              onPin={onPinPost}
              onPump={onPumpPost}
              comments={expandedComments[post.id]}
              onToggleComments={() => toggleComments(post.id)}
              commentTexts={commentTexts}
              setCommentTexts={setCommentTexts}
              replyTo={replyTo[post.id]}
              setReplyTo={(val) => setReplyTo(prev => ({ ...prev, [post.id]: val }))}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Community Post Card ─────────────────────────────

function CommunityPostCard({
  post, community, user, isMember, isModOrOwner,
  onDelete, onPin, onPump,
  comments, onToggleComments,
  commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const images = (() => { try { return JSON.parse(post.images || '[]'); } catch { return []; } })();
  const isAuthor = user?.id === post.user_id;
  const canDelete = isAuthor || isModOrOwner;
  const youtubeId = post.youtube_url ? extractYoutubeId(post.youtube_url) : null;

  return (
    <div className="bg-piu-card border border-piu-border rounded-xl overflow-hidden">
      {/* Pinned indicator */}
      {post.is_pinned ? (
        <div className="px-4 py-1.5 bg-piu-accent/10 border-b border-piu-accent/20 flex items-center gap-1.5 text-[10px] text-piu-accent font-display font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.182L2.4 8.044a.5.5 0 0 1 0-.707c.688-.688 1.673-.766 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
          </svg>
          PINNED
        </div>
      ) : null}

      <div className="p-4">
        {/* Author header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Link to={getProfilePath(post.user_id, post.username)}>
              {post.user_avatar ? (
                <img src={post.user_avatar.startsWith('data:') ? post.user_avatar : getAvatarUrl(post.user_avatar)} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                  {post.username?.[0]?.toUpperCase()}
                </div>
              )}
            </Link>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link to={getProfilePath(post.user_id, post.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors">
                  {post.username}
                </Link>
                <CommunityTagList tags={post.author_tags} />
              </div>
              <span className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</span>
            </div>
          </div>

          {/* Menu */}
          {canDelete && (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-gray-600 hover:text-gray-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-piu-dark border border-piu-border rounded-lg shadow-xl z-20 py-1 min-w-[120px]">
                  {isModOrOwner && (
                    <button
                      onClick={() => { onPin(post.id); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs font-display hover:bg-piu-card/50 transition-colors"
                    >
                      {post.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  <button
                    onClick={() => { onDelete(post.id); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs font-display text-red-400 hover:bg-piu-card/50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {post.content && (
          <div className="text-sm text-gray-300 mb-3 whitespace-pre-wrap break-words leading-relaxed">
            {renderFormattedText(post.content)}
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className={`grid gap-1.5 mb-3 ${images.length === 1 ? 'grid-cols-1' : images.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {images.map((img, i) => (
              <img key={i} src={img} alt="" className="w-full rounded-lg object-cover max-h-64" />
            ))}
          </div>
        )}

        {/* YouTube embed */}
        {youtubeId && (
          <div className="mb-3 aspect-video rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title="YouTube"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2 border-t border-piu-border/30">
          <button
            onClick={() => isMember ? onPump(post.id) : null}
            className={`flex items-center gap-1.5 text-xs font-display transition-colors ${
              post.user_pumped ? 'text-piu-accent' : 'text-gray-500 hover:text-piu-accent'
            } ${!isMember ? 'opacity-50 cursor-default' : ''}`}
            title={!isMember ? 'Join to interact' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill={post.user_pumped ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {post.pump_count > 0 && <span>{post.pump_count}</span>}
          </button>

          <button
            onClick={() => onToggleComments()}
            className="flex items-center gap-1.5 text-xs font-display text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </button>
        </div>

        {/* Comments section */}
        {comments && (
          <div className="mt-3 pt-3 border-t border-piu-border/30 space-y-2">
            {comments.filter(c => !c.parent_id).map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={comments.filter(c => c.parent_id === comment.id)}
                community={community}
                user={user}
                isMember={isMember}
                isModOrOwner={isModOrOwner}
                postId={post.id}
                commentTexts={commentTexts}
                setCommentTexts={setCommentTexts}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                onAddComment={onAddComment}
                onDelete={onDeleteComment}
              />
            ))}

            {/* Add comment */}
            {isMember && !replyTo && (
              <div className="flex items-center gap-2 mt-2">
                <MentionCommentInput
                  communityId={community.id}
                  value={commentTexts[post.id] || ''}
                  onChange={(value) => setCommentTexts(prev => ({ ...prev, [post.id]: value }))}
                  onSubmit={() => onAddComment(post.id, null)}
                  placeholder="Write a comment..."
                  inputClassName="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-piu-accent"
                />
                <button
                  onClick={() => onAddComment(post.id, null)}
                  className="text-xs text-piu-accent font-display font-bold hover:text-piu-accent/80"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comment Item ────────────────────────────────────

function CommentItem({ comment, replies, community, user, isMember, isModOrOwner, postId, commentTexts, setCommentTexts, replyTo, setReplyTo, onAddComment, onDelete }) {
  const isAuthor = user?.id === comment.user_id;
  const canDelete = isAuthor || isModOrOwner;

  return (
    <div>
      <div className="flex items-start gap-2">
        <Link to={getProfilePath(comment.user_id, comment.username)}>
          {comment.user_avatar ? (
            <img src={comment.user_avatar.startsWith('data:') ? comment.user_avatar : getAvatarUrl(comment.user_avatar)} alt="" className="w-6 h-6 rounded-full object-cover mt-0.5" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] mt-0.5">
              {comment.username?.[0]?.toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="bg-piu-dark/50 rounded-lg px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <Link to={getProfilePath(comment.user_id, comment.username)} className="font-display font-bold text-[11px] hover:text-piu-accent transition-colors">
                {comment.username}
              </Link>
              <CommunityTagList tags={comment.author_tags} />
            </div>
            <div className="text-xs text-gray-300 mt-0.5 break-words">{renderFormattedText(comment.content)}</div>
          </div>
          <div className="flex items-center gap-3 mt-0.5 ml-3">
            <span className="text-[9px] text-gray-600">{timeAgo(comment.created_at)}</span>
            {isMember && (
              <button
                onClick={() => setReplyTo(comment.id)}
                className="text-[9px] text-gray-500 hover:text-piu-accent font-display font-bold"
              >
                Reply
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(postId, comment.id)}
                className="text-[9px] text-gray-600 hover:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1.5">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2">
              <Link to={getProfilePath(reply.user_id, reply.username)}>
                {reply.user_avatar ? (
                  <img src={reply.user_avatar.startsWith('data:') ? reply.user_avatar : getAvatarUrl(reply.user_avatar)} alt="" className="w-5 h-5 rounded-full object-cover mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[7px] mt-0.5">
                    {reply.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="bg-piu-dark/30 rounded-lg px-2.5 py-1">
                  <div className="flex items-center gap-1.5">
                    <Link to={getProfilePath(reply.user_id, reply.username)} className="font-display font-bold text-[10px] hover:text-piu-accent transition-colors">
                      {reply.username}
                    </Link>
                    <CommunityTagList tags={reply.author_tags} />
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5 break-words">{renderFormattedText(reply.content)}</div>
                </div>
                <div className="flex items-center gap-3 mt-0.5 ml-2.5">
                  <span className="text-[9px] text-gray-600">{timeAgo(reply.created_at)}</span>
                  {isMember && (
                    <button
                      onClick={() => {
                        setReplyTo(comment.id);
                        setCommentTexts(prev => ({ ...prev, [comment.id]: `@${reply.username} ` }));
                      }}
                      className="text-[9px] text-gray-500 hover:text-piu-accent font-display font-bold"
                    >
                      Reply
                    </button>
                  )}
                  {(user?.id === reply.user_id || isModOrOwner) && (
                    <button onClick={() => onDelete(postId, reply.id)} className="text-[9px] text-gray-600 hover:text-red-400">Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyTo === comment.id && isMember && (
        <div className="ml-8 mt-1.5 flex items-center gap-2">
          <MentionCommentInput
            communityId={community.id}
            value={commentTexts[comment.id] || ''}
            onChange={(value) => setCommentTexts(prev => ({ ...prev, [comment.id]: value }))}
            onSubmit={() => onAddComment(postId, comment.id)}
            placeholder={`Reply to ${comment.username}...`}
            autoFocus
            inputClassName="w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1 text-[11px] text-white focus:outline-none focus:border-piu-accent"
          />
          <button onClick={() => onAddComment(postId, comment.id)} className="text-[10px] text-piu-accent font-display font-bold">Send</button>
          <button onClick={() => setReplyTo(null)} className="text-[10px] text-gray-600 hover:text-gray-400">Cancel</button>
        </div>
      )}
    </div>
  );
}

function MentionCommentInput({
  communityId,
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus = false,
  disabled = false,
  inputClassName = '',
}) {
  const inputRef = useRef(null);
  const [mentionToken, setMentionToken] = useState(null);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!communityId || disabled || !mentionToken?.query) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
      return;
    }

    const requestId = ++requestRef.current;
    setMentionLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const found = await searchCommunityMentions(communityId, mentionToken.query);
        if (requestId !== requestRef.current) return;
        const filtered = (found || []).filter(u => u?.username).slice(0, 6);
        setMentionUsers(filtered);
        setShowMentions(filtered.length > 0);
      } catch {
        if (requestId === requestRef.current) {
          setMentionUsers([]);
          setShowMentions(false);
        }
      } finally {
        if (requestId === requestRef.current) setMentionLoading(false);
      }
    }, 150);

    return () => clearTimeout(timeout);
  }, [communityId, mentionToken?.query, disabled]);

  const updateMentionState = (nextValue, cursorOverride) => {
    const cursor = Number.isFinite(cursorOverride)
      ? cursorOverride
      : (inputRef.current?.selectionStart ?? String(nextValue || '').length);
    const token = getActiveMentionQuery(nextValue, cursor);
    setMentionToken(token);
    if (!token) {
      setMentionUsers([]);
      setMentionLoading(false);
      setShowMentions(false);
    }
  };

  const handleChange = (nextValue) => {
    onChange(nextValue);
    updateMentionState(nextValue);
  };

  const applyMention = (username) => {
    const current = String(value || '');
    const cursor = inputRef.current?.selectionStart ?? current.length;
    const token = getActiveMentionQuery(current, cursor) || mentionToken;
    if (!token) return;

    const next = `${current.slice(0, token.start)}@${username} ${current.slice(token.end)}`;
    const nextCursor = token.start + username.length + 2;
    onChange(next);
    setMentionToken(null);
    setMentionUsers([]);
    setMentionLoading(false);
    setShowMentions(false);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (showMentions && mentionUsers.length > 0) {
        e.preventDefault();
        applyMention(mentionUsers[0].username);
        return;
      }
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === 'Escape' && showMentions) {
      e.preventDefault();
      setShowMentions(false);
    }
  };

  const classes = inputClassName || 'w-full bg-piu-dark border border-piu-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-piu-accent';

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onClick={() => updateMentionState(value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className={classes}
      />
      {(showMentions || mentionLoading) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-lg border border-piu-border bg-piu-card shadow-xl max-h-48 overflow-y-auto">
          {mentionLoading && mentionUsers.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-gray-500">Searching...</p>
          ) : mentionUsers.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-gray-500">No users found</p>
          ) : (
            mentionUsers.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => applyMention(u.username)}
                className="w-full px-3 py-2 text-left hover:bg-piu-dark/60 transition-colors flex items-center gap-2"
              >
                {u.avatar ? (
                  <img src={u.avatar.startsWith('data:') ? u.avatar : getAvatarUrl(u.avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[9px]">
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-display font-bold">@{u.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────

function MembersTab({ members, loading, memberSort, setMemberSort, community }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500 font-display">Sort by:</span>
        <button
          onClick={() => setMemberSort('joined')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            memberSort === 'joined' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Joined
        </button>
        <button
          onClick={() => setMemberSort('pumbility')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            memberSort === 'pumbility' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Pumbility
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">No members yet</p>
      ) : (
        <div className="space-y-1">
          {members.map(member => (
            <Link
              key={member.id}
              to={getProfilePath(member.id, member.username)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-piu-dark/50 transition-colors"
            >
              {member.avatar ? (
                <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                  {member.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display font-bold text-sm">{member.username}</span>
                  {member.nationality && <span className="text-sm">{getCountryFlag(member.nationality)}</span>}
                  {member.role === 'owner' && (
                    <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-gold/20 text-piu-gold">Owner</span>
                  )}
                  {member.role === 'moderator' && (
                    <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-blue/20 text-piu-blue">Mod</span>
                  )}
                  <CommunityTagList tags={member.tags} />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                  {member.skill_title && <span>{member.skill_title}</span>}
                  {member.pumbility > 0 && <span className="text-piu-accent font-mono">{member.pumbility}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────

function extractYoutubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
