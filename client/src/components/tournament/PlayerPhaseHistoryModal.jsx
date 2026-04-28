import React, { useEffect, useMemo } from 'react';
import { getAvatarUrl } from '../AvatarPicker';
import PiuChartJacket from '../PiuChartJacket';

const formatScore = (score) => {
  if (score == null || score === '') return '-';
  const numeric = Number(score);
  if (Number.isNaN(numeric)) return String(score);
  return numeric.toLocaleString();
};

const isSharedWinMatch = (match) => !!match?.scores?.shared_win;

const getSongTitle = (song, index) => {
  return song.title || song.song?.title || `Song ${index + 1}`;
};

const getSongArtist = (song) => {
  return song.artist || song.song?.artist || '';
};

const getSongMode = (song) => {
  return song.mode || song.song?.mode || 'Single';
};

const getSongLevel = (song) => {
  return song.level || song.song?.level || '';
};

const getSongJacketUrl = (song) => {
  return song.jacket_url
    || song.background_url
    || song.song_jacket_url
    || song.song?.jacket_url
    || song.song?.background_url
    || song.song?.song_jacket_url
    || '';
};

const scoreNumber = (score) => {
  if (score == null || score === '') return null;
  const numeric = Number(score);
  return Number.isFinite(numeric) ? numeric : null;
};

const getSongWinnerId = (song) => {
  if (song.song_winner_id) return song.song_winner_id;
  const p1Score = scoreNumber(song.p1_score);
  const p2Score = scoreNumber(song.p2_score);
  if (p1Score == null || p2Score == null) return null;
  if (p1Score === p2Score) return 'tie';
  return p1Score > p2Score ? 'p1' : 'p2';
};

const getGauntletLabel = (match, totalGauntletMatches) => {
  if (match.gauntlet_order === totalGauntletMatches) return 'Final';
  return `Step ${match.gauntlet_order || '?'}`;
};

const getMatchLabel = (match, phaseFormat, totalGauntletMatches) => {
  if (phaseFormat === 'gauntlet' || match.match_type === 'gauntlet') {
    const level = match.difficulty_min || match.difficulty_max
      ? `Lv.${match.difficulty_min || '?'}-${match.difficulty_max || '?'}`
      : 'Gauntlet';
    return `${getGauntletLabel(match, totalGauntletMatches)} - ${level}`;
  }

  const level = match.difficulty_min || match.difficulty_max
    ? `Lv.${match.difficulty_min || '?'}-${match.difficulty_max || '?'}`
    : 'Round Robin';
  return `Round ${match.round_number || '?'} - ${level}`;
};

const getMatchScore = (match) => {
  const scores = match.scores || {};
  if (match.match_type === 'gauntlet') return null;
  return `${scores.player1_wins ?? 0}-${scores.player2_wins ?? 0}`;
};

const getScoreTotals = (match) => {
  const scores = match.scores || {};
  const playedSongs = match.played_songs || [];
  const summed = playedSongs.reduce((acc, song) => {
    const p1Score = scoreNumber(song.p1_score);
    const p2Score = scoreNumber(song.p2_score);
    if (p1Score != null) {
      acc.p1 += p1Score;
      acc.hasScores = true;
    }
    if (p2Score != null) {
      acc.p2 += p2Score;
      acc.hasScores = true;
    }
    return acc;
  }, { p1: 0, p2: 0, hasScores: false });

  const p1Total = scoreNumber(scores.p1_total);
  const p2Total = scoreNumber(scores.p2_total);
  if ((p1Total || p2Total) && p1Total != null && p2Total != null) {
    return { p1: p1Total, p2: p2Total, hasScores: true };
  }
  if (summed.hasScores) return summed;
  return { p1: p1Total ?? 0, p2: p2Total ?? 0, hasScores: p1Total != null || p2Total != null };
};

const getOutcomeTone = ({ sharedWin, isWin }) => {
  if (sharedWin) {
    return {
      label: 'Shared Win',
      badge: 'border-piu-accent/25 bg-piu-accent/10 text-piu-accent',
      panel: 'border-piu-accent/20 bg-[linear-gradient(180deg,rgba(255,51,102,0.055),rgba(10,10,16,0.74))]',
      rail: 'bg-piu-accent',
    };
  }
  if (isWin) {
    return {
      label: 'Win',
      badge: 'border-piu-green/25 bg-piu-green/10 text-piu-green',
      panel: 'border-piu-green/20 bg-[linear-gradient(180deg,rgba(51,255,102,0.05),rgba(10,10,16,0.74))]',
      rail: 'bg-piu-green',
    };
  }
  return {
    label: 'Loss',
    badge: 'border-red-400/25 bg-red-500/10 text-red-300',
    panel: 'border-red-400/20 bg-[linear-gradient(180deg,rgba(248,113,113,0.055),rgba(10,10,16,0.74))]',
    rail: 'bg-red-400',
  };
};

