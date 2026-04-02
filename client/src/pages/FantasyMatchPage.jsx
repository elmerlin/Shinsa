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
    desc: 'Burst patterns dominate',
    weights: { speed: 0.4, tech: 0.3, stamina: 0.2, mobility: 0.1 },
  },
  {
    name: 'Endurance Trial',
    icon: 'E',
    desc: 'Sustained energy wins',
    weights: { stamina: 0.4, mobility: 0.3, speed: 0.15, tech: 0.15 },
  },
  {
    name: 'Technical Showcase',
    icon: 'T',
    desc: 'Precision is everything',
    weights: { tech: 0.35, mobility: 0.3, speed: 0.2, stamina: 0.15 },
  },
];

const BUCKET_META = {
  speed: { label: 'Speed', short: 'SPD' },
  stamina: { label: 'Stamina', short: 'STA' },
  mobility: { label: 'Mobility', short: 'MOB' },
  tech: { label: 'Tech', short: 'TEC' },
};

function ratingColor(value) {
  if (value >= 85) return 'text-piu-gold';
  if (value >= 65) return 'text-sky-300';
  if (value >= 40) return 'text-white/80';
  return 'text-white/40';
}

function computeScore(card, theme) {
  const attrs = card.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const ovr = card.ratings?.overall?.score100 || 0;
  const weighted = Object.entries(theme.weights).reduce((sum, [key, weight]) => sum + (attrs[key] || 0) * weight, 0);
  const randomFactor = 0.85 + Math.random() * 0.3;
  return Math.round((weighted + ovr / 10) * randomFactor * 10) / 10;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function SectionLabel({ children, accent = 'text-white/40' }) {
  return (
    <p className={`font-display text-[9px] font-black uppercase tracking-[0.14em] ${accent}`}>
      {children}
    </p>
  );
}

function StatChip({ children, tone = 'default' }) {
  const tones = {
    default: 'border-white/[0.08] bg-white/[0.03] text-white/55',
    gold: 'border-piu-gold/20 bg-piu-gold/[0.08] text-piu-gold/80',
    cyan: 'border-sky-300/20 bg-sky-300/[0.08] text-sky-200',
    rose: 'border-rose-300/20 bg-rose-300/[0.08] text-rose-200',
    green: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200',
  };

  return (
    <span className={`inline-flex items-center rounded px-2 py-1 font-display text-[9px] font-bold uppercase tracking-[0.12em] border ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

function ThemeSummaryCard({ theme, compact = false }) {
  const sortedWeights = Object.entries(theme.weights).sort((a, b) => b[1] - a[1]);

  return (
    <div className={`rounded-lg border border-white/[0.06] bg-white/[0.03] ${compact ? 'px-3 py-2' : 'px-3 py-3'}`}>
      <div className="flex items-start gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-piu-gold/15 bg-piu-gold/[0.08] font-display text-[10px] font-black text-piu-gold">
          {theme.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-display font-black uppercase text-white ${compact ? 'text-[10px] tracking-[0.12em]' : 'text-[11px] tracking-[0.1em]'}`}>
            {theme.name}
          </p>
          {!compact && (
            <p className="mt-1 text-[10px] leading-relaxed text-white/45">{theme.desc}</p>
          )}
        </div>
      </div>
      <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-2' : 'mt-3'}`}>
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
      <div className="flex min-h-[68px] items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-white/[0.015] text-[10px] font-display font-bold uppercase tracking-[0.16em] text-white/25">
        Empty
      </div>
    );
  }

  const user = card.user || {};
  const ovr = card.ratings?.overall?.score100 || 0;

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${tones[tone] || tones.default}`}>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-piu-dark">
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
          <p className="text-[9px] text-white/35">OVR {ovr}</p>
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
}) {
  const attrs = card.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const ovr = card.ratings?.overall?.score100 || 0;
  const user = card.user || {};
  const comp = card.competitive || {};

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{ animationDelay: `${animDelay}ms` }}
      className={[
        'relative rounded-lg border transition-all duration-300 animate-[cardFlip_0.45s_ease-out_both]',
        selected
          ? 'border-piu-gold/30 bg-piu-dark/80 ring-1 ring-piu-gold/20'
          : 'border-white/[0.06] bg-gradient-to-r from-white/[0.035] to-transparent',
        highlight ? 'ring-1 ring-sky-300/18' : '',
        disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:border-white/15 hover:bg-white/[0.045]',
        compact ? 'p-2.5' : 'p-3',
      ].filter(Boolean).join(' ')}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-piu-dark">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-sm font-bold text-white/35">
                {(user.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-[11px] font-bold text-white">{user.username || 'Unknown'}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {comp.singleLevel && <StatChip tone="rose">S{comp.singleLevel}</StatChip>}
              {comp.doubleLevel && <StatChip tone="green">D{comp.doubleLevel}</StatChip>}
            </div>
          </div>
        </div>
        <div className="shrink-0 rounded-md border border-piu-gold/15 bg-piu-gold/[0.06] px-2 py-1 text-right">
          <div className={`font-display text-sm font-black leading-none tabular-nums ${ratingColor(ovr)}`}>{ovr}</div>
          <div className="mt-0.5 font-display text-[8px] font-bold uppercase tracking-[0.14em] text-white/30">OVR</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {['speed', 'stamina', 'mobility', 'tech'].map((bucket) => {
          const value = attrs[bucket] || 0;
          const weight = showWeights?.weights?.[bucket];
          return (
            <div key={bucket} className="flex items-center gap-1.5">
              <span className="w-[56px] shrink-0 font-display text-[9px] font-bold uppercase tracking-[0.1em] text-white/35">
                {BUCKET_META[bucket].short}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400/90 via-cyan-300/80 to-piu-gold/75 transition-all duration-700"
                  style={{ width: `${Math.min(100, value)}%` }}
                />
              </div>
              <span className={`w-6 text-right font-display text-[10px] font-bold tabular-nums ${ratingColor(value)}`}>
                {value}
              </span>
              {weight !== undefined && (
                <span className="w-8 text-right font-display text-[9px] font-bold text-piu-gold/70">
                  {Math.round(weight * 100)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BattleView({ userCard, cpuCard, theme, userScore, cpuScore, roundNum, onContinue }) {
  const [revealed, setRevealed] = useState(false);
  const maxScore = Math.max(userScore, cpuScore, 1);

  useEffect(() => {
    const timeout = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Round {roundNum}</SectionLabel>
            <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.1em] text-white">
              Battle
            </p>
          </div>
          <div className="max-w-[220px]">
            <ThemeSummaryCard theme={theme} compact />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
        <div className="space-y-2">
          <SectionLabel accent="text-sky-300/70">Your Pick</SectionLabel>
          <MiniCard card={userCard} compact showWeights={theme} />
        </div>

        <div className="flex items-center justify-center md:pt-14">
          <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-display text-[11px] font-black uppercase tracking-[0.14em] text-white/50">
            VS
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel accent="text-rose-300/70">CPU Pick</SectionLabel>
          <MiniCard card={cpuCard} compact showWeights={theme} />
        </div>
      </div>

      <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-700 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        <SectionLabel>Performance</SectionLabel>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-[11px] font-bold text-sky-200">{userCard.user?.username}</span>
              <span className={`font-display text-sm font-black tabular-nums ${userScore >= cpuScore ? 'text-piu-gold' : 'text-white/70'}`}>
                {userScore.toFixed(1)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${userScore >= cpuScore ? 'bg-piu-gold' : 'bg-sky-300/80'}`}
                style={{ width: revealed ? `${(userScore / maxScore) * 100}%` : '0%' }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-[11px] font-bold text-rose-200">{cpuCard.user?.username}</span>
              <span className={`font-display text-sm font-black tabular-nums ${cpuScore > userScore ? 'text-piu-gold' : 'text-white/70'}`}>
                {cpuScore.toFixed(1)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${cpuScore > userScore ? 'bg-piu-gold' : 'bg-rose-300/75'}`}
                style={{ width: revealed ? `${(cpuScore / maxScore) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {revealed && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <StatChip tone={userScore > cpuScore ? 'gold' : userScore < cpuScore ? 'rose' : 'default'}>
              {userScore > cpuScore ? 'Round Win' : userScore < cpuScore ? 'CPU Win' : 'Draw'}
            </StatChip>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-md border border-piu-gold/20 bg-piu-gold/[0.08] px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-piu-gold hover:bg-piu-gold/[0.12] transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FantasyMatchPage({ embedded = false }) {
  const [phase, setPhase] = useState(PHASES.START);
  const [pool, setPool] = useState([]);
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
      const data = await getFantasyPool(10);
      const cards = data.cards || [];
      if (cards.length < 8) throw new Error('Not enough players available');
      const shuffled = shuffle(cards);
      setPool(shuffled);
      setDraftCards(shuffled.slice(0, 5));
      setMyTeam([]);
      setCpuTeam([]);
      setRoundIndex(0);
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
      const cpuPool = shuffle(remaining).slice(0, 5);
      const cpuPicks = cpuPool
        .sort((a, b) => (b.ratings?.overall?.score100 || 0) - (a.ratings?.overall?.score100 || 0))
        .slice(0, 3);

      setCpuTeam(cpuPicks);
      setMyRemaining(nextTeam);
      setCpuRemaining(cpuPicks);

      setTimeout(() => setPhase(PHASES.MATCH), 450);
    }
  }, [myTeam, pool]);

  const fieldPlayer = useCallback((card) => {
    if (battleState) return;
    const theme = ROUND_THEMES[roundIndex];
    const cpuPick = [...cpuRemaining].sort((a, b) => computeScore(b, theme) - computeScore(a, theme))[0];

    const userScore = computeScore(card, theme);
    const cpuScore = computeScore(cpuPick, theme);

    setMyRemaining((prev) => prev.filter((entry) => entry.user.id !== card.user.id));
    setCpuRemaining((prev) => prev.filter((entry) => entry.user.id !== cpuPick.user.id));
    setBattleState({ userCard: card, cpuCard: cpuPick, userScore, cpuScore, theme });
    setPhase(PHASES.BATTLE);
  }, [battleState, roundIndex, cpuRemaining]);

  const continueBattle = useCallback(() => {
    const nextResults = [...roundResults, battleState];
    setRoundResults(nextResults);
    setBattleState(null);

    if (nextResults.length >= 3) {
      setPhase(PHASES.RESULT);
    } else {
      setRoundIndex((prev) => prev + 1);
      setPhase(PHASES.MATCH);
    }
  }, [roundResults, battleState]);

  const playAgain = useCallback(() => {
    setPhase(PHASES.START);
    setPool([]);
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

  const userWins = roundResults.filter((result) => result.userScore > result.cpuScore).length;
  const cpuWins = roundResults.filter((result) => result.cpuScore > result.userScore).length;
  const currentTheme = ROUND_THEMES[roundIndex] || ROUND_THEMES[0];
  const title = phase === PHASES.START || phase === PHASES.LOADING ? 'Draft Mode' : 'Live Match';

  return (
    <div className={embedded ? 'rounded-2xl border border-piu-border bg-[#0a0a10]' : 'min-h-screen bg-[#0a0a10] pb-20'}>
      <div className="border-b border-white/[0.04] px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
          <div>
            <SectionLabel>{title}</SectionLabel>
            <h2 className="mt-1 font-display text-lg font-black uppercase tracking-wide text-white">
              Fantasy Match
            </h2>
            <p className="mt-1 text-[10px] text-white/35">
              Draft 3 players. Play 3 themed rounds.
            </p>
          </div>
          {phase !== PHASES.START && phase !== PHASES.LOADING && (
            <div className="flex items-center gap-2">
              <StatChip tone="cyan">You {userWins}</StatChip>
              <StatChip tone="rose">CPU {cpuWins}</StatChip>
            </div>
          )}
        </div>
      </div>

      <div className={`mx-auto max-w-2xl px-4 ${embedded ? 'py-4' : 'py-6'}`}>
        {phase === PHASES.START && (
          <div className="space-y-4 animate-[cardFlip_0.35s_ease-out_both]">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <SectionLabel>How It Works</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Build a three-player squad from live scouting cards, then send one player into each
                round. Every round emphasizes different strengths, so drafting balance matters more than
                raw overall.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatChip tone="gold">3 Draft Picks</StatChip>
                <StatChip>Best of 3</StatChip>
                <StatChip>Real Shinsa Cards</StatChip>
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

            {error && (
              <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-[11px] font-display font-bold text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={startDraft}
              className="rounded-md border border-piu-gold/20 bg-piu-gold/[0.08] px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-piu-gold hover:bg-piu-gold/[0.12] transition-colors"
            >
              Start Draft
            </button>
          </div>
        )}

        {phase === PHASES.LOADING && (
          <div className="py-12 text-center">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
              Loading Player Pool
            </p>
          </div>
        )}

        {phase === PHASES.DRAFT && (
          <div className="space-y-4 animate-[cardFlip_0.35s_ease-out_both]">
            <div className="rounded-lg border border-piu-gold/20 bg-gradient-to-r from-piu-gold/[0.06] to-transparent px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <SectionLabel accent="text-piu-gold/70">Draft</SectionLabel>
                  <p className="mt-1 font-display text-[11px] font-black uppercase tracking-[0.12em] text-white">
                    Pick {3 - myTeam.length} More Player{3 - myTeam.length === 1 ? '' : 's'}
                  </p>
                </div>
                <StatChip tone="gold">{myTeam.length}/3 Selected</StatChip>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-sky-300/70">Your Squad</SectionLabel>
                <p className="text-[10px] text-white/35">Locked after three picks</p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <TeamSlotCard key={index} card={myTeam[index]} tone="cyan" />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Available Cards</SectionLabel>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {draftCards.map((card, index) => {
                  const alreadyPicked = myTeam.some((entry) => entry.user.id === card.user.id);
                  const pickDisabled = alreadyPicked || myTeam.length >= 3;
                  return (
                    <div key={card.user.id} className="relative">
                      <MiniCard
                        card={card}
                        selected={alreadyPicked}
                        disabled={pickDisabled}
                        onClick={() => selectForTeam(card)}
                        animDelay={index * 90}
                      />
                      {alreadyPicked ? (
                        <div className="absolute right-2 top-2">
                          <StatChip tone="gold">Drafted</StatChip>
                        </div>
                      ) : (
                        !pickDisabled && (
                          <button
                            type="button"
                            onClick={() => selectForTeam(card)}
                            className="absolute bottom-2 right-2 rounded-md border border-piu-gold/20 bg-piu-gold/[0.08] px-3 py-1.5 font-display text-[9px] font-bold uppercase tracking-[0.14em] text-piu-gold hover:bg-piu-gold/[0.12] transition-colors"
                          >
                            Select
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {phase === PHASES.MATCH && (
          <div className="space-y-4 animate-[cardFlip_0.35s_ease-out_both]">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionLabel>Current Round</SectionLabel>
                  <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.1em] text-white">
                    Round {roundIndex + 1} of 3
                  </p>
                </div>
                <div className="max-w-[280px]">
                  <ThemeSummaryCard theme={currentTheme} compact />
                </div>
              </div>
            </div>

            {roundResults.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {roundResults.map((result, index) => (
                  <StatChip
                    key={`round-result-${index + 1}`}
                    tone={
                      result.userScore > result.cpuScore
                        ? 'gold'
                        : result.cpuScore > result.userScore
                          ? 'rose'
                          : 'default'
                    }
                  >
                    R{index + 1} {result.userScore > result.cpuScore ? 'Win' : result.cpuScore > result.userScore ? 'Loss' : 'Draw'}
                  </StatChip>
                ))}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-sky-300/70">Choose Your Player</SectionLabel>
                <p className="text-[10px] text-white/35">One card per round</p>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {myRemaining.map((card, index) => (
                  <div key={card.user.id}>
                    <MiniCard
                      card={card}
                      onClick={() => fieldPlayer(card)}
                      showWeights={currentTheme}
                      animDelay={index * 80}
                    />
                    <button
                      type="button"
                      onClick={() => fieldPlayer(card)}
                      className="mt-2 w-full rounded-md border border-piu-gold/20 bg-piu-gold/[0.08] px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-piu-gold hover:bg-piu-gold/[0.12] transition-colors"
                    >
                      Field Player
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel accent="text-rose-300/70">CPU Bench</SectionLabel>
                <StatChip tone="rose">{cpuRemaining.length} Remaining</StatChip>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {cpuRemaining.map((card) => (
                  <TeamSlotCard key={card.user.id} card={card} tone="rose" />
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === PHASES.BATTLE && battleState && (
          <div className="animate-[cardFlip_0.35s_ease-out_both]">
            <BattleView
              userCard={battleState.userCard}
              cpuCard={battleState.cpuCard}
              theme={battleState.theme}
              userScore={battleState.userScore}
              cpuScore={battleState.cpuScore}
              roundNum={roundIndex + 1}
              onContinue={continueBattle}
            />
          </div>
        )}

        {phase === PHASES.RESULT && (
          <div className="space-y-4 animate-[cardFlip_0.35s_ease-out_both]">
            <div className="rounded-lg border border-piu-gold/20 bg-gradient-to-r from-piu-gold/[0.06] to-transparent px-3 py-3">
              <SectionLabel accent="text-piu-gold/70">Result</SectionLabel>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-black uppercase tracking-[0.08em] text-white">
                    {userWins > cpuWins ? 'Victory' : userWins < cpuWins ? 'Defeat' : 'Draw'}
                  </p>
                  <p className="mt-1 text-[10px] text-white/35">Final match score</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatChip tone="cyan">You {userWins}</StatChip>
                  <StatChip tone="rose">CPU {cpuWins}</StatChip>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>Round Breakdown</SectionLabel>
              <div className="mt-2 space-y-2">
                {roundResults.map((result, index) => (
                  <div key={`breakdown-${index + 1}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[10px] font-black uppercase tracking-[0.12em] text-white/55">
                          Round {index + 1}
                        </p>
                        <p className="mt-1 truncate font-display text-[11px] font-bold uppercase tracking-[0.08em] text-white">
                          {ROUND_THEMES[index].name}
                        </p>
                      </div>
                      <StatChip
                        tone={
                          result.userScore > result.cpuScore
                            ? 'gold'
                            : result.cpuScore > result.userScore
                              ? 'rose'
                              : 'default'
                        }
                      >
                        {result.userScore > result.cpuScore ? 'Win' : result.cpuScore > result.userScore ? 'Loss' : 'Draw'}
                      </StatChip>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                      <div>
                        <p className="truncate font-display text-[10px] font-bold text-sky-200">{result.userCard.user?.username}</p>
                        <p className={`font-display text-sm font-black tabular-nums ${result.userScore >= result.cpuScore ? 'text-piu-gold' : 'text-white/60'}`}>
                          {result.userScore.toFixed(1)}
                        </p>
                      </div>
                      <span className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">vs</span>
                      <div>
                        <p className="truncate font-display text-[10px] font-bold text-rose-200">{result.cpuCard.user?.username}</p>
                        <p className={`font-display text-sm font-black tabular-nums ${result.cpuScore > result.userScore ? 'text-piu-gold' : 'text-white/60'}`}>
                          {result.cpuScore.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel accent="text-sky-300/70">Your Team</SectionLabel>
                  <StatChip tone="cyan">{myTeam.length} Cards</StatChip>
                </div>
                <div className="mt-2 space-y-2">
                  {myTeam.map((card) => (
                    <TeamSlotCard key={card.user.id} card={card} tone="cyan" />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel accent="text-rose-300/70">CPU Team</SectionLabel>
                  <StatChip tone="rose">{cpuTeam.length} Cards</StatChip>
                </div>
                <div className="mt-2 space-y-2">
                  {cpuTeam.map((card) => (
                    <TeamSlotCard key={card.user.id} card={card} tone="rose" />
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={playAgain}
              className="rounded-md border border-piu-gold/20 bg-piu-gold/[0.08] px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-piu-gold hover:bg-piu-gold/[0.12] transition-colors"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
