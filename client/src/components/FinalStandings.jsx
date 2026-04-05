import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { getCountryFlag } from './PlayerRegistration';

const MEDAL_CONFIG = {
  1: { label: 'GOLD', color: 'text-piu-gold', bg: 'bg-piu-gold/10 border-piu-gold/40', icon: '\uD83E\uDD47' },
  2: { label: 'SILVER', color: 'text-piu-silver', bg: 'bg-piu-silver/10 border-piu-silver/40', icon: '\uD83E\uDD48' },
  3: { label: 'BRONZE', color: 'text-piu-bronze', bg: 'bg-piu-bronze/10 border-piu-bronze/40', icon: '\uD83E\uDD49' },
};

export default function FinalStandings({ players, matches, config }) {
  const gauntletMatches = [...matches]
    .filter(m => m.match_type === 'gauntlet')
    .sort((a, b) => a.gauntlet_order - b.gauntlet_order);

  const hasGauntlet = gauntletMatches.length > 0;
  const finalMatch = gauntletMatches[gauntletMatches.length - 1];
  const gauntletComplete = finalMatch?.status === 'COMPLETED';

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  // Determine final rankings
  // If gauntlet was played, the gauntlet determines placement:
  //   - Winner of final match = 1st
  //   - Loser of final match = 2nd
  //   - Loser of semifinal (second to last match) = 3rd
  // If no gauntlet, use round robin standings
  let podium = []; // array of { rank, player }

  if (hasGauntlet && gauntletComplete) {
    const winner = playerMap[finalMatch.winner_id];
    const finalLoserId = finalMatch.player1_id === finalMatch.winner_id
      ? finalMatch.player2_id : finalMatch.player1_id;
    const runnerUp = playerMap[finalLoserId];

    podium.push({ rank: 1, player: winner });
    if (runnerUp) podium.push({ rank: 2, player: runnerUp });

    // 3rd place: the loser of the semifinal match (second to last gauntlet match)
    if (gauntletMatches.length >= 2) {
      const semiMatch = gauntletMatches[gauntletMatches.length - 2];
      if (semiMatch.status === 'COMPLETED') {
        const semiLoserId = semiMatch.player1_id === semiMatch.winner_id
          ? semiMatch.player2_id : semiMatch.player1_id;
        const thirdPlace = playerMap[semiLoserId];
        if (thirdPlace) podium.push({ rank: 3, player: thirdPlace });
      }
    }
  } else {
    // No gauntlet - use round robin standings
    const sorted = [...players].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pumbility - a.pumbility;
    });
    podium = sorted.slice(0, 3).map((p, i) => ({ rank: i + 1, player: p }));
  }

  const champion = podium.find(p => p.rank === 1)?.player;

  const confettiFired = useRef(false);
  useEffect(() => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    const timer = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.2, y: 0.6 },
        colors: ['#ffd700', '#ff3366', '#33ff66', '#4488ff'],
      });
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.8, y: 0.6 },
        colors: ['#ffd700', '#ff3366', '#33ff66', '#4488ff'],
      });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-piu-gold/10 border border-piu-gold/20">
          <span className="text-sm">{'\uD83C\uDFC6'}</span>
        </div>
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-white">Final Standings</h2>
          <p className="text-xs text-zinc-500">
            {hasGauntlet ? 'Rankings determined by Gauntlet results' : 'Rankings based on Round Robin performance'}
          </p>
        </div>
      </div>

      {/* Champion Banner */}
      {champion && (
        <div className="relative mb-6 overflow-hidden rounded-xl border border-piu-gold/30 bg-[radial-gradient(circle_at_50%_0%,rgba(255,215,0,0.14),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,51,102,0.06),transparent_40%)] py-6 sm:py-8 text-center shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-piu-gold/50 to-transparent" />
          <div className="text-4xl sm:text-5xl mb-2">{'\uD83C\uDFC6'}</div>
          <p className="text-[10px] text-zinc-400 font-display uppercase tracking-[0.2em] font-bold mb-2">
            {hasGauntlet ? 'Gauntlet Champion' : 'Tournament Champion'}
          </p>
          <div className="flex items-center justify-center gap-2 mb-1">
            {champion.nationality && (
              <span className="text-2xl">{getCountryFlag(champion.nationality)}</span>
            )}
            <p className="font-display font-bold text-piu-gold text-3xl sm:text-4xl tracking-wide">
              {champion.name}
            </p>
          </div>
          {champion.skill_title && (
            <p className="text-sm text-zinc-500 mt-1">{champion.skill_title}</p>
          )}
        </div>
      )}

      {/* Podium */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        {/* 2nd place - left */}
        {podium.length >= 2 ? (
          <PodiumCard entry={podium[1]} />
        ) : (
          <div />
        )}
        {/* 1st place - center, taller */}
        {podium.length >= 1 ? (
          <PodiumCard entry={podium[0]} isChampion />
        ) : (
          <div />
        )}
        {/* 3rd place - right */}
        {podium.length >= 3 ? (
          <PodiumCard entry={podium[2]} />
        ) : (
          <div />
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Full Rankings List */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/78 shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
        <div className="px-3 sm:px-4 py-2.5 bg-white/[0.03] border-b border-white/6">
          <p className="text-[10px] text-zinc-500 font-display uppercase tracking-[0.14em] font-bold">All Players</p>
        </div>
        {[...players].sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pumbility - a.pumbility;
        }).map((player, idx) => {
          const rank = idx + 1;
          const medal = MEDAL_CONFIG[rank];
          const flag = getCountryFlag(player.nationality);
          // Override rank for gauntlet top 3
          const podiumEntry = podium.find(p => p.player?.id === player.id);
          const displayRank = podiumEntry ? podiumEntry.rank : rank;
          const displayMedal = MEDAL_CONFIG[displayRank];

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-white/[0.02] ${idx > 0 ? 'border-t border-white/5' : ''} ${
                displayMedal ? displayMedal.bg.split(' ')[0] : ''
              }`}
            >
              <div className={`w-8 text-center font-display font-bold text-lg ${
                displayMedal ? displayMedal.color : 'text-gray-600'
              }`}>
                {displayMedal ? displayMedal.icon : displayRank}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {flag && <span className="text-sm shrink-0">{flag}</span>}
                <span className="font-display font-bold truncate">{player.name}</span>
                {player.skill_title && (
                  <span className="text-xs text-gray-500 hidden sm:inline shrink-0">{player.skill_title}</span>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-sm text-piu-green">{player.wins}W</span>
                <span className="text-gray-600 mx-1">-</span>
                <span className="font-mono text-sm text-red-400">{player.losses}L</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PodiumCard({ entry, isChampion }) {
  const { rank, player } = entry;
  const medal = MEDAL_CONFIG[rank];
  const flag = player ? getCountryFlag(player.nationality) : null;

  return (
    <div
      className={`rounded-xl border text-center shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${medal.bg} ${isChampion ? 'pt-4 sm:pt-8' : 'mt-4 sm:mt-8'} pb-3 sm:pb-4 ${isChampion ? 'bg-gradient-to-b from-piu-gold/10 to-zinc-950/70' : 'bg-zinc-950/70'}`}
      style={{ animation: `slideUp 0.5s ease-out ${isChampion ? '0.4s' : rank === 2 ? '0.6s' : '0.8s'} both` }}
    >
      <div className={`text-3xl sm:text-4xl mb-1 ${isChampion ? 'sm:text-5xl' : ''}`}>
        {medal.icon}
      </div>
      <p className={`text-[10px] font-display uppercase tracking-[0.14em] font-bold mb-1 ${medal.color}`}>
        {medal.label}
      </p>
      {player ? (
        <>
          {flag && <div className="text-lg mb-0.5">{flag}</div>}
          <p className={`font-display font-bold truncate px-1 ${isChampion ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} ${medal.color}`}>
            {player.name}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {player.wins}W &ndash; {player.losses}L
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-700">-</p>
      )}
    </div>
  );
}