function PlayerAvatar({ player, size = 'md' }) {
  const sizeClass = size === 'lg' ? 'h-14 w-14 rounded-2xl text-xl' : 'h-8 w-8 rounded-full text-[11px]';
  if (player?.avatar) {
    return (
      <img
        src={getAvatarUrl(player.avatar)}
        alt=""
        className={`${sizeClass} shrink-0 border border-white/10 object-cover shadow-sm`}
      />
    );
  }
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.05] font-display font-bold text-zinc-400`}>
      {String(player?.name || '?').trim().slice(0, 1).toUpperCase() || '?'}
    </div>
  );
}

function MetricPill({ label, value, tone = 'neutral' }) {
  const toneClass = {
    win: 'border-piu-green/20 bg-piu-green/10 text-piu-green',
    loss: 'border-red-400/20 bg-red-500/10 text-red-300',
    accent: 'border-piu-accent/20 bg-piu-accent/10 text-piu-accent',
    neutral: 'border-white/10 bg-white/[0.045] text-zinc-300',
  }[tone] || 'border-white/10 bg-white/[0.045] text-zinc-300';

  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <p className="font-mono text-base font-black leading-none tabular-nums">{value}</p>
      <p className="mt-1 truncate font-display text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</p>
    </div>
  );
}

function OutcomeBadge({ tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-[0.12em] ${tone.badge}`}>
      {tone.label}
    </span>
  );
}

function ScoreBox({ player, score, active, align = 'left' }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${align === 'right' ? 'text-right' : ''} ${active ? 'border-piu-green/25 bg-piu-green/[0.075]' : 'border-white/8 bg-white/[0.035]'}`}>
      <p className={`truncate font-display text-[10px] font-bold uppercase tracking-[0.12em] ${active ? 'text-piu-green' : 'text-zinc-500'}`}>
        {player?.name || 'TBD'}
      </p>
      <p className={`mt-1 truncate font-mono text-[13px] font-black tabular-nums sm:text-sm ${active ? 'text-piu-green' : 'text-zinc-200'}`}>
        {formatScore(score)}
      </p>
    </div>
  );
}

function TotalScoreStrip({ p1, p2, totals, winnerId, sharedWin }) {
  if (!totals.hasScores) return null;
  const p1Active = sharedWin || winnerId === p1?.id;
  const p2Active = sharedWin || winnerId === p2?.id;
  const gap = Math.abs((totals.p1 || 0) - (totals.p2 || 0));
  const gapLabel = gap > 0 ? `+${formatScore(gap)}` : 'Tie';

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-[#070a12] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-stretch gap-2">
        <div className={`min-w-0 rounded-lg border px-2.5 py-2 text-right ${p1Active ? 'border-piu-green/25 bg-piu-green/[0.07]' : 'border-white/8 bg-white/[0.03]'}`}>
          <p className={`truncate font-display text-[10px] font-bold uppercase tracking-[0.12em] ${p1Active ? 'text-piu-green' : 'text-zinc-500'}`}>
            {p1?.name || 'TBD'}
          </p>
          <p className={`mt-1 font-mono text-base font-black tabular-nums ${p1Active ? 'text-piu-green' : 'text-zinc-100'}`}>
            {formatScore(totals.p1)}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-white/6 bg-black/20 px-1">
          <span className="font-display text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600">Sum</span>
          <span className="mt-1 font-mono text-[11px] font-bold text-zinc-400">{gapLabel}</span>
        </div>
        <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${p2Active ? 'border-piu-green/25 bg-piu-green/[0.07]' : 'border-white/8 bg-white/[0.03]'}`}>
          <p className={`truncate font-display text-[10px] font-bold uppercase tracking-[0.12em] ${p2Active ? 'text-piu-green' : 'text-zinc-500'}`}>
            {p2?.name || 'TBD'}
          </p>
          <p className={`mt-1 font-mono text-base font-black tabular-nums ${p2Active ? 'text-piu-green' : 'text-zinc-100'}`}>
            {formatScore(totals.p2)}
          </p>
        </div>
      </div>
    </div>
  );
}

