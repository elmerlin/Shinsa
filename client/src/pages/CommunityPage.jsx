import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { COUNTRIES, getCountryFlag } from '../components/PlayerRegistration';
import { renderFormattedText } from '../utils/formatText';
import { getProfilePath } from '../utils/profile';
import CommunityBadge from '../components/CommunityBadge';
import { CommunityTagList } from '../components/CommunityTag';
import SessionSummaryCard from '../components/SessionSummaryCard';
import SessionShareCard from '../components/SessionShareCard';
import PumbilityBreakdownModal from '../components/PumbilityBreakdownModal';
import { ImageGrid, Lightbox, YouTubeEmbed, ShareButton, timeAgo as postCardTimeAgo } from '../components/PostCard';
import PumpersModal from '../components/PumpersModal';
import ImageEditor from '../components/ImageEditor';
import DojoCatStickerPicker from '../components/DojoCatStickerPicker';
import {
  getCommunityByName, joinCommunity, leaveCommunity,
  getCommunityPosts, createCommunityPost, deleteCommunityPost, pinCommunityPost,
  pumpCommunityPost, getCommunityPostComments, addCommunityPostComment, deleteCommunityPostComment,
  getCommunityMembers, pumpCommunityComment, getCommunityEmojis, searchCommunityMentions, getPiugameRecentlyPlayed, getJacketMap, getCommunityPostPumpers,
  getSongAnalytics,
  getCommunityNotificationPreferences, updateCommunityNotificationPreferences,
} from '../utils/api';
import { calculateClearRating } from '../utils/clearRating';
import { serializeSessionSummaryMarker, splitSessionSummaryContent } from '../utils/sessionSummaryMarker';
import { serializeSessionShareMarker, splitSessionShareContent } from '../utils/sessionShareMarker';
import { buildSessionCalorieEstimate } from '../utils/calorieEstimate';
import { buildSessionShareCard, getSessionLevelOptions, SHARE_MIN_GRADE_OPTIONS } from '../utils/sessionShare';

