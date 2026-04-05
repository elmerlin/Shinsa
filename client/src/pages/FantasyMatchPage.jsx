import React, { useState, useEffect, useCallback } from 'react';
import { getFantasyPool } from '../utils/api';

const PHASES = {
  START: 'start',
  LOADING: 'loading',
  DRAFT: 'draft',
  MATCH: 'match',
  BATTLE: 'battle',
  RESULT: 'result',
};

const ROUND_THEMES = [
  {
    name: 'Speed Blitz',
    icon: 'S',
    desc: 'Fast lines, burst recovery, and sudden pressure.',
    weights: { speed: 0.4, tech: 0.28, stamina: 0.2, mobility: 0.12 },
  },
  {
    name: 'Endurance Trial',
    icon: 'E',
    desc: 'Long pressure where stamina and movement depth matter.',
    weights: { stamina: 0.38, mobility: 0.3, speed: 0.18, tech: 0.14 },
  },
  {
    name: 'Technical Showcase',
    icon: 'T',
    desc: 'Awkward shapes, precision, and problem solving.',
    weights: { tech: 0.36, mobility: 0.28, speed: 0.2, stamina: 0.16 },
  },
];

const BUCKET_KEYS = ['speed', 'stamina', 'mobility', 'tech'];

const BUCKET_META = {
  speed: { label: 'Speed', short: 'SPD' },
  stamina: { label: 'Stamina', short: 'STA' },
  mobility: { label: 'Mobility', short: 'MOB' },
  tech: { label: 'Tech', short: 'TEC' },
};

const SCOUTING_SKILL_BUCKETS = {
  speed: ['bursty'],
  stamina: ['sustained', 'run', 'yog_walk', 'anchor_run', 'drill', 'run_without_twists'],
  mobility: ['cross-pad_transition', 'co-op_pad_transition', 'twist_far', 'jump', '10-stair'],
  tech: [
    'bracket', 'bracket_jump', 'bracket_run', 'bracket_twist', 'doublestep',
    'jack', 'staggered_bracket', 'twist_90', 'twist_close', 'twist_over90',
    'hold_footslide', 'hold_footswitch',
  ],
};

