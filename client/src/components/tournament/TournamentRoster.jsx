import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from '../AvatarPicker';
import { getCountryFlag, getSkillColor } from '../PlayerRegistration';
import { getProfilePath } from '../../utils/profile';
import { FORMAT_LABELS } from '../../utils/tournamentConstants';

const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

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
    PENDING: { label: 'Queued', cls: 'border-white/8 bg-white/4 text-zinc-500' },
    DRAWING: { label: 'Drawing', cls: 'border-piu-accent/25 bg-piu-accent/10 text-piu-accent' },
    VETOING: { label: 'Vetoing', cls: 'border-piu-accent/25 bg-piu-accent/10 text-piu-accent' },
    READY: { label: 'Playing', cls: 'border-piu-blue/20 bg-piu-blue/10 text-piu-blue' },
  };
  const cfg = map[status] || map.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-[0.1em] ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function getActivePhaseLabel(playerId, matches, phases) {
  if (!phases.length) return null;
  const phaseMap = {};
  phases.forEach((p) => { phaseMap[p.id] = p; });

  // Find the latest phase this player has matches in
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

export default function TournamentRoster({ players, matches, phases = [] }) {
  const sorted = [...players].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.pumbility || 0) - (a.pumbility || 0);
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-zinc-950/55 py-14 text-center">
        <span className="mb-2 block text-3xl opacity-40" aria-hidden="true">&#9878;</span>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-500">No players registered yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-piu-accent/12 border border-piu-accent/20">
          <span className="font-display text-xs font-bold text-piu-accent">{sorted.length}</span>
        </div>
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-white">Players</h2>
          <p className="text-xs text-zinc-500">{sorted.length} registered</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/78 shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
        {sorted.map((player, idx) => {
          const flag = getCountryFlag(player.nationality);
          const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
          const matchStatus = getPlayerMatchStatus(player.id, matches);
          const phaseLabel = getActivePhaseLabel(player.id, matches, phases);
          const completedMatches = matches.filter(
            (m) => (m.player1_id === player.id || m.player2_id === player.id) && m.status === 'COMPLETED'
          );

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-white/[0.02] ${
                idx > 0 ? 'border-t border-white/5' : ''
              } ${matchStatus ? 'bg-piu-accent/[0.03]' : ''}`}
            >
              {/* Rank */}
              <div className="w-7 text-center font-mono text-xs text-zinc-600">
                {idx + 1}
              </div>

              {/* Avatar */}
              {player.avatar ? (
                <img
                  src={getAvatarUrl(player.avatar)}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10 shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent to-purple-700 font-display text-[10px] font-bold text-white ring-1 ring-white/10 shrink-0">
                  {String(player.name || '?').charAt(0).toUpperCase()}
                </div>
              )}

              {/* Name & details */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {flag ? <span className="text-sm shrink-0">{flag}</span> : null}
                  {player.user_id ? (
                    <Link
                      to={getProfilePath(player.user_id, player.name)}
                      className="truncate font-display text-sm font-bold text-white hover:text-piu-accent transition-colors"
                    >
                      {player.name}
                    </Link>
                  ) : (
                    <span className="truncate font-display text-sm font-bold text-white">{player.name}</span>
                  )}
                  {genderSymbol ? (
                    <span className={`text-[10px] ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {genderSymbol}
                    </span>
                  ) : null}
                  {player.skill_title ? (
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-display font-bold ${getSkillColor(player.skill_title)}`}>
                      {player.skill_title}
                    </span>
                  ) : null}
                </div>
                {phaseLabel ? (
                  <p className="mt-0.5 text-[10px] text-zinc-600">{phaseLabel}</p>
                ) : null}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2.5 shrink-0">
                {matchStatus ? getStatusBadge(matchStatus) : null}
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-mono font-bold text-piu-green">{player.wins}W</span>
                    <span className="text-zinc-700">&ndash;</span>
                    <span className="font-mono text-red-400/80">{player.losses}L</span>
                  </div>
                  {player.pumbility > 0 ? (
                    <div className="mt-0.5 font-mono text-[10px] text-piu-gold/70">{Number(player.pumbility).toLocaleString()}</div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
