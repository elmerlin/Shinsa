import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserProfile, getUserProfileByUsername, getUserStats, getUserActivity, getJacketMap, getChartKeyMap,
  getSongAnalytics,
  getPiugameSyncStatus, getPiugamePumbility, getPiugameBestScores, getPiugameRecentlyPlayed, getPiugameTitles,
  syncPumbility, syncRecentlyPlayed, syncBestScores, getSyncProgress,
  getProfileShoes, wearProfileShoe,
  followUser, unfollowUser, getFollowStatus, getSocialCounts,
  getUserPosts, getFollowers, getFollowing,
  getActivityNotificationPreferences, updateActivityNotificationPreferences,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';
import PostCard, { timeAgo } from '../components/PostCard';
import SongAnalyticsPanel from '../components/SongAnalyticsPanel';
import SkillBreakdownPanel from '../components/SkillBreakdownPanel';
import RankingsPanel from '../components/RankingsPanel';
import GradeGoalTracker from '../components/GradeGoalTracker';
import TitleProgressTab from '../components/TitleProgressTab';
import { getProfilePath } from '../utils/profile';
import { parseGrade } from '../utils/grades';

function getAge(dateStr) {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function getRank(score) {
  const s = parseInt(score) || 0;
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

function getGradeColor(grade) {
  const g = parseGrade(grade).normalized.replace('+', '_P');
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g.includes('A')) return 'text-amber-700';
  return 'text-gray-500';
}

// Rank ranges for distribution chart — ordered from best to worst
const RANK_RANGES = [
  { label: 'SSS+', min: 995000, bg: 'bg-sky-300' },
  { label: 'SSS',  min: 990000, bg: 'bg-sky-400' },
  { label: 'SS+',  min: 985000, bg: 'bg-yellow-300' },
  { label: 'SS',   min: 980000, bg: 'bg-yellow-400' },
  { label: 'S+',   min: 975000, bg: 'bg-amber-400' },
  { label: 'S',    min: 970000, bg: 'bg-amber-500' },
  { label: 'AAA+', min: 960000, bg: 'bg-slate-300' },
  { label: 'AAA',  min: 950000, bg: 'bg-slate-400' },
  { label: 'AA+',  min: 925000, bg: 'bg-violet-400' },
  { label: 'AA',   min: 900000, bg: 'bg-violet-500' },
  { label: 'A+',   min: 825000, bg: 'bg-emerald-400' },
  { label: 'A',    min: 750000, bg: 'bg-emerald-500' },
  { label: 'B',    min: 650000, bg: 'bg-gray-400' },
  { label: 'C',    min: 550000, bg: 'bg-gray-500' },
  { label: 'D',    min: 450000, bg: 'bg-gray-600' },
  { label: 'F',    min: 0,      bg: 'bg-gray-700' },
];

const GRADE_BARS = [
  { key: 'SSS+', color: '#7dd3fc' },
  { key: 'SSS', color: '#38bdf8' },
  { key: 'SS+', color: '#fde047' },
  { key: 'SS', color: '#facc15' },
  { key: 'S+', color: '#f59e0b' },
  { key: 'S', color: '#d97706' },
  { key: 'AAA+', color: '#cbd5e1' },
  { key: 'AAA', color: '#94a3b8' },
  { key: 'AA+', color: '#a78bfa' },
  { key: 'AA', color: '#8b5cf6' },
  { key: 'A+', color: '#34d399' },
  { key: 'A', color: '#10b981' },
  { key: 'B', color: '#9ca3af' },
];

const SINGLE_MAX_LEVEL = 26;
const DOUBLE_MAX_LEVEL = 28;
const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function parseDayKey(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function diffDays(startDate, endDate) {
  return Math.round((startOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / DAY_MS);
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

function parsePlayDayKey(value) {
  const parsed = parsePlayedAt(value);
  if (parsed) return toDayKey(parsed);

  const fallback = String(value || '').trim().replace(/[./]/g, '-');
  const m = fallback.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
}

function hexToRgb(hex) {
  const cleaned = String(hex || '').replace('#', '');
  if (cleaned.length !== 6) return null;
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function toHex(v) {
  return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
}

function interpolateHex(fromHex, targetHex, t) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(targetHex);
  if (!from || !to) return fromHex;
  const ratio = clamp(t, 0, 1);
  const r = from.r + (to.r - from.r) * ratio;
  const g = from.g + (to.g - from.g) * ratio;
  const b = from.b + (to.b - from.b) * ratio;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getSingleLevelColor(level) {
  const lv = clamp(Number(level) || 0, 1, SINGLE_MAX_LEVEL);
  const ratio = lv / SINGLE_MAX_LEVEL;
  return interpolateHex('#fca5a5', '#7f1d1d', ratio);
}

function getDoubleLevelColor(level) {
  const lv = clamp(Number(level) || 0, 1, DOUBLE_MAX_LEVEL);
  const ratio = lv / DOUBLE_MAX_LEVEL;
  return interpolateHex('#86efac', '#14532d', ratio);
}

function isStageBreakPlay(play) {
  return (parseInt(play?.score, 10) || 0) <= 0;
}

function getChartGradeFromScore(score) {
  const label = getRank(parseInt(score, 10) || 0).label;
  // Keep chart compact: fold C/D/F into the B bucket.
  if (label === 'C' || label === 'D' || label === 'F') return 'B';
  return label;
}

function DailyLevelGradeChart({ plays }) {
  const chartData = useMemo(() => {
    const levelMap = {};
    const rows = Array.isArray(plays) ? plays : [];

    for (const play of rows) {
      const level = parseInt(play?.level, 10);
      if (!Number.isFinite(level) || level <= 0) continue;
      if (!levelMap[level]) {
        const seed = { levelLabel: `Lv.${level}`, levelValue: level, stage_break: 0 };
        for (const g of GRADE_BARS) seed[g.key] = 0;
        levelMap[level] = seed;
      }

      if (isStageBreakPlay(play)) {
        levelMap[level].stage_break -= 1;
        continue;
      }

      const grade = getChartGradeFromScore(play.score);
      if (levelMap[level][grade] !== undefined) {
        levelMap[level][grade] += 1;
      }
    }

    return Object.values(levelMap).sort((a, b) => a.levelValue - b.levelValue);
  }, [plays]);

  if (chartData.length === 0) return null;

  const maxMagnitude = Math.max(
    1,
    ...chartData.map((d) => {
      const positives = GRADE_BARS.reduce((sum, g) => sum + (d[g.key] || 0), 0);
      return Math.max(positives, Math.abs(d.stage_break || 0));
    })
  );

  const tooltipContent = ({ active, label, payload }) => {
    if (!active || !Array.isArray(payload)) return null;
    const rows = payload.filter((item) => (parseInt(item?.value, 10) || 0) !== 0);
    if (rows.length === 0) return null;

    return (
      <div className="rounded-lg border border-slate-700 bg-[#0b1220] px-2.5 py-2 shadow-lg">
        <p className="text-[10px] font-display font-bold text-slate-200 mb-1">{label}</p>
        <div className="space-y-0.5">
          {rows.map((item, idx) => {
            const key = String(item?.dataKey || item?.name || '');
            const value = Math.abs(parseInt(item?.value, 10) || 0);
            const text = key === 'stage_break' ? 'Stage Break' : key;
            return (
              <div key={`${key}-${idx}`} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: item?.fill || item?.color || '#64748b' }}
                  />
                  {text}
                </span>
                <span className="font-mono font-bold text-slate-200">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4">
      <h4 className="text-[10px] font-display font-bold text-gray-500 mb-2 uppercase tracking-wide">
        Grade Count by Level (Stage Break below zero)
      </h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="rgba(148,163,184,0.2)" vertical={false} />
            <XAxis dataKey="levelLabel" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis
              domain={[-maxMagnitude, maxMagnitude]}
              allowDecimals={false}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
            />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.45)" />
            <Tooltip content={tooltipContent} />
            {GRADE_BARS.map((grade) => (
              <Bar key={grade.key} dataKey={grade.key} stackId="grades" fill={grade.color} />
            ))}
            <Bar dataKey="stage_break" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {GRADE_BARS.map((g) => (
          <span key={g.key} className="inline-flex items-center gap-1 text-[9px] text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: g.color }} />
            {g.key}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[9px] text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#dc2626' }} />
          Stage Break
        </span>
      </div>
    </div>
  );
}

function getRankIndex(score) {
  for (let i = 0; i < RANK_RANGES.length; i++) {
    if (score >= RANK_RANGES[i].min) return i;
  }
  return RANK_RANGES.length - 1;
}

// Reusable song jacket with level badge overlay
function PiuSongJacket({ title, mode, level, bgUrl, jacketLookup, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  const badgeSize = size === 'sm' ? 'text-[8px] min-w-[16px] h-[14px]' : 'text-[9px] min-w-[18px] h-[16px]';
  const isSingle = mode === 'Single';
  const isDouble = mode === 'Double';

  const norm = (title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${norm}|${mode}|${level}`;
  // Prefer local jacket from lookup; only use bgUrl if it's a local path (not piugame)
  const localJacket = jacketLookup[exactKey] || jacketLookup[norm] || '';
  const jacketUrl = localJacket || (bgUrl && !bgUrl.includes('piugame') ? bgUrl : '') || '';

  const badgeColor = isSingle ? 'bg-red-600' : isDouble ? 'bg-green-600' : 'bg-blue-600';

  return (
    <div className="relative shrink-0">
      {jacketUrl ? (
        <img src={jacketUrl} alt="" className={`${sizeClass} rounded object-cover`} />
      ) : (
        <div className={`${sizeClass} rounded bg-piu-dark flex items-center justify-center font-display font-bold text-sm text-gray-500`}>
          {(title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 ${badgeSize} flex items-center justify-center rounded font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </div>
  );
}

// Grade distribution bar chart for a single level — grades on x-axis
// showModeFilter: only show when top-level tab is "All"
function GradeDistributionChart({ scores, rankRanges, showModeFilter = false }) {
  const [chartMode, setChartMode] = useState('');

  const filtered = chartMode ? scores.filter(s => s.mode === chartMode) : scores;

  // Build distribution, grouping B and below into one bucket
  const groupedRanges = [
    ...rankRanges.filter(r => ['SSS+','SSS','SS+','SS','S+','S','AAA+','AAA','AA+','AA','A+','A'].includes(r.label)),
    { label: 'B-', min: 0, bg: 'bg-gray-400' },
  ];
  const distribution = groupedRanges.map(r => ({ ...r, count: 0 }));
  for (const s of filtered) {
    let placed = false;
    for (let i = 0; i < rankRanges.length; i++) {
      if (s.score >= rankRanges[i].min) {
        // Is this rank in the non-grouped set (A and above)?
        const grpIdx = distribution.findIndex(d => d.label === rankRanges[i].label);
        if (grpIdx !== -1) {
          distribution[grpIdx].count++;
        } else {
          // B, C, D, F — goes into the grouped "B-" bucket
          distribution[distribution.length - 1].count++;
        }
        placed = true;
        break;
      }
    }
    if (!placed) distribution[distribution.length - 1].count++;
  }

  // Invert: lowest grade on left, SSS+ on right
  const displayDistribution = [...distribution].reverse();

  const maxCount = Math.max(1, ...displayDistribution.map(d => d.count));
  const totalCount = displayDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-gray-500 font-display">GRADE DISTRIBUTION ({totalCount} scores)</span>
        {showModeFilter && (
          <div className="flex gap-1">
            {[
              { key: '', label: 'All' },
              { key: 'Single', label: 'Singles' },
              { key: 'Double', label: 'Doubles' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setChartMode(m.key)}
                className={`px-2 py-1 rounded text-[10px] font-display font-bold transition-colors ${
                  chartMode === m.key ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-1" style={{ minHeight: '100px' }}>
        {displayDistribution.map((d, i) => (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={`w-full rounded-t ${d.bg} transition-all`}
              style={{ height: `${d.count > 0 ? Math.max((d.count / maxCount) * 90, 4) : 0}px` }}
              title={`${d.label}: ${d.count}`}
            />
            {d.count > 0 && (
              <span className="text-[8px] font-mono text-gray-400 mt-0.5">{d.count}</span>
            )}
            <span className="text-[7px] font-display font-bold text-gray-500 leading-tight mt-0.5 truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vertical distribution bar chart — levels on x-axis, stacked grade segments
function VerticalDistributionChart({ levels, maxCount, activeLevel, onLevelClick }) {
  if (levels.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-0.5 min-w-0" style={{ minHeight: '140px' }}>
        {levels.map(({ level, distribution, total }) => (
          <button
            key={level}
            onClick={() => onLevelClick(level)}
            className={`flex flex-col items-center flex-1 min-w-[22px] group transition-colors rounded-t ${activeLevel === String(level) ? 'bg-piu-dark/80' : 'hover:bg-piu-dark/40'}`}
          >
            {/* Stacked vertical bar */}
            <div className="w-full flex flex-col-reverse rounded-t overflow-hidden bg-piu-dark/30" style={{ height: `${Math.max((total / maxCount) * 120, 4)}px` }}>
              {distribution.map((d, i) => d.count > 0 ? (
                <div
                  key={i}
                  className={`w-full ${d.bg} relative`}
                  style={{ height: `${(d.count / total) * 100}%` }}
                  title={`${d.label}: ${d.count}`}
                />
              ) : null)}
            </div>
            {/* Count */}
            <span className="text-[8px] font-mono text-gray-500 mt-0.5">{total}</span>
            {/* Level label */}
            <span className="text-[9px] font-display font-bold text-gray-400 leading-tight">{level}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Sync progress bar component
function SyncProgressBar({ progress, total, label }) {
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  return (
    <div className="card py-3 px-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-display font-bold text-piu-accent">{label}</span>
        <span className="text-xs font-mono text-gray-400">{progress}/{total} pages ({pct}%)</span>
      </div>
      <div className="h-2 bg-piu-dark rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-piu-accent to-purple-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActivityIconGlyph({ icon, className = 'w-4 h-4' }) {
  if (icon === 'post') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M8.5 9.5h7M8.5 12h7M8.5 14.5h4.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'comment') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="M6 7.5a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 18 7.5v5A2.5 2.5 0 0 1 15.5 15H11l-4.2 3.2c-.4.3-.8 0-.8-.4V15A2.5 2.5 0 0 1 3.5 12.5v-5A2.5 2.5 0 0 1 6 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'score-up') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M5 18h14" strokeLinecap="round" />
        <path d="m7 14 3-3 2.5 2.5L17 9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14.5 9H17v2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'score-clear') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <circle cx="12" cy="12" r="7" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'trophy') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="M8 5h8v3a4 4 0 0 1-8 0V5Z" />
        <path d="M10 13h4v2a2 2 0 0 1-4 0v-2Z" />
        <path d="M9 18h6M6 6h2v1a3 3 0 0 1-3 3H4V8a2 2 0 0 1 2-2Zm12 0h-2v1a3 3 0 0 0 3 3h1V8a2 2 0 0 0-2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'duel') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="m13.5 3.5-7 9h4L9.5 20l7-9h-4l1-7.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'community-created') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="M9 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a3.5 3.5 0 0 1 7 0M19 4v4M17 6h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'community-joined') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path d="M3 20a7 7 0 0 1 14 0M18.5 9v6M15.5 12h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'community-mod') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
        <path d="m12 4 6 2.5V12c0 3.8-2.5 6.6-6 8-3.5-1.4-6-4.2-6-8V6.5L12 4Z" />
        <path d="m9.5 12.5 1.8 1.8 3.4-3.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 8v4l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getActivityVisual(item) {
  const type = item?.type || '';
  const category = item?.category || '';

  if (type === 'post_created') {
    return { icon: 'post', tone: 'text-sky-300 border-sky-400/30 bg-sky-500/10' };
  }
  if (type.includes('comment') || type.includes('reply')) {
    return { icon: 'comment', tone: 'text-violet-300 border-violet-400/30 bg-violet-500/10' };
  }
  if (type === 'upscore') {
    return { icon: 'score-up', tone: 'text-amber-300 border-amber-400/30 bg-amber-500/10' };
  }
  if (type === 'new_clear') {
    return { icon: 'score-clear', tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' };
  }
  if (type.includes('tournament')) {
    return { icon: 'trophy', tone: 'text-pink-300 border-pink-400/30 bg-pink-500/10' };
  }
  if (type.includes('duel')) {
    return { icon: 'duel', tone: 'text-orange-300 border-orange-400/30 bg-orange-500/10' };
  }
  if (type === 'community_created') {
    return { icon: 'community-created', tone: 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10' };
  }
  if (type === 'community_joined') {
    return { icon: 'community-joined', tone: 'text-teal-300 border-teal-400/30 bg-teal-500/10' };
  }
  if (type === 'community_moderator') {
    return { icon: 'community-mod', tone: 'text-lime-300 border-lime-400/30 bg-lime-500/10' };
  }

  if (category === 'posts') {
    return { icon: 'post', tone: 'text-sky-300 border-sky-400/30 bg-sky-500/10' };
  }
  if (category === 'comments') {
    return { icon: 'comment', tone: 'text-violet-300 border-violet-400/30 bg-violet-500/10' };
  }
  if (category === 'scores') {
    return { icon: 'score-up', tone: 'text-amber-300 border-amber-400/30 bg-amber-500/10' };
  }
  if (category === 'competitions') {
    return { icon: 'trophy', tone: 'text-pink-300 border-pink-400/30 bg-pink-500/10' };
  }
  if (category === 'community') {
    return { icon: 'community-joined', tone: 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10' };
  }

  return { icon: 'default', tone: 'text-gray-300 border-gray-400/25 bg-gray-500/10' };
}

function getActivityCategoryLabel(category) {
  if (category === 'posts') return 'Post';
  if (category === 'comments') return 'Comment';
  if (category === 'scores') return 'Score';
  if (category === 'competitions') return 'Competition';
  if (category === 'community') return 'Community';
  return 'Activity';
}

export default function ProfilePage() {
  const { id, username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('overview');
  const [activityItems, setActivityItems] = useState([]);
  const [activitySubTab, setActivitySubTab] = useState('all');
  const usernameHandle = (() => {
    if (!username) return '';
    try {
      return decodeURIComponent(String(username));
    } catch {
      return String(username);
    }
  })();
  const isUsernameRoute = Boolean(username);
  const isAtUsernameRoute = isUsernameRoute && usernameHandle.startsWith('@');
  const normalizedUsername = isAtUsernameRoute ? usernameHandle.slice(1) : '';

  // PIUGame state
  const [piuStatus, setPiuStatus] = useState(null);
  const [piuPumbility, setPiuPumbility] = useState(null);
  const [piuBestScores, setPiuBestScores] = useState(null);
  const [piuRecentlyPlayed, setPiuRecentlyPlayed] = useState(null);
  const [piuTitles, setPiuTitles] = useState(null);
  const [piuScoreMode, setPiuScoreMode] = useState('');  // '' = All
  const [piuScoreLevel, setPiuScoreLevel] = useState('');
  const [piuSyncing, setPiuSyncing] = useState('');
  const [piuDataLoaded, setPiuDataLoaded] = useState(false);
  const [showPumbilityThresholdModal, setShowPumbilityThresholdModal] = useState(false);
  const [selectedGroupBadge, setSelectedGroupBadge] = useState(null);
  const [selectedOverviewDateKey, setSelectedOverviewDateKey] = useState('');
  const [selectedPlay, setSelectedPlay] = useState(null);
  const [jacketLookup, setJacketLookup] = useState({});
  const [chartKeyMap, setChartKeyMap] = useState({});
  const [bestScoreSort, setBestScoreSort] = useState('score'); // 'score' | 'name'
  const [bestScoreSearch, setBestScoreSearch] = useState('');
  const [syncProgress, setSyncProgress] = useState({ in_progress: '', progress: 0, total: 0 });
  const [profilePosts, setProfilePosts] = useState([]);
  const [shoeCabinet, setShoeCabinet] = useState(null);
  const [shoeLoading, setShoeLoading] = useState(false);
  const [shoeBusy, setShoeBusy] = useState(false);
  const [shoeFeedback, setShoeFeedback] = useState('');

  // Social state
  const [followStatus, setFollowStatus] = useState({ following: false, followers_count: 0, following_count: 0 });
  const [socialCounts, setSocialCounts] = useState({ followers_count: 0, following_count: 0, posts_count: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [notifyMenuOpen, setNotifyMenuOpen] = useState(false);
  const notifyMenuRef = useRef(null);
  const [activityNotifyPrefs, setActivityNotifyPrefs] = useState({
    loading: false,
    saving: false,
    subscribed: false,
    notify_posts: false,
    notify_upscores: false,
    notify_new_clears: false,
  });
  const [activityNotifyError, setActivityNotifyError] = useState('');
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [myFollowingIds, setMyFollowingIds] = useState(new Set());
  const [followBackLoading, setFollowBackLoading] = useState({});
  const [competitionsSub, setCompetitionsSub] = useState('tournaments');
  const [songAnalytics, setSongAnalytics] = useState(null);

  const profileId = profile?.id || null;
  const isOwner = authUser && profileId && authUser.id === profileId;
  const hasPiuData = piuStatus && (piuStatus.linked || piuStatus.best_scores_imported || piuStatus.pumbility_value > 0);

  useEffect(() => {
    let cancelled = false;

    setProfile(null);
    setLoadError('');
    setStats(null);
    setPiuStatus(null);
    setPiuPumbility(null);
    setPiuBestScores(null);
    setPiuRecentlyPlayed(null);
    setPiuTitles(null);
    setPiuDataLoaded(false);
    setShowPumbilityThresholdModal(false);
    setSelectedGroupBadge(null);
    setSyncProgress({ in_progress: '', progress: 0, total: 0 });
    setSocialCounts({ followers_count: 0, following_count: 0, posts_count: 0 });
    setActivityItems([]);
    setSongAnalytics(null);
    setShoeCabinet(null);
    setShoeLoading(false);
    setShoeBusy(false);
    setShoeFeedback('');
    setFollowersLoaded(false);
    setTab('overview');
    setSelectedOverviewDateKey('');
    setActivitySubTab('all');
    setActivityNotifyPrefs({
      loading: false,
      saving: false,
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    });
    setActivityNotifyError('');
    setNotifyMenuOpen(false);

    const load = async () => {
      try {
        if (isUsernameRoute && !isAtUsernameRoute) {
          if (!cancelled) {
            setProfile(null);
            setLoadError('Page not found');
          }
          return;
        }

        const userProfile = username
          ? await getUserProfileByUsername(normalizedUsername)
          : await getUserProfile(id);
        if (cancelled) return;

        setProfile(userProfile);

        if (!username && userProfile?.username && location.pathname.startsWith('/profile/')) {
          navigate(getProfilePath(userProfile.id, userProfile.username), { replace: true });
        }

        const uid = userProfile.id;
        const [statsData, piuStatusData, socialData, activityData, titleData] = await Promise.all([
          getUserStats(uid).catch(() => null),
          getPiugameSyncStatus(uid).catch(() => null),
          getSocialCounts(uid).catch(() => null),
          getUserActivity(uid).catch(() => []),
          getPiugameTitles(uid).catch(() => null),
        ]);

        if (cancelled) return;
        if (statsData) setStats(statsData);
        if (piuStatusData) setPiuStatus(piuStatusData);
        if (socialData) setSocialCounts(socialData);
        if (Array.isArray(activityData)) setActivityItems(activityData);
        if (titleData) setPiuTitles(titleData);

        if (authUser) {
          const status = await getFollowStatus(uid).catch(() => null);
          if (!cancelled && status) setFollowStatus(status);
        } else {
          setFollowStatus({ following: false, followers_count: 0, following_count: 0 });
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setLoadError('Profile not found');
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id, username, normalizedUsername, isUsernameRoute, isAtUsernameRoute, authUser, navigate, location.pathname]);

  // Load posts when posts tab is active
  useEffect(() => {
    if (tab === 'posts' && profileId) {
      getUserPosts(profileId, 1).then(setProfilePosts).catch(() => {});
    }
  }, [tab, profileId]);

  // Load followers/following when followers tab is active
  useEffect(() => {
    if (tab === 'followers' && profileId && !followersLoaded) {
      setFollowersLoaded(true);
      getFollowers(profileId).then(setFollowersList).catch(() => {});
      getFollowing(profileId).then(setFollowingList).catch(() => {});
      if (authUser) {
        getFollowing(authUser.id).then(list => {
          setMyFollowingIds(new Set(list.map(u => u.id)));
        }).catch(() => {});
      }
    }
  }, [tab, profileId, followersLoaded, authUser]);

  useEffect(() => {
    let cancelled = false;
    if (!profileId) {
      setSongAnalytics(null);
      return () => { cancelled = true; };
    }

    getSongAnalytics(profileId)
      .then((data) => {
        if (cancelled) return;
        setSongAnalytics(data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setSongAnalytics(null);
      });

    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;

    if (!authUser || !profileId || isOwner) {
      setNotifyMenuOpen(false);
      setActivityNotifyPrefs({
        loading: false,
        saving: false,
        subscribed: false,
        notify_posts: false,
        notify_upscores: false,
        notify_new_clears: false,
      });
      return () => { cancelled = true; };
    }

    setActivityNotifyPrefs(prev => ({ ...prev, loading: true, saving: false }));
    getActivityNotificationPreferences(profileId)
      .then((prefs) => {
        if (cancelled) return;
        setActivityNotifyPrefs({
          loading: false,
          saving: false,
          subscribed: !!prefs?.subscribed,
          notify_posts: !!prefs?.notify_posts,
          notify_upscores: !!prefs?.notify_upscores,
          notify_new_clears: !!prefs?.notify_new_clears,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setActivityNotifyPrefs({
          loading: false,
          saving: false,
          subscribed: false,
          notify_posts: false,
          notify_upscores: false,
          notify_new_clears: false,
        });
      });

    return () => { cancelled = true; };
  }, [authUser, profileId, isOwner]);

  const refreshShoeCabinet = async (options = {}) => {
    const { silent = false } = options;
    if (!profileId) return null;

    if (!silent) setShoeLoading(true);
    try {
      const data = await getProfileShoes(profileId);
      const cabinet = data || { active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] };
      setShoeCabinet(cabinet);
      return cabinet;
    } catch {
      const emptyCabinet = { active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] };
      setShoeCabinet(emptyCabinet);
      return emptyCabinet;
    } finally {
      if (!silent) setShoeLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (tab !== 'shoes' || !profileId) {
      return () => { cancelled = true; };
    }

    setShoeLoading(true);
    getProfileShoes(profileId)
      .then((data) => {
        if (cancelled) return;
        setShoeCabinet(data || { active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] });
      })
      .catch(() => {
        if (cancelled) return;
        setShoeCabinet({ active_shoe_id: null, lifetime_songs: 0, lifetime_steps: 0, shoes: [] });
      })
      .finally(() => {
        if (!cancelled) setShoeLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab, profileId]);

  useEffect(() => {
    if (!notifyMenuOpen) return undefined;

    function handleDocumentClick(e) {
      if (notifyMenuRef.current && !notifyMenuRef.current.contains(e.target)) {
        setNotifyMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [notifyMenuOpen]);

  // Load PIUGame data + jacket lookup when any PIU tab is active
  const piuTabs = ['pumbility', 'best-scores', 'titles', 'recently-played'];
  const isPiuTab = piuTabs.includes(tab);
  const hasJacketLookup = Object.keys(jacketLookup).length > 0;

  useEffect(() => {
    if (isPiuTab && profileId && !piuDataLoaded) {
      setPiuDataLoaded(true);
      getPiugamePumbility(profileId).then(setPiuPumbility).catch(() => {});
      getPiugameBestScores(profileId).then(setPiuBestScores).catch(() => {});
      getPiugameRecentlyPlayed(profileId).then(setPiuRecentlyPlayed).catch(() => {});
      getPiugameTitles(profileId).then(setPiuTitles).catch(() => {});
      getJacketMap().then(map => setJacketLookup(map)).catch(() => {});
      getChartKeyMap().then(map => setChartKeyMap(map)).catch(() => {});
    }
  }, [isPiuTab, profileId, piuDataLoaded]);

  const hasChartKeyMap = Object.keys(chartKeyMap).length > 0;
  useEffect(() => {
    if (tab !== 'overview' || !profileId || !hasPiuData) return;
    if (!piuRecentlyPlayed) {
      getPiugameRecentlyPlayed(profileId).then(setPiuRecentlyPlayed).catch(() => {});
    }
    if (!hasJacketLookup) {
      getJacketMap().then(map => setJacketLookup(map)).catch(() => {});
    }
    if (!hasChartKeyMap) {
      getChartKeyMap().then(map => setChartKeyMap(map)).catch(() => {});
    }
  }, [tab, profileId, hasPiuData, piuRecentlyPlayed, hasJacketLookup, hasChartKeyMap]);

  // Auto-sync pumbility + recently played (NOT best scores) for profile owner
  useEffect(() => {
    if (isPiuTab && profileId && isOwner && piuStatus?.linked && piuSyncing !== 'auto') {
      setPiuSyncing('auto');
      Promise.all([
        syncPumbility().catch(() => null),
        syncRecentlyPlayed().catch(() => null),
      ]).then(() => {
        getPiugamePumbility(profileId).then(setPiuPumbility).catch(() => {});
        getPiugameRecentlyPlayed(profileId).then(setPiuRecentlyPlayed).catch(() => {});
        getPiugameBestScores(profileId).then(setPiuBestScores).catch(() => {});
        getPiugameTitles(profileId).then(setPiuTitles).catch(() => {});
        getPiugameSyncStatus(profileId).then(setPiuStatus).catch(() => {});
      }).finally(() => setPiuSyncing(''));
    }
  }, [isPiuTab, profileId, isOwner, piuStatus?.linked]);

  // Poll sync progress when a background sync is running
  useEffect(() => {
    if (!isOwner || !piuStatus?.sync_in_progress) return;
    setSyncProgress({ in_progress: piuStatus.sync_in_progress, progress: piuStatus.sync_progress || 0, total: piuStatus.sync_total || 0 });

    const interval = setInterval(() => {
      getSyncProgress().then(data => {
        setSyncProgress(data);
        if (!data.in_progress) {
          clearInterval(interval);
          // Refresh data after sync completes
          if (profileId) {
            getPiugameBestScores(profileId).then(setPiuBestScores).catch(() => {});
            getPiugameTitles(profileId).then(setPiuTitles).catch(() => {});
            getPiugameSyncStatus(profileId).then(setPiuStatus).catch(() => {});
          }
        }
      }).catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [isOwner, profileId, piuStatus?.sync_in_progress]);

  const handleFollow = async () => {
    if (!authUser || followLoading || !profileId) return;
    setFollowLoading(true);
    try {
      if (followStatus.following) {
        await unfollowUser(profileId);
        setFollowStatus(s => ({ ...s, following: false, followers_count: s.followers_count - 1 }));
        setSocialCounts(c => ({ ...c, followers_count: Math.max(0, c.followers_count - 1) }));
      } else {
        await followUser(profileId);
        setFollowStatus(s => ({ ...s, following: true, followers_count: s.followers_count + 1 }));
        setSocialCounts(c => ({ ...c, followers_count: c.followers_count + 1 }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFollowLoading(false);
    }
  };

  const updateActivityPrefs = async (nextPrefs) => {
    if (!authUser || !profileId || isOwner || activityNotifyPrefs.saving) return;

    const previous = activityNotifyPrefs;
    const optimistic = {
      loading: false,
      saving: true,
      subscribed: !!(nextPrefs.notify_posts || nextPrefs.notify_upscores || nextPrefs.notify_new_clears),
      notify_posts: !!nextPrefs.notify_posts,
      notify_upscores: !!nextPrefs.notify_upscores,
      notify_new_clears: !!nextPrefs.notify_new_clears,
    };

    setActivityNotifyError('');
    setActivityNotifyPrefs(optimistic);

    try {
      const saved = await updateActivityNotificationPreferences(profileId, {
        notify_posts: optimistic.notify_posts,
        notify_upscores: optimistic.notify_upscores,
        notify_new_clears: optimistic.notify_new_clears,
      });
      setActivityNotifyPrefs({
        loading: false,
        saving: false,
        subscribed: !!saved?.subscribed,
        notify_posts: !!saved?.notify_posts,
        notify_upscores: !!saved?.notify_upscores,
        notify_new_clears: !!saved?.notify_new_clears,
      });
    } catch (err) {
      setActivityNotifyPrefs({ ...previous, saving: false, loading: false });
      setActivityNotifyError(err?.message || 'Failed to update activity notification settings');
    }
  };

  const handleToggleActivityPref = (field) => {
    if (activityNotifyPrefs.loading || activityNotifyPrefs.saving) return;
    updateActivityPrefs({
      notify_posts: field === 'notify_posts' ? !activityNotifyPrefs.notify_posts : activityNotifyPrefs.notify_posts,
      notify_upscores: field === 'notify_upscores' ? !activityNotifyPrefs.notify_upscores : activityNotifyPrefs.notify_upscores,
      notify_new_clears: field === 'notify_new_clears' ? !activityNotifyPrefs.notify_new_clears : activityNotifyPrefs.notify_new_clears,
    });
  };

  const handleSetAllActivityPrefs = (enabled) => {
    if (activityNotifyPrefs.loading || activityNotifyPrefs.saving) return;
    updateActivityPrefs({
      notify_posts: !!enabled,
      notify_upscores: !!enabled,
      notify_new_clears: !!enabled,
    });
  };

  const handleWearShoe = async (shoeId) => {
    if (!isOwner || shoeBusy) return;
    setShoeBusy(true);
    setShoeFeedback('');
    try {
      const data = await wearProfileShoe(shoeId);
      setShoeCabinet(data?.cabinet || null);
      setShoeFeedback('Current shoe updated');
    } catch (err) {
      setShoeFeedback(err?.message || 'Failed to set current shoe');
    } finally {
      setShoeBusy(false);
    }
  };

  const [syncFeedback, setSyncFeedback] = useState('');
  const handleStartBestScoresSync = async () => {
    try {
      await syncBestScores();
      setSyncFeedback('Import started successfully. Check progress in Best Scores tab.');
      setTimeout(() => setSyncFeedback(''), 6000);
      // Refresh status to start polling
      if (profileId) getPiugameSyncStatus(profileId).then(setPiuStatus).catch(() => {});
    } catch (err) {
      alert(err.message);
    }
  };

  // Aggregate all song scores across duels and tournaments
  const songScores = useMemo(() => {
    if (!stats) return [];
    const scores = [];

    for (const { duel, songs } of stats.duelStats) {
      const isP1 = duel.player1_user_id === profileId;
      for (const s of songs) {
        const myScore = isP1 ? s.player1_score : s.player2_score;
        const opponentScore = isP1 ? s.player2_score : s.player1_score;
        const won = (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2');
        if (myScore > 0 || opponentScore > 0) {
          scores.push({
            title: s.song_title, artist: s.song_artist, mode: s.song_mode, level: s.song_level,
            jacket: s.song_jacket_url, myScore, opponentScore, won,
            draw: s.winner === 'draw', source: `Duel: ${duel.name}`, date: duel.date || duel.created_at,
          });
        }
      }
    }

    for (const { duel, songs } of (stats.onlineDuelStats || [])) {
      const isP1 = duel.creator_user_id === profileId;
      for (const s of songs) {
        if (s.status !== 'completed') continue;
        const myScore = isP1 ? s.player1_score : s.player2_score;
        const opponentScore = isP1 ? s.player2_score : s.player1_score;
        const won = (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2');
        if (myScore > 0 || opponentScore > 0) {
          scores.push({
            title: s.song_title, artist: s.song_artist, mode: s.song_mode, level: s.song_level,
            jacket: s.song_jacket_url, myScore, opponentScore, won,
            draw: s.winner === 'draw', source: `Online Duel: ${duel.name}`, date: duel.created_at,
          });
        }
      }
    }

    for (const { tournament, matches } of stats.tournamentPlayers) {
      for (const m of matches) {
        if (m.status !== 'COMPLETED') continue;
        const isP1 = m.player1_id === tournament.id;
        const playedSongs = JSON.parse(m.played_songs || '[]');
        const matchScores = JSON.parse(m.scores || '{}');
        for (const ps of playedSongs) {
          const myScore = isP1 ? (matchScores[ps.id]?.player1 || 0) : (matchScores[ps.id]?.player2 || 0);
          const oppScore = isP1 ? (matchScores[ps.id]?.player2 || 0) : (matchScores[ps.id]?.player1 || 0);
          if (myScore > 0 || oppScore > 0) {
            scores.push({
              title: ps.title, artist: ps.artist || '', mode: ps.mode, level: ps.level,
              jacket: ps.jacket_url || '', myScore, opponentScore: oppScore,
              won: myScore > oppScore, draw: myScore === oppScore,
              source: `Tournament: ${tournament.tournament_name}`, date: tournament.tournament_date || '',
            });
          }
        }
      }
    }

    return scores.sort((a, b) => b.myScore - a.myScore);
  }, [stats, profileId]);

  // Aggregated stats
  const aggregated = useMemo(() => {
    if (!stats) return null;
    const tournamentCount = stats.tournamentPlayers.length;
    const onlineDuelCount = (stats.onlineDuelStats || []).length;
    const duelCount = stats.duelStats.length + onlineDuelCount;
    let totalWins = 0, totalLosses = 0;
    for (const { tournament } of stats.tournamentPlayers) {
      totalWins += tournament.wins || 0;
      totalLosses += tournament.losses || 0;
    }
    let duelWins = 0, duelLosses = 0;
    for (const { duel } of stats.duelStats) {
      if (duel.status !== 'COMPLETED') continue;
      const isP1 = duel.player1_user_id === profileId;
      if ((isP1 && duel.winner === 'player1') || (!isP1 && duel.winner === 'player2')) duelWins++;
      else if (duel.winner !== 'draw') duelLosses++;
    }
    for (const { duel } of (stats.onlineDuelStats || [])) {
      if (duel.status !== 'COMPLETED') continue;
      const isP1 = duel.creator_user_id === profileId;
      if ((isP1 && duel.winner === 'player1') || (!isP1 && duel.winner === 'player2')) duelWins++;
      else if (duel.winner !== 'draw') duelLosses++;
    }
    const totalSongs = songScores.length;
    const avgScore = totalSongs > 0 ? Math.round(songScores.reduce((s, sc) => s + sc.myScore, 0) / totalSongs) : 0;
    const bestScore = totalSongs > 0 ? Math.max(...songScores.map(s => s.myScore)) : 0;

    const levelMap = {};
    songScores.forEach(s => {
      if (!levelMap[s.level]) levelMap[s.level] = { count: 0, totalScore: 0 };
      levelMap[s.level].count++;
      levelMap[s.level].totalScore += s.myScore;
    });
    const byLevel = Object.entries(levelMap)
      .map(([level, d]) => ({ level: parseInt(level), count: d.count, avg: Math.round(d.totalScore / d.count) }))
      .sort((a, b) => a.level - b.level);

    return { tournamentCount, duelCount, totalWins, totalLosses, duelWins, duelLosses, totalSongs, avgScore, bestScore, byLevel };
  }, [stats, songScores, profileId]);

  const recentlyPlayedRows = useMemo(() => {
    const rows = Array.isArray(piuRecentlyPlayed?.plays) ? piuRecentlyPlayed.plays : [];
    return rows
      .map((play, idx) => {
        const parsed = parsePlayedAt(play?.date_played);
        return {
          play,
          idx,
          ts: parsed ? parsed.getTime() : null,
        };
      })
      .sort((a, b) => {
        if (a.ts !== null && b.ts !== null && a.ts !== b.ts) return b.ts - a.ts;
        if (a.ts !== null) return -1;
        if (b.ts !== null) return 1;
        return b.idx - a.idx;
      })
      .map(({ play }) => play);
  }, [piuRecentlyPlayed]);

  const overviewPlayHeatmap = useMemo(() => {
    const plays = recentlyPlayedRows;
    const dayMap = {};
    let singleMin = Infinity;
    let singleMax = 0;
    let doubleMin = Infinity;
    let doubleMax = 0;
    let latestDate = null;

    for (let i = 0; i < plays.length; i++) {
      const play = plays[i];
      const dayKey = parsePlayDayKey(play?.date_played);
      const dayDate = parseDayKey(dayKey);
      if (!dayKey || !dayDate) continue;

      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          key: dayKey,
          plays: [],
          singles: 0,
          doubles: 0,
          singleLevelTotal: 0,
          doubleLevelTotal: 0,
        };
      }

      const mode = play?.mode === 'Single' || play?.mode === 'Double' ? play.mode : '';
      const level = parseInt(play?.level, 10) || 0;
      const parsedAt = parsePlayedAt(play?.date_played);

      if (mode === 'Single') {
        dayMap[dayKey].singles += 1;
        dayMap[dayKey].singleLevelTotal += level;
      } else if (mode === 'Double') {
        dayMap[dayKey].doubles += 1;
        dayMap[dayKey].doubleLevelTotal += level;
      }

      if ((parseInt(play?.score, 10) || 0) > 0) {
        if (mode === 'Single' && level > 0) {
          singleMin = Math.min(singleMin, level);
          singleMax = Math.max(singleMax, level);
        } else if (mode === 'Double' && level > 0) {
          doubleMin = Math.min(doubleMin, level);
          doubleMax = Math.max(doubleMax, level);
        }
      }

      dayMap[dayKey].plays.push({
        ...play,
        _parsedAtMs: parsedAt ? parsedAt.getTime() : null,
        _index: i,
      });

      if (!latestDate || dayDate.getTime() > latestDate.getTime()) latestDate = dayDate;
    }

    const dayEntries = Object.values(dayMap);
    dayEntries.forEach((d) => {
      d.total = d.singles + d.doubles;
      d.singleAvgLevel = d.singles > 0 ? d.singleLevelTotal / d.singles : 0;
      d.doubleAvgLevel = d.doubles > 0 ? d.doubleLevelTotal / d.doubles : 0;
      d.singleRatio = d.total > 0 ? d.singles / d.total : 0;
      d.doubleRatio = d.total > 0 ? d.doubles / d.total : 0;
      d.singleColor = d.singles > 0 ? getSingleLevelColor(d.singleAvgLevel) : 'transparent';
      d.doubleColor = d.doubles > 0 ? getDoubleLevelColor(d.doubleAvgLevel) : 'transparent';

      if (d.singles > 0 && d.doubles > 0) {
        const singlesPct = clamp(d.singleRatio * 100, 0, 100);
        d.fill = `linear-gradient(90deg, ${d.singleColor} 0%, ${d.singleColor} ${singlesPct}%, ${d.doubleColor} ${singlesPct}%, ${d.doubleColor} 100%)`;
      } else if (d.singles > 0) {
        d.fill = d.singleColor;
      } else if (d.doubles > 0) {
        d.fill = d.doubleColor;
      } else {
        d.fill = 'transparent';
      }

      d.plays = d.plays.sort((a, b) => {
        const aTime = a._parsedAtMs ?? -1;
        const bTime = b._parsedAtMs ?? -1;
        if (aTime !== bTime) return bTime - aTime;
        return b._index - a._index;
      });
    });

    const today = startOfDay(new Date());
    const yearStartDate = new Date(today.getFullYear(), 0, 1);
    const yearEndDate = new Date(today.getFullYear(), 11, 31);
    const gridStartDate = startOfWeek(yearStartDate);
    const totalGridDays = diffDays(gridStartDate, yearEndDate) + 1;
    const weeksCount = Math.ceil(totalGridDays / 7);

    const weeks = [];
    for (let weekIdx = 0; weekIdx < weeksCount; weekIdx++) {
      const week = [];
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const date = addDays(gridStartDate, weekIdx * 7 + dayIdx);
        const key = toDayKey(date);
        const dayData = dayMap[key] || null;
        week.push({
          key,
          date,
          data: dayData,
          fill: dayData?.fill || '#111827',
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        });
      }
      weeks.push(week);
    }

    const monthLabels = [];
    let lastMonthKey = '';
    for (const week of weeks) {
      const firstInYear = week.find((cell) => cell.date.getTime() >= yearStartDate.getTime());
      if (!firstInYear) {
        monthLabels.push('');
        continue;
      }
      const first = firstInYear.date;
      const monthKey = `${first.getFullYear()}-${first.getMonth()}`;
      if (monthKey !== lastMonthKey) {
        monthLabels.push(first.toLocaleDateString(undefined, { month: 'short' }));
        lastMonthKey = monthKey;
      } else {
        monthLabels.push('');
      }
    }

    return {
      weeks,
      monthLabels,
      daysByKey: dayMap,
      latestDayKey: latestDate ? toDayKey(latestDate) : '',
      activeDays: dayEntries.length,
      totalPlays: plays.length,
      singleLegend: singleMax > 0
        ? {
          min: singleMin === Infinity ? singleMax : singleMin,
          max: singleMax,
          minColor: getSingleLevelColor(singleMin === Infinity ? singleMax : singleMin),
          maxColor: getSingleLevelColor(singleMax),
        }
        : null,
      doubleLegend: doubleMax > 0
        ? {
          min: doubleMin === Infinity ? doubleMax : doubleMin,
          max: doubleMax,
          minColor: getDoubleLevelColor(doubleMin === Infinity ? doubleMax : doubleMin),
          maxColor: getDoubleLevelColor(doubleMax),
        }
        : null,
    };
  }, [recentlyPlayedRows]);

  useEffect(() => {
    if (!overviewPlayHeatmap.latestDayKey) {
      setSelectedOverviewDateKey('');
      return;
    }
    if (!selectedOverviewDateKey || !overviewPlayHeatmap.daysByKey[selectedOverviewDateKey]) {
      setSelectedOverviewDateKey(overviewPlayHeatmap.latestDayKey);
    }
  }, [overviewPlayHeatmap, selectedOverviewDateKey]);

  const selectedOverviewDay = selectedOverviewDateKey
    ? overviewPlayHeatmap.daysByKey[selectedOverviewDateKey] || null
    : null;

  const singleLegendLevels = useMemo(() => {
    const legend = overviewPlayHeatmap.singleLegend;
    if (!legend) return [];
    return Array.from({ length: legend.max - legend.min + 1 }, (_, i) => legend.min + i);
  }, [overviewPlayHeatmap.singleLegend]);

  const doubleLegendLevels = useMemo(() => {
    const legend = overviewPlayHeatmap.doubleLegend;
    if (!legend) return [];
    return Array.from({ length: legend.max - legend.min + 1 }, (_, i) => legend.min + i);
  }, [overviewPlayHeatmap.doubleLegend]);

  // Filtered + sorted best scores
  const filteredBestScores = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    let filtered = piuBestScores.scores;
    if (piuScoreMode) {
      filtered = filtered.filter(s => s.mode === piuScoreMode);
    }
    if (piuScoreLevel) {
      filtered = filtered.filter(s => s.level === parseInt(piuScoreLevel));
    }
    if (bestScoreSearch) {
      const q = bestScoreSearch.toLowerCase();
      filtered = filtered.filter(s => s.song_title.toLowerCase().includes(q));
    }
    if (bestScoreSort === 'name') {
      filtered = [...filtered].sort((a, b) => a.song_title.localeCompare(b.song_title));
    } else {
      filtered = [...filtered].sort((a, b) => b.score - a.score);
    }
    return filtered;
  }, [piuBestScores, piuScoreMode, piuScoreLevel, bestScoreSort, bestScoreSearch]);

  // Available levels for filtering
  const availableLevels = useMemo(() => {
    if (!piuBestScores?.scores) return [];
    const levels = new Set();
    const modeFiltered = piuScoreMode ? piuBestScores.scores.filter(s => s.mode === piuScoreMode) : piuBestScores.scores;
    modeFiltered.forEach(s => levels.add(s.level));
    return [...levels].sort((a, b) => a - b);
  }, [piuBestScores, piuScoreMode]);

  // Level distribution data for chart
  const levelDistribution = useMemo(() => {
    if (!piuBestScores?.scores) return { levels: [], maxCount: 0 };
    const modeFiltered = piuScoreMode ? piuBestScores.scores.filter(s => s.mode === piuScoreMode) : piuBestScores.scores;

    const levelMap = {};
    let maxCount = 0;
    for (const s of modeFiltered) {
      if (!levelMap[s.level]) {
        levelMap[s.level] = RANK_RANGES.map(r => ({ ...r, count: 0 }));
      }
      const idx = getRankIndex(s.score);
      levelMap[s.level][idx].count++;
    }

    const levels = Object.entries(levelMap)
      .map(([level, distribution]) => {
        const total = distribution.reduce((s, d) => s + d.count, 0);
        if (total > maxCount) maxCount = total;
        return { level: parseInt(level), distribution, total };
      })
      .sort((a, b) => a.level - b.level);

    return { levels, maxCount };
  }, [piuBestScores, piuScoreMode]);

  const filteredActivity = useMemo(() => {
    if (!Array.isArray(activityItems)) return [];
    if (activitySubTab === 'all') return activityItems;
    if (activitySubTab === 'posts') return activityItems.filter(a => a.category === 'posts');
    if (activitySubTab === 'comments') return activityItems.filter(a => a.category === 'comments');
    if (activitySubTab === 'scores') return activityItems.filter(a => a.category === 'scores');
    if (activitySubTab === 'competitions') return activityItems.filter(a => a.category === 'competitions');
    return activityItems;
  }, [activityItems, activitySubTab]);

  if (!profile) {
    if (loadError) {
      return <div className="text-center py-20 text-gray-500">{loadError}</div>;
    }
    return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  }

  const age = profile.show_age && profile.date_of_birth ? getAge(profile.date_of_birth) : null;
  const genderSymbol = profile.gender ? GENDER_SYMBOLS[profile.gender] || '' : '';
  const flag = getCountryFlag(profile.nationality, "inline-block h-3.5 sm:h-5 align-middle");
  const locationLabel = [profile.location_city, profile.location_country].filter(Boolean).join(', ');
  const locationFlag = getCountryFlag(profile.location_country_code || profile.nationality, "inline-block h-3.5 align-middle");
  const computedSkillTitle = piuTitles?.imported ? (piuTitles?.summary?.current_title?.name || '') : '';
  const displaySkillTitle = computedSkillTitle || profile.skill_title;

  const tabs = ['overview', 'posts', 'competitions', 'shoes'];
  if (hasPiuData) {
    tabs.push(...piuTabs);
  }
  tabs.push('activity');

  const tabLabels = {
    overview: 'Overview', posts: 'Posts', competitions: 'Competitions', shoes: 'Shoes', activity: 'Activity',
    pumbility: 'Pumbility', 'best-scores': 'Best Scores', titles: 'Titles', 'recently-played': 'Recently Played',
  };

  const competitionsCount = aggregated ? aggregated.duelCount + aggregated.tournamentCount : 0;
  const cabinetShoes = Array.isArray(shoeCabinet?.shoes) ? shoeCabinet.shoes : [];
  const activeCabinetShoes = cabinetShoes.filter((shoe) => !shoe.retired_at);
  const retiredCabinetShoes = cabinetShoes.filter((shoe) => !!shoe.retired_at);
  const pumbilityTopScores = Array.isArray(piuPumbility?.scores) ? piuPumbility.scores : [];
  const pumbilityAvgScore = pumbilityTopScores.length > 0
    ? Math.round(pumbilityTopScores.reduce((sum, row) => sum + (parseInt(row.score, 10) || 0), 0) / pumbilityTopScores.length)
    : 0;
  const pumbilityAvgScoreRank = pumbilityAvgScore > 0 ? getRank(pumbilityAvgScore) : null;
  const pumbilityAvgLevel = pumbilityTopScores.length > 0
    ? Math.round((pumbilityTopScores.reduce((sum, row) => sum + (parseInt(row.level, 10) || 0), 0) / pumbilityTopScores.length) * 10) / 10
    : 0;
  const hasGroupBadges = Array.isArray(profile.group_badges) && profile.group_badges.length > 0;
  const hasCompactPiuSummary = profile.pumbility > 0 || piuStatus?.highest_single || piuStatus?.highest_double;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-8">
      {/* Profile Header */}
      <div className="card mb-4 sm:mb-6">
        <div className="flex flex-row items-start gap-3 sm:gap-6">
          {profile.avatar ? (
            <img src={getAvatarUrl(profile.avatar)} alt="" className="w-14 h-14 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-piu-border shadow-lg shrink-0" />
          ) : (
            <div className="w-14 h-14 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xl sm:text-3xl shadow-lg shrink-0">
              {profile.username[0].toUpperCase()}
            </div>
          )}
          <div className="text-left flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {flag && <span>{flag}</span>}
              <h1 className="text-lg sm:text-2xl font-display font-bold truncate">{profile.username}</h1>
              {genderSymbol && (
                <span className={`text-base sm:text-lg ${profile.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                  {genderSymbol}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
              {displaySkillTitle && (
                <span className={`badge border ${getSkillColor(displaySkillTitle)}`}>
                  {displaySkillTitle}
                </span>
              )}
              {age !== null && (
                <span className="text-xs sm:text-sm text-gray-500">Age {age}</span>
              )}
            </div>
            {profile.playing_status && (
              <div className="flex items-center gap-1.5 mt-1 sm:mt-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-display font-bold text-green-400">{profile.playing_status}</span>
              </div>
            )}
            {profile.description && (
              <p className="text-xs sm:text-sm text-gray-400 mt-1 sm:mt-2 line-clamp-2">{profile.description}</p>
            )}
            {locationLabel && (
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                <span className="text-[12px]">📍</span>
                {locationFlag && <span>{locationFlag}</span>}
                <span className="truncate">{locationLabel}</span>
              </p>
            )}
            <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 sm:mt-1">
              Member since {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
            </p>
            {/* Follow + compact notify controls */}
            {authUser && !isOwner && (
              <div className="mt-1.5 sm:mt-2 relative w-fit" ref={notifyMenuRef}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`px-4 py-1 sm:py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                      followStatus.following
                        ? 'bg-piu-dark text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-piu-border'
                        : 'bg-piu-accent text-white hover:bg-piu-accent/80'
                    }`}
                  >
                    {followLoading ? '...' : followStatus.following ? 'Following' : 'Follow'}
                  </button>
                  <button
                    onClick={() => setNotifyMenuOpen(v => !v)}
                    className={`px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-display font-bold border transition-colors ${
                      activityNotifyPrefs.subscribed
                        ? 'bg-piu-dark border-emerald-400/40 text-gray-100'
                        : 'bg-piu-dark border-piu-border text-gray-300 hover:text-white'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Notify</span>
                      {activityNotifyPrefs.subscribed && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      )}
                    </span>
                  </button>
                </div>

                {notifyMenuOpen && (
                  <div className="absolute left-0 top-full mt-2 z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg bg-piu-card border border-piu-border/60 p-2.5 shadow-2xl">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-display font-bold text-gray-400 uppercase tracking-wide">
                        Notify About {profile.username}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSetAllActivityPrefs(true)}
                          disabled={activityNotifyPrefs.loading || activityNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          All
                        </button>
                        <button
                          onClick={() => handleSetAllActivityPrefs(false)}
                          disabled={activityNotifyPrefs.loading || activityNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { key: 'notify_posts', label: 'New Posts' },
                        { key: 'notify_upscores', label: 'Upscores' },
                        { key: 'notify_new_clears', label: 'New Clears' },
                      ].map(opt => {
                        const enabled = !!activityNotifyPrefs[opt.key];
                        return (
                          <button
                            key={opt.key}
                            onClick={() => handleToggleActivityPref(opt.key)}
                            disabled={activityNotifyPrefs.loading || activityNotifyPrefs.saving}
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
                      {activityNotifyPrefs.loading && 'Loading activity notification settings...'}
                      {!activityNotifyPrefs.loading && activityNotifyPrefs.saving && 'Saving activity notification settings...'}
                      {!activityNotifyPrefs.loading && !activityNotifyPrefs.saving && activityNotifyPrefs.subscribed && 'You will get notified for selected activities.'}
                      {!activityNotifyPrefs.loading && !activityNotifyPrefs.saving && !activityNotifyPrefs.subscribed && 'Activity notifications are off.'}
                    </p>
                    {activityNotifyError && (
                      <p className="text-[10px] text-red-400 mt-1">{activityNotifyError}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {(hasCompactPiuSummary || hasGroupBadges) && (
            <div className="shrink-0 self-start w-[140px] sm:w-[220px]">
              {hasCompactPiuSummary && (
                <div className="rounded-lg bg-piu-dark/50 border border-piu-border/30 px-2 py-1.5 sm:px-3 sm:py-2 flex flex-col gap-0.5 sm:gap-1">
                  {profile.pumbility > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] sm:text-[11px] text-gray-400 font-display">Pumbility</span>
                      <span className="text-[11px] sm:text-sm text-piu-gold font-mono font-bold">{profile.pumbility.toLocaleString()} PB</span>
                    </div>
                  )}
                  {(piuStatus?.highest_single || piuStatus?.highest_double) && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] sm:text-[11px] text-gray-400 font-display">Best Clears</span>
                      <span className="text-[11px] sm:text-sm font-mono font-bold">
                        {piuStatus.highest_single && <span className="text-red-400">S{piuStatus.highest_single}</span>}
                        {piuStatus.highest_single && piuStatus.highest_double && <span className="text-gray-500 mx-0.5 sm:mx-1">/</span>}
                        {piuStatus.highest_double && <span className="text-green-400">D{piuStatus.highest_double}</span>}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {hasGroupBadges && (
                <div className={`${hasCompactPiuSummary ? 'mt-2' : ''} rounded-lg bg-piu-dark/50 border border-piu-border/30 px-2 py-2 sm:px-3 sm:py-2.5`}>
                  <div className="overflow-x-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="inline-flex min-w-full justify-end gap-2">
                      {profile.group_badges.map((badge) => (
                        <button
                          key={`${badge.id || badge.name}-${badge.group_id || ''}`}
                          type="button"
                          className="inline-flex shrink-0 items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-md border border-piu-border/60 bg-piu-dark/55 hover:border-piu-accent/70 transition-colors focus:outline-none focus:ring-1 focus:ring-piu-accent/70"
                          title={badge.description || badge.name || 'Group Badge'}
                          aria-label={badge.name || 'Group Badge'}
                          onClick={() => setSelectedGroupBadge(badge)}
                        >
                          {badge.image ? (
                            <img src={badge.image} alt={badge.name || 'Badge'} className="w-full h-full rounded-md object-contain p-0.5" />
                          ) : (
                            <span className="text-[11px] font-display font-bold text-gray-200">
                              {String((badge.name || 'B')[0] || 'B').toUpperCase()}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats integrated into profile card */}
        <div className="flex items-center justify-around sm:justify-start gap-2 sm:gap-6 mt-3 pt-2.5 sm:pt-3 border-t border-piu-border/30">
          <button
            onClick={() => { setTab('followers'); setFollowersLoaded(false); }}
            className="text-center hover:opacity-80 transition-opacity cursor-pointer"
          >
            <p className="font-mono font-bold text-base sm:text-lg text-piu-accent leading-tight">
              {socialCounts.followers_count}
              {socialCounts.followers_count > (socialCounts.yesterday_followers ?? socialCounts.followers_count) && (
                <span className="text-green-400 text-[10px] ml-0.5">&#9650;</span>
              )}
              {socialCounts.followers_count < (socialCounts.yesterday_followers ?? socialCounts.followers_count) && (
                <span className="text-red-400 text-[10px] ml-0.5">&#9660;</span>
              )}
            </p>
            <p className="text-[10px] text-gray-500 font-display">Followers</p>
          </button>
          <div className="text-center">
            <p className="font-mono font-bold text-base sm:text-lg text-piu-accent leading-tight">{socialCounts.posts_count}</p>
            <p className="text-[10px] text-gray-500 font-display">Posts</p>
          </div>
          <div className="text-center">
            <p className="font-mono font-bold text-base sm:text-lg text-piu-accent leading-tight">{socialCounts.total_pumps || 0}</p>
            <p className="text-[10px] text-gray-500 font-display">Pumps</p>
          </div>
          <div className="text-center">
            <p className="font-mono font-bold text-base sm:text-lg text-piu-accent leading-tight">{competitionsCount}</p>
            <p className="text-[10px] text-gray-500 font-display">Competitions</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              tab === t
                ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Syncing indicator */}
      {piuSyncing === 'auto' && isPiuTab && (
        <div className="text-center text-xs text-piu-accent animate-pulse py-2 mb-2">
          Syncing latest data from piugame.com...
        </div>
      )}

      {/* Background sync progress bar */}
      {syncProgress.in_progress && (
        <div className="mb-4">
          <SyncProgressBar
            progress={syncProgress.progress}
            total={syncProgress.total}
            label="Importing Best Scores..."
          />
        </div>
      )}

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {songAnalytics && (
            <SongAnalyticsPanel analytics={songAnalytics} />
          )}

          <SkillBreakdownPanel userId={profileId} />
          <RankingsPanel userId={profileId} viewerUserId={authUser?.id || null} />
          {isOwner && songAnalytics && (
            <GradeGoalTracker userId={profileId} analyticsLevels={songAnalytics.levels} />
          )}

          {(overviewPlayHeatmap.weeks.length > 0 || hasPiuData) && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-sm text-piu-accent">Play Activity Heatmap</h3>
                {overviewPlayHeatmap.activeDays > 0 && (
                  <span className="text-[10px] text-gray-500">
                    {overviewPlayHeatmap.activeDays} active day{overviewPlayHeatmap.activeDays === 1 ? '' : 's'} | {overviewPlayHeatmap.totalPlays} plays
                  </span>
                )}
              </div>

              {overviewPlayHeatmap.weeks.length > 0 ? (
                <>
                  <div className="overflow-x-auto pb-2">
                    <div className="inline-block min-w-max">
                      <div className="flex mb-1">
                        <div className="w-8 shrink-0" />
                        <div className="flex gap-1">
                          {overviewPlayHeatmap.monthLabels.map((label, idx) => (
                            <div key={`${label}-${idx}`} className="w-4 text-[9px] text-gray-500">
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-start gap-1">
                        <div className="w-8 shrink-0 flex flex-col gap-1 text-[9px] text-gray-600">
                          <div className="h-4 flex items-center">S</div>
                          <div className="h-4 flex items-center">M</div>
                          <div className="h-4 flex items-center">T</div>
                          <div className="h-4 flex items-center">W</div>
                          <div className="h-4 flex items-center">T</div>
                          <div className="h-4 flex items-center">F</div>
                          <div className="h-4 flex items-center">S</div>
                        </div>
                        <div className="flex gap-1">
                          {overviewPlayHeatmap.weeks.map((week, weekIndex) => (
                            <div key={weekIndex} className="flex flex-col gap-1">
                              {week.map((cell, dayIdx) => (
                                <button
                                  key={`${cell.key}-${dayIdx}`}
                                  onClick={() => cell.data && setSelectedOverviewDateKey(cell.key)}
                                  className={`w-4 h-4 rounded-[3px] border transition-all ${
                                    cell.data
                                      ? selectedOverviewDateKey === cell.key
                                        ? 'border-white/80 ring-1 ring-piu-accent/70'
                                        : 'border-piu-border/30 hover:border-white/60'
                                      : 'border-piu-border/20'
                                  }`}
                                  style={{ background: cell.data ? cell.fill : '#111827' }}
                                  title={
                                    cell.data
                                      ? `${cell.label} | ${cell.data.total} plays (${Math.round(cell.data.doubleRatio * 100)}% Double / ${Math.round(cell.data.singleRatio * 100)}% Single)`
                                      : cell.label
                                  }
                                  disabled={!cell.data}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 flex flex-col items-end">
                    {overviewPlayHeatmap.singleLegend && (
                      <div className="flex items-center justify-end gap-2 w-full">
                        <span className="text-[10px] font-display font-bold text-red-300 shrink-0">Singles</span>
                        <div className="flex items-center gap-[2px] justify-end">
                          {singleLegendLevels.map((level) => (
                            <span
                              key={`single-${level}`}
                              className="w-2.5 h-2.5 rounded-[2px] border border-piu-border/35"
                              style={{ backgroundColor: getSingleLevelColor(level) }}
                              title={`S${level}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          S{overviewPlayHeatmap.singleLegend.min} - S{overviewPlayHeatmap.singleLegend.max}
                        </span>
                      </div>
                    )}
                    {overviewPlayHeatmap.doubleLegend && (
                      <div className="flex items-center justify-end gap-2 w-full">
                        <span className="text-[10px] font-display font-bold text-green-300 shrink-0">Doubles</span>
                        <div className="flex items-center gap-[2px] justify-end">
                          {doubleLegendLevels.map((level) => (
                            <span
                              key={`double-${level}`}
                              className="w-2.5 h-2.5 rounded-[2px] border border-piu-border/35"
                              style={{ backgroundColor: getDoubleLevelColor(level) }}
                              title={`D${level}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          D{overviewPlayHeatmap.doubleLegend.min} - D{overviewPlayHeatmap.doubleLegend.max}
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedOverviewDay && (
                    <div className="mt-4 pt-4 border-t border-piu-border/30">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-display font-bold text-xs text-piu-accent">
                          {parseDayKey(selectedOverviewDateKey)?.toLocaleDateString(undefined, {
                            weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
                          }) || selectedOverviewDateKey}
                        </h4>
                        <span className="text-[10px] text-gray-500">{selectedOverviewDay.total} plays</span>
                      </div>

                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {selectedOverviewDay.plays.map((play, idx) => {
                          const rank = getRank(play.score);
                          const displayGrade = parseGrade(play.grade, rank.label);
                          const isBreak = isStageBreakPlay(play);
                          const playNorm = (play.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
                          const playChartKey = `${playNorm}|${play.mode}|${play.level}`;
                          const playChartId = chartKeyMap?.[playChartKey] || chartKeyMap?.[playNorm];
                          const playChartLink = playChartId ? `/songs/chart/${playChartId}` : `/songs?q=${encodeURIComponent(play.song_title || '')}`;
                          return (
                            <div key={`${play.song_title}-${play.mode}-${play.level}-${idx}`} className="flex items-center gap-2 py-1 border-b border-piu-border/20 last:border-0">
                              <Link to={playChartLink}>
                                <PiuSongJacket
                                  title={play.song_title}
                                  mode={play.mode}
                                  level={play.level}
                                  bgUrl={play.background_url}
                                  jacketLookup={jacketLookup}
                                  size="sm"
                                />
                              </Link>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-display font-bold truncate">{play.song_title}</p>
                                <p className="text-[10px] text-gray-500">
                                  {play.mode === 'Single' ? 'S' : play.mode === 'Double' ? 'D' : 'C'}{play.level}
                                  {play.date_played && (
                                    <span className="ml-1.5 text-gray-600">{String(play.date_played).split(' ').slice(1).join(' ') || ''}</span>
                                  )}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="text-right shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                                onClick={() => setSelectedPlay(play)}
                              >
                                {isBreak ? (
                                  <span className="text-xs leading-none font-display font-bold text-red-500">STAGE BREAK</span>
                                ) : (
                                  <>
                                    <span
                                      className={`text-xs leading-none font-display font-bold ${getGradeColor(displayGrade.display)} ${displayGrade.isBroken ? 'grade-broken' : ''}`}
                                      data-grade={displayGrade.display}
                                    >
                                      {displayGrade.display}
                                    </span>
                                    <p className="text-[11px] leading-none font-mono font-bold mt-0.5">{(parseInt(play.score, 10) || 0).toLocaleString()}</p>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <DailyLevelGradeChart plays={selectedOverviewDay.plays} />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-gray-500 text-sm py-4">No recently played data synced yet</p>
              )}
            </div>
          )}

        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'all', label: 'All' },
              { key: 'posts', label: 'Posts' },
              { key: 'comments', label: 'Comments' },
              { key: 'scores', label: 'Scores' },
              { key: 'competitions', label: 'Competitions' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setActivitySubTab(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                  activitySubTab === opt.key ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {filteredActivity.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No activity yet</p>
          ) : (
            <div className="space-y-3.5">
              {filteredActivity.map(item => {
                const visual = getActivityVisual(item);
                const content = (
                  <div className="card-hover p-3 sm:p-3.5">
                    <div className="flex items-start gap-3.5">
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${visual.tone}`}>
                        <ActivityIconGlyph icon={visual.icon} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2.5">
                          <p className="text-sm font-display font-bold text-gray-200 leading-5">{item.message}</p>
                          <span className="text-[10px] text-gray-600 shrink-0 pt-0.5">{timeAgo(item.created_at)}</span>
                        </div>
                        {item.detail && (
                          <p className="text-xs text-gray-500 mt-1.5 break-words leading-relaxed">{item.detail}</p>
                        )}
                        <div className="mt-2.5">
                          <span className="inline-flex items-center rounded-md border border-piu-border/50 bg-piu-dark/60 px-2 py-0.5 text-[10px] font-display uppercase tracking-wide text-gray-400">
                            {getActivityCategoryLabel(item.category)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );

                if (item.link) {
                  return (
                    <Link key={item.id} to={item.link} className="block">
                      {content}
                    </Link>
                  );
                }

                return <div key={item.id}>{content}</div>;
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'competitions' && (
        <div>
          {/* Sub-tabs for Tournaments, Duels, and Songs */}
          <div className="flex gap-1 mb-3 flex-wrap">
            <button
              onClick={() => setCompetitionsSub('tournaments')}
              className={`px-3 py-1 rounded text-[11px] font-display font-bold transition-colors ${
                competitionsSub === 'tournaments' ? 'bg-piu-dark text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Tournaments ({aggregated?.tournamentCount || 0})
            </button>
            <button
              onClick={() => setCompetitionsSub('duels')}
              className={`px-3 py-1 rounded text-[11px] font-display font-bold transition-colors ${
                competitionsSub === 'duels' ? 'bg-piu-dark text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Duels ({aggregated?.duelCount || 0})
            </button>
            <button
              onClick={() => setCompetitionsSub('songs')}
              className={`px-3 py-1 rounded text-[11px] font-display font-bold transition-colors ${
                competitionsSub === 'songs' ? 'bg-piu-dark text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Songs ({songScores.length})
            </button>
          </div>

          {competitionsSub === 'tournaments' && (
            <div className="space-y-3">
              {!stats ? (
                <p className="text-center text-gray-500 py-8">Loading competition history...</p>
              ) : stats.tournamentPlayers.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No tournament participation yet</p>
              ) : (
                stats.tournamentPlayers.map(({ tournament }) => (
                  <Link
                    key={tournament.tournament_id || tournament.id}
                    to={`/tournament/${tournament.tournament_id}`}
                    className="card-hover flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      {tournament.tournament_avatar ? (
                        <img src={getAvatarUrl(tournament.tournament_avatar)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-piu-accent to-purple-700 rounded-lg flex items-center justify-center font-display font-bold">
                          {(tournament.tournament_name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-display font-bold group-hover:text-piu-accent transition-colors">
                          {tournament.tournament_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {tournament.tournament_date || ''} - {tournament.wins}W {tournament.losses}L
                        </p>
                      </div>
                    </div>
                    <span className={`badge ${
                      tournament.tournament_phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
                    }`}>
                      {tournament.tournament_phase}
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}

          {competitionsSub === 'duels' && (
            <div className="space-y-3">
              {!stats ? (
                <p className="text-center text-gray-500 py-8">Loading competition history...</p>
              ) : (stats.duelStats.length === 0 && (stats.onlineDuelStats || []).length === 0) ? (
                <p className="text-center text-gray-500 py-8">No duel participation yet</p>
              ) : (
                <>
                  {/* Online Duels */}
                  {(stats.onlineDuelStats || []).map(({ duel, songs }) => {
                    const isP1 = duel.creator_user_id === profileId;
                    const opponentName = isP1 ? duel.opponent_username : duel.creator_username;
                    const completedSongs = songs.filter(s => s.status === 'completed');
                    const myWins = completedSongs.filter(s => (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2')).length;
                    const oppWins = completedSongs.filter(s => (isP1 && s.winner === 'player2') || (!isP1 && s.winner === 'player1')).length;
                    return (
                      <Link key={duel.id} to={`/online-duel/${duel.id}`} className="card-hover flex items-center justify-between group">
                        <div>
                          <p className="font-display font-bold group-hover:text-piu-accent transition-colors">
                            {duel.name}
                            <span className="text-[10px] text-piu-accent ml-1.5 font-normal">ONLINE</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            vs {opponentName} - {myWins}W {oppWins}L ({completedSongs.length} songs)
                          </p>
                        </div>
                        <span className={`badge ${duel.status === 'COMPLETED' ? 'badge-completed' : duel.status === 'WAITING' ? 'badge-pending' : 'badge-active'}`}>
                          {duel.status === 'COMPLETED' ? 'Completed' : duel.status === 'WAITING' ? 'Waiting' : 'Active'}
                        </span>
                      </Link>
                    );
                  })}
                  {/* Offline Duels */}
                  {stats.duelStats.map(({ duel, songs }) => {
                    const isP1 = duel.player1_user_id === profileId;
                    const opponentName = isP1 ? duel.player2_name : duel.player1_name;
                    const myWins = songs.filter(s => (isP1 && s.winner === 'player1') || (!isP1 && s.winner === 'player2')).length;
                    const oppWins = songs.filter(s => (isP1 && s.winner === 'player2') || (!isP1 && s.winner === 'player1')).length;
                    return (
                      <Link key={duel.id} to={`/duel/${duel.id}`} className="card-hover flex items-center justify-between group">
                        <div>
                          <p className="font-display font-bold group-hover:text-piu-accent transition-colors">
                            {duel.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            vs {opponentName} - {myWins}W {oppWins}L ({songs.length} songs)
                          </p>
                        </div>
                        <span className={`badge ${duel.status === 'COMPLETED' ? 'badge-completed' : 'badge-active'}`}>
                          {duel.status === 'COMPLETED' ? 'Completed' : 'Active'}
                        </span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {competitionsSub === 'songs' && (
            <div className="space-y-4">
              {aggregated?.byLevel?.length > 0 && (
                <div className="card">
                  <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Average Score by Level</h3>
                  <div className="space-y-1.5">
                    {aggregated.byLevel.map(l => {
                      const rank = getRank(l.avg);
                      return (
                        <div key={l.level} className="flex items-center gap-2">
                          <span className="text-xs font-display font-bold w-10 text-gray-400">Lv.{l.level}</span>
                          <div className="flex-1 h-4 bg-piu-dark rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-piu-accent to-purple-600 rounded-full"
                              style={{ width: `${(l.avg / 1000000) * 100}%` }}
                            />
                          </div>
                          <span className={`text-xs font-display font-bold w-8 ${rank.color}`}>{rank.label}</span>
                          <span className="text-xs font-mono text-gray-500 w-16 text-right">{l.avg.toLocaleString()}</span>
                          <span className="text-[10px] text-gray-600 w-8 text-right">{l.count}x</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {songScores.length > 0 && (
                <div className="card">
                  <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Top Scores</h3>
                  <div className="space-y-2">
                    {songScores.slice(0, 10).map((s, i) => {
                      const rank = getRank(s.myScore);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 font-mono w-4">#{i + 1}</span>
                          {s.jacket && (
                            <img src={s.jacket} alt="" className="w-8 h-8 rounded object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-display font-bold truncate">{s.title}</p>
                            <p className="text-[10px] text-gray-500">
                              {s.mode} Lv.{s.level}
                              <span className="ml-2 text-gray-600">{s.source}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`font-display font-bold text-xs ${rank.color}`}>{rank.label}</span>
                            <p className="font-mono text-xs font-bold">{s.myScore.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {songScores.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No song scores recorded yet</p>
              ) : (
                songScores.map((s, i) => {
                  const rank = getRank(s.myScore);
                  return (
                    <div key={i} className="card flex items-center gap-3 py-2.5">
                      {s.jacket && (
                        <img src={s.jacket} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{s.title}</p>
                        <p className="text-[10px] text-gray-500">
                          {s.mode} Lv.{s.level} - {s.source}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-display font-bold text-xs ${rank.color}`}>{rank.label}</span>
                        <p className="font-mono text-xs font-bold">{s.myScore.toLocaleString()}</p>
                      </div>
                      <div className="w-6 text-center shrink-0">
                        {s.won && <span className="text-piu-green text-xs">W</span>}
                        {!s.won && !s.draw && <span className="text-red-400 text-xs">L</span>}
                        {s.draw && <span className="text-gray-500 text-xs">D</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'shoes' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display font-bold text-base text-piu-accent">SHOE CABINET</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshShoeCabinet().catch(() => {})}
                  className="px-3 py-1 rounded-lg text-[11px] font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white disabled:opacity-60"
                  disabled={shoeBusy || shoeLoading}
                >
                  {shoeLoading ? 'Loading...' : 'Refresh'}
                </button>
                {isOwner && (
                  <Link
                    to="/account"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white transition-colors"
                    title="Open shoe settings"
                    aria-label="Open shoe settings"
                  >
                    ⚙
                  </Link>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Lifetime Steps</p>
                <p className="font-mono font-bold text-sm text-piu-accent mt-1">
                  {((shoeCabinet?.lifetime_steps || 0)).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Lifetime Songs</p>
                <p className="font-mono font-bold text-sm text-piu-accent mt-1">
                  {((shoeCabinet?.lifetime_songs || 0)).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-piu-dark/60 border border-piu-border/40 p-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">No. of Shoes</p>
                <p className="font-mono font-bold text-sm text-piu-accent mt-1">
                  {cabinetShoes.length.toLocaleString()}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Syncing recently played asserts your current shoe for fetched plays.
            </p>
            {shoeFeedback && <p className="text-xs text-gray-400 mt-2">{shoeFeedback}</p>}
          </div>

          <div className="space-y-3">
            {shoeLoading && cabinetShoes.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">Loading shoes...</p>
            ) : cabinetShoes.length === 0 ? (
              <div className="rounded-lg border border-piu-border/40 bg-piu-dark/30 p-4 text-center">
                <p className="text-gray-500 text-sm">
                  {isOwner ? 'No shoes in your cabinet yet' : 'No shoes added yet'}
                </p>
                {isOwner && (
                  <Link
                    to="/account"
                    className="inline-flex items-center mt-3 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-piu-accent/20 text-piu-accent border border-piu-accent/40 hover:bg-piu-accent/30 transition-colors"
                  >
                    Add your first shoe
                  </Link>
                )}
              </div>
            ) : (
              <>
                {activeCabinetShoes.map((shoe) => {
                  const shoeLabel = `${shoe.make} ${shoe.model}`.replace(/\s+/g, ' ').trim() || 'Unnamed Shoe';
                  const shoeColorway = String(shoe.colorway || '').trim();
                  return (
                    <div
                      key={shoe.id}
                      className={`card flex items-start gap-3 ${shoe.is_current ? 'bg-emerald-500/10 border-emerald-400/50' : ''}`}
                    >
                      {shoe.image_data ? (
                        <img src={shoe.image_data} alt={shoeLabel} className="w-28 h-16 rounded-lg object-contain bg-piu-dark/60 border border-piu-border/40 shrink-0 p-1" />
                      ) : (
                        <div className="w-28 h-16 rounded-lg border border-piu-border/40 bg-piu-dark/60 flex items-center justify-center text-[11px] text-gray-500 text-center shrink-0">
                          No Photo
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-bold text-sm truncate">{shoeLabel}</p>
                          {shoe.is_current ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                              Current
                            </span>
                          ) : null}
                        </div>
                        {shoeColorway ? (
                          <p className="text-[10px] text-gray-400 mt-0.5">{shoeColorway}</p>
                        ) : null}
                        <p className="text-[11px] text-gray-500 mt-1">
                          {shoe.songs_logged?.toLocaleString() || 0} songs
                          <span className="mx-1.5 text-gray-700">|</span>
                          {shoe.steps_logged?.toLocaleString() || 0} steps
                        </p>
                      </div>
                      {isOwner && !shoe.is_current && (
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => handleWearShoe(shoe.id)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-piu-dark text-gray-300 border border-piu-border hover:text-white disabled:opacity-60"
                            disabled={shoeBusy}
                          >
                            Wear
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {retiredCabinetShoes.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] font-display font-bold text-gray-400 uppercase tracking-wide">Retired Shoes</p>
                  </div>
                )}

                {retiredCabinetShoes.map((shoe) => {
                  const shoeLabel = `${shoe.make} ${shoe.model}`.replace(/\s+/g, ' ').trim() || 'Unnamed Shoe';
                  const shoeColorway = String(shoe.colorway || '').trim();
                  return (
                    <div key={shoe.id} className="card flex items-start gap-3">
                      {shoe.image_data ? (
                        <img src={shoe.image_data} alt={shoeLabel} className="w-28 h-16 rounded-lg object-contain bg-piu-dark/60 border border-piu-border/40 shrink-0 p-1" />
                      ) : (
                        <div className="w-28 h-16 rounded-lg border border-piu-border/40 bg-piu-dark/60 flex items-center justify-center text-[11px] text-gray-500 text-center shrink-0">
                          No Photo
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display font-bold text-sm truncate">{shoeLabel}</p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-bold bg-gray-700/60 text-gray-300 border border-gray-500/40">
                            Retired
                          </span>
                        </div>
                        {shoeColorway ? (
                          <p className="text-[10px] text-gray-400 mt-0.5">{shoeColorway}</p>
                        ) : null}
                        <p className="text-[11px] text-gray-500 mt-1">
                          {shoe.songs_logged?.toLocaleString() || 0} songs
                          <span className="mx-1.5 text-gray-700">|</span>
                          {shoe.steps_logged?.toLocaleString() || 0} steps
                        </p>
                        <p className="text-[10px] text-gray-600 mt-1">
                          Retired {new Date(`${shoe.retired_at}Z`).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* ────── FOLLOWERS VIEW (accessed via Followers box click) ────── */}
      {tab === 'followers' && (
        <div className="space-y-4">
          <button onClick={() => setTab('overview')} className="text-xs text-gray-500 hover:text-piu-accent font-display">&larr; Back to profile</button>
          {/* Followers */}
          <div className="card">
            <h3 className="font-display font-bold text-sm text-piu-accent mb-3">FOLLOWERS ({followersList.length})</h3>
            {followersList.length === 0 ? (
              <p className="text-gray-500 text-xs py-4 text-center">No followers yet</p>
            ) : (
              <div className="divide-y divide-piu-border/20">
                {followersList.map(f => {
                  const fFlag = getCountryFlag(f.nationality);
                  const isFollowingBack = myFollowingIds.has(f.id);
                  const isSelf = authUser && authUser.id === f.id;
                  return (
                    <div key={f.id} className="flex items-center gap-3 py-2.5">
                      <Link to={getProfilePath(f.id, f.username)} className="shrink-0">
                        {f.avatar ? (
                          <img src={getAvatarUrl(f.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                            {(f.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={getProfilePath(f.id, f.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors truncate block">
                          {fFlag && <span className="mr-1">{fFlag}</span>}
                          {f.username}
                        </Link>
                        {f.skill_title && <p className="text-[10px] text-gray-500 truncate">{f.skill_title}</p>}
                      </div>
                      {f.pumbility > 0 && (
                        <span className="text-[10px] font-mono text-piu-accent shrink-0">{f.pumbility}</span>
                      )}
                      {authUser && !isSelf && !isFollowingBack && (
                        <button
                          onClick={async () => {
                            setFollowBackLoading(prev => ({ ...prev, [f.id]: true }));
                            try {
                              await followUser(f.id);
                              setMyFollowingIds(prev => new Set([...prev, f.id]));
                            } catch {}
                            setFollowBackLoading(prev => ({ ...prev, [f.id]: false }));
                          }}
                          disabled={followBackLoading[f.id]}
                          className="btn-primary text-[10px] px-3 py-1 shrink-0"
                        >
                          {followBackLoading[f.id] ? '...' : 'Follow'}
                        </button>
                      )}
                      {authUser && !isSelf && isFollowingBack && (
                        <span className="text-[10px] text-gray-500 font-display shrink-0">Following</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Following */}
          <div className="card">
            <h3 className="font-display font-bold text-sm text-piu-accent mb-3">FOLLOWING ({followingList.length})</h3>
            {followingList.length === 0 ? (
              <p className="text-gray-500 text-xs py-4 text-center">Not following anyone yet</p>
            ) : (
              <div className="divide-y divide-piu-border/20">
                {followingList.map(f => {
                  const fFlag = getCountryFlag(f.nationality);
                  return (
                    <div key={f.id} className="flex items-center gap-3 py-2.5">
                      <Link to={getProfilePath(f.id, f.username)} className="shrink-0">
                        {f.avatar ? (
                          <img src={getAvatarUrl(f.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-sm">
                            {(f.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={getProfilePath(f.id, f.username)} className="font-display font-bold text-sm hover:text-piu-accent transition-colors truncate block">
                          {fFlag && <span className="mr-1">{fFlag}</span>}
                          {f.username}
                        </Link>
                        {f.skill_title && <p className="text-[10px] text-gray-500 truncate">{f.skill_title}</p>}
                      </div>
                      {f.pumbility > 0 && (
                        <span className="text-[10px] font-mono text-piu-accent shrink-0">{f.pumbility}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────── POSTS TAB ────── */}
      {tab === 'posts' && (
        <div className="space-y-3">
          {profilePosts.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No posts yet</p>
          ) : (
            profilePosts.map(post => (
              <PostCard
                key={post.id}
                post={{ ...post, username: profile.username, avatar: profile.avatar, nationality: profile.nationality }}
                showAuthor={false}
              />
            ))
          )}
        </div>
      )}

      {/* ────── PUMBILITY TAB ────── */}
      {tab === 'pumbility' && (
        <div className="space-y-4">
          {/* Stats Card */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-base text-piu-accent">PUMBILITY</h3>
              <div className="text-right">
                {piuPumbility?.pumbility_value > 0 && (
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-2xl font-mono font-bold text-piu-gold">
                      {piuPumbility.pumbility_value.toLocaleString()}
                    </span>
                    {piuPumbility.ranking ? (
                      <button
                        type="button"
                        onClick={() => setShowPumbilityThresholdModal(true)}
                        className="px-2 py-0.5 rounded border border-piu-gold/40 text-piu-gold text-xs font-display font-bold hover:bg-piu-gold/10 transition-colors"
                      >
                        #{piuPumbility.ranking}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPumbilityThresholdModal(true)}
                        className="px-2 py-0.5 rounded border border-piu-border/40 text-gray-500 text-[10px] font-display hover:text-gray-300 transition-colors"
                      >
                        Outside Top 1000
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {piuPumbility && piuPumbility.pumbility_value > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {/* Average Rating */}
                <div className="bg-piu-dark/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Avg Rating</p>
                  <p className="text-lg font-mono font-bold text-white">{piuPumbility.average_rating?.toLocaleString()}</p>
                  {piuPumbility.equivalent_level && piuPumbility.equivalent_grade && (
                    <p className="text-[10px] text-gray-400 font-display mt-0.5">
                      <span className="text-gray-500">~</span> Lv.{piuPumbility.equivalent_level}{' '}
                      {(() => {
                        const equivalentGrade = parseGrade(piuPumbility.equivalent_grade);
                        return (
                          <span
                            className={`${getGradeColor(equivalentGrade.display)} ${equivalentGrade.isBroken ? 'grade-broken' : ''}`}
                            data-grade={equivalentGrade.display}
                          >
                            {equivalentGrade.display}
                          </span>
                        );
                      })()}
                    </p>
                  )}
                </div>

                {/* Min Entry */}
                <div className="bg-piu-dark/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Min Entry</p>
                  <p className="text-lg font-mono font-bold text-white">
                    {piuPumbility.min_entry_rating > 0 ? piuPumbility.min_entry_rating.toLocaleString() : '--'}
                  </p>
                  {piuPumbility.min_entry_details && (
                    <p className="text-[10px] text-gray-400 font-display mt-0.5">
                      Lv.{piuPumbility.min_entry_details.level}{' '}
                      {(() => {
                        const minEntryGrade = parseGrade(piuPumbility.min_entry_details.grade);
                        return (
                          <span
                            className={`${getGradeColor(minEntryGrade.display)} ${minEntryGrade.isBroken ? 'grade-broken' : ''}`}
                            data-grade={minEntryGrade.display}
                          >
                            {minEntryGrade.display}
                          </span>
                        );
                      })()}
                    </p>
                  )}
                </div>

                {/* Average Score */}
                <div className="bg-piu-dark/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Avg Score</p>
                  <p className="text-lg font-mono font-bold text-white">
                    {pumbilityAvgScore > 0 ? pumbilityAvgScore.toLocaleString() : '--'}
                  </p>
                  {pumbilityAvgScore > 0 && (
                    <p className={`text-[10px] font-display mt-0.5 ${pumbilityAvgScoreRank?.color || 'text-gray-500'}`}>
                      {pumbilityAvgScoreRank?.label || '--'}
                    </p>
                  )}
                </div>

                {/* Average Level */}
                <div className="bg-piu-dark/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide mb-1">Avg Level</p>
                  <p className="text-lg font-mono font-bold text-white">
                    {pumbilityAvgLevel > 0 ? pumbilityAvgLevel.toFixed(1) : '--'}
                  </p>
                  {pumbilityAvgLevel > 0 && (
                    <p className="text-[10px] text-gray-500 font-display mt-0.5">
                      Top 50 average
                    </p>
                  )}
                </div>
              </div>
            )}

            {piuPumbility?.last_sync && (
              <p className="text-xs text-gray-600">
                Last synced: {new Date(piuPumbility.last_sync + 'Z').toLocaleString()}
              </p>
            )}
          </div>

          {showPumbilityThresholdModal && (
            <div
              className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowPumbilityThresholdModal(false)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl p-4"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Top 1000 Threshold</p>
                    <p className="text-xl font-mono font-bold text-white mt-1">
                      {piuPumbility?.threshold > 0 ? piuPumbility.threshold.toLocaleString() : '--'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPumbilityThresholdModal(false)}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] text-gray-400">
                    Current ranking: {piuPumbility?.ranking ? `#${piuPumbility.ranking}` : 'Outside top 1000'}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Current pumbility: {(piuPumbility?.pumbility_value || 0).toLocaleString()}
                  </p>
                  {piuPumbility?.threshold > 0 && piuPumbility?.pumbility_value > 0 ? (
                    <p className="text-[11px] font-display">
                      {piuPumbility.pumbility_value >= piuPumbility.threshold ? (
                        <span className="text-green-400">Qualified for Top 1000</span>
                      ) : (
                        <span className="text-gray-400">
                          {(piuPumbility.threshold - piuPumbility.pumbility_value).toLocaleString()} away from Top 1000
                        </span>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Top 50 Scores List */}
          <div className="card">
            <h3 className="font-display font-bold text-base text-piu-accent mb-3">TOP 50 SCORES</h3>
            {piuPumbility?.scores?.length > 0 ? (
              <div className="space-y-2">
                {piuPumbility.scores.map((s, i) => {
                  const rank = getRank(s.score);
                  const displayGrade = parseGrade(s.grade, rank.label);
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/30 last:border-0">
                      <span className="text-xs text-gray-500 font-mono w-6 shrink-0 text-right">#{s.rank_order}</span>
                      <PiuSongJacket
                        title={s.song_title} mode={s.mode} level={s.level}
                        bgUrl={s.background_url} jacketLookup={jacketLookup}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                        {s.rating > 0 && (
                          <p className="text-[10px] text-gray-500 font-mono">
                            Rating: {s.rating.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-display font-bold ${getGradeColor(displayGrade.display)} ${displayGrade.isBroken ? 'grade-broken' : ''}`}
                          data-grade={displayGrade.display}
                        >
                          {displayGrade.display}
                        </span>
                        <p className="font-mono text-xs font-bold">{s.score.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 text-sm py-6">No pumbility data synced yet</p>
            )}
          </div>
        </div>
      )}

      {/* ────── BEST SCORES TAB ────── */}
      {tab === 'best-scores' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-base text-piu-accent">BEST SCORES</h3>
              {isOwner && piuStatus?.linked && !syncProgress.in_progress && (
                <button
                  onClick={handleStartBestScoresSync}
                  className="text-xs text-gray-400 hover:text-piu-accent transition-colors font-display"
                >
                  Full Sync
                </button>
              )}
            </div>

            {syncFeedback && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-display">
                {syncFeedback}
              </div>
            )}

            {/* Mode filter: All, Single, Double, Co-op */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex gap-1">
                {[
                  { key: '', label: 'All' },
                  { key: 'Single', label: 'Single' },
                  { key: 'Double', label: 'Double' },
                  { key: 'Co-op', label: 'Co-op' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setPiuScoreMode(m.key); setPiuScoreLevel(''); }}
                    className={`px-3 py-1.5 rounded text-xs font-display font-bold transition-colors ${
                      piuScoreMode === m.key ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Level filter */}
              {availableLevels.length > 0 && (
                <select
                  className="input-field text-xs py-1.5 px-2 w-auto"
                  value={piuScoreLevel}
                  onChange={e => setPiuScoreLevel(e.target.value)}
                >
                  <option value="">All Levels ({(piuScoreMode ? piuBestScores?.scores?.filter(s => s.mode === piuScoreMode) : piuBestScores?.scores)?.length || 0})</option>
                  {availableLevels.map(l => {
                    const count = (piuScoreMode ? piuBestScores?.scores?.filter(s => s.mode === piuScoreMode && s.level === l) : piuBestScores?.scores?.filter(s => s.level === l))?.length || 0;
                    return <option key={l} value={l}>Lv.{l} ({count})</option>;
                  })}
                </select>
              )}
            </div>

            {/* Distribution chart — vertical bars with levels on x-axis */}
            {levelDistribution.levels.length > 0 && !piuScoreLevel && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500 font-display">SCORE DISTRIBUTION BY LEVEL</span>
                  {/* Legend */}
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {RANK_RANGES.filter((_, i) => i < 8).map(r => (
                      <div key={r.label} className="flex items-center gap-0.5">
                        <div className={`w-2 h-2 rounded-sm ${r.bg}`} />
                        <span className="text-[8px] text-gray-500">{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <VerticalDistributionChart
                  levels={levelDistribution.levels}
                  maxCount={levelDistribution.maxCount}
                  activeLevel={piuScoreLevel}
                  onLevelClick={(level) => setPiuScoreLevel(piuScoreLevel === String(level) ? '' : String(level))}
                />
              </div>
            )}

            {/* Grade distribution chart for selected level */}
            {piuScoreLevel && piuBestScores?.scores && (
              <GradeDistributionChart
                scores={piuBestScores.scores.filter(s => s.level === parseInt(piuScoreLevel))}
                rankRanges={RANK_RANGES}
                showModeFilter={piuScoreMode === ''}
              />
            )}

            {/* Search + Sort */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Search songs..."
                value={bestScoreSearch}
                onChange={e => setBestScoreSearch(e.target.value)}
              />
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setBestScoreSort('score')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-display font-bold transition-colors ${
                    bestScoreSort === 'score' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                  }`}
                >
                  Score
                </button>
                <button
                  onClick={() => setBestScoreSort('name')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-display font-bold transition-colors ${
                    bestScoreSort === 'name' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
                  }`}
                >
                  Name
                </button>
              </div>
            </div>

            {/* Song list */}
            {filteredBestScores.length > 0 ? (
              <div className="space-y-1.5">
                {filteredBestScores.map((s, i) => {
                  const rank = getRank(s.score);
                  const displayGrade = parseGrade(s.grade, rank.label);
                  return (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-piu-border/30 last:border-0">
                      <PiuSongJacket
                        title={s.song_title} mode={s.mode} level={s.level}
                        bgUrl={s.background_url || ''} jacketLookup={jacketLookup}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{s.song_title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] px-1 py-0.5 rounded font-display font-bold ${
                            s.mode === 'Single' ? 'bg-red-600/20 text-red-400' :
                            s.mode === 'Double' ? 'bg-green-600/20 text-green-400' :
                            'bg-blue-600/20 text-blue-400'
                          }`}>
                            {s.mode === 'Single' ? 'S' : s.mode === 'Double' ? 'D' : 'C'}{s.level}
                          </span>
                          {s.plate && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-piu-dark text-gray-400 font-mono">{s.plate}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-display font-bold ${getGradeColor(displayGrade.display)} ${displayGrade.isBroken ? 'grade-broken' : ''}`}
                          data-grade={displayGrade.display}
                        >
                          {displayGrade.display}
                        </span>
                        <p className="font-mono text-xs font-bold">{s.score.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-500 text-sm py-6">
                {piuBestScores?.scores?.length > 0
                  ? `No scores found${bestScoreSearch ? ` matching "${bestScoreSearch}"` : ''}`
                  : 'No best scores imported yet'}
              </p>
            )}

            {piuBestScores?.last_sync && (
              <p className="text-xs text-gray-600 mt-4">
                Last synced: {new Date(piuBestScores.last_sync + 'Z').toLocaleString()}
                {piuBestScores?.scores && ` | ${piuBestScores.scores.length} total scores`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ────── TITLES TAB ────── */}
      {tab === 'titles' && (
        <TitleProgressTab
          data={piuTitles}
          avatarUrl={profile.avatar ? getAvatarUrl(profile.avatar) : ''}
          username={profile.username}
          gender={profile.gender || ''}
          isOwner={isOwner}
        />
      )}

      {/* ────── RECENTLY PLAYED TAB ────── */}
      {tab === 'recently-played' && (
        <div className="card">
          <h3 className="font-display font-bold text-base text-piu-accent mb-4">RECENTLY PLAYED</h3>

          {recentlyPlayedRows.length > 0 ? (
            <div className="space-y-2">
              {recentlyPlayedRows.map((p, i) => {
                const rank = getRank(p.score);
                const displayGrade = parseGrade(p.grade, rank.label);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 border-b border-piu-border/30 last:border-0 cursor-pointer hover:bg-piu-dark/50 rounded transition-colors"
                    onClick={() => setSelectedPlay(p)}
                  >
                    <PiuSongJacket
                      title={p.song_title} mode={p.mode} level={p.level}
                      bgUrl={p.background_url} jacketLookup={jacketLookup}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold truncate">{p.song_title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.score > 0 ? (
                        <>
                          <span
                            className={`text-xs font-display font-bold ${getGradeColor(displayGrade.display)} ${displayGrade.isBroken ? 'grade-broken' : ''}`}
                            data-grade={displayGrade.display}
                          >
                            {displayGrade.display}
                          </span>
                          <p className="font-mono text-xs font-bold">{p.score.toLocaleString()}</p>
                        </>
                      ) : (
                        <span className="text-xs font-display font-bold text-red-500">STAGE BREAK</span>
                      )}
                    </div>
                    {p.date_played && (
                      <span className="text-[10px] text-gray-500 shrink-0 w-16 text-right">
                        {p.date_played.split(' ')[0]?.replace(/^\d{4}-/, '')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 text-sm py-6">No recently played data synced yet</p>
          )}

          {piuRecentlyPlayed?.last_sync && (
            <p className="text-xs text-gray-600 mt-4">
              Last synced: {new Date(piuRecentlyPlayed.last_sync + 'Z').toLocaleString()}
            </p>
          )}
        </div>
      )}

      {selectedGroupBadge && (
        <div
          className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedGroupBadge(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Group Badge</p>
              <button
                type="button"
                onClick={() => setSelectedGroupBadge(null)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-xl border border-piu-border/60 bg-piu-dark/55 flex items-center justify-center overflow-hidden">
                {selectedGroupBadge.image ? (
                  <img
                    src={selectedGroupBadge.image}
                    alt={selectedGroupBadge.name || 'Badge'}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <span className="text-2xl font-display font-bold text-gray-200">
                    {String((selectedGroupBadge.name || 'B')[0] || 'B').toUpperCase()}
                  </span>
                )}
              </div>
              <p className="mt-3 text-lg font-display font-bold text-white break-words">
                {selectedGroupBadge.name || 'Badge'}
              </p>
              <p className="mt-1 text-sm text-gray-400 break-words">
                {selectedGroupBadge.description || 'No description provided.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Phoenix Score Card Modal */}
      {selectedPlay && (() => {
        const p = selectedPlay;
        const rank = getRank(p.score);
        const displayGrade = parseGrade(p.grade, rank.label);
        const hasBreakdown = p.perfect > 0 || p.great > 0 || p.good > 0 || p.bad > 0 || p.miss > 0;
        const PLATE_NAMES = { PG: 'PERFECT GAME', UG: 'ULTIMATE GAME', EG: 'EXTREME GAME', SG: 'SUPERB GAME', MG: 'MARVELOUS GAME', TG: 'TALENTED GAME', FG: 'FAIR GAME', RG: 'ROUGH GAME' };
        const PLATE_COLORS = { PG: 'text-piu-gold', UG: 'text-yellow-400', EG: 'text-green-400', SG: 'text-blue-400', MG: 'text-sky-400', TG: 'text-purple-400', FG: 'text-gray-400', RG: 'text-red-400' };
        const plateName = PLATE_NAMES[p.plate] || p.plate || '';
        const plateColor = PLATE_COLORS[p.plate] || 'text-gray-400';
        const judgments = [
          { label: 'PERFECT', value: p.perfect || 0, textColor: 'text-sky-400' },
          { label: 'GREAT', value: p.great || 0, textColor: 'text-green-400' },
          { label: 'GOOD', value: p.good || 0, textColor: 'text-yellow-400' },
          { label: 'BAD', value: p.bad || 0, textColor: 'text-fuchsia-400' },
          { label: 'MISS', value: p.miss || 0, textColor: 'text-gray-400' },
        ];
        const modalNorm = (p.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const modalExactKey = `${modalNorm}|${p.mode}|${p.level}`;
        const modalBg = jacketLookup[modalExactKey] || jacketLookup[modalNorm] || '';
        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPlay(null)}>
            <div
              className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-piu-border shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {modalBg && (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-15"
                  style={{ backgroundImage: `url(${modalBg})` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-piu-bg/85 to-piu-bg" />

              <div className="relative p-5">
                <button
                  className="absolute top-3 right-3 text-gray-500 hover:text-white text-xl leading-none"
                  onClick={() => setSelectedPlay(null)}
                >
                  x
                </button>

                <p className="font-display font-bold text-lg leading-tight pr-6">{p.song_title}</p>

                <div className="flex items-center gap-3 mt-4">
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                    p.mode === 'Single' ? 'border-red-500/50 bg-red-500/10' : p.mode === 'Double' ? 'border-green-500/50 bg-green-500/10' : 'border-blue-500/50 bg-blue-500/10'
                  }`}>
                    <span className={`font-display font-bold text-[10px] uppercase ${p.mode === 'Single' ? 'text-red-400' : p.mode === 'Double' ? 'text-green-400' : 'text-blue-400'}`}>{p.mode}</span>
                    <span className={`font-display font-bold text-base ${p.mode === 'Single' ? 'text-red-300' : p.mode === 'Double' ? 'text-green-300' : 'text-blue-300'}`}>{p.level}</span>
                  </div>
                  <div className="text-center flex-1">
                    {p.score > 0 ? (
                      <p
                        className={`text-3xl font-display font-black ${getGradeColor(displayGrade.display)} ${displayGrade.isBroken ? 'grade-broken' : ''}`}
                        data-grade={displayGrade.display}
                      >
                        {displayGrade.display}
                      </p>
                    ) : (
                      <p className="text-xl font-display font-black text-red-500">STAGE BREAK</p>
                    )}
                  </div>
                </div>

                {plateName && (
                  <p className={`text-center font-display font-bold text-sm mt-1 ${plateColor}`}>{plateName}</p>
                )}

                {p.score > 0 && (
                  <p className="text-center font-mono text-2xl font-bold mt-2">{p.score.toLocaleString()}</p>
                )}

                {hasBreakdown && (
                  <div className="grid grid-cols-5 gap-1 text-center mt-5 pt-4 border-t border-piu-border/30">
                    {judgments.map(j => (
                      <div key={j.label}>
                        <p className={`text-[10px] font-display font-bold ${j.textColor}`}>{j.label}</p>
                        <p className="font-mono font-bold text-base mt-0.5">{j.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {!hasBreakdown && p.score > 0 && (
                  <p className="text-center text-xs text-gray-600 mt-4 pt-4 border-t border-piu-border/30">
                    Judgment breakdown not available — try re-syncing
                  </p>
                )}

                {p.date_played && (
                  <p className="text-xs text-gray-500 text-right mt-3">{p.date_played}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