const SKILL_TO_BUCKET = {};
for (const [bucket, slugs] of Object.entries(SCOUTING_SKILL_BUCKETS)) {
  for (const slug of slugs) SKILL_TO_BUCKET[slug] = bucket;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hashSeed(...parts) {
  const text = parts.join('|');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(...parts) {
  return (hashSeed(...parts) % 10000) / 10000;
}

function weightedAverage(values, weights) {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    numerator += values[i] * weights[i];
    denominator += weights[i];
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function ratingColor(value) {
  if (value >= 85) return 'text-piu-gold';
  if (value >= 65) return 'text-sky-300';
  if (value >= 40) return 'text-white/80';
  return 'text-white/40';
}

function formatSongScore(value) {
  return Math.round(value || 0).toLocaleString('en-GB');
}

function formatDuration(seconds) {
  const safe = parseInt(seconds, 10) || 0;
  if (safe <= 0) return null;
  const mins = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function getModeKey(mode) {
  return mode === 'Double' ? 'doubles' : 'singles';
}

function getModeLevel(card, mode) {
  const singleLevel = card?.competitive?.singleLevel || 0;
  const doubleLevel = card?.competitive?.doubleLevel || 0;
  if (mode === 'Double' && doubleLevel) return doubleLevel;
  if (mode === 'Single' && singleLevel) return singleLevel;
  const fallbackLevels = [singleLevel, doubleLevel].filter((level) => level > 0);
  if (fallbackLevels.length > 0) {
    return Math.round(fallbackLevels.reduce((sum, level) => sum + level, 0) / fallbackLevels.length);
  }
  const rating = card?.ratings?.overall?.score100 || 0;
  return clamp(10, 24, Math.round(rating / 4));
}

function getModeSnapshot(card, mode) {
  const scope = getModeKey(mode);
  return {
    attrs: card?.attributes?.[scope] || card?.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 },
    rating: card?.ratings?.[scope]?.score100 || card?.ratings?.overall?.score100 || 0,
    level: getModeLevel(card, mode),
  };
}

function buildSongWeights(song, theme) {
  const counts = { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  for (const skill of Array.isArray(song?.skills) ? song.skills : []) {
    const bucket = SKILL_TO_BUCKET[skill?.slug];
    if (bucket) counts[bucket] += 1;
  }

  const total = BUCKET_KEYS.reduce((sum, bucket) => sum + counts[bucket], 0);
  if (total <= 0) {
    return { ...theme.weights };
  }

  const blended = {};
  for (const bucket of BUCKET_KEYS) {
    blended[bucket] = (theme.weights[bucket] * 0.62) + ((counts[bucket] / total) * 0.38);
  }

  const normalizedTotal = BUCKET_KEYS.reduce((sum, bucket) => sum + blended[bucket], 0);
  for (const bucket of BUCKET_KEYS) {
    blended[bucket] = normalizedTotal > 0 ? blended[bucket] / normalizedTotal : 0.25;
  }
  return blended;
}

function getSongHighlightTags(song) {
  const modeTag = `${song?.mode === 'Double' ? 'D' : 'S'}${song?.level || '?'}`;
  const durationTag = formatDuration(song?.duration_seconds);
  const skillTags = (Array.isArray(song?.skills) ? song.skills : [])
    .slice(0, 2)
    .map((skill) => String(skill?.name || skill?.slug || '').replace(/_/g, ' '));

  return [modeTag, durationTag, ...skillTags].filter(Boolean);
}

function computeCardThemeValue(card, theme, mode = 'overall') {
  const attrs = card?.attributes?.[mode] || card?.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const rating = card?.ratings?.[mode]?.score100 || card?.ratings?.overall?.score100 || 0;
  const weighted = BUCKET_KEYS.reduce((sum, bucket) => sum + ((attrs[bucket] || 0) * (theme.weights[bucket] || 0)), 0);
  return (weighted * 0.76) + (rating * 0.24);
}

function buildModePlan(userCard, cpuCard) {
  const avgSingle = weightedAverage([
    getModeLevel(userCard, 'Single'),
    getModeLevel(cpuCard, 'Single'),
  ], [1, 1]);
  const avgDouble = weightedAverage([
    getModeLevel(userCard, 'Double'),
    getModeLevel(cpuCard, 'Double'),
  ], [1, 1]);

  const userHasDouble = (userCard?.competitive?.doubleLevel || 0) > 0;
  const cpuHasDouble = (cpuCard?.competitive?.doubleLevel || 0) > 0;
  if (!userHasDouble || !cpuHasDouble) {
    return ['Single', 'Single', 'Single'];
  }

  if (avgDouble >= avgSingle + 2) return ['Double', 'Single', 'Double'];
  if (avgSingle >= avgDouble + 2) return ['Single', 'Double', 'Single'];
  return ['Single', 'Double', 'Single'];
}

function evaluateSongCandidate(song, theme, targetLevel, usedKeys) {
  if (!song?.key || usedKeys.has(song.key)) return -Infinity;

  const weights = buildSongWeights(song, theme);
  const themeFit = BUCKET_KEYS.reduce((sum, bucket) => sum + (weights[bucket] || 0) * (theme.weights[bucket] || 0), 0);
  const levelDelta = Math.abs((song?.level || 0) - targetLevel);
  const levelFit = 1 - clamp(0, 1, levelDelta / 7);
  const durationFit = song?.duration_seconds
    ? 1 - clamp(0, 0.32, Math.abs(song.duration_seconds - 120) / 220)
    : 0.72;
  const skillFit = Math.min(1, ((song?.skills?.length || 0) / 5));
  const variety = seededUnit(song?.key || '', theme.name) * 0.06;

  return (themeFit * 0.46) + (levelFit * 0.32) + (durationFit * 0.12) + (skillFit * 0.1) + variety;
}

function drawMatchSongs(userCard, cpuCard, theme, songPool, roundIndex) {
  const modePlan = buildModePlan(userCard, cpuCard);
  const usedKeys = new Set();

  return modePlan.map((mode, index) => {
    const targetLevel = Math.round(weightedAverage([
      getModeLevel(userCard, mode),
      getModeLevel(cpuCard, mode),
    ], [1, 1]));

    const candidates = songPool
      .filter((song) => song?.mode === mode)
      .map((song) => ({
        ...song,
        drawScore: evaluateSongCandidate(song, theme, targetLevel, usedKeys),
      }))
      .filter((song) => Number.isFinite(song.drawScore))
      .sort((a, b) => b.drawScore - a.drawScore);

    const shortlist = candidates.slice(0, 8);
    const choiceIndex = Math.floor(seededUnit(theme.name, mode, roundIndex, index, userCard?.user?.id || '', cpuCard?.user?.id || '') * Math.max(1, shortlist.length));
    const chosen = shortlist[choiceIndex] || candidates[0] || null;
    if (!chosen) return null;
    usedKeys.add(chosen.key);

    return {
      ...chosen,
      drawIndex: index + 1,
      featureWeights: buildSongWeights(chosen, theme),
      highlightTags: getSongHighlightTags(chosen),
    };
  }).filter(Boolean);
}

function simulateSongBattle(card, song, theme, roundIndex, songIndex) {
  const scope = getModeSnapshot(card, song.mode);
  const weights = song.featureWeights || buildSongWeights(song, theme);
  const weightedAttrs = BUCKET_KEYS.reduce((sum, bucket) => sum + ((scope.attrs[bucket] || 0) * (weights[bucket] || 0)), 0);
  const levelDelta = scope.level - (song.level || scope.level);
  const levelPressure = clamp(-12, 10, levelDelta * 2.5);
  const cadenceLift = ((card?.cadence?.score100 || 50) - 50) * 0.18;
  const modeBias = card?.competitive?.dominantMode === song.mode ? 3.5 : 0;
  const noise = 0.94 + (seededUnit(card?.user?.id || '', song?.key || '', roundIndex, songIndex) * 0.12);

  const performance = ((weightedAttrs * 0.72) + (scope.rating * 0.28) + levelPressure + cadenceLift + modeBias) * noise;
  const score = clamp(
    780000,
    999999,
    Math.round(782000 + (performance * 2050) + ((song.level || 0) * 420))
  );

  return {
    performance,
    score,
    scope,
  };
}

function buildBattleResult(userCard, cpuCard, theme, songPool, roundIndex) {
  const songs = drawMatchSongs(userCard, cpuCard, theme, songPool, roundIndex).map((song, songIndex) => {
    const userRun = simulateSongBattle(userCard, song, theme, roundIndex, `${songIndex}-user`);
    const cpuRun = simulateSongBattle(cpuCard, song, theme, roundIndex, `${songIndex}-cpu`);
    const winner = userRun.score === cpuRun.score
      ? 'draw'
      : userRun.score > cpuRun.score
        ? 'user'
        : 'cpu';

    return {
      song,
      winner,
      userScore: userRun.score,
      cpuScore: cpuRun.score,
      margin: Math.abs(userRun.score - cpuRun.score),
    };
  });

  const userSongWins = songs.filter((entry) => entry.winner === 'user').length;
  const cpuSongWins = songs.filter((entry) => entry.winner === 'cpu').length;
  const userTotal = songs.reduce((sum, entry) => sum + entry.userScore, 0);
  const cpuTotal = songs.reduce((sum, entry) => sum + entry.cpuScore, 0);
  const winner = userSongWins === cpuSongWins
    ? userTotal === cpuTotal
      ? 'draw'
      : userTotal > cpuTotal
        ? 'user'
        : 'cpu'
    : userSongWins > cpuSongWins
      ? 'user'
      : 'cpu';

  return {
    userCard,
    cpuCard,
    theme,
    songs,
    userSongWins,
    cpuSongWins,
    userTotal,
    cpuTotal,
    winner,
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function SectionLabel({ children, accent = 'text-white/40' }) {
  return (
    <p className={`font-display text-[9px] font-black uppercase tracking-[0.14em] ${accent}`}>
      {children}
    </p>
  );
}

function StatChip({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-white/[0.08] bg-white/[0.03] text-white/55',
    gold: 'border-piu-gold/20 bg-piu-gold/[0.08] text-piu-gold/85',
    cyan: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-200',
    rose: 'border-rose-300/20 bg-rose-300/[0.08] text-rose-200',
    green: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200',
  };

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 font-display text-[9px] font-bold uppercase tracking-[0.12em] border ${tones[tone] || tones.default} ${className}`}>
      {children}
    </span>
  );
}

function ThemeSummaryCard({ theme, compact = false }) {
  const sortedWeights = Object.entries(theme.weights).sort((a, b) => b[1] - a[1]);

  return (
    <div className={`rounded-xl border border-white/[0.06] bg-white/[0.03] ${compact ? 'px-3 py-2.5' : 'px-3 py-3'}`}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-piu-gold/15 bg-piu-gold/[0.08] font-display text-[11px] font-black text-piu-gold">
          {theme.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-display font-black uppercase text-white ${compact ? 'text-[10px] tracking-[0.12em]' : 'text-[11px] tracking-[0.1em]'}`}>
            {theme.name}
          </p>
          {!compact ? (
            <p className="mt-1 text-[10px] leading-relaxed text-white/45">{theme.desc}</p>
          ) : null}
        </div>
      </div>
      <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-2.5' : 'mt-3'}`}>
        {sortedWeights.map(([key, weight]) => (
          <StatChip key={key} tone="gold">
            {BUCKET_META[key].short} {Math.round(weight * 100)}%
          </StatChip>
        ))}
      </div>
    </div>
  );
}

function TeamSlotCard({ card, tone = 'default' }) {
  const tones = {
    default: 'border-white/[0.06] bg-white/[0.02]',
    cyan: 'border-sky-300/16 bg-sky-300/[0.05]',
    rose: 'border-rose-300/16 bg-rose-300/[0.05]',
  };

  if (!card) {
    return (
      <div className="flex min-h-[72px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] text-[10px] font-display font-bold uppercase tracking-[0.16em] text-white/25">
        Empty
      </div>
    );
  }

  const user = card.user || {};
  const ovr = card.ratings?.overall?.score100 || 0;

  return (
    <div className={`rounded-xl border px-2.5 py-2.5 ${tones[tone] || tones.default}`}>
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-piu-dark">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-[11px] font-bold text-white/35">
              {(user.username || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[11px] font-bold text-white">{user.username || 'Unknown'}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {card.competitive?.singleLevel ? <StatChip tone="rose">S{card.competitive.singleLevel}</StatChip> : null}
            {card.competitive?.doubleLevel ? <StatChip tone="green">D{card.competitive.doubleLevel}</StatChip> : null}
          </div>
        </div>
        <div className="shrink-0 rounded-md border border-piu-gold/15 bg-piu-gold/[0.06] px-2 py-1 text-right">
          <div className={`font-display text-sm font-black leading-none tabular-nums ${ratingColor(ovr)}`}>{ovr}</div>
          <div className="mt-0.5 font-display text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">OVR</div>
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  card,
  onClick,
  selected,
  disabled,
  highlight,
  animDelay = 0,
  showWeights,
  compact,
  actionLabel,
  onAction,
  statusLabel,
  statusTone = 'gold',
}) {
  const attrs = card.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const ovr = card.ratings?.overall?.score100 || 0;
  const user = card.user || {};
  const comp = card.competitive || {};

  const handleAction = (event) => {
    event.stopPropagation();
    if (!disabled) onAction?.();
  };

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{ animationDelay: `${animDelay}ms` }}
      className={[
        'group relative overflow-hidden rounded-2xl border transition-all duration-300 motion-reduce:animate-none animate-[cardFlip_0.45s_cubic-bezier(0.16,1,0.3,1)_both]',
        selected
          ? 'border-piu-gold/30 bg-piu-dark/85 ring-1 ring-piu-gold/20'
          : 'border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))]',
        highlight ? 'ring-1 ring-sky-300/18' : '',
        disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer hover:border-white/14 hover:bg-white/[0.045]',
        compact ? 'p-3' : 'p-3.5',
      ].filter(Boolean).join(' ')}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(255,214,92,0.09),transparent_62%)] opacity-80" />

      <div className="relative mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-1 items-start gap-2.5">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-piu-dark">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-sm font-bold text-white/35">
                {(user.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="max-w-full truncate font-display text-[12px] font-bold text-white">
                {user.username || 'Unknown'}
              </p>
              {statusLabel ? (
                <StatChip tone={statusTone}>{statusLabel}</StatChip>
              ) : actionLabel ? (
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={disabled}
                  className="rounded-full border border-piu-gold/20 bg-piu-gold/[0.1] px-2.5 py-1 font-display text-[8px] font-black uppercase tracking-[0.18em] text-piu-gold transition-colors hover:bg-piu-gold/[0.15] disabled:opacity-40"
                >
                  {actionLabel}
                </button>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {comp.singleLevel ? <StatChip tone="rose">S{comp.singleLevel}</StatChip> : null}
              {comp.doubleLevel ? <StatChip tone="green">D{comp.doubleLevel}</StatChip> : null}
              {comp.dominantLabel ? <StatChip>{comp.dominantLabel}</StatChip> : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-xl border border-piu-gold/15 bg-piu-gold/[0.06] px-2.5 py-1.5 text-right">
          <div className={`font-display text-lg font-black leading-none tabular-nums ${ratingColor(ovr)}`}>{ovr}</div>
          <div className="mt-1 font-display text-[8px] font-bold uppercase tracking-[0.16em] text-white/30">OVR</div>
        </div>
      </div>

      <div className="space-y-2">
        {BUCKET_KEYS.map((bucket) => {
          const value = attrs[bucket] || 0;
          const weight = showWeights?.weights?.[bucket];
          return (
            <div key={bucket} className="flex items-center gap-2">
              <span className="w-[52px] shrink-0 font-display text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">
                {BUCKET_META[bucket].short}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-piu-gold transition-all duration-700"
                  style={{ width: `${Math.min(100, value)}%` }}
                />
              </div>
              <span className={`w-7 text-right font-display text-[10px] font-bold tabular-nums ${ratingColor(value)}`}>
                {value}
              </span>
              {weight !== undefined ? (
                <span className="w-9 text-right font-display text-[9px] font-bold text-piu-gold/75">
                  {Math.round(weight * 100)}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SongDrawCard({ entry, index, revealed, userCard, cpuCard, revealedWins }) {
  const winnerTone = entry.winner === 'user' ? 'gold' : entry.winner === 'cpu' ? 'rose' : 'default';

  if (!revealed) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-piu-gold/15 bg-[linear-gradient(135deg,rgba(255,215,96,0.08),rgba(255,255,255,0.02))] px-4 py-4 motion-reduce:animate-none animate-[cardFlip_0.4s_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{ animationDelay: `${index * 90}ms` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.08),transparent)] animate-[shimmer_2s_linear_infinite] motion-reduce:animate-none" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <SectionLabel accent="text-piu-gold/70">Draw {index + 1}</SectionLabel>
            <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.14em] text-piu-gold">
              Song Card Incoming
            </p>
          </div>
          <div className="rounded-full border border-piu-gold/20 bg-black/20 px-3 py-1 font-display text-[10px] font-black uppercase tracking-[0.18em] text-piu-gold/80">
            Flip
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-3.5 py-3.5 motion-reduce:animate-none animate-[cardFlip_0.42s_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-piu-dark">
          {entry.song?.jacket_url ? (
            <img src={entry.song.jacket_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-[10px] font-black uppercase tracking-[0.12em] text-white/30">
              {entry.song?.mode === 'Double' ? 'D' : 'S'}{entry.song?.level || '?'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <SectionLabel accent="text-white/35">Song {index + 1}</SectionLabel>
              <p className="mt-1 truncate font-display text-[12px] font-black uppercase tracking-[0.08em] text-white">
                {entry.song?.title}
              </p>
              <p className="mt-1 truncate text-[10px] text-white/40">{entry.song?.artist}</p>
            </div>
            <StatChip tone={winnerTone}>
              {entry.winner === 'user'
                ? `${userCard.user?.username} win`
                : entry.winner === 'cpu'
                  ? `${cpuCard.user?.username} win`
                  : 'draw'}
            </StatChip>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.song?.highlightTags?.map((tag) => (
              <StatChip key={`${entry.song.key}-${tag}`}>{tag}</StatChip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-xl border border-white/[0.05] bg-black/15 px-3 py-2.5">
        <div className={`rounded-lg border px-2.5 py-2 ${entry.winner === 'user' ? 'border-piu-gold/20 bg-piu-gold/[0.08]' : 'border-transparent bg-white/[0.02]'}`}>
          <p className="truncate font-display text-[10px] font-bold text-sky-200">{userCard.user?.username}</p>
          <p className={`mt-1 font-display text-lg font-black tabular-nums ${entry.winner === 'user' ? 'text-piu-gold' : 'text-white/70'}`}>
            {formatSongScore(entry.userScore)}
          </p>
        </div>
        <div className="text-center">
          <p className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">set</p>
          <p className="mt-1 font-display text-sm font-black text-white/75">
            {revealedWins.user}-{revealedWins.cpu}
          </p>
          <p className="mt-1 text-[9px] text-white/35">Δ {formatSongScore(entry.margin)}</p>
        </div>
        <div className={`rounded-lg border px-2.5 py-2 ${entry.winner === 'cpu' ? 'border-piu-gold/20 bg-piu-gold/[0.08]' : 'border-transparent bg-white/[0.02]'}`}>
          <p className="truncate text-right font-display text-[10px] font-bold text-rose-200">{cpuCard.user?.username}</p>
          <p className={`mt-1 text-right font-display text-lg font-black tabular-nums ${entry.winner === 'cpu' ? 'text-piu-gold' : 'text-white/70'}`}>
            {formatSongScore(entry.cpuScore)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BattleView({ battleState, roundNum, onContinue, reducedMotion }) {
  const [revealedCount, setRevealedCount] = useState(reducedMotion ? battleState.songs.length : 0);
  const { userCard, cpuCard, theme, songs } = battleState;

  useEffect(() => {
    if (reducedMotion) {
      setRevealedCount(songs.length);
      return undefined;
    }

    setRevealedCount(0);
    const timers = songs.map((_, index) => (
      setTimeout(() => {
        setRevealedCount((current) => Math.max(current, index + 1));
      }, 450 + (index * 700))
    ));

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [battleState, reducedMotion, songs]);

  const visibleSongs = songs.slice(0, revealedCount);
  const visibleWins = {
    user: visibleSongs.filter((entry) => entry.winner === 'user').length,
    cpu: visibleSongs.filter((entry) => entry.winner === 'cpu').length,
  };
  const revealDone = revealedCount >= songs.length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-piu-gold/18 bg-[radial-gradient(circle_at_top,rgba(255,215,96,0.11),rgba(255,255,255,0.02)_45%,rgba(255,255,255,0.015))] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel accent="text-piu-gold/70">Round {roundNum}</SectionLabel>
            <p className="mt-1 font-display text-base font-black uppercase tracking-[0.12em] text-white">
              Best Of 3 Draw
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-white/45">
              Three real charts get drawn under the round theme. Each song crowns its own winner.
            </p>
          </div>
          <div className="max-w-[240px]">
            <ThemeSummaryCard theme={theme} compact />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <TeamSlotCard card={userCard} tone="cyan" />
          <div className="flex items-center justify-center">
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-display text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
              {visibleWins.user}-{visibleWins.cpu}
            </div>
          </div>
          <TeamSlotCard card={cpuCard} tone="rose" />
        </div>
      </div>

      <div className="space-y-3">
        {songs.map((entry, index) => (
          <SongDrawCard
            key={entry.song.key}
            entry={entry}
            index={index}
            revealed={index < revealedCount}
            userCard={userCard}
            cpuCard={cpuCard}
            revealedWins={{
              user: songs.slice(0, index + 1).filter((song, songIndex) => songIndex < revealedCount && song.winner === 'user').length,
              cpu: songs.slice(0, index + 1).filter((song, songIndex) => songIndex < revealedCount && song.winner === 'cpu').length,
            }}
          />
        ))}
      </div>

      {revealDone ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div>
            <SectionLabel>Set Winner</SectionLabel>
            <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.12em] text-white">
              {battleState.winner === 'user'
                ? userCard.user?.username
                : battleState.winner === 'cpu'
                  ? cpuCard.user?.username
                  : 'Draw'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatChip tone="cyan">{userCard.user?.username} {battleState.userSongWins}</StatChip>
            <StatChip tone="rose">{cpuCard.user?.username} {battleState.cpuSongWins}</StatChip>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-full border border-piu-gold/20 bg-piu-gold/[0.08] px-4 py-2 font-display text-[10px] font-black uppercase tracking-[0.16em] text-piu-gold transition-colors hover:bg-piu-gold/[0.14]"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <p className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
            Drawing Charts...
          </p>
        </div>
      )}
    </div>
  );
}

export default function FantasyMatchPage({ embedded = false }) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState(PHASES.START);
  const [pool, setPool] = useState([]);
  const [songPool, setSongPool] = useState([]);
  const [draftCards, setDraftCards] = useState([]);
  const [myTeam, setMyTeam] = useState([]);
  const [cpuTeam, setCpuTeam] = useState([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [myRemaining, setMyRemaining] = useState([]);
  const [cpuRemaining, setCpuRemaining] = useState([]);
  const [roundResults, setRoundResults] = useState([]);
  const [battleState, setBattleState] = useState(null);
  const [error, setError] = useState(null);

  const startDraft = useCallback(async () => {
    setPhase(PHASES.LOADING);
    setError(null);

    try {
      const data = await getFantasyPool(12);
      const cards = shuffle(data.cards || []);
      const songs = shuffle(data.songs || []);

      if (cards.length < 8) throw new Error('Not enough players available');
      if (songs.length < 12) throw new Error('Not enough song cards available');

      setPool(cards);
      setSongPool(songs);
      setDraftCards(cards.slice(0, 5));
      setMyTeam([]);
      setCpuTeam([]);
      setRoundIndex(0);
      setMyRemaining([]);
      setCpuRemaining([]);
      setRoundResults([]);
      setBattleState(null);
      setPhase(PHASES.DRAFT);
    } catch (err) {
      setError(err.message || 'Failed to load player pool');
      setPhase(PHASES.START);
    }
  }, []);

  const selectForTeam = useCallback((card) => {
    if (myTeam.length >= 3) return;

    const nextTeam = [...myTeam, card];
    setMyTeam(nextTeam);

    if (nextTeam.length === 3) {
      const userIds = new Set(nextTeam.map((entry) => entry.user.id));
      const remaining = pool.filter((entry) => !userIds.has(entry.user.id));
      const cpuPicks = shuffle(remaining)
        .sort((a, b) => (b.ratings?.overall?.score100 || 0) - (a.ratings?.overall?.score100 || 0))
        .slice(0, 3);

      setCpuTeam(cpuPicks);
      setMyRemaining(nextTeam);
      setCpuRemaining(cpuPicks);

      setTimeout(() => setPhase(PHASES.MATCH), reducedMotion ? 0 : 320);
    }
  }, [myTeam, pool, reducedMotion]);

  const fieldPlayer = useCallback((card) => {
    if (battleState) return;

    const theme = ROUND_THEMES[roundIndex];
    const cpuPick = [...cpuRemaining]
      .sort((a, b) => computeCardThemeValue(b, theme) - computeCardThemeValue(a, theme))[0];

    if (!cpuPick) return;

    const nextBattle = buildBattleResult(card, cpuPick, theme, songPool, roundIndex);

    setMyRemaining((prev) => prev.filter((entry) => entry.user.id !== card.user.id));
    setCpuRemaining((prev) => prev.filter((entry) => entry.user.id !== cpuPick.user.id));
    setBattleState(nextBattle);
    setPhase(PHASES.BATTLE);
  }, [battleState, roundIndex, cpuRemaining, songPool]);

  const continueBattle = useCallback(() => {
    if (!battleState) return;

    const nextResults = [...roundResults, battleState];
    setRoundResults(nextResults);
    setBattleState(null);

    if (nextResults.length >= 3) {
      setPhase(PHASES.RESULT);
    } else {
      setRoundIndex((prev) => prev + 1);
      setPhase(PHASES.MATCH);
    }
  }, [battleState, roundResults]);

  const playAgain = useCallback(() => {
    setPhase(PHASES.START);
    setPool([]);
    setSongPool([]);
    setDraftCards([]);
    setMyTeam([]);
    setCpuTeam([]);
    setRoundIndex(0);
    setMyRemaining([]);
    setCpuRemaining([]);
    setRoundResults([]);
    setBattleState(null);
    setError(null);
  }, []);

  const completedUserWins = roundResults.filter((result) => result.winner === 'user').length;
  const completedCpuWins = roundResults.filter((result) => result.winner === 'cpu').length;
  const currentTheme = ROUND_THEMES[roundIndex] || ROUND_THEMES[0];
  const title = phase === PHASES.START || phase === PHASES.LOADING ? 'Draft Mode' : 'Live Match';

  return (
    <div className={embedded ? 'overflow-hidden rounded-2xl border border-piu-border bg-[#0a0a10]' : 'min-h-screen bg-[#0a0a10] pb-20'}>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes cardFlip {
          0% { opacity: 0; transform: translateY(14px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="border-b border-white/[0.04] px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            <SectionLabel>{title}</SectionLabel>
            <h2 className="mt-1 font-display text-lg font-black uppercase tracking-wide text-white">
              Fantasy Match
            </h2>
            <p className="mt-1 text-[10px] text-white/35">
              Draft 3 players. Each round becomes a real best-of-3 chart draw.
            </p>
          </div>
          {phase !== PHASES.START && phase !== PHASES.LOADING ? (
            <div className="flex items-center gap-2">
              <StatChip tone="cyan">You {completedUserWins}</StatChip>
              <StatChip tone="rose">CPU {completedCpuWins}</StatChip>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mx-auto max-w-3xl px-4 ${embedded ? 'py-4' : 'py-6'}`}>
        {phase === PHASES.START ? (
          <div className="space-y-4 motion-reduce:animate-none animate-[cardFlip_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="rounded-2xl border border-white/[0.06] bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-4">
              <SectionLabel>How It Works</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Build a three-player squad from live scouting cards, then send one player into each set.
                Every set draws three real charts around the current round theme, so balance, mode depth,
                and matchup feel all matter.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatChip tone="gold">3 Draft Picks</StatChip>
                <StatChip>Best of 3 Sets</StatChip>
                <StatChip>Real Song Draws</StatChip>
              </div>
            </div>

            <div>
              <SectionLabel>Round Themes</SectionLabel>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {ROUND_THEMES.map((theme) => (
                  <ThemeSummaryCard key={theme.name} theme={theme} />
                ))}
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-[11px] font-display font-bold text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={startDraft}
              className="rounded-full border border-piu-gold/20 bg-piu-gold/[0.08] px-5 py-2.5 font-display text-[10px] font-black uppercase tracking-[0.16em] text-piu-gold transition-colors hover:bg-piu-gold/[0.14]"
            >
              Start Draft
            </button>
          </div>
        ) : null}

        {phase === PHASES.LOADING ? (
          <div className="py-12 text-center">
            <p className="font-display text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
              Building Player Pool
            </p>
          </div>
        ) : null}

        {phase === PHASES.DRAFT ? (
          <div className="space-y-4 motion-reduce:animate-none animate-[cardFlip_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="rounded-2xl border border-piu-gold/20 bg-[linear-gradient(135deg,rgba(255,215,96,0.09),rgba(255,255,255,0.015))] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <SectionLabel accent="text-piu-gold/70">Draft</SectionLabel>
                  <p className="mt-1 font-display text-[11px] font-black uppercase tracking-[0.12em] text-white">
                    Pick {3 - myTeam.length} More Player{3 - myTeam.length === 1 ? '' : 's'}
                  </p>
                </div>
                <StatChip tone="gold">{myTeam.length}/3 Selected</StatChip>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-sky-300/70">Your Squad</SectionLabel>
                <p className="text-[10px] text-white/35">Locked after three picks</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <TeamSlotCard key={index} card={myTeam[index]} tone="cyan" />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Available Cards</SectionLabel>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {draftCards.map((card, index) => {
                  const alreadyPicked = myTeam.some((entry) => entry.user.id === card.user.id);
                  const pickDisabled = alreadyPicked || myTeam.length >= 3;
                  return (
                    <MiniCard
                      key={card.user.id}
                      card={card}
                      selected={alreadyPicked}
                      disabled={pickDisabled}
                      onClick={() => selectForTeam(card)}
                      onAction={() => selectForTeam(card)}
                      actionLabel={!pickDisabled && !alreadyPicked ? 'Select' : null}
                      statusLabel={alreadyPicked ? 'Drafted' : null}
                      statusTone="gold"
                      animDelay={index * 80}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {phase === PHASES.MATCH ? (
          <div className="space-y-4 motion-reduce:animate-none animate-[cardFlip_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionLabel>Current Round</SectionLabel>
                  <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.1em] text-white">
                    Round {roundIndex + 1} of 3
                  </p>
                  <p className="mt-1 text-[10px] text-white/35">Pick one player to enter this best-of-3 set.</p>
                </div>
                <div className="max-w-[280px]">
                  <ThemeSummaryCard theme={currentTheme} compact />
                </div>
              </div>
            </div>

            {roundResults.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {roundResults.map((result, index) => (
                  <StatChip
                    key={`round-result-${index + 1}`}
                    tone={result.winner === 'user' ? 'gold' : result.winner === 'cpu' ? 'rose' : 'default'}
                  >
                    R{index + 1} {result.winner === 'user' ? 'Win' : result.winner === 'cpu' ? 'Loss' : 'Draw'}
                  </StatChip>
                ))}
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-sky-300/70">Choose Your Player</SectionLabel>
                <p className="text-[10px] text-white/35">One card per set</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {myRemaining.map((card, index) => (
                  <MiniCard
                    key={card.user.id}
                    card={card}
                    onClick={() => fieldPlayer(card)}
                    onAction={() => fieldPlayer(card)}
                    actionLabel="Field"
                    showWeights={currentTheme}
                    animDelay={index * 80}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-rose-300/70">CPU Bench</SectionLabel>
                <StatChip tone="rose">{cpuRemaining.length} Remaining</StatChip>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {cpuRemaining.map((card) => (
                  <TeamSlotCard key={card.user.id} card={card} tone="rose" />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {phase === PHASES.BATTLE && battleState ? (
          <div className="motion-reduce:animate-none animate-[cardFlip_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
            <BattleView
              battleState={battleState}
              roundNum={roundIndex + 1}
              onContinue={continueBattle}
              reducedMotion={reducedMotion}
            />
          </div>
        ) : null}

        {phase === PHASES.RESULT ? (
          <div className="space-y-4 motion-reduce:animate-none animate-[cardFlip_0.35s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="rounded-2xl border border-piu-gold/20 bg-[linear-gradient(135deg,rgba(255,215,96,0.1),rgba(255,255,255,0.02))] px-4 py-3.5">
              <SectionLabel accent="text-piu-gold/70">Result</SectionLabel>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-black uppercase tracking-[0.08em] text-white">
                    {completedUserWins > completedCpuWins ? 'Victory' : completedUserWins < completedCpuWins ? 'Defeat' : 'Draw'}
                  </p>
                  <p className="mt-1 text-[10px] text-white/35">Final match score</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatChip tone="cyan">You {completedUserWins}</StatChip>
                  <StatChip tone="rose">CPU {completedCpuWins}</StatChip>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>Round Breakdown</SectionLabel>
              <div className="mt-3 space-y-3">
                {roundResults.map((result, index) => (
                  <div key={`breakdown-${index + 1}`} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[10px] font-black uppercase tracking-[0.12em] text-white/55">
                          Round {index + 1}
                        </p>
                        <p className="mt-1 truncate font-display text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                          {result.theme.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatChip tone="cyan">{result.userCard.user?.username} {result.userSongWins}</StatChip>
                        <StatChip tone="rose">{result.cpuCard.user?.username} {result.cpuSongWins}</StatChip>
                        <StatChip tone={result.winner === 'user' ? 'gold' : result.winner === 'cpu' ? 'rose' : 'default'}>
                          {result.winner === 'user' ? 'Set Win' : result.winner === 'cpu' ? 'Set Loss' : 'Set Draw'}
                        </StatChip>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {result.songs.map((entry, songIndex) => (
                        <div key={`${result.theme.name}-${entry.song.key}`} className="rounded-xl border border-white/[0.05] bg-black/15 px-3 py-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
                                Song {songIndex + 1}
                              </p>
                              <p className="mt-1 truncate font-display text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                                {entry.song.title}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {entry.song.highlightTags.map((tag) => (
                                  <StatChip key={`${entry.song.key}-${tag}`}>{tag}</StatChip>
                                ))}
                              </div>
                            </div>
                            <StatChip tone={entry.winner === 'user' ? 'gold' : entry.winner === 'cpu' ? 'rose' : 'default'}>
                              {entry.winner === 'user' ? result.userCard.user?.username : entry.winner === 'cpu' ? result.cpuCard.user?.username : 'draw'}
                            </StatChip>
                          </div>

                          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                            <div>
                              <p className="truncate font-display text-[10px] font-bold text-sky-200">{result.userCard.user?.username}</p>
                              <p className={`font-display text-sm font-black tabular-nums ${entry.winner === 'user' ? 'text-piu-gold' : 'text-white/60'}`}>
                                {formatSongScore(entry.userScore)}
                              </p>
                            </div>
                            <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">vs</span>
                            <div>
                              <p className="truncate font-display text-[10px] font-bold text-rose-200">{result.cpuCard.user?.username}</p>
                              <p className={`font-display text-sm font-black tabular-nums ${entry.winner === 'cpu' ? 'text-piu-gold' : 'text-white/60'}`}>
                                {formatSongScore(entry.cpuScore)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel accent="text-sky-300/70">Your Team</SectionLabel>
                  <StatChip tone="cyan">{myTeam.length} Cards</StatChip>
                </div>
                <div className="mt-3 space-y-2">
                  {myTeam.map((card) => (
                    <TeamSlotCard key={card.user.id} card={card} tone="cyan" />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel accent="text-rose-300/70">CPU Team</SectionLabel>
                  <StatChip tone="rose">{cpuTeam.length} Cards</StatChip>
                </div>
                <div className="mt-3 space-y-2">
                  {cpuTeam.map((card) => (
                    <TeamSlotCard key={card.user.id} card={card} tone="rose" />
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={playAgain}
              className="rounded-full border border-piu-gold/20 bg-piu-gold/[0.08] px-5 py-2.5 font-display text-[10px] font-black uppercase tracking-[0.16em] text-piu-gold transition-colors hover:bg-piu-gold/[0.14]"
            >
              Play Again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