// Common emoji sets for quick insert (same as PostsPage)
const EMOJI_GROUPS = [
  { label: 'Faces', emojis: ['😀','😂','🤣','😊','😎','🤩','😍','🥳','🤔','😱','😤','😭','🙄','😴','🤮'] },
  { label: 'Hands', emojis: ['👍','👎','👏','🙌','💪','✌️','🤞','🤘','👊','✊','🫡','🫶'] },
  { label: 'PIU', emojis: ['🎵','🎶','🎤','🎮','🕹️','🏆','🥇','🥈','🥉','🔥','⭐','💥','💯','🚀','⚡'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖'] },
];

const COUNTRY_NAME_BY_CODE = COUNTRIES.reduce((acc, country) => {
  if (country?.code) acc[country.code] = country.name;
  return acc;
}, {});

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
  share: {
    trigger: '/share',
    buttonLabel: 'Generate session share',
  },
};

const SUMMARY_SESSION_GAP_MS = 90 * 60 * 1000;
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

function RankDeltaIndicator({ delta, compact = false }) {
  const numericDelta = parseInt(delta, 10) || 0;
  if (!numericDelta) return null;

  const isUp = numericDelta > 0;
  const amount = Math.abs(numericDelta);
  const icon = isUp ? '▲' : '▼';
  const colorClass = isUp
    ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10'
    : 'text-red-300 border-red-400/40 bg-red-500/10';

  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono font-bold ${compact ? 'text-[10px]' : 'text-[11px]'} ${colorClass}`}>
      <span>{icon}</span>
      <span>{amount}</span>
    </span>
  );
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

function stripSlashCommands(text, triggers = []) {
  return (Array.isArray(triggers) ? triggers : []).reduce(
    (acc, trigger) => stripSlashCommand(acc, trigger),
    String(text || '')
  );
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

function averageForNumericRows(rows, key) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return 0;
  const total = list.reduce((sum, row) => sum + (parseInt(row?.[key], 10) || 0), 0);
  return total / list.length;
}

function buildPumbilityMetricSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return {
      average_score: 0,
      average_level: 0,
      average_grade: '--',
    };
  }
  const averageScore = Math.round(averageForNumericRows(list, 'score'));
  const averageLevel = averageForNumericRows(list, 'level');
  return {
    average_score: averageScore,
    average_level: Math.round(averageLevel * 10) / 10,
    average_grade: getRankLabel(averageScore),
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  const maxConcurrent = Math.max(1, parseInt(limit, 10) || 1);
  const results = new Array(source.length);
  let cursor = 0;

  async function worker() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(source[index], index);
    }
  }

  const workers = [];
  const workerCount = Math.min(maxConcurrent, source.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
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

function buildSessionSummary(sessionRows, jacketLookup = {}, userProfile = null) {
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
      _over_top100_rank: parseInt(play?.over_top100_rank, 10) || 0,
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
  const shoeCounts = new Map();

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

    const make = String(play?.shoe_make || '').trim();
    const model = String(play?.shoe_model || '').trim();
    const colorway = String(play?.shoe_colorway || '').trim();
    const normalizedLabel = `${make} ${model}`.replace(/\s+/g, ' ').trim();
    const fallbackLabel = play?.shoe_id ? `Shoe #${parseInt(play.shoe_id, 10) || play.shoe_id}` : '';
    const shoeLabel = normalizedLabel
      ? (colorway ? `${normalizedLabel} (${colorway})` : normalizedLabel)
      : fallbackLabel;
    if (shoeLabel) {
      shoeCounts.set(shoeLabel, (shoeCounts.get(shoeLabel) || 0) + 1);
    }
  }

  const songCount = enrichedRows.length;
  const clearCount = songCount - stageBreakCount;
  const clearRate = songCount > 0 ? Math.round((clearCount / songCount) * 100) : 0;
  const averageScore = scoredCount > 0 ? Math.round(scoreTotal / scoredCount) : 0;
  const averageLevel = levelCount > 0 ? (levelTotal / levelCount) : 0;
  const calorieEstimate = buildSessionCalorieEstimate(songCount, userProfile?.weight_kg);
  const estimatedKcal = calorieEstimate.estimatedKcal;
  const estimatedKcalPerHour = calorieEstimate.kcalPerHour;
  const calorieWeightKg = calorieEstimate.weightKgUsed;
  const calorieEstimatePersonalized = calorieEstimate.personalized;
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
  const topShoe = [...shoeCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0] || null;
  const sessionShoeLabel = topShoe
    ? (shoeCounts.size > 1 ? `${topShoe[0]} (+${shoeCounts.size - 1} more)` : topShoe[0])
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
    `🗓️ ${sessionDateLabel}${sessionTimeRange ? ` • ${sessionTimeRange}` : ''}${sessionDurationLabel ? ` • ${sessionDurationLabel}` : ''}`,
    sessionMachineName ? `🕹️ Machine: **${sessionMachineName}**` : '',
    sessionShoeLabel ? `👟 Shoe: **${sessionShoeLabel}**` : '',
    `🎵 **${songCount} songs** | 🏁 Clears: **${clearCount}/${songCount}** (${clearRate}%)`,
    `🦶 Judged steps: **${totalSteps.toLocaleString()}**${judgmentCoverageLabel}`,
    `🔥 Estimated calories: **~${estimatedKcal.toLocaleString()} kcal**`,
    `⚡ Burn rate: **~${estimatedKcalPerHour.toLocaleString()} kcal/hour**${calorieEstimatePersonalized ? ` @ ${calorieWeightKg.toLocaleString()} kg` : ' (fallback 70 kg; set your weight in Health)'}`,
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
    estimatedKcalPerHour,
    calorieWeightKg,
    calorieEstimatePersonalized,
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
    sessionShoeLabel,
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
  const notifyMenuRef = useRef(null);
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [postSort, setPostSort] = useState('new');
  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeMembers, setActiveMembers] = useState([]);
  const [memberSort, setMemberSort] = useState('joined');
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [leaderboardMetric, setLeaderboardMetric] = useState('overall');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [leaderboardLoadedCommunityId, setLeaderboardLoadedCommunityId] = useState('');
  const [postsLoading, setPostsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [communityNotifyMenuOpen, setCommunityNotifyMenuOpen] = useState(false);
  const [communityNotifyPrefs, setCommunityNotifyPrefs] = useState({
    loading: false,
    saving: false,
    subscribed: false,
    notify_new_posts: false,
    mode: 'off',
  });
  const [communityNotifyError, setCommunityNotifyError] = useState('');

  // Post composer state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImages, setNewPostImages] = useState([]);
  const [newPostYoutube, setNewPostYoutube] = useState('');
  const [posting, setPosting] = useState(false);
  const [postSummaryPreview, setPostSummaryPreview] = useState(null);
  const [postSummaryLoading, setPostSummaryLoading] = useState(false);
  const [postSummaryError, setPostSummaryError] = useState('');
  const [postSharePreview, setPostSharePreview] = useState(null);
  const [postShareLoading, setPostShareLoading] = useState(false);
  const [postShareError, setPostShareError] = useState('');
  const [postShareSessionRows, setPostShareSessionRows] = useState([]);
  const [postShareJacketLookup, setPostShareJacketLookup] = useState({});
  const [postShareMode, setPostShareMode] = useState('Both');
  const [postShareMinGrade, setPostShareMinGrade] = useState('PASS');
  const [postShareRangeA, setPostShareRangeA] = useState(null);
  const [postShareRangeB, setPostShareRangeB] = useState(null);

  // Comment state
  const [expandedComments, setExpandedComments] = useState({});
  const [commentTexts, setCommentTexts] = useState({});
  const [replyTo, setReplyTo] = useState({});
  const postShareLevelOptions = getSessionLevelOptions(postShareSessionRows);
  const selectedPostShareMin = Number.isFinite(postShareRangeA) && Number.isFinite(postShareRangeB)
    ? Math.min(postShareRangeA, postShareRangeB)
    : null;
  const selectedPostShareMax = Number.isFinite(postShareRangeA) && Number.isFinite(postShareRangeB)
    ? Math.max(postShareRangeA, postShareRangeB)
    : null;

  const loadCommunity = useCallback(async () => {
    setPosts([]);
    setMembers([]);
    setActiveMembers([]);
    setLeaderboardRows([]);
    setLeaderboardMetric('overall');
    setLeaderboardLoading(false);
    setLeaderboardError('');
    setLeaderboardLoadedCommunityId('');
    setCommunityNotifyMenuOpen(false);
    setCommunityNotifyError('');
    setCommunityNotifyPrefs({
      loading: false,
      saving: false,
      subscribed: false,
      notify_new_posts: false,
      mode: 'off',
    });
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

  const loadLeaderboard = useCallback(async () => {
    if (!community) return;
    setLeaderboardLoading(true);
    setLeaderboardError('');

    try {
      const memberRows = await getCommunityMembers(community.id, 'pumbility');
      const uniqueMembers = [];
      const seen = new Set();
      for (const member of (memberRows || [])) {
        const id = String(member?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        uniqueMembers.push(member);
      }

      const analyticsResults = await mapWithConcurrency(uniqueMembers, 6, async (member) => {
        try {
          const analytics = await getSongAnalytics(member.id);
          const overallBreakdown = analytics?.pumbility_breakdown?.overall_top50 || [];
          const singlesBreakdown = analytics?.pumbility_breakdown?.singles_top50 || [];
          const overallSummary = buildPumbilityMetricSummary(overallBreakdown);
          const singlesSummary = buildPumbilityMetricSummary(singlesBreakdown);

          return {
            user_id: member.id,
            analytics,
            overall_pumbility: parseInt(analytics?.pumbility, 10) || parseInt(member?.pumbility, 10) || 0,
            singles_pumbility: parseInt(analytics?.singles_pumbility, 10) || 0,
            overall_breakdown: overallBreakdown,
            singles_breakdown: singlesBreakdown,
            overall_average_grade: overallSummary.average_grade,
            overall_average_level: overallSummary.average_level,
            singles_average_grade: singlesSummary.average_grade,
            singles_average_level: singlesSummary.average_level,
            singles_competitive_level: parseInt(analytics?.competitive_levels?.single?.level, 10) || null,
            doubles_competitive_level: parseInt(analytics?.competitive_levels?.double?.level, 10) || null,
          };
        } catch {
          return {
            user_id: member.id,
            analytics: null,
            overall_pumbility: parseInt(member?.pumbility, 10) || 0,
            singles_pumbility: 0,
            overall_breakdown: [],
            singles_breakdown: [],
            overall_average_grade: '--',
            overall_average_level: 0,
            singles_average_grade: '--',
            singles_average_level: 0,
            singles_competitive_level: null,
            doubles_competitive_level: null,
          };
        }
      });

      const byUserId = new Map((analyticsResults || []).map((row) => [String(row.user_id), row]));
      const rows = uniqueMembers.map((member) => {
        const metrics = byUserId.get(String(member.id)) || {};
        return {
          ...member,
          ...metrics,
        };
      });

      setLeaderboardRows(rows);
      setLeaderboardLoadedCommunityId(community.id);
    } catch (err) {
      setLeaderboardError(err?.message || 'Failed to load community leaderboard.');
      setLeaderboardRows([]);
      setLeaderboardLoadedCommunityId('');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [community]);

  const loadActiveMembers = useCallback(async () => {
    if (!community) return;
    try {
      const data = await getCommunityMembers(community.id, 'activity', { limit: 7 });
      const withActivity = (data || []).filter((member) => (member.recent_activity_count || 0) > 0);
      setActiveMembers(withActivity.length > 0 ? withActivity.slice(0, 7) : (data || []).slice(0, 7));
    } catch (err) {
      console.error(err);
      setActiveMembers([]);
    }
  }, [community]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [communityName]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);
  useEffect(() => { if (community && activeTab === 'posts') loadPosts(); }, [community, activeTab, postSort, loadPosts]);
  useEffect(() => { if (community && activeTab === 'members') loadMembers(); }, [community, activeTab, memberSort, loadMembers]);
  useEffect(() => {
    if (!community || activeTab !== 'leaderboard') return;
    if (leaderboardLoadedCommunityId === community.id && leaderboardRows.length > 0) return;
    loadLeaderboard();
  }, [community, activeTab, leaderboardLoadedCommunityId, leaderboardRows.length, loadLeaderboard]);
  useEffect(() => { if (community) loadActiveMembers(); }, [community, loadActiveMembers]);

  useEffect(() => {
    const canConfigure = !!user && !!community && (!community.is_invite_only || !!community.user_role);
    if (!canConfigure) {
      setCommunityNotifyPrefs({
        loading: false,
        saving: false,
        subscribed: false,
        notify_new_posts: false,
        mode: 'off',
      });
      setCommunityNotifyError('');
      return undefined;
    }

    let cancelled = false;
    setCommunityNotifyError('');
    setCommunityNotifyPrefs(prev => ({ ...prev, loading: true, saving: false }));

    getCommunityNotificationPreferences(community.id)
      .then((prefs) => {
        if (cancelled) return;
        setCommunityNotifyPrefs({
          loading: false,
          saving: false,
          subscribed: !!prefs?.subscribed,
          notify_new_posts: !!prefs?.notify_new_posts,
          mode: prefs?.mode === 'following' ? 'following' : (prefs?.mode === 'all' ? 'all' : 'off'),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setCommunityNotifyPrefs({
          loading: false,
          saving: false,
          subscribed: false,
          notify_new_posts: false,
          mode: 'off',
        });
        setCommunityNotifyError(err?.message || 'Failed to load community notification settings');
      });

    return () => { cancelled = true; };
  }, [community?.id, community?.is_invite_only, community?.user_role, user?.id]);

  useEffect(() => {
    if (!communityNotifyMenuOpen) return undefined;
    const onDocumentMouseDown = (e) => {
      if (notifyMenuRef.current && !notifyMenuRef.current.contains(e.target)) {
        setCommunityNotifyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [communityNotifyMenuOpen]);

  const handleSetCommunityNotifyMode = async (mode) => {
    if (!user || !community || communityNotifyPrefs.saving || communityNotifyPrefs.loading) return;
    const nextMode = mode === 'all' || mode === 'following' ? mode : 'off';
    const previous = communityNotifyPrefs;
    const optimistic = {
      loading: false,
      saving: true,
      subscribed: nextMode !== 'off',
      notify_new_posts: nextMode !== 'off',
      mode: nextMode,
    };
    setCommunityNotifyError('');
    setCommunityNotifyPrefs(optimistic);

    try {
      const saved = await updateCommunityNotificationPreferences(community.id, { mode: nextMode });
      setCommunityNotifyPrefs({
        loading: false,
        saving: false,
        subscribed: !!saved?.subscribed,
        notify_new_posts: !!saved?.notify_new_posts,
        mode: saved?.mode === 'following' ? 'following' : (saved?.mode === 'all' ? 'all' : 'off'),
      });
    } catch (err) {
      setCommunityNotifyPrefs({ ...previous, loading: false, saving: false });
      setCommunityNotifyError(err?.message || 'Failed to update community notification settings');
    }
  };

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
      const summary = buildSessionSummary(sessionRows, jacketLookup || {}, user || null);
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

  const hydratePostShareSession = async () => {
    const [data, jacketLookup] = await Promise.all([
      getPiugameRecentlyPlayed(user.id),
      getJacketMap().catch(() => ({})),
    ]);
    const sortedRows = sortRecentPlays(data?.plays || []);
    const sessionRows = getMostRecentSession(sortedRows);
    if (sessionRows.length === 0) {
      throw new Error('No recently played data found. Sync recently played first.');
    }
    const levels = getSessionLevelOptions(sessionRows);
    setPostShareSessionRows(sessionRows);
    setPostShareJacketLookup(jacketLookup || {});
    setPostShareMode('Both');
    setPostShareMinGrade('PASS');
    if (levels.length > 0) {
      setPostShareRangeA(levels[0]);
      setPostShareRangeB(levels[levels.length - 1]);
    } else {
      setPostShareRangeA(null);
      setPostShareRangeB(null);
    }
    return { sessionRows, jacketLookup: jacketLookup || {}, levels };
  };

  const handleLoadPostShareSession = async () => {
    if (!user?.id || postShareLoading) return;
    setPostShareError('');
    setPostShareLoading(true);
    try {
      await hydratePostShareSession();
    } catch (err) {
      setPostShareError(err.message || 'Failed to load share filters.');
    } finally {
      setPostShareLoading(false);
    }
  };

  const handleGeneratePostShare = async ({ reloadSession = false } = {}) => {
    if (!user?.id || postShareLoading) return;
    setPostShareError('');
    setPostShareLoading(true);
    try {
      let sessionRows = postShareSessionRows;
      let jacketLookup = postShareJacketLookup;

      if (reloadSession || sessionRows.length === 0) {
        const hydrated = await hydratePostShareSession();
        sessionRows = hydrated.sessionRows;
        jacketLookup = hydrated.jacketLookup;
      }

      const levels = getSessionLevelOptions(sessionRows);
      const minLevel = selectedPostShareMin ?? levels[0] ?? null;
      const maxLevel = selectedPostShareMax ?? levels[levels.length - 1] ?? null;
      if (minLevel === null || maxLevel === null) {
        throw new Error('Select a level range before generating the share card.');
      }

      const share = buildSessionShareCard(sessionRows, {
        mode: postShareMode,
        minGrade: postShareMinGrade,
        minLevel,
        maxLevel,
      }, jacketLookup || {});
      if (!share) {
        throw new Error('No results matched your filters. Try widening the selection.');
      }

      setPostSharePreview(share);
      setNewPostContent((prev) => stripSlashCommand(prev, SLASH_COMMANDS.share.trigger));
    } catch (err) {
      setPostShareError(err.message || 'Failed to generate share card.');
    } finally {
      setPostShareLoading(false);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    const sanitizedContent = stripSlashCommands(newPostContent, [SLASH_COMMANDS.summary.trigger, SLASH_COMMANDS.share.trigger]);
    const summaryMarker = postSummaryPreview ? serializeSessionSummaryMarker(postSummaryPreview) : '';
    const shareMarker = postSharePreview ? serializeSessionShareMarker(postSharePreview) : '';
    const finalContent = [sanitizedContent.trim(), summaryMarker, shareMarker].filter(Boolean).join('\n\n');
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
      setPostSharePreview(null);
      setPostShareError('');
      setPostShareSessionRows([]);
      setPostShareJacketLookup({});
      setPostShareMode('Both');
      setPostShareMinGrade('PASS');
      setPostShareRangeA(null);
      setPostShareRangeB(null);
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
  const isOwner = community.user_role === 'owner';
  const isModOrOwner = community.user_role === 'owner' || community.user_role === 'moderator';
  const canConfigureCommunityNotify = !!user && (!community.is_invite_only || isMember);
  const topActiveMembers = (activeMembers || []).slice(0, 7);
  const showMembershipActionBar = (
    (user && !isMember && !community.user_pending_request)
    || community.user_pending_request
    || (isMember && community.user_role !== 'owner')
  );

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
            <div className="flex items-center gap-2 text-xs text-gray-300 mt-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-piu-border/70 bg-piu-dark/60 px-2 py-0.5" title={`${community.member_count} members`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5V9a2 2 0 00-2-2h-3m-4 13h4m-4 0H7m6 0v-5a3 3 0 00-6 0v5m6 0H7m0 0H2V9a2 2 0 012-2h3m0 0a3 3 0 006 0m-6 0a3 3 0 016 0" />
                </svg>
                <span>{community.member_count}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-piu-border/70 bg-piu-dark/60 px-2 py-0.5" title={`${community.posts_last_week || 0} posts this week`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-piu-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7H8m11 4H8m11 4H8m-4 4h16a1 1 0 001-1V6a1 1 0 00-1-1H4a1 1 0 00-1 1v12a1 1 0 001 1zm2-12h.01M6 11h.01M6 15h.01" />
                </svg>
                <span>{community.posts_last_week || 0}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <p className="text-sm text-gray-400 mt-3 leading-relaxed">{community.description}</p>
        )}

        {(topActiveMembers.length > 0 || canConfigureCommunityNotify || isOwner) && (
          <div className="mt-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Most Active Members This Week</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center overflow-x-auto pb-1 pr-1 min-w-0">
                {topActiveMembers.map((member, index) => (
                  <Link
                    key={member.id}
                    to={getProfilePath(member.id, member.username)}
                    className={`shrink-0 w-9 h-9 rounded-full border-2 border-piu-card hover:border-piu-accent transition-colors overflow-hidden ${index === 0 ? '' : '-ml-2'}`}
                    title={`${member.username} • ${member.recent_activity_count || 0} activity`}
                  >
                    {member.avatar ? (
                      <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt={member.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[11px]">
                        {member.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </Link>
                ))}
              </div>

              {(canConfigureCommunityNotify || isOwner) && (
                <div className="flex items-center gap-2 shrink-0">
                  {canConfigureCommunityNotify && (
                    <div className="relative" ref={notifyMenuRef}>
                      <button
                        onClick={() => setCommunityNotifyMenuOpen(v => !v)}
                        className={`px-3.5 py-2 rounded-lg text-xs font-display font-bold border transition-colors backdrop-blur-sm ${
                          communityNotifyPrefs.subscribed
                            ? 'bg-piu-dark/85 border-emerald-400/40 text-gray-100'
                            : 'bg-piu-dark/85 border-piu-border text-gray-300 hover:text-white'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span>Notify</span>
                          {communityNotifyPrefs.subscribed && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          )}
                        </span>
                      </button>
                      {communityNotifyMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-3rem)] rounded-lg bg-piu-card border border-piu-border/60 p-2.5 shadow-2xl">
                          <p className="text-[10px] font-display font-bold text-gray-400 uppercase tracking-wide">
                            Notify About {community.display_name}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { key: 'all', label: 'All New Posts' },
                              { key: 'following', label: 'Followed Members' },
                              { key: 'off', label: 'Off' },
                            ].map(opt => {
                              const enabled = communityNotifyPrefs.mode === opt.key;
                              return (
                                <button
                                  key={opt.key}
                                  onClick={() => handleSetCommunityNotifyMode(opt.key)}
                                  disabled={communityNotifyPrefs.loading || communityNotifyPrefs.saving}
                                  className={`px-2 py-1 rounded-md text-[11px] font-display font-bold border transition-colors disabled:opacity-60 ${
                                    enabled
                                      ? 'bg-piu-dark border-emerald-400/50 text-emerald-300'
                                      : 'bg-piu-dark border-piu-border text-gray-500 hover:text-gray-300'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {enabled && <span className="text-emerald-400">✓</span>}
                                    <span>{opt.label}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1.5">
                            {communityNotifyPrefs.loading && 'Loading community notification settings...'}
                            {!communityNotifyPrefs.loading && communityNotifyPrefs.saving && 'Saving community notification settings...'}
                            {!communityNotifyPrefs.loading && !communityNotifyPrefs.saving && communityNotifyPrefs.mode === 'all' && 'You will get notified for all new posts in this community.'}
                            {!communityNotifyPrefs.loading && !communityNotifyPrefs.saving && communityNotifyPrefs.mode === 'following' && 'You will get notified for posts from members you follow.'}
                            {!communityNotifyPrefs.loading && !communityNotifyPrefs.saving && communityNotifyPrefs.mode === 'off' && 'Community post notifications are off.'}
                          </p>
                          {communityNotifyError && (
                            <p className="text-[10px] text-red-400 mt-1">{communityNotifyError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isOwner && (
                    <Link
                      to={`/c/${community.name}/settings`}
                      className="p-2 rounded-lg bg-piu-dark/85 border border-piu-border text-gray-300 hover:text-white transition-colors"
                      title="Community Settings"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action bar */}
        {showMembershipActionBar && (
        <div className="flex items-center gap-2 mt-2.5">
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
        </div>
        )}

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3 border-b border-piu-border">
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
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'leaderboard' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Leaderboard
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`px-4 py-2.5 font-display font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'about' ? 'border-piu-accent text-piu-accent' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            About
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
            postSharePreview={postSharePreview}
            postShareLoading={postShareLoading}
            postShareError={postShareError}
            postShareSessionRows={postShareSessionRows}
            postShareMode={postShareMode}
            setPostShareMode={setPostShareMode}
            postShareMinGrade={postShareMinGrade}
            setPostShareMinGrade={setPostShareMinGrade}
            postShareRangeA={postShareRangeA}
            setPostShareRangeA={setPostShareRangeA}
            postShareRangeB={postShareRangeB}
            setPostShareRangeB={setPostShareRangeB}
            postShareLevelOptions={postShareLevelOptions}
            selectedPostShareMin={selectedPostShareMin}
            selectedPostShareMax={selectedPostShareMax}
            onGeneratePostSummary={handleGeneratePostSummary}
            onClearPostSummary={() => { setPostSummaryPreview(null); setPostSummaryError(''); }}
            onLoadPostShareSession={handleLoadPostShareSession}
            onGeneratePostShare={handleGeneratePostShare}
            onClearPostShare={() => { setPostSharePreview(null); setPostShareError(''); }}
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
        {activeTab === 'about' && (
          <AboutTab community={community} />
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
        {activeTab === 'leaderboard' && (
          <LeaderboardTab
            rows={leaderboardRows}
            loading={leaderboardLoading}
            error={leaderboardError}
            metric={leaderboardMetric}
            setMetric={setLeaderboardMetric}
            onRefresh={loadLeaderboard}
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
  postSharePreview, postShareLoading, postShareError,
  postShareSessionRows, postShareMode, setPostShareMode, postShareMinGrade, setPostShareMinGrade,
  postShareRangeA, setPostShareRangeA, postShareRangeB, setPostShareRangeB,
  postShareLevelOptions, selectedPostShareMin, selectedPostShareMax,
  onGeneratePostSummary, onClearPostSummary,
  onLoadPostShareSession, onGeneratePostShare, onClearPostShare, onCreatePost,
  onDeletePost, onPinPost, onPumpPost,
  expandedComments, toggleComments, commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const hasSummaryCommand = hasSlashCommand(newPostContent, SLASH_COMMANDS.summary.trigger);
  const hasShareCommand = hasSlashCommand(newPostContent, SLASH_COMMANDS.share.trigger);
  const sanitizedContent = stripSlashCommands(newPostContent, [SLASH_COMMANDS.summary.trigger, SLASH_COMMANDS.share.trigger]);
  const canSubmit = !!(sanitizedContent.trim() || newPostImages.length > 0 || newPostYoutube || postSummaryPreview || postSharePreview);

  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [customEmojis, setCustomEmojis] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showCommandInfo, setShowCommandInfo] = useState(false);
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);

  // Load custom emojis for this community
  useEffect(() => {
    if (community?.id) {
      getCommunityEmojis(community.id).then(setCustomEmojis).catch(() => {});
    }
  }, [community?.id]);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!showCommandInfo) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowCommandInfo(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCommandInfo]);

  const resizeComposer = useCallback(() => {
    const textarea = textRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 220;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [newPostContent, resizeComposer]);

  const insertEmoji = (emoji) => {
    const textarea = textRef.current;
    if (!textarea) {
      setNewPostContent(c => c + emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = newPostContent.slice(0, start) + emoji + newPostContent.slice(end);
    setNewPostContent(newContent);
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
    const selected = newPostContent.slice(start, end);
    const newContent = newPostContent.slice(0, start) + prefix + selected + suffix + newPostContent.slice(end);
    setNewPostContent(newContent);
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
      textarea.focus();
    }, 0);
  };

  const handleComposerChange = (e) => {
    setNewPostContent(e.target.value);
    resizeComposer();
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files).slice(0, 9 - newPostImages.length);
    const newImages = [...newPostImages, ...files].slice(0, 9);
    setNewPostImages(newImages);
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newImages.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    setNewPostImages(imgs => imgs.filter((_, i) => i !== idx));
    setPreviews(prevs => prevs.filter((_, i) => i !== idx));
  };

  // Clean up previews when post is created (images reset)
  useEffect(() => {
    if (newPostImages.length === 0 && previews.length > 0) {
      previews.forEach(p => URL.revokeObjectURL(p));
      setPreviews([]);
    }
  }, [newPostImages.length]);

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

      {/* Post Composer — feature-matched with regular PostComposer */}
      {isMember && (
        <form onSubmit={onCreatePost} className="card mb-4">
          <div className="flex items-start gap-3 mb-3">
            {user?.avatar ? (
              <img src={user.avatar.startsWith('data:') ? user.avatar : getAvatarUrl(user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm shrink-0">
                {user?.username?.[0]?.toUpperCase()}
              </div>
            )}
            <textarea
              ref={textRef}
              value={newPostContent}
              onChange={handleComposerChange}
              className="input-field flex-1 resize-none min-h-[44px] max-h-[220px] overflow-y-auto"
              rows={1}
              placeholder="Share something (try /summary or /share)"
              maxLength={5000}
            />
          </div>

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
            <SessionSummaryCard
              summary={postSummaryPreview}
              title="Session Summary Preview"
              className="mt-2"
              actions={(
                <>
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
                </>
              )}
            />
          )}

          {hasShareCommand && !postSharePreview && (
            <div className="mt-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-display font-bold text-cyan-300">{SLASH_COMMANDS.share.trigger} command detected</p>
                  <p className="text-[11px] text-gray-400">Choose which results from your latest session to post.</p>
                </div>
                <button
                  type="button"
                  onClick={onLoadPostShareSession}
                  disabled={postShareLoading}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-[11px] font-display font-bold text-white disabled:opacity-50"
                >
                  {postShareLoading ? 'Loading...' : (postShareSessionRows.length > 0 ? 'Refresh Session' : 'Load Session')}
                </button>
              </div>

              {postShareSessionRows.length > 0 && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Mode</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['Single', 'Double', 'Both'].map((mode) => (
                        <button
                          key={`community-share-mode-${mode}`}
                          type="button"
                          onClick={() => setPostShareMode(mode)}
                          className={`px-2.5 py-1 rounded text-[11px] font-display font-bold border transition-colors ${
                            postShareMode === mode
                              ? 'bg-cyan-500 text-white border-cyan-400'
                              : 'bg-piu-dark text-gray-400 border-piu-border/60 hover:text-white'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Minimum Grade</p>
                    <select
                      value={postShareMinGrade}
                      onChange={(e) => setPostShareMinGrade(String(e.target.value || 'PASS').toUpperCase())}
                      className="input-field text-xs py-1.5"
                    >
                      {SHARE_MIN_GRADE_OPTIONS.map((option) => (
                        <option key={`community-share-grade-${option.value}`} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase mb-1">Level Range (select two levels)</p>
                    {postShareLevelOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {postShareLevelOptions.map((level) => {
                          const selected = level === postShareRangeA || level === postShareRangeB;
                          const inSelectedRange = selectedPostShareMin !== null && selectedPostShareMax !== null
                            ? level >= selectedPostShareMin && level <= selectedPostShareMax
                            : false;
                          return (
                            <button
                              key={`community-share-level-${level}`}
                              type="button"
                              onClick={() => {
                                if (postShareRangeA === null || (postShareRangeA !== null && postShareRangeB !== null)) {
                                  setPostShareRangeA(level);
                                  setPostShareRangeB(null);
                                  return;
                                }
                                if (postShareRangeA === level) {
                                  setPostShareRangeA(null);
                                  return;
                                }
                                setPostShareRangeB(level);
                              }}
                              className={`min-w-[34px] h-[30px] px-2 rounded-md text-xs font-display font-bold border transition-colors ${
                                selected
                                  ? 'bg-cyan-500 text-white border-cyan-400'
                                  : inSelectedRange
                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/50'
                                    : 'bg-piu-dark text-gray-400 border-piu-border/60 hover:text-white'
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No levels found in your latest session.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-gray-500">
                      Selected range:{' '}
                      {selectedPostShareMin !== null && selectedPostShareMax !== null
                        ? `Lv.${selectedPostShareMin} to Lv.${selectedPostShareMax}`
                        : 'Select two levels'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onGeneratePostShare({ reloadSession: false })}
                      disabled={postShareLoading || selectedPostShareMin === null || selectedPostShareMax === null}
                      className="px-3 py-1.5 rounded text-[11px] font-display font-bold bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {postShareLoading ? 'Generating...' : SLASH_COMMANDS.share.buttonLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {postSharePreview && (
            <SessionShareCard
              share={postSharePreview}
              title="Session Share Preview"
              className="mt-2"
              actions={(
                <>
                  <button
                    type="button"
                    onClick={() => onGeneratePostShare({ reloadSession: false })}
                    disabled={postShareLoading}
                    className="px-2 py-1 rounded border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 text-[10px] font-display font-bold disabled:opacity-50"
                  >
                    {postShareLoading ? 'Generating...' : 'Regenerate'}
                  </button>
                  <button
                    type="button"
                    onClick={onClearPostShare}
                    className="px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-400/10 text-[10px] font-display font-bold"
                  >
                    Remove
                  </button>
                </>
              )}
            />
          )}

          {postSummaryError && (
            <p className="mt-2 text-xs text-red-400">{postSummaryError}</p>
          )}
          {postShareError && (
            <p className="mt-2 text-xs text-red-400">{postShareError}</p>
          )}

          {/* YouTube URL input */}
          {showYoutubeInput && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
                value={newPostYoutube}
                onChange={(e) => setNewPostYoutube(e.target.value)}
              />
              <button type="button" onClick={() => { setShowYoutubeInput(false); setNewPostYoutube(''); }} className="text-gray-500 hover:text-red-400 text-xs">&#10005;</button>
            </div>
          )}

          {/* Image previews */}
          {previews.length > 0 && (
            <div className={`grid gap-1.5 mb-3 ${previews.length === 1 ? 'grid-cols-1 max-w-[120px]' : previews.length <= 4 ? 'grid-cols-2 max-w-[200px]' : 'grid-cols-3 max-w-[280px]'}`}>
              {previews.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="w-full aspect-square rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditingIndex(i)}
                    className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80 transition-colors"
                    title="Edit image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                  >x</button>
                </div>
              ))}
            </div>
          )}

          {/* Image Editor Modal */}
          {editingIndex !== null && newPostImages[editingIndex] && (
            <ImageEditor
              file={newPostImages[editingIndex]}
              onDone={(editedFile) => {
                const newImages = [...newPostImages];
                newImages[editingIndex] = editedFile;
                setNewPostImages(newImages);
                previews.forEach(p => URL.revokeObjectURL(p));
                setPreviews(newImages.map(f => URL.createObjectURL(f)));
                setEditingIndex(null);
              }}
              onCancel={() => setEditingIndex(null)}
            />
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between border-t border-piu-border/30 pt-2">
            <div className="flex items-center gap-1">
              {/* Bold */}
              <button type="button" onClick={() => applyFormat('**', '**')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs font-bold" title="Bold">B</button>
              {/* Italic */}
              <button type="button" onClick={() => applyFormat('*', '*')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs italic" title="Italic">I</button>
              {/* Strikethrough */}
              <button type="button" onClick={() => applyFormat('~~', '~~')} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-xs line-through" title="Strikethrough">S</button>

              <div className="w-px h-5 bg-piu-border/30 mx-1" />

              <DojoCatStickerPicker onSelect={insertEmoji} compact />

              {/* Emoji picker */}
              <div className="relative" ref={emojiRef}>
                <button type="button" onClick={() => setShowEmojis(!showEmojis)} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm" title="Emoji">&#9786;</button>
                {showEmojis && (
                  <div className="absolute left-0 top-full mt-1 bg-piu-card border border-piu-border rounded-xl shadow-2xl z-50 p-3 w-[min(18rem,calc(100vw-1.5rem))] max-h-80 overflow-y-auto">
                    {/* Custom community emojis */}
                    {customEmojis.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-piu-accent font-display mb-1">{community.display_name}</p>
                        <div className="flex flex-wrap gap-1">
                          {customEmojis.map(e => (
                            <button key={e.id} type="button" onClick={() => { insertEmoji(`:${e.name}:`); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors" title={e.name}>
                              <img src={e.image} alt={e.name} className="w-5 h-5 object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {EMOJI_GROUPS.map(group => (
                      <div key={group.label} className="mb-2">
                        <p className="text-[10px] text-gray-500 font-display mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.emojis.map(e => (
                            <button key={e} type="button" onClick={() => insertEmoji(e)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-piu-dark/50 transition-colors text-base">{e}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Image upload */}
              <button type="button" onClick={() => fileRef.current?.click()} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm" title="Attach images (max 9)" disabled={newPostImages.length >= 9}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />

              {/* YouTube link */}
              <button type="button" onClick={() => setShowYoutubeInput(!showYoutubeInput)} className={`p-1.5 rounded hover:bg-piu-dark/50 transition-colors text-sm ${showYoutubeInput || newPostYoutube ? 'text-red-400' : 'text-gray-400 hover:text-white'}`} title="Attach YouTube video">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setShowCommandInfo(true)}
                className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors text-sm"
                title="Extra commands"
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current text-[11px] font-display font-bold">i</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={posting || !canSubmit}
              className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {showCommandInfo && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCommandInfo(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-piu-border bg-piu-card p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm tracking-wide">Extra Commands</h3>
              <button
                type="button"
                onClick={() => setShowCommandInfo(false)}
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Close command info"
              >
                &#10005;
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-piu-border/50 bg-piu-dark/40 px-3 py-2">
              <p className="text-[11px] text-gray-300">
                <span className="font-mono text-piu-accent">{SLASH_COMMANDS.summary.trigger}</span>
                {' '}Generate a recap from your latest recently-played session.
              </p>
              <p className="text-[11px] text-gray-300 mt-1.5">
                <span className="font-mono text-cyan-300">{SLASH_COMMANDS.share.trigger}</span>
                {' '}Filter latest-session results and post a share card with judgment drill-down.
              </p>
            </div>
          </div>
        </div>
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

// ─── Badge List Component ────────────────────────────

function BadgeList({ badges }) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {badges.map(b => (
        <img key={b.id} src={b.image} alt={b.name} title={b.name} className="w-4 h-4 object-contain" />
      ))}
    </span>
  );
}

// ─── Community Post Card (feature-matched with PostCard) ─

function CommunityPostCard({
  post, community, user, isMember, isModOrOwner,
  onDelete, onPin, onPump,
  comments, onToggleComments,
  commentTexts, setCommentTexts,
  replyTo, setReplyTo, onAddComment, onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pumped, setPumped] = useState(!!post.user_pumped);
  const [pumpCount, setPumpCount] = useState(post.pump_count || 0);
  const [animating, setAnimating] = useState(false);
  const [showPumpers, setShowPumpers] = useState(false);
  const images = (() => { try { return JSON.parse(post.images || '[]'); } catch { return []; } })();
  const isAuthor = user?.id === post.user_id;
  const canDelete = isAuthor || isModOrOwner;
  const parsedSummary = splitSessionSummaryContent(post.content || '');
  const parsedShare = splitSessionShareContent(parsedSummary.text || '');
  const postText = parsedShare.text || '';
  const postSummary = parsedSummary.summary;
  const postShare = parsedShare.share;

  const handlePump = async () => {
    if (!isMember) return;
    try {
      const result = await pumpCommunityPost(community.id, post.id);
      setPumped(result.pumped);
      setPumpCount(result.pump_count);
      if (result.pumped) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 600);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="card overflow-hidden">
      {/* Pinned indicator */}
      {post.is_pinned ? (
        <div className="px-4 py-1.5 -mx-4 -mt-4 mb-3 bg-piu-accent/10 border-b border-piu-accent/20 flex items-center gap-1.5 text-[10px] text-piu-accent font-display font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.182L2.4 8.044a.5.5 0 0 1 0-.707c.688-.688 1.673-.766 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
          </svg>
          PINNED
        </div>
      ) : null}

      {/* Author header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link to={getProfilePath(post.user_id, post.username)}>
            {post.user_avatar ? (
              <img src={post.user_avatar.startsWith('data:') ? post.user_avatar : getAvatarUrl(post.user_avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
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
              <BadgeList badges={post.author_badges} />
              <CommunityTagList tags={post.author_tags} />
            </div>
            <p className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</p>
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
      {postText && (
        <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 leading-relaxed">
          {renderFormattedText(postText)}
        </div>
      )}

      {postSummary && (
        <SessionSummaryCard summary={postSummary} title="Session Summary" className="mb-3" />
      )}
      {postShare && (
        <SessionShareCard share={postShare} title="Session Share" className="mb-3" />
      )}

      {/* YouTube */}
      {post.youtube_url && <YouTubeEmbed url={post.youtube_url} />}

      {/* Images with lightbox */}
      <ImageGrid images={images} onImageClick={setLightboxIndex} />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* Actions: Pump + Comments + Share */}
      <div className="border-t border-piu-border/20 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pump button (stomp icon matching PostCard) */}
          <button
            onClick={handlePump}
            disabled={!isMember}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold transition-all ${
              pumped
                ? 'text-piu-gold bg-piu-gold/10'
                : 'text-gray-400 hover:text-piu-gold hover:bg-piu-gold/5'
            } ${!isMember ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!isMember ? 'Join to interact' : (pumped ? 'Un-pump' : 'Pump it up!')}
          >
            <img
              src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'}
              alt=""
              className={`w-4 h-4 ${animating ? 'animate-bounce' : ''}`}
            />
          </button>
          {pumpCount > 0 && (
            <button
              type="button"
              onClick={() => setShowPumpers(true)}
              className="px-2 py-1 rounded-lg text-xs font-display font-bold text-gray-300 hover:text-white hover:bg-piu-dark/50 transition-colors"
              title="See who pumped this post"
            >
              {pumpCount}
            </button>
          )}
          <PumpersModal
            open={showPumpers}
            onClose={() => setShowPumpers(false)}
            title={`Pumped by (${pumpCount})`}
            loadPumpers={() => getCommunityPostPumpers(community.id, post.id)}
            reloadKey={pumpCount}
          />

          {/* Comments button */}
          <button
            onClick={() => onToggleComments()}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-display font-bold text-gray-400 hover:text-white hover:bg-piu-dark/50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{post.comment_count > 0 ? post.comment_count : ''}</span>
          </button>

          {/* Share button */}
          <ShareButton path={`/c/${community.name}`} />
        </div>
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
                disabled={!commentTexts[post.id]?.trim()}
                className="text-xs font-display font-bold text-piu-accent hover:text-white disabled:opacity-30 transition-colors shrink-0"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Comment Pump Button ─────────────────────────────

function CommunityCommentPump({ communityId, commentId, initialCount, initialPumped, isMember }) {
  const [pumped, setPumped] = useState(!!initialPumped);
  const [count, setCount] = useState(initialCount || 0);

  const toggle = async () => {
    if (!isMember) return;
    try {
      const res = await pumpCommunityComment(communityId, commentId);
      setPumped(res.pumped);
      setCount(res.pump_count);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      disabled={!isMember}
      className={`flex items-center gap-0.5 transition-colors ${
        pumped ? 'text-piu-gold' : 'text-gray-600 hover:text-piu-gold'
      } ${!isMember ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={pumped ? 'Un-pump' : 'Pump'}
    >
      <img src={pumped ? '/piu/stomp-yellow.svg' : '/piu/stomp-gray.svg'} alt="" className="w-3 h-3" />
      {count > 0 && <span className="text-[9px] font-display font-bold">{count}</span>}
    </button>
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
            <img src={comment.user_avatar.startsWith('data:') ? comment.user_avatar : getAvatarUrl(comment.user_avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-piu-border shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[8px] shrink-0">
              {comment.username?.[0]?.toUpperCase()}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="bg-piu-dark/50 rounded-lg px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <Link to={getProfilePath(comment.user_id, comment.username)} className="font-display font-bold text-[11px] hover:text-piu-accent transition-colors leading-none">
                {comment.username}
              </Link>
              <BadgeList badges={comment.author_badges} />
              <CommunityTagList tags={comment.author_tags} />
            </div>
            <div className="text-xs text-gray-300 mt-0.5 break-words">{renderFormattedText(comment.content)}</div>
          </div>
          <div className="flex items-center gap-3 mt-0.5 px-1">
            <span className="text-[10px] text-gray-600">{timeAgo(comment.created_at)}</span>
            <CommunityCommentPump communityId={community.id} commentId={comment.id} initialCount={comment.pump_count || 0} initialPumped={comment.user_pumped} isMember={isMember} />
            {isMember && (
              <button onClick={() => setReplyTo(comment.id)} className="text-[10px] text-gray-500 hover:text-piu-accent">Reply</button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(postId, comment.id)} className="text-[10px] text-gray-600 hover:text-red-400">Delete</button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-8 mt-1 space-y-1">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-2">
              <Link to={getProfilePath(reply.user_id, reply.username)}>
                {reply.user_avatar ? (
                  <img src={reply.user_avatar.startsWith('data:') ? reply.user_avatar : getAvatarUrl(reply.user_avatar)} alt="" className="w-5 h-5 rounded-full object-cover border border-piu-border shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[7px] shrink-0">
                    {reply.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <div className="bg-piu-dark/30 rounded-lg px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <Link to={getProfilePath(reply.user_id, reply.username)} className="font-display font-bold text-[10px] hover:text-piu-accent transition-colors leading-none">
                      {reply.username}
                    </Link>
                    <BadgeList badges={reply.author_badges} />
                    <CommunityTagList tags={reply.author_tags} />
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5 break-words">{renderFormattedText(reply.content)}</div>
                </div>
                <div className="flex items-center gap-3 mt-0.5 px-1">
                  <span className="text-[9px] text-gray-600">{timeAgo(reply.created_at)}</span>
                  <CommunityCommentPump communityId={community.id} commentId={reply.id} initialCount={reply.pump_count || 0} initialPumped={reply.user_pumped} isMember={isMember} />
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

  const insertSticker = (token) => {
    const current = String(value || '');
    const input = inputRef.current;
    if (!input) {
      const next = `${current}${token}`;
      onChange(next);
      updateMentionState(next, next.length);
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    const nextCursor = start + token.length;
    onChange(next);
    updateMentionState(next, nextCursor);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
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
      <div className="flex items-center gap-2">
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
        <DojoCatStickerPicker onSelect={insertSticker} compact align="right" />
      </div>
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

function AboutTab({ community }) {
  const aboutText = String(community.about || '').trim();
  const rulesText = String(community.rules || '').trim();
  const rawLocation = String(community.location_country || '').trim();
  const locationCode = rawLocation.toUpperCase();
  const knownCountry = COUNTRY_NAME_BY_CODE[locationCode] || '';
  const locationName = knownCountry || rawLocation;

  return (
    <div className="space-y-4">
      <section className="card">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">About</p>
        {aboutText ? (
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{aboutText}</p>
        ) : (
          <p className="text-sm text-gray-500">No long description has been added yet.</p>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="card">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Privacy</p>
          <p className="text-sm font-display font-bold text-gray-100">{community.is_invite_only ? 'Private' : 'Public'}</p>
        </section>

        <section className="card">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Location</p>
          {locationName ? (
            <div className="inline-flex items-center gap-2 text-sm text-gray-100">
              {knownCountry && (
                <span>{getCountryFlag(locationCode, 'inline-block h-4 align-middle')}</span>
              )}
              <span>{locationName}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-gray-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
              </svg>
              <span>Global</span>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Rules</p>
        {rulesText ? (
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{rulesText}</p>
        ) : (
          <p className="text-sm text-gray-500">No community rules have been added yet.</p>
        )}
      </section>
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────

function getCompetitiveLevelInspectRow(rows, computedLevel) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const targetLevel = parseInt(computedLevel, 10) || 0;
  if (targetLevel > 0) {
    const exact = list.find((row) => (parseInt(row?.level, 10) || 0) === targetLevel);
    if (exact) return exact;
  }

  for (let idx = list.length - 1; idx >= 0; idx -= 1) {
    const cleared = parseInt(list[idx]?.cleared_charts, 10) || 0;
    if (cleared > 0) return list[idx];
  }
  return list[list.length - 1] || list[0];
}

const LEADERBOARD_GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const LEADERBOARD_GRADE_INDEX = Object.fromEntries(LEADERBOARD_GRADE_ORDER.map((grade, idx) => [grade, idx]));

function getLeaderboardGradeSortValue(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  return LEADERBOARD_GRADE_INDEX[normalized] ?? -1;
}

function CompetitiveLevelFolderCard({ modeLabel, modePrefix, modeColorClass, computedLevel, rows }) {
  const inspectedRow = getCompetitiveLevelInspectRow(rows, computedLevel);
  const computed = parseInt(computedLevel, 10) || 0;

  if (!inspectedRow) {
    return (
      <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-display font-bold tracking-wide text-gray-300">{modeLabel}</p>
          <span className={`font-display font-black text-sm ${modeColorClass}`}>{computed > 0 ? `${modePrefix}${computed}` : '--'}</span>
        </div>
        <p className="text-[11px] text-gray-500">No folder data available for this player yet.</p>
      </div>
    );
  }

  const folderLevel = parseInt(inspectedRow?.level, 10) || 0;
  const avgScore = parseInt(inspectedRow?.average_score, 10) || 0;
  const avgGrade = String(inspectedRow?.average_grade || '').trim() || (avgScore > 0 ? getRankLabel(avgScore) : '--');
  const clearedCharts = parseInt(inspectedRow?.cleared_charts, 10) || 0;
  const totalCharts = parseInt(inspectedRow?.total_charts, 10) || 0;
  const clearPct = totalCharts > 0 ? (clearedCharts / totalCharts) * 100 : 0;
  const meetsCoverage = totalCharts > 0 && clearPct >= 50;
  const meetsGrade = avgGrade !== '--'
    ? getLeaderboardGradeSortValue(avgGrade) >= getLeaderboardGradeSortValue('S')
    : avgScore >= 970000;
  const qualifies = meetsCoverage && meetsGrade;

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-display font-bold tracking-wide text-gray-300">{modeLabel}</p>
        <span className={`font-display font-black text-sm ${modeColorClass}`}>{computed > 0 ? `${modePrefix}${computed}` : '--'}</span>
      </div>
      <div className="space-y-1 text-[11px] text-gray-400">
        <p>Inspected folder: <span className={`font-display font-bold ${modeColorClass}`}>{folderLevel > 0 ? `${modePrefix}${folderLevel}` : '--'}</span></p>
        <p>
          Avg grade:{' '}
          <span className={`font-display font-bold ${avgGrade !== '--' ? getGradeColorClass(avgGrade) : 'text-gray-500'}`}>
            {avgGrade}
          </span>
        </p>
        <p>Avg score: <span className="font-mono text-gray-200">{avgScore > 0 ? formatNumber(avgScore) : '--'}</span></p>
        <p className={meetsCoverage ? 'text-emerald-300' : 'text-gray-500'}>
          Clear coverage: {totalCharts > 0 ? `${clearPct.toFixed(1)}% (${clearedCharts}/${totalCharts})` : '--'}
        </p>
        <p className={meetsGrade ? 'text-emerald-300' : 'text-gray-500'}>
          S-or-better average: {meetsGrade ? 'met' : 'not met'}
        </p>
        <p className={qualifies ? 'text-emerald-300' : 'text-gray-500'}>
          {qualifies ? 'This folder qualifies for competitive level.' : 'This folder does not qualify yet.'}
        </p>
      </div>
    </div>
  );
}

function getHighestCompetitiveLevel(member) {
  const singleLevel = parseInt(member?.singles_competitive_level, 10) || 0;
  const doubleLevel = parseInt(member?.doubles_competitive_level, 10) || 0;
  if (singleLevel <= 0 && doubleLevel <= 0) {
    return { value: 0, label: '--', colorClass: 'text-gray-500' };
  }
  if (doubleLevel > singleLevel) {
    return { value: doubleLevel, label: `D${doubleLevel}`, colorClass: 'text-green-300' };
  }
  return { value: singleLevel, label: `S${singleLevel}`, colorClass: 'text-red-300' };
}

function CompetitiveLevelInfoModal({ open, member, onClose }) {
  if (!open || !member) return null;
  const highestLevel = getHighestCompetitiveLevel(member);
  const singleRows = member?.analytics?.levels?.single || [];
  const doubleRows = member?.analytics?.levels?.double || [];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <div>
            <h3 className="font-display font-bold tracking-wide text-sm">
              Competitive Level • {member.username}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Highest folder: <span className={`font-display font-bold ${highestLevel.colorClass}`}>{highestLevel.label}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="px-4 py-3 text-[11px] text-gray-400">
          Competitive level requires both: 50%+ clears in a folder and a folder average of Grade S (970,000+) or better.
        </div>

        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <CompetitiveLevelFolderCard
            modeLabel="Singles Folder"
            modePrefix="S"
            modeColorClass="text-red-300"
            computedLevel={member?.singles_competitive_level}
            rows={singleRows}
          />
          <CompetitiveLevelFolderCard
            modeLabel="Doubles Folder"
            modePrefix="D"
            modeColorClass="text-green-300"
            computedLevel={member?.doubles_competitive_level}
            rows={doubleRows}
          />
        </div>
      </div>
    </div>
  );
}

function LeaderboardSortHeader({ label, sortKey, activeSortKey, sortDirection, onSort }) {
  const isActive = activeSortKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1.5 text-left text-[11px] font-display font-bold tracking-wide uppercase transition-colors ${
        isActive ? 'text-piu-accent' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-[10px]">{isActive ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}</span>
    </button>
  );
}

function LeaderboardTab({ rows, loading, error, metric, setMetric, onRefresh }) {
  const [openBreakdown, setOpenBreakdown] = useState(null);
  const [openCompInfo, setOpenCompInfo] = useState(null);
  const [sortKey, setSortKey] = useState('pumbility');
  const [sortDirection, setSortDirection] = useState('desc');
  const [mobileMetricView, setMobileMetricView] = useState('avg_grade');
  const normalizedMetric = metric === 'singles' ? 'singles' : 'overall';

  const getMetricValues = (member) => {
    const isSingles = normalizedMetric === 'singles';
    const pumbilityValue = isSingles
      ? (parseInt(member?.singles_pumbility, 10) || 0)
      : (parseInt(member?.overall_pumbility, 10) || parseInt(member?.pumbility, 10) || 0);
    const averageGrade = isSingles
      ? (member?.singles_average_grade || '--')
      : (member?.overall_average_grade || '--');
    const averageLevel = isSingles
      ? (Number(member?.singles_average_level) || 0)
      : (Number(member?.overall_average_level) || 0);
    const breakdownCount = isSingles
      ? (Array.isArray(member?.singles_breakdown) ? member.singles_breakdown.length : 0)
      : (Array.isArray(member?.overall_breakdown) ? member.overall_breakdown.length : 0);
    const competitiveLevel = getHighestCompetitiveLevel(member);
    return {
      pumbilityValue,
      averageGrade,
      averageGradeValue: getLeaderboardGradeSortValue(averageGrade),
      averageLevel,
      breakdownCount,
      competitiveLevel,
    };
  };

  const sortedRows = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : [];
    return list.sort((a, b) => {
      const metricsA = getMetricValues(a);
      const metricsB = getMetricValues(b);
      let comparison = 0;

      if (sortKey === 'avg_grade') comparison = metricsA.averageGradeValue - metricsB.averageGradeValue;
      else if (sortKey === 'avg_level') comparison = metricsA.averageLevel - metricsB.averageLevel;
      else if (sortKey === 'competitive_level') comparison = metricsA.competitiveLevel.value - metricsB.competitiveLevel.value;
      else comparison = metricsA.pumbilityValue - metricsB.pumbilityValue;

      if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison;
      return String(a?.username || '').localeCompare(String(b?.username || ''), undefined, { sensitivity: 'base' });
    });
  }, [rows, normalizedMetric, sortKey, sortDirection]);

  const handleOpenBreakdown = (member) => {
    const isSingles = normalizedMetric === 'singles';
    const breakdownRows = isSingles
      ? (member?.singles_breakdown || [])
      : (member?.overall_breakdown || []);
    if (!Array.isArray(breakdownRows) || breakdownRows.length === 0) return;
    setOpenBreakdown({
      title: isSingles
        ? `${member.username} • Singles Pumbility Top Songs`
        : `${member.username} • Pumbility Top Songs`,
      rows: breakdownRows,
    });
  };

  const handleSort = (nextKey) => {
    if (nextKey === sortKey) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('desc');
  };

  const handleOpenCompInfo = (member) => {
    if (!member) return;
    setOpenCompInfo(member);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-display">View:</span>
          <button
            onClick={() => setMetric('overall')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              normalizedMetric === 'overall' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Overall Pumbility
          </button>
          <button
            onClick={() => setMetric('singles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              normalizedMetric === 'singles' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Singles Pumbility
          </button>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white hover:border-piu-accent/50 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="md:hidden mb-3 flex items-center gap-2">
        <label htmlFor="leaderboard-mobile-metric" className="text-[11px] text-gray-500 font-display">Show:</label>
        <select
          id="leaderboard-mobile-metric"
          value={mobileMetricView}
          onChange={(event) => setMobileMetricView(event.target.value)}
          className="flex-1 bg-piu-dark border border-piu-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 font-display focus:outline-none focus:border-piu-accent"
        >
          <option value="avg_grade">Avg Grade</option>
          <option value="avg_level">Avg Level</option>
          <option value="competitive_level">C. Level</option>
        </select>
      </div>

      <p className="hidden md:block text-[11px] text-gray-500 mb-3">
        Click a column header to switch between high-to-low and low-to-high sorting.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : sortedRows.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">No leaderboard data available yet</p>
      ) : (
        <>
          <div className="md:hidden space-y-1.5">
            {sortedRows.map((member, index) => {
              const metrics = getMetricValues(member);
              const communityRank = parseInt(member?.community_rank, 10) || (index + 1);
              const communityRankDelta = parseInt(member?.community_rank_delta, 10) || 0;
              const pumbilityCanOpen = metrics.pumbilityValue > 0 && metrics.breakdownCount > 0;
              const mobileMetricLabel = mobileMetricView === 'avg_level'
                ? 'Avg Level'
                : mobileMetricView === 'competitive_level'
                  ? 'C. Level'
                  : 'Avg Grade';

              return (
                <div key={member.id} className="rounded-lg border border-piu-border/40 bg-piu-card/35 px-2.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-12 shrink-0 flex flex-col items-start gap-0.5">
                        <span className="text-sm font-mono text-gray-500">#{communityRank}</span>
                        <RankDeltaIndicator delta={communityRankDelta} compact />
                      </div>
                      <Link to={getProfilePath(member.id, member.username)} className="shrink-0">
                        {member.avatar ? (
                          <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border/40" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs border border-piu-border/40">
                            {member.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                          <Link to={getProfilePath(member.id, member.username)} className="font-display font-bold text-sm truncate hover:text-piu-accent transition-colors">
                            {member.username}
                          </Link>
                          <BadgeList badges={member.badges} />
                          {member.nationality && <span className="text-sm">{getCountryFlag(member.nationality)}</span>}
                          {member.role === 'owner' && (
                            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-gold/20 text-piu-gold">Owner</span>
                          )}
                          {member.role === 'moderator' && (
                            <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-blue/20 text-piu-blue">Mod</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                          <span>{mobileMetricLabel}:</span>
                          {mobileMetricView === 'avg_level' && (
                            <span className="font-mono text-gray-300">{metrics.averageLevel > 0 ? metrics.averageLevel.toFixed(1) : '--'}</span>
                          )}
                          {mobileMetricView === 'avg_grade' && (
                            <span className={`font-display font-bold ${metrics.averageGrade !== '--' ? getGradeColorClass(metrics.averageGrade) : 'text-gray-500'}`}>
                              {metrics.averageGrade || '--'}
                            </span>
                          )}
                          {mobileMetricView === 'competitive_level' && (
                            <button
                              type="button"
                              onClick={() => handleOpenCompInfo(member)}
                              className={`font-display font-bold underline decoration-dotted underline-offset-2 transition-colors hover:text-piu-accent ${metrics.competitiveLevel.colorClass}`}
                            >
                              {metrics.competitiveLevel.label}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenBreakdown(member)}
                      disabled={!pumbilityCanOpen}
                      className={`shrink-0 text-sm font-mono font-bold transition-colors ${
                        pumbilityCanOpen
                          ? 'text-piu-gold hover:text-yellow-300'
                          : 'text-gray-500 cursor-default'
                      }`}
                    >
                      {metrics.pumbilityValue > 0 ? formatNumber(metrics.pumbilityValue) : '--'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
              <table className="w-full table-fixed">
                <thead className="bg-piu-dark/70">
                  <tr className="border-b border-piu-border/50">
                    <th className="px-2 py-2 text-left text-[11px] font-display font-bold tracking-wide uppercase text-gray-500 w-[7%]">#</th>
                    <th className="px-2 py-2 text-left text-[11px] font-display font-bold tracking-wide uppercase text-gray-500 w-[34%]">Player</th>
                    <th className="px-2 py-2 text-left w-[16%]">
                      <LeaderboardSortHeader
                        label="Pumbility"
                        sortKey="pumbility"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-2 py-2 text-left w-[14%]">
                      <LeaderboardSortHeader
                        label="Avg Grade"
                        sortKey="avg_grade"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-2 py-2 text-left w-[14%]">
                      <LeaderboardSortHeader
                        label="Avg Level"
                        sortKey="avg_level"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-2 py-2 text-left w-[15%]">
                      <LeaderboardSortHeader
                        label="Competitive Level"
                        sortKey="competitive_level"
                        activeSortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((member, index) => {
                    const metrics = getMetricValues(member);
                    const communityRank = parseInt(member?.community_rank, 10) || (index + 1);
                    const communityRankDelta = parseInt(member?.community_rank_delta, 10) || 0;
                    const pumbilityCanOpen = metrics.pumbilityValue > 0 && metrics.breakdownCount > 0;
                    return (
                      <tr key={member.id} className="border-b border-piu-border/25 last:border-b-0 hover:bg-piu-dark/25 transition-colors">
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-sm font-mono text-gray-500">#{communityRank}</span>
                            <RankDeltaIndicator delta={communityRankDelta} compact />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link to={getProfilePath(member.id, member.username)} className="shrink-0">
                              {member.avatar ? (
                                <img src={member.avatar.startsWith('data:') ? member.avatar : getAvatarUrl(member.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border/40" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs border border-piu-border/40">
                                  {member.username?.[0]?.toUpperCase()}
                                </div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  to={getProfilePath(member.id, member.username)}
                                  className="font-display font-bold text-[13px] hover:text-piu-accent transition-colors truncate max-w-[120px] lg:max-w-[170px] xl:max-w-[220px]"
                                >
                                  {member.username}
                                </Link>
                                <BadgeList badges={member.badges} />
                                {member.nationality && <span className="text-sm">{getCountryFlag(member.nationality)}</span>}
                                {member.role === 'owner' && (
                                  <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-gold/20 text-piu-gold">Owner</span>
                                )}
                                {member.role === 'moderator' && (
                                  <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-full bg-piu-blue/20 text-piu-blue">Mod</span>
                                )}
                              </div>
                              <CommunityTagList tags={member.tags} />
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenBreakdown(member)}
                            disabled={!pumbilityCanOpen}
                            className={`font-mono font-bold transition-colors ${
                              pumbilityCanOpen
                                ? 'text-piu-gold hover:text-yellow-300'
                                : 'text-gray-500 cursor-default'
                            }`}
                          >
                            {metrics.pumbilityValue > 0 ? formatNumber(metrics.pumbilityValue) : '--'}
                          </button>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className={`font-display font-bold text-sm ${metrics.averageGrade !== '--' ? getGradeColorClass(metrics.averageGrade) : 'text-gray-500'}`}>
                            {metrics.averageGrade || '--'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-sm font-mono text-gray-300 whitespace-nowrap">
                          {metrics.averageLevel > 0 ? metrics.averageLevel.toFixed(1) : '--'}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenCompInfo(member)}
                            className={`font-display font-bold text-sm underline decoration-dotted underline-offset-2 transition-colors hover:text-piu-accent ${metrics.competitiveLevel.colorClass}`}
                            title="Show this player's competitive level details"
                          >
                            {metrics.competitiveLevel.label}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
        </>
      )}

      <PumbilityBreakdownModal
        open={!!openBreakdown}
        title={openBreakdown?.title || ''}
        rows={openBreakdown?.rows || []}
        onClose={() => setOpenBreakdown(null)}
      />
      <CompetitiveLevelInfoModal
        open={!!openCompInfo}
        member={openCompInfo}
        onClose={() => setOpenCompInfo(null)}
      />
    </div>
  );
}

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
                  <BadgeList badges={member.badges} />
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

// (Helpers: YouTubeEmbed, ImageGrid, Lightbox, ShareButton imported from PostCard)
