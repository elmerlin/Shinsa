import React, { useEffect, useMemo } from 'react';
import { getAvatarUrl } from '../AvatarPicker';

const formatScore = (score) => {
  if (score == null || score === '') return '-';
  const numeric = Number(score);
  if (Number.isNaN(numeric)) return String(score);
  return numeric.toLocaleString();
};

const isSharedWinMatch = (match) => !!match?.scores?.shared_win;

const getSongMeta = (song) => {
  const mode = song.mode || song.song?.mode || '';
  const level = song.level || song.song?.level || '';
  const modeLabel = mode ? mode.slice(0, 1).toUpperCase() : '?';
  return `${modeLabel}${level || '?'}`;
};

const getSongTitle = (song, index) => {
  return song.title || song.song?.title || `Song ${index + 1}`;
};

const getSongWinnerId = (song) => {
  if (song.song_winner_id) return song.song_winner_id;
  const p1Score = Number(song.p1_score);
  const p2Score = Number(song.p2_score);
  if (Number.isNaN(p1Score) || Number.isNaN(p2Score)) return null;
  if (p1Score === p2Score) return 'tie';
  return p1Score > p2Score ? 'p1' : 'p2';
};

const getGauntletLabel = (match, totalGauntletMatches) => {
  if (match.gauntlet_order === totalGauntletMatches) return 'Final';
  return `#${match.gauntlet_order || '?'}`;
};

const getMatchLabel = (match, phaseFormat, totalGauntletMatches) => {
  if (phaseFormat === 'gauntlet' || match.match_type === 'gauntlet') {
    const level = match.difficulty_min || match.difficulty_max
      ? `Lv.${match.difficulty_min || '?'}-${match.difficulty_max || '?'}`
      : 'Gauntlet';
    return `${getGauntletLabel(match, totalGauntletMatches)} - ${level}`;
  }

  const level = match.difficulty_min || match.difficulty_max
    ? ` - Lv.${match.difficulty_min || '?'}-${match.difficulty_max || '?'}`
    : '';
  return `Round ${match.round_number || '?'}${level}`;
};

const getMatchScore = (match) => {
  const scores = match.scores || {};
  if (match.match_type === 'gauntlet') {
    return `${formatScore(scores.p1_total)} - ${formatScore(scores.p2_total)}`;
  }
  return `${scores.player1_wins ?? 0} - ${scores.player2_wins ?? 0}`;
};