function SongWinnerChip({ tied, winner }) {
  const label = tied ? 'Tie' : winner?.name || 'Not recorded';
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.12em] ${tied ? 'border-piu-accent/20 bg-piu-accent/10 text-piu-accent' : 'border-white/8 bg-white/[0.045] text-zinc-400'}`}>
      <span className="truncate">{label}</span>
    </span>
  );
}

function SongResultRow({ song, index, p1, p2, match, playerMap }) {
  const title = getSongTitle(song, index);
  const artist = getSongArtist(song);
  const mode = getSongMode(song);
  const level = getSongLevel(song);
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
    <div className="p-2.5 sm:p-3">
      <div className="grid grid-cols-[auto,minmax(0,1fr)] gap-3 sm:grid-cols-[auto,minmax(0,1fr)_minmax(220px,0.72fr)] sm:items-center">
        <PiuChartJacket
          title={title}
          mode={mode}
          level={level}
          jacketUrl={getSongJacketUrl(song)}
          size="wide"
          className="mt-0.5"
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-black leading-tight text-white">
                {title}
              </p>
              <p className="mt-1 truncate text-[11px] text-zinc-500">
                {artist || `${mode} ${level}`}
              </p>
            </div>
            <div className="hidden shrink-0 sm:block">
              <SongWinnerChip tied={tied} winner={songWinner} />
            </div>
          </div>
          <div className="mt-2 sm:hidden">
            <SongWinnerChip tied={tied} winner={songWinner} />
          </div>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
          <ScoreBox player={p1} score={song.p1_score} active={p1Active} align="right" />
          <ScoreBox player={p2} score={song.p2_score} active={p2Active} />
        </div>
      </div>
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
      acc.songs += match.played_songs?.length || 0;
      return acc;
    }, { wins: 0, losses: 0, shared: 0, songs: 0 });
  }, [playerMatches, player.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#02030a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#090b14] shadow-[0_24px_80px_rgba(0,0,0,0.56)] sm:max-w-3xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} match history`}
      >
        <div className="relative overflow-hidden border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(12,14,24,0.92))]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-piu-accent/45 to-transparent" />
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start gap-3">
              <PlayerAvatar player={player} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-piu-accent">
                  {phaseLabel || 'Phase'} History
                </p>
                <h2 className="mt-1 truncate font-display text-2xl font-black tracking-wide text-white sm:text-3xl">
                  {player.name}
                </h2>
                {player.skill_title && (
                  <p className="mt-1 truncate text-sm text-zinc-500">{player.skill_title}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] font-display text-sm font-black text-zinc-300 transition-colors hover:border-piu-accent/30 hover:bg-piu-accent/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-piu-accent/60"
                aria-label="Close match history"
              >
                X
              </button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <MetricPill label="Wins" value={record.wins} tone="win" />
              <MetricPill label="Losses" value={record.losses} tone="loss" />
              <MetricPill label="Shared" value={record.shared} tone="accent" />
              <MetricPill label="Songs" value={record.songs} />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5">
          {playerMatches.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-10 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-zinc-400">
                No completed matches in this phase
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {playerMatches.map((match) => {
                const p1 = playerMap[match.player1_id];
                const p2 = playerMap[match.player2_id];
                const opponent = player.id === match.player1_id ? p2 : p1;
                const sharedWin = isSharedWinMatch(match);
                const isWin = sharedWin || match.winner_id === player.id;
                const winner = sharedWin ? null : playerMap[match.winner_id];
                const playedSongs = match.played_songs || [];
                const totals = getScoreTotals(match);
                const matchScore = getMatchScore(match);
                const tone = getOutcomeTone({ sharedWin, isWin });

                return (
                  <article
                    key={match.id}
                    className={`relative overflow-hidden rounded-2xl border ${tone.panel} shadow-[0_14px_34px_rgba(0,0,0,0.22)]`}
                  >
                    <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
                    <div className="border-b border-white/8 px-3 py-3 pl-4 sm:px-4 sm:py-4 sm:pl-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <OutcomeBadge tone={tone} />
                            <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                              {getMatchLabel(match, phaseFormat, totalGauntletMatches)}
                            </span>
                            {matchScore && (
                              <span className="rounded-full border border-white/8 bg-black/25 px-2.5 py-1 font-mono text-[10px] font-black text-zinc-300">
                                {matchScore}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 flex min-w-0 items-center gap-2.5">
                            <PlayerAvatar player={opponent} />
                            <div className="min-w-0">
                              <p className="truncate font-display text-base font-black text-white">
                                vs {opponent?.name || 'Unknown'}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                Winner: <span className="text-zinc-300">{sharedWin ? 'Shared win' : winner?.name || 'No winner recorded'}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-white/8 bg-black/20 px-3 py-2 sm:text-right">
                          <p className="font-display text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600">Songs</p>
                          <p className="mt-1 font-mono text-lg font-black text-zinc-100">{playedSongs.length}</p>
                        </div>
                      </div>
                      <TotalScoreStrip p1={p1} p2={p2} totals={totals} winnerId={match.winner_id} sharedWin={sharedWin} />
                    </div>

                    {playedSongs.length > 0 ? (
                      <div className="divide-y divide-white/6">
                        {playedSongs.map((song, index) => (
                          <SongResultRow
                            key={`${match.id}-${index}`}
                            song={song}
                            index={index}
                            p1={p1}
                            p2={p2}
                            match={match}
                            playerMap={playerMap}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-4">
                        <div className="rounded-xl border border-white/8 bg-black/18 px-3 py-3">
                          <p className="text-sm text-zinc-500">No song details were saved for this match.</p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
