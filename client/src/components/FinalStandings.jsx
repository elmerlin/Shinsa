import React, { useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { getCountryFlag } from './PlayerRegistration';
import { getAvatarUrl } from './AvatarPicker';
import { getTournamentPlacings } from '../utils/tournamentPlacings';

const MEDAL_CONFIG = {
  1: { label: 'Gold', color: 'text-piu-gold', bg: 'bg-piu-gold/10 border-piu-gold/35', icon: '\uD83E\uDD47' },
  2: { label: 'Silver', color: 'text-piu-silver', bg: 'bg-piu-silver/10 border-piu-silver/30', icon: '\uD83E\uDD48' },
  3: { label: 'Bronze', color: 'text-piu-bronze', bg: 'bg-piu-bronze/10 border-piu-bronze/30', icon: '\uD83E\uDD49' },
};

const PANEL_TONES = {
  roundRobin: {
    border: 'border-piu-blue/20',
    glow: 'shadow-[0_14px_34px_rgba(59,130,246,0.12)]',
    pill: 'border-piu-blue/18 bg-piu-blue/10 text-sky-100',
    eyebrow: 'text-piu-blue',
  },
  gauntlet: {
    border: 'border-piu-accent/20',
    glow: 'shadow-[0_14px_34px_rgba(255,51,102,0.12)]',
    pill: 'border-piu-accent/18 bg-piu-accent/10 text-rose-100',
    eyebrow: 'text-piu-accent',
  },
};

function getDisplayRank(rank) {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

function getStageValue(entry, variant) {
  if (variant === 'roundRobin') {
    return `${entry.wins || 0}W · ${entry.losses || 0}L`;
  }
  if (entry.rank === 1) return 'Champion';
  if (entry.rank === 2) return 'Runner-up';
  if (entry.rank === 3) return 'Third place';
  return `Placed ${getDisplayRank(entry.rank)}`;
}

function PlacementPodium({ entries = [] }) {
  const podium = entries.slice(0, 3);

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {[1, 0, 2].map((slotIndex) => {
        const entry = podium[slotIndex];
        if (!entry) return <div key={slotIndex} />;
        const medal = MEDAL_CONFIG[entry.rank];
        const flag = getCountryFlag(entry.nationality);
        const avatar = entry.avatar ? getAvatarUrl(entry.avatar) : '';
        const isChampion = entry.rank === 1;
        const isSecond = entry.rank === 2;

        const heightClass = isChampion ? 'pt-5 sm:pt-7 pb-4 sm:pb-5' : 'mt-3 sm:mt-5 pt-3 sm:pt-4 pb-3 sm:pb-4';
        const ringClass = isChampion ? 'ring-piu-gold/45' : isSecond ? 'ring-piu-silver/40' : 'ring-piu-bronze/40';

        return (
          <div
            key={entry.player_id || `${entry.rank}-${entry.name}`}
            className={`relative overflow-hidden rounded-2xl border px-3 text-center ${heightClass} ${
              isChampion
                ? 'border-piu-gold/35 bg-[radial-gradient(circle_at_50%_-20%,rgba(255,215,0,0.18),transparent_60%),linear-gradient(180deg,rgba(22,18,12,0.88),rgba(15,12,8,0.92))] shadow-[0_18px_36px_-8px_rgba(0,0,0,0.5),0_0_22px_-2px_rgba(255,215,0,0.2)]'
                : isSecond
                  ? 'border-piu-silver/30 bg-[radial-gradient(circle_at_50%_-20%,rgba(192,192,192,0.10),transparent_60%),linear-gradient(180deg,rgba(18,20,24,0.85),rgba(13,15,18,0.9))] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.4)]'
                  : 'border-piu-bronze/30 bg-[radial-gradient(circle_at_50%_-20%,rgba(205,127,50,0.10),transparent_60%),linear-gradient(180deg,rgba(20,16,12,0.85),rgba(14,12,9,0.9))] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.4)]'
            }`}
          >
            {isChampion && (
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/60 to-transparent" />
            )}
            <div className={`text-3xl mb-1 ${isChampion ? 'sm:text-5xl' : 'sm:text-4xl'}`}>{medal.icon}</div>
            <p className={`font-display text-[10px] font-bold uppercase tracking-[0.18em] mb-2 ${medal.color}`}>{medal.label}</p>
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className={`mx-auto rounded-full object-cover ring-1 ${ringClass} ${isChampion ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-10 w-10 sm:h-11 sm:w-11'}`}
              />
            ) : (
              <div className={`mx-auto flex items-center justify-center rounded-full bg-gradient-to-br from-piu-accent/70 to-purple-700/70 font-display font-bold text-white ring-1 ${ringClass} ${isChampion ? 'h-12 w-12 sm:h-14 sm:w-14 text-base' : 'h-10 w-10 sm:h-11 sm:w-11 text-sm'}`}>
                {String(entry.name || '?').trim().slice(0, 1).toUpperCase()}
              </div>
            )}
            {flag && <div className="text-base mt-1.5">{flag}</div>}
            <p className={`mt-1 max-w-full truncate font-display font-bold px-2 ${isChampion ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} ${medal.color}`}>
              {entry.name}
            </p>
            {entry.skill_title && (
              <p className="mt-1 truncate text-[10px] text-zinc-600 px-2">{entry.skill_title}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlacementList({ entries = [], variant, onEntryClick }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/70">
      <div className="grid grid-cols-[auto,1fr,auto] gap-3 border-b border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-zinc-500 sm:px-4">
        <div>Place</div>
        <div>Player</div>
        <div className="text-right">{variant === 'roundRobin' ? 'Record' : 'Result'}</div>
      </div>

      {entries.map((entry, index) => {
        const medal = MEDAL_CONFIG[entry.rank];
        const flag = getCountryFlag(entry.nationality);
        const avatar = entry.avatar ? getAvatarUrl(entry.avatar) : '';
        const interactive = typeof onEntryClick === 'function' && entry.player_id;
        const rowClassName = `group grid w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 px-3 py-3 text-left ${
          index > 0 ? 'border-t border-white/5' : ''
        } ${
          medal ? 'bg-white/[0.02]' : ''
        } ${
          interactive ? 'cursor-pointer transition-colors hover:bg-white/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-piu-accent/60' : ''
        } sm:px-4`;
        const rowContent = (
          <>
            <div className={`min-w-[44px] font-display text-sm font-bold ${medal ? medal.color : 'text-zinc-500'}`}>
              {medal ? medal.icon : getDisplayRank(entry.rank)}
            </div>

            <div className="flex min-w-0 items-center gap-2.5">
              {avatar ? (
                <img src={avatar} alt="" className="h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] font-display text-[11px] font-bold text-zinc-300">
                  {String(entry.name || '?').trim().slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {flag && <span className="shrink-0 text-sm">{flag}</span>}
                  <p className={`truncate font-display font-bold text-white ${interactive ? 'group-hover:text-piu-accent' : ''}`}>
                    {entry.name}
                  </p>
                </div>
                {entry.skill_title && (
                  <p className="truncate text-xs text-zinc-500">{entry.skill_title}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 text-right">
              <div>
                <p className={`font-display text-[11px] font-bold uppercase tracking-[0.12em] ${medal ? medal.color : 'text-zinc-400'}`}>
                  {getStageValue(entry, variant)}
                </p>
                {variant === 'roundRobin' && (
                  <p className="text-[11px] text-zinc-600">
                    Pum {Number(entry.pumbility || 0).toLocaleString()}
                  </p>
                )}
              </div>
              {interactive && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.035] font-display text-sm font-bold text-zinc-500 transition-colors group-hover:border-piu-accent/25 group-hover:bg-piu-accent/10 group-hover:text-piu-accent" aria-hidden="true">
                  &gt;
                </span>
              )}
            </div>
          </>
        );

        return interactive ? (
          <button
            key={entry.player_id || `${entry.rank}-${entry.name}`}
            type="button"
            onClick={() => onEntryClick(entry)}
            className={rowClassName}
            aria-label={`View ${entry.name} match history`}
          >
            {rowContent}
          </button>
        ) : (
          <div
            key={entry.player_id || `${entry.rank}-${entry.name}`}
            className={rowClassName}
          >
            {rowContent}
          </div>
        );
      })}
    </div>
  );
}

function PlacementSnapshotPanel({ title, subtitle, entries, variant, onEntryClick }) {
  const tone = PANEL_TONES[variant];

  return (
    <section className={`overflow-hidden rounded-[1.4rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(8,8,12,0.75))] ${tone.border} ${tone.glow}`}>
      <div className="border-b border-white/6 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`font-display text-[10px] font-bold uppercase tracking-[0.18em] ${tone.eyebrow}`}>
              Placement Snapshot
            </p>
            <h3 className="mt-1 font-display text-xl font-bold text-white">{title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">{subtitle}</p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-display font-bold uppercase tracking-[0.14em] ${tone.pill}`}>
            {entries.length} players ranked
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <PlacementPodium entries={entries} />
        <PlacementList entries={entries} variant={variant} onEntryClick={onEntryClick} />
      </div>
    </section>
  );
}

function getPhaseDisplayLabel(phase, fallback) {
  return phase?.name || fallback;
}

export default function FinalStandings({ tournament = null, phases = [], players, matches, onPlayerClick }) {
  const { roundRobin, gauntlet, final } = getTournamentPlacings({ tournament, phases, players, matches });
  const hasGauntlet = gauntlet.length > 0;
  const champion = final[0] || null;
  const confettiFired = useRef(false);
  const canOpenHistory = typeof onPlayerClick === 'function';
  const playerMap = useMemo(() => {
    const map = new Map();
    players.forEach((player) => {
      if (player?.id) map.set(player.id, player);
    });
    return map;
  }, [players]);
  const completedPhases = useMemo(
    () => phases.filter((phase) => phase?.status === 'COMPLETED'),
    [phases],
  );
  const latestRoundRobinPhase = useMemo(
    () => [...completedPhases].reverse().find((phase) => phase.format === 'round_robin' || phase.format === 'pools') || null,
    [completedPhases],
  );
  const latestGauntletPhase = useMemo(
    () => [...completedPhases].reverse().find((phase) => phase.format === 'gauntlet') || null,
    [completedPhases],
  );

  const openEntryHistory = (entry, variant) => {
    if (!onPlayerClick || !entry?.player_id) return;
    const player = playerMap.get(entry.player_id) || { ...entry, id: entry.player_id };
    const phase = variant === 'gauntlet' ? latestGauntletPhase : latestRoundRobinPhase;
    const fallbackLabel = variant === 'gauntlet' ? 'Gauntlet' : 'Round Robin';
    onPlayerClick(player, {
      phaseId: phase?.id || null,
      phaseLabel: getPhaseDisplayLabel(phase, fallbackLabel),
      format: phase?.format || (variant === 'gauntlet' ? 'gauntlet' : 'round_robin'),
    });
  };

  useEffect(() => {
    if (!champion || confettiFired.current) return;
    confettiFired.current = true;
    const timer = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.2, y: 0.58 },
        colors: ['#ffd700', '#ff3366', '#33ff66', '#4488ff'],
      });
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8, y: 0.58 },
        colors: ['#ffd700', '#ff3366', '#33ff66', '#4488ff'],
      });
    }, 260);
    return () => clearTimeout(timer);
  }, [champion]);

  if (!final.length) {
    return (
      <div className="rounded-2xl border border-white/8 bg-zinc-950/70 px-6 py-12 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">Placings unavailable</p>
        <p className="mt-2 text-sm text-zinc-400">Complete the tournament to lock the final order.</p>
      </div>
    );
  }

  const championFlag = champion ? getCountryFlag(champion.nationality) : '';
  const championAvatar = champion?.avatar ? getAvatarUrl(champion.avatar) : '';

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-piu-gold/20 to-piu-gold/5 border border-piu-gold/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(255,215,0,0.3)]">
          <span className="text-base sm:text-lg" aria-hidden>{'\uD83C\uDFC6'}</span>
        </div>
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">Placement Timeline</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {hasGauntlet ? 'Round robin locked the ladder, then the gauntlet decided the finish.' : 'Final placings were settled in round robin.'}
          </p>
        </div>
      </div>

      {champion && (
        <div className="relative overflow-hidden rounded-2xl border border-piu-gold/30 bg-[radial-gradient(circle_at_50%_-30%,rgba(255,215,0,0.22),transparent_55%),radial-gradient(circle_at_85%_120%,rgba(255,51,102,0.10),transparent_45%),radial-gradient(circle_at_15%_115%,rgba(68,136,255,0.06),transparent_45%),linear-gradient(180deg,rgba(22,18,12,0.92),rgba(13,11,8,0.96))] py-7 sm:py-9 px-5 sm:px-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6),0_0_32px_-4px_rgba(255,215,0,0.3)]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.08]" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="champ-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,215,0,0.6)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#champ-grid)" />
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/70 to-transparent" />
          <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-piu-gold/30 blur-3xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {championAvatar ? (
                <img
                  src={championAvatar}
                  alt={champion.name}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-2 ring-piu-gold/50 shadow-[0_0_24px_rgba(255,215,0,0.4)]"
                />
              ) : (
                <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-piu-gold/85 via-amber-500/70 to-piu-accent/65 font-display text-3xl font-bold text-white ring-2 ring-piu-gold/50 shadow-[0_0_24px_rgba(255,215,0,0.4)]">
                  {String(champion.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-piu-gold/70">
                  {hasGauntlet ? 'Gauntlet Champion' : 'Tournament Champion'}
                </p>
                <div className="mt-1 flex items-center gap-2.5">
                  {championFlag && <span className="text-2xl sm:text-3xl">{championFlag}</span>}
                  <p className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-piu-gold drop-shadow-[0_3px_12px_rgba(255,215,0,0.5)]">
                    {champion.name}
                  </p>
                </div>
                {champion.skill_title && (
                  <p className="mt-1.5 text-xs sm:text-sm font-display uppercase tracking-[0.14em] text-piu-gold/70">{champion.skill_title}</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-piu-gold/15 bg-black/25 px-4 py-3 sm:max-w-xs">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-piu-gold/60">Final Order</p>
              <p className="mt-1.5 font-display text-sm sm:text-base font-bold text-white leading-relaxed">
                {final.slice(0, 3).map((entry) => `${getDisplayRank(entry.rank)} ${entry.name}`).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <PlacementSnapshotPanel
        title={hasGauntlet ? 'After Round Robin' : 'Final Placings'}
        subtitle={hasGauntlet ? 'These results seeded the gauntlet ladder before the climb began.' : 'No gauntlet stage was played, so round robin locked the final order.'}
        entries={roundRobin}
        variant="roundRobin"
        onEntryClick={canOpenHistory ? (entry) => openEntryHistory(entry, 'roundRobin') : null}
      />

      {gauntlet.length > 0 && (
        <PlacementSnapshotPanel
          title="After the Gauntlet"
          subtitle="Winner-stays-on gauntlet results settled the championship and the full finishing order."
          entries={gauntlet}
          variant="gauntlet"
          onEntryClick={canOpenHistory ? (entry) => openEntryHistory(entry, 'gauntlet') : null}
        />
      )}
    </div>
  );
}
