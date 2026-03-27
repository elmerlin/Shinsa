import React from 'react';
import { Link } from 'react-router-dom';
import { parseGrade } from '../utils/grades';

const PLATE_NAMES = {
  PG: 'PERFECT GAME',
  UG: 'ULTIMATE GAME',
  EG: 'EXTREME GAME',
  SG: 'SUPERB GAME',
  MG: 'MARVELOUS GAME',
  TG: 'TALENTED GAME',
  FG: 'FAIR GAME',
  RG: 'ROUGH GAME',
};

const PLATE_COLORS = {
  PG: 'text-piu-gold',
  UG: 'text-yellow-300',
  EG: 'text-emerald-300',
  SG: 'text-sky-300',
  MG: 'text-cyan-300',
  TG: 'text-violet-300',
  FG: 'text-slate-300',
  RG: 'text-rose-300',
};

const JUDGMENT_META = [
  { key: 'PERFECT', field: 'perfect', labelClass: 'text-sky-300' },
  { key: 'GREAT', field: 'great', labelClass: 'text-emerald-300' },
  { key: 'GOOD', field: 'good', labelClass: 'text-yellow-300' },
  { key: 'BAD', field: 'bad', labelClass: 'text-fuchsia-300' },
  { key: 'MISS', field: 'miss', labelClass: 'text-rose-300' },
];

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
  const normalized = parseGrade(grade).normalized;
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

function getModeBadgeClasses(mode) {
  if (String(mode || '').trim() === 'Single') {
    return 'border-red-300/60 bg-gradient-to-b from-red-500 to-red-800 text-white';
  }
  if (String(mode || '').trim() === 'Double') {
    return 'border-emerald-300/60 bg-gradient-to-b from-emerald-500 to-emerald-800 text-white';
  }
  return 'border-sky-300/50 bg-gradient-to-b from-sky-500 to-sky-800 text-white';
}

function getOverTop100Rank(rawRank) {
  const rank = parseInt(rawRank, 10) || 0;
  return rank >= 1 && rank <= 100 ? rank : 0;
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function hasJudgments(score) {
  return JUDGMENT_META.some(({ field }) => (parseInt(score?.[field], 10) || 0) > 0);
}

function formatDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const candidate = hasExplicitTimezone || /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    if (raw.length >= 16) return raw.slice(0, 16).replace('T', ' ');
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }

  // Display in the viewer's local timezone (browser default)
  const hasTime = /(?:T|\s)\d{2}:\d{2}/.test(raw);
  return hasTime
    ? parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    : parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
}

function normalizeMetaBadges(badges = []) {
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (!badge || typeof badge !== 'object') return null;
      const label = String(badge.label || '').trim();
      if (!label) return null;
      return {
        label,
        className: String(badge.className || '').trim(),
      };
    })
    .filter(Boolean);
}

