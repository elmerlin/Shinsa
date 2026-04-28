import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag, getSkillColor } from '../PlayerRegistration';
import { getProfilePath } from '../../utils/profile';
import { FORMAT_LABELS } from '../../utils/tournamentConstants';
import { sortRoundRobinPlayers } from '../../utils/tournamentPlacings';

const GENDER_SYMBOLS = { male: '♂', female: '♀' };

function getPlayerMatchStatus(playerId, matches) {
  const activeMatch = matches.find(
    (m) =>
      (m.player1_id === playerId || m.player2_id === playerId) &&
      m.status !== 'COMPLETED' &&
      m.status !== 'BYE' &&
      m.status !== 'WAITING'
  );
  if (!activeMatch) return null;
  return activeMatch.status;
}

function getStatusBadge(status) {
  if (!status) return null;
  const map = {
    PENDING: { label: 'Queued', cls: 'border-white/10 bg-white/[0.04] text-zinc-400' },
    DRAWING: { label: 'Drawing', cls: 'border-piu-accent/35 bg-piu-accent/12 text-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.18)]' },
    VETOING: { label: 'Vetoing', cls: 'border-piu-accent/35 bg-piu-accent/12 text-piu-accent shadow-[0_0_10px_rgba(255,51,102,0.18)]' },
    READY: { label: 'Playing', cls: 'border-piu-blue/30 bg-piu-blue/12 text-piu-blue' },
  };
  const cfg = map[status] || map.PENDING;
  const isLive = status === 'DRAWING' || status === 'VETOING' || status === 'READY';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-[0.12em] ${cfg.cls}`}>
      {isLive ? (
        <span className="relative flex h-1 w-1">
          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping" />
          <span className="relative inline-flex h-1 w-1 rounded-full bg-current" />
        </span>
      ) : null}
      {cfg.label}
    </span>
  );
}

function getActivePhaseLabel(playerId, matches, phases) {
  if (!phases.length) return null;
  const phaseMap = {};
  phases.forEach((p) => { phaseMap[p.id] = p; });

  const playerMatches = matches.filter(
    (m) => m.player1_id === playerId || m.player2_id === playerId
  );
  if (!playerMatches.length) return null;

  const latestPhaseId = playerMatches.reduce((latest, m) => {
    if (!m.phase_id) return latest;
    const phase = phaseMap[m.phase_id];
    if (!phase) return latest;
    if (!latest) return m.phase_id;
    const latestPhase = phaseMap[latest];
    if (!latestPhase) return m.phase_id;
    return phase.order > latestPhase.order ? m.phase_id : latest;
  }, null);

  if (!latestPhaseId) return null;
  const phase = phaseMap[latestPhaseId];
  return phase ? (phase.name || FORMAT_LABELS[phase.format] || phase.format) : null;
}

function getRankAccent(rank) {
  if (rank === 1) return { color: 'text-piu-gold', ring: 'ring-piu-gold/40', bg: 'bg-piu-gold/8' };
  if (rank === 2) return { color: 'text-piu-silver', ring: 'ring-piu-silver/30', bg: 'bg-piu-silver/6' };
  if (rank === 3) return { color: 'text-piu-bronze', ring: 'ring-piu-bronze/30', bg: 'bg-piu-bronze/6' };
  return { color: 'text-zinc-500', ring: 'ring-white/10', bg: '' };
}

export default function TournamentRoster({ players, matches, phases = [] }) {
  const sorted = sortRoundRobinPlayers(players, matches);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-3 block text-4xl opacity-40" aria-hidden="true">⚙</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No players registered yet</p>
      </div>
    );
  }

  const totalWins = sorted.reduce((acc, p) => acc + (p.wins || 0), 0);
  const totalLosses = sorted.reduce((acc, p) => acc + (p.losses || 0), 0);
  const totalMatches = totalWins + totalLosses;
  const liveCount = sorted.filter(p => {
    const s = getPlayerMatchStatus(p.id, matches);
    return s === 'DRAWING' || s === 'VETOING' || s === 'READY';
  }).length;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/20 to-piu-accent/5 border border-piu-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_-4px_rgba(255,51,102,0.3)]">
            <span className="font-display text-base sm:text-lg font-bold text-piu-accent">{sorted.length}</span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">Players</h2>
              {liveCount > 0 && (
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-piu-accent">
                  · {liveCount} live
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {sorted.length} registered{totalMatches > 0 ? ` · ${totalMatches} matches played` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Roster list */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-950/82 to-zinc-950/65 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.4)]">
        {/* Column header */}
        <div className="hidden sm:grid grid-cols-[42px_1fr_120px_88px] items-center gap-3 px-4 py-2.5 bg-white/[0.025] border-b border-white/6 text-[10px] font-display font-bold uppercase tracking-[0.16em] text-zinc-500">
          <div className="text-center">Rank</div>
          <div>Player</div>
          <div className="text-right">Score</div>
          <div className="text-right">Pumbility</div>
        </div>

        {sorted.map((player, idx) => {
          const rank = idx + 1;
          const accent = getRankAccent(rank);
          const flag = getCountryFlag(player.nationality);
          const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
          const matchStatus = getPlayerMatchStatus(player.id, matches);
          const phaseLabel = getActivePhaseLabel(player.id, matches, phases);
          const wins = player.wins || 0;
          const losses = player.losses || 0;
          const total = wins + losses;
          const winRate = total > 0 ? wins / total : 0;
          const winRatePct = Math.round(winRate * 100);

          return (
            <div
              key={player.id}
              className={`group relative grid grid-cols-[42px_1fr_auto] sm:grid-cols-[42px_1fr_120px_88px] items-center gap-3 px-3 sm:px-4 py-3 transition-all hover:bg-white/[0.025] ${
                idx > 0 ? 'border-t border-white/5' : ''
              } ${matchStatus ? 'bg-piu-accent/[0.04]' : ''}`}
            >
              {matchStatus ? (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-piu-accent/60 rounded-r-full" aria-hidden />
              ) : null}

              {/* Rank */}
              <div className="flex items-center justify-center">
                <span className={`font-display font-bold text-base sm:text-lg ${accent.color}`}>
                  {rank}
                </span>
              </div>

              {/* Player */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="relative shrink-0">
                  {player.avatar ? (
                    <img
                      src={getAvatarUrl(player.avatar)}
                      alt=""
                      className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover ring-1 ${accent.ring}`}
                    />
                  ) : (
                    <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent/80 to-purple-700/80 font-display text-sm font-bold text-white ring-1 ${accent.ring}`}>
                      {String(player.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {flag ? (
                    <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 ring-1 ring-piu-bg text-[10px]">
                      {flag}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {player.user_id ? (
                      <Link
                        to={getProfilePath(player.user_id, player.name)}
                        className="truncate font-display text-sm sm:text-base font-bold text-white hover:text-piu-accent transition-colors"
                      >
                        {player.name}
                      </Link>
                    ) : (
                      <span className="truncate font-display text-sm sm:text-base font-bold text-white">{player.name}</span>
                    )}
                    {genderSymbol ? (
                      <span className={`text-[11px] ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                        {genderSymbol}
                      </span>
                    ) : null}
                    {player.skill_title ? (
                      <span className={`hidden sm:inline-flex items-center rounded-md border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-display font-bold uppercase tracking-[0.06em] ${getSkillColor(player.skill_title)}`}>
                        {player.skill_title}
                      </span>
                    ) : null}
                    {matchStatus ? <span className="sm:hidden">{getStatusBadge(matchStatus)}</span> : null}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {phaseLabel ? (
                      <span className="text-[10px] sm:text-[11px] text-zinc-500">{phaseLabel}</span>
                    ) : null}
                    {matchStatus ? (
                      <span className="hidden sm:inline-flex">{getStatusBadge(matchStatus)}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Score (W-L + win rate bar) */}
              <div className="flex flex-col items-end justify-center sm:items-end min-w-0 shrink-0">
                <div className="flex items-baseline gap-1 font-mono">
                  <span className="text-piu-green font-bold text-sm sm:text-base">{wins}<span className="text-[10px] ml-0.5">W</span></span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-rose-400/80 text-sm sm:text-base">{losses}<span className="text-[10px] ml-0.5">L</span></span>
                </div>
                {total > 0 ? (
                  <div className="mt-1 hidden sm:flex items-center gap-1.5">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5">
                      <div
                        className={`h-full rounded-full ${winRatePct >= 50 ? 'bg-piu-green/80' : 'bg-rose-400/70'}`}
                        style={{ width: `${winRatePct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500">{winRatePct}%</span>
                  </div>
                ) : (
                  <span className="hidden sm:inline mt-1 font-mono text-[10px] text-zinc-700">No matches</span>
                )}
              </div>

              {/* Pumbility (desktop only) */}
              <div className="hidden sm:flex flex-col items-end shrink-0">
                {player.pumbility > 0 ? (
                  <>
                    <span className="font-mono font-bold text-piu-gold/90 text-sm">
                      {Number(player.pumbility).toLocaleString()}
                    </span>
                    <span className="font-display text-[9px] uppercase tracking-[0.14em] text-zinc-600 mt-0.5">
                      Pumbility
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[11px] text-zinc-700">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
