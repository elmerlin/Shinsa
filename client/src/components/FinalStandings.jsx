import React, { useEffect, useRef } from 'react';
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
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {[1, 0, 2].map((slotIndex) => {
        const entry = podium[slotIndex];
        if (!entry) return <div key={slotIndex} />;
        const medal = MEDAL_CONFIG[entry.rank];
        const flag = getCountryFlag(entry.nationality);
        const isChampion = entry.rank === 1;

        return (
          <div
            key={entry.player_id || `${entry.rank}-${entry.name}`}
            className={`rounded-2xl border px-3 py-4 text-center ${medal.bg} ${
              isChampion
                ? 'bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.14),transparent_62%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(10,10,14,0.5))]'
                : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(10,10,14,0.48))]'
            }`}
          >
            <div className={`mb-1 text-3xl ${isChampion ? 'sm:text-5xl' : 'sm:text-4xl'}`}>{medal.icon}</div>
            <p className={`font-display text-[10px] font-bold uppercase tracking-[0.18em] ${medal.color}`}>{medal.label}</p>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {flag && <span className="text-base">{flag}</span>}
              <p className={`max-w-full truncate font-display font-bold ${isChampion ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} ${medal.color}`}>
                {entry.name}
              </p>
            </div>
            {entry.skill_title && (
              <p className="mt-1 truncate text-[11px] text-zinc-500">{entry.skill_title}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlacementList({ entries = [], variant }) {
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

        return (
          <div
            key={entry.player_id || `${entry.rank}-${entry.name}`}
            className={`grid grid-cols-[auto,1fr,auto] items-center gap-3 px-3 py-3 sm:px-4 ${
              index > 0 ? 'border-t border-white/5' : ''
            } ${medal ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'} transition-colors`}
          >
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
                <div className="flex items-center gap-2">
                  {flag && <span className="text-sm">{flag}</span>}
                  <p className="truncate font-display font-bold text-white">{entry.name}</p>
                </div>
                {entry.skill_title && (
                  <p className="truncate text-xs text-zinc-500">{entry.skill_title}</p>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className={`font-display text-[11px] font-bold uppercase tracking-[0.12em] ${medal ? medal.color : 'text-zinc-400'}`}>
                {getStageValue(entry, variant)}
              </p>
              {variant === 'roundRobin' && (
                <p className="text-[11px] text-zinc-600">
                  Pum {Number(entry.pumbility || 0).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlacementSnapshotPanel({ title, subtitle, entries, variant }) {
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
        <PlacementList entries={entries} variant={variant} />
      </div>
    </section>
  );
}

export default function FinalStandings({ tournament = null, phases = [], players, matches }) {
  const { roundRobin, gauntlet, final } = getTournamentPlacings({ tournament, phases, players, matches });
  const hasGauntlet = gauntlet.length > 0;
  const champion = final[0] || null;
  const confettiFired = useRef(false);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-piu-gold/20 bg-piu-gold/10">
          <span className="text-base">{'\uD83C\uDFC6'}</span>
        </div>
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide text-white">Placement Timeline</h2>
          <p className="text-sm text-zinc-500">
            {hasGauntlet ? 'Round robin locked the ladder, then the gauntlet decided the finish.' : 'Final placings were settled in round robin.'}
          </p>
        </div>
      </div>

      {champion && (
        <div className="relative overflow-hidden rounded-[1.6rem] border border-piu-gold/25 bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.16),transparent_48%),radial-gradient(circle_at_85%_25%,rgba(255,51,102,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(8,8,12,0.82))] px-5 py-6 shadow-[0_18px_42px_rgba(0,0,0,0.3)] sm:px-6">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/45 to-transparent" />
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">
            {hasGauntlet ? 'Gauntlet Champion' : 'Tournament Champion'}
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                {championFlag && <span className="text-3xl">{championFlag}</span>}
                <div>
                  <p className="font-display text-3xl font-bold tracking-wide text-piu-gold sm:text-4xl">{champion.name}</p>
                  {champion.skill_title && (
                    <p className="mt-1 text-sm text-zinc-400">{champion.skill_title}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Final Order</p>
              <p className="mt-1 font-display text-lg font-bold text-white">
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
      />

      {gauntlet.length > 0 && (
        <PlacementSnapshotPanel
          title="After the Gauntlet"
          subtitle="Winner-stays-on gauntlet results settled the championship and the full finishing order."
          entries={gauntlet}
          variant="gauntlet"
        />
      )}
    </div>
  );
}