function ScoreBox({ player, score, active }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${active ? 'border-piu-green/25 bg-piu-green/[0.07]' : 'border-white/8 bg-white/[0.03]'}`}>
      <p className={`truncate font-display text-[10px] font-bold uppercase tracking-[0.12em] ${active ? 'text-piu-green' : 'text-zinc-500'}`}>
        {player?.name || 'TBD'}
      </p>
      <p className={`mt-1 truncate font-mono text-sm font-bold ${active ? 'text-piu-green' : 'text-zinc-200'}`}>
        {formatScore(score)}
      </p>
    </div>
  );
}

export default function PlayerPhaseHistoryModal({
  player,
  players,
  matches,
  phaseLabel,
  phaseFormat,
  onClose,
}) {
  const playerMap = useMemo(() => {
    const map = {};
    players.forEach((p) => { map[p.id] = p; });
    return map;
  }, [players]);

  const totalGauntletMatches = useMemo(
    () => matches.filter((match) => match.match_type === 'gauntlet').length,
    [matches],
  );

  const playerMatches = useMemo(() => {
    return matches
      .filter((match) => match.status === 'COMPLETED' && (match.player1_id === player.id || match.player2_id === player.id))
      .sort((a, b) => {
        if (a.match_type !== b.match_type) return a.match_type === 'gauntlet' ? 1 : -1;
        if (a.match_type === 'gauntlet') return (a.gauntlet_order || 0) - (b.gauntlet_order || 0);
        if ((a.round_number || 0) !== (b.round_number || 0)) return (a.round_number || 0) - (b.round_number || 0);
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
  }, [matches, player.id]);

  const record = useMemo(() => {
    return playerMatches.reduce((acc, match) => {
      if (isSharedWinMatch(match)) {
        acc.shared += 1;
      } else if (match.winner_id === player.id) {
        acc.wins += 1;
      } else {
        acc.losses += 1;
      }
      return acc;
    }, { wins: 0, losses: 0, shared: 0 });
  }, [playerMatches, player.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/[0.82] px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-w-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} match history`}
      >
        <div className="border-b border-white/8 bg-white/[0.03] px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            {player.avatar ? (
              <img src={getAvatarUrl(player.avatar)} alt="" className="h-12 w-12 rounded-xl border border-white/10 object-cover shadow-sm" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-display text-lg font-bold text-zinc-500">
                {player.name?.slice(0, 1) || '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-piu-accent">
                {phaseLabel || 'Phase'} History
              </p>
              <h2 className="mt-1 truncate font-display text-2xl font-bold tracking-wide text-white">
                {player.name}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-display font-bold uppercase tracking-[0.12em]">
                <span className="rounded-full border border-piu-green/20 bg-piu-green/10 px-2 py-1 text-piu-green">
                  {record.wins}W
                </span>
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300">
                  {record.losses}L
                </span>
                {record.shared > 0 && (
                  <span className="rounded-full border border-piu-accent/20 bg-piu-accent/10 px-2 py-1 text-piu-accent">
                    {record.shared} Shared
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-zinc-400">
                  {playerMatches.length} Matches
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 font-display text-sm font-bold text-zinc-300 transition-colors hover:border-piu-accent/30 hover:bg-piu-accent/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-piu-accent/60"
              aria-label="Close match history"
            >
              X
            </button>
          </div>
        </div>

        <div className="max-h-[calc(92vh-132px)] overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          {playerMatches.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-8 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-zinc-400">
                No completed matches in this phase
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {playerMatches.map((match) => {
                const p1 = playerMap[match.player1_id];
                const p2 = playerMap[match.player2_id];
                const opponent = player.id === match.player1_id ? p2 : p1;
                const sharedWin = isSharedWinMatch(match);
                const isWin = sharedWin || match.winner_id === player.id;
                const winner = sharedWin ? null : playerMap[match.winner_id];
                const playedSongs = match.played_songs || [];

                return (
                  <div
                    key={match.id}
                    className={`rounded-xl border p-3 sm:p-4 ${isWin ? 'border-piu-green/15 bg-piu-green/[0.035]' : 'border-red-500/15 bg-red-500/[0.035]'}`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] ${
                            sharedWin
                              ? 'border-piu-accent/20 bg-piu-accent/10 text-piu-accent'
                              : isWin
                                ? 'border-piu-green/20 bg-piu-green/10 text-piu-green'
                                : 'border-red-500/20 bg-red-500/10 text-red-300'
                          }`}>
                            {sharedWin ? 'Shared Win' : isWin ? 'Win' : 'Loss'}
                          </span>
                          <span className="font-display text-sm font-bold text-zinc-100">
                            vs {opponent?.name || 'Unknown'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          Winner: <span className="text-zinc-300">{sharedWin ? 'Shared win' : winner?.name || 'No winner recorded'}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:justify-end">
                        <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                          {getMatchLabel(match, phaseFormat, totalGauntletMatches)}
                        </span>
                        <span className="rounded-full border border-white/8 bg-black/25 px-2 py-1 font-mono text-[10px] font-bold text-zinc-300">
                          {getMatchScore(match)}
                        </span>
                      </div>
                    </div>

                    {playedSongs.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {playedSongs.map((song, index) => {
                          const songWinnerId = getSongWinnerId(song);
                          const songWinner = songWinnerId === 'p1'
                            ? p1
                            : songWinnerId === 'p2'
                              ? p2
                              : playerMap[songWinnerId];
                          const tied = songWinnerId === 'tie';
                          const p1Active = !tied && (songWinnerId === 'p1' || songWinnerId === match.player1_id);
                          const p2Active = !tied && (songWinnerId === 'p2' || songWinnerId === match.player2_id);

                          return (
                            <div key={`${match.id}-${index}`} className="rounded-lg border border-white/8 bg-black/18 p-2.5">
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 w-9 shrink-0 rounded bg-piu-blue/12 px-1 py-1 text-center font-display text-[10px] font-bold text-piu-blue">
                                  {getSongMeta(song)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-display text-sm font-bold text-zinc-100">
                                    {getSongTitle(song, index)}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-zinc-500">
                                    Song winner: <span className="text-zinc-300">{tied ? 'Tie' : songWinner?.name || 'Not recorded'}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <ScoreBox player={p1} score={song.p1_score} active={p1Active} />
                                <ScoreBox player={p2} score={song.p2_score} active={p2Active} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-white/8 bg-black/18 px-3 py-3">
                        <p className="text-xs text-zinc-500">No song details were saved for this match.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