function ReplayIcon({ className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export default function ScoreSnapshotCard({
  score,
  jacketUrl = '',
  chartLink = '',
  className = '',
  avatarUrl = '',
  skillTitle = '',
  roleLabel = '',
  contextLabel = '',
  metaBadges = [],
  replayUrl = '',
  replayTitle = '',
  onOpenReplay = null,
}) {
  if (!score) return null;

  const songTitle = String(score.song_title || score.songTitle || 'Score details').trim() || 'Score details';
  const username = String(score.username || score.playerName || '').trim();
  const playedAt = formatDateLabel(score.played_at_utc || score.date_played || score.playedAt);
  const machineName = String(score.machine_name || score.machineName || '').trim();
  const resolvedAvatarUrl = String(avatarUrl || score.playerAvatar || score.avatar || '').trim();
  const resolvedSkillTitle = String(skillTitle || score.playerSkillTitle || score.skillTitle || score.skill_title || '').trim();
  const resolvedRoleLabel = String(roleLabel || score.playerRoleLabel || score.roleLabel || '').trim();
  const resolvedContextLabel = String(contextLabel || score.contextLabel || score.context_label || '').trim();
  const mode = String(score.mode || '').trim();
  const level = parseInt(score.level, 10) || 0;
  const displayScore = parseInt(score.new_score ?? score.score, 10) || 0;
  const rank = getRank(displayScore);
  const parsedGrade = parseGrade(score.new_grade || score.grade, rank.label);
  const grade = parsedGrade.display || rank.label;
  const oldScore = parseInt(score.old_score, 10) || 0;
  const parsedOldGrade = parseGrade(score.old_grade, getRank(oldScore).label);
  const isUpscore = score.old_score !== undefined && oldScore > 0;
  const deltaValue = Number.isFinite(Number(score.scoreDelta))
    ? Number(score.scoreDelta)
    : (isUpscore ? displayScore - oldScore : 0);
  const deltaClass = deltaValue > 0 ? 'text-piu-green' : deltaValue < 0 ? 'text-rose-300' : 'text-gray-400';
  const overRank = getOverTop100Rank(score.over_top100_rank ?? score.overTop100Rank);
  const plateName = PLATE_NAMES[String(score.plate || '').trim().toUpperCase()] || String(score.plate || '').trim();
  const plateColor = PLATE_COLORS[String(score.plate || '').trim().toUpperCase()] || 'text-gray-300';
  const isStageBreak = !!score.is_stage_break || !!score.isStageBreak;
  const infoBadges = [
    resolvedRoleLabel ? {
      label: resolvedRoleLabel,
      className: 'border-amber-300/45 bg-amber-500/14 text-amber-100',
    } : null,
    resolvedSkillTitle ? {
      label: resolvedSkillTitle,
      className: 'border-cyan-300/35 bg-cyan-500/12 text-cyan-100',
    } : null,
    resolvedContextLabel ? {
      label: resolvedContextLabel,
      className: 'border-emerald-300/35 bg-emerald-500/12 text-emerald-100',
    } : null,
    overRank > 0 ? {
      label: `TOP #${overRank}`,
      className: 'border-piu-gold/55 bg-piu-gold/15 text-yellow-200',
    } : null,
    ...normalizeMetaBadges(metaBadges),
  ].filter(Boolean);
  const judgmentItems = JUDGMENT_META.map(({ key, field, labelClass }) => ({
    key,
    labelClass,
    value: parseInt(score?.[field], 10) || 0,
  }));
  const resolvedReplayUrl = String(replayUrl || score.replayUrl || score.replay_url || score.replayEmbedUrl || score.replay_embed_url || '').trim();
  const hasReplay = !!resolvedReplayUrl && typeof onOpenReplay === 'function';
  const titleNode = chartLink ? (
    <Link to={chartLink} className="line-clamp-2 font-display text-[1.05rem] font-black leading-tight text-white hover:text-cyan-100">
      {songTitle}
    </Link>
  ) : (
    <p className="line-clamp-2 font-display text-[1.05rem] font-black leading-tight text-white">
      {songTitle}
    </p>
  );

  return (
    <div className={`relative overflow-hidden rounded-[1.45rem] border border-piu-border/70 shadow-[0_18px_42px_rgba(0,0,0,0.28)] ${className}`.trim()}>
      {jacketUrl ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${jacketUrl})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#152238] via-[#0f1a2d] to-[#090d18]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,16,0.26)_0%,rgba(7,12,22,0.5)_34%,rgba(6,10,18,0.88)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(120,220,255,0.14),transparent_42%)]" />

      <div className="relative p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {titleNode}
            {(resolvedAvatarUrl || username || playedAt || infoBadges.length > 0) ? (
              <div className="mt-2 flex items-start gap-2.5">
                {resolvedAvatarUrl ? (
                  <img
                    src={resolvedAvatarUrl}
                    alt={username || 'Player'}
                    className="h-8 w-8 shrink-0 rounded-full border border-white/15 bg-piu-dark/80 object-cover shadow-[0_4px_14px_rgba(0,0,0,0.2)]"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  {(username || playedAt || machineName) ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-gray-200/90">
                      {username ? <span className="font-display font-bold text-white">{username}</span> : null}
                      {playedAt ? <span>{playedAt}</span> : null}
                      {machineName ? <span className="text-gray-400">at {machineName}</span> : null}
                    </div>
                  ) : null}
                  {infoBadges.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {infoBadges.map((badge) => (
                        <span
                          key={`${badge.label}:${badge.className}`}
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {hasReplay ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenReplay();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/28 bg-sky-500/10 px-2.5 py-1 text-[10px] font-display font-bold text-sky-100 transition-colors hover:border-sky-300/42 hover:bg-sky-500/16 hover:text-white"
                title={replayTitle || 'Open replay clip'}
                aria-label={replayTitle || 'Open replay clip'}
              >
                <ReplayIcon className="h-3.5 w-3.5 text-sky-300" />
                <span>Replay</span>
              </button>
            ) : null}
            {level > 0 ? (
              <span className={`inline-flex h-10 min-w-[42px] shrink-0 items-center justify-center rounded-full border px-2 font-display text-lg font-black ${getModeBadgeClasses(mode)}`}>
                {level}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-display text-[2.35rem] font-black leading-none ${isStageBreak ? 'text-rose-300' : 'text-white'}`}>
              {isStageBreak ? 'STAGE BREAK' : formatNumber(displayScore)}
            </p>
            {plateName ? (
              <p className={`mt-1 text-[11px] font-display font-bold tracking-[0.14em] ${plateColor}`}>
                {plateName}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            {!isStageBreak ? (
              <p className={`font-display text-[2.2rem] font-black leading-none ${getGradeColor(grade, displayScore)} ${parsedGrade.isBroken ? 'grade-broken' : ''}`} data-grade={grade}>
                {grade}
              </p>
            ) : null}
            {isUpscore ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-[11px] text-gray-200/75">
                  Prev{' '}
                  <span className="font-mono">{formatNumber(oldScore)}</span>
                  {' '}
                  <span className={parsedOldGrade.isBroken ? 'grade-broken' : ''} data-grade={parsedOldGrade.display}>
                    {parsedOldGrade.display}
                  </span>
                </p>
                {deltaValue !== 0 ? (
                  <p className={`font-mono text-[0.95rem] font-bold ${deltaClass}`}>
                    {deltaValue > 0 ? '+' : ''}{deltaValue.toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {hasJudgments(score) ? (
          <div className="mt-3 rounded-[1.1rem] border border-white/8 bg-black/48 px-2.5 py-2 backdrop-blur-[2px]">
            <div className="grid grid-cols-5 gap-1 text-center">
              {judgmentItems.map((item) => (
                <div key={item.key}>
                  <p className={`text-[9px] font-display font-bold tracking-[0.08em] ${item.labelClass}`}>{item.key}</p>
                  <p className="mt-0.5 font-mono text-[1.05rem] font-bold leading-none text-white">
                    {formatNumber(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
