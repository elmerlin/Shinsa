function normalizeSnapshots(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getPlayerId(player) {
  return String(player?.player_id || player?.id || '').trim();
}

function snapshotPlayer(player, rank) {
  return {
    rank,
    player_id: getPlayerId(player),
    name: String(player?.name || 'Unknown').trim(),
    avatar: String(player?.avatar || '').trim(),
    nationality: String(player?.nationality || '').trim(),
    skill_title: String(player?.skill_title || '').trim(),
    pumbility: parseInt(player?.pumbility, 10) || 0,
    wins: parseInt(player?.wins, 10) || 0,
    losses: parseInt(player?.losses, 10) || 0,
    points: Number(player?.points) || 0,
    buchholz: Number(player?.buchholz) || 0,
    seed_rank: parseInt(player?.seed_rank ?? player?.seed, 10) || 0,
  };
}

function compareRoundRobinPlayers(a, b) {
  const pointDelta = (Number(b?.points) || 0) - (Number(a?.points) || 0);
  if (pointDelta !== 0) return pointDelta;

  const winDelta = (parseInt(b?.wins, 10) || 0) - (parseInt(a?.wins, 10) || 0);
  if (winDelta !== 0) return winDelta;

  const buchholzDelta = (Number(b?.buchholz) || 0) - (Number(a?.buchholz) || 0);
  if (buchholzDelta !== 0) return buchholzDelta;

  const pumbilityDelta = (parseInt(b?.pumbility, 10) || 0) - (parseInt(a?.pumbility, 10) || 0);
  if (pumbilityDelta !== 0) return pumbilityDelta;

  const seedDelta = (parseInt(a?.seed_rank ?? a?.seed, 10) || 0) - (parseInt(b?.seed_rank ?? b?.seed, 10) || 0);
  if (seedDelta !== 0) return seedDelta;

  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

export function computeRoundRobinPlacings(players = []) {
  return [...players]
    .filter((player) => getPlayerId(player))
    .sort(compareRoundRobinPlayers)
    .map((player, index) => snapshotPlayer(player, index + 1));
}

export function computeGauntletPlacings(players = [], matches = []) {
  const gauntletMatches = [...matches]
    .filter((match) => match?.match_type === 'gauntlet')
    .sort((a, b) => (parseInt(a?.gauntlet_order, 10) || 0) - (parseInt(b?.gauntlet_order, 10) || 0));

  if (gauntletMatches.length === 0) return [];
  if (gauntletMatches.some((match) => match?.status !== 'COMPLETED' || !match?.winner_id)) return [];

  const playerMap = new Map();
  players.forEach((player) => {
    const playerId = getPlayerId(player);
    if (playerId) playerMap.set(playerId, player);
  });

  const totalPlayers = [...new Set([
    ...players.map(getPlayerId).filter(Boolean),
    ...gauntletMatches.flatMap((match) => [match?.player1_id, match?.player2_id]).filter(Boolean),
  ])].length;

  const rankByPlayerId = new Map();
  gauntletMatches.forEach((match, index) => {
    const order = parseInt(match?.gauntlet_order, 10) || index + 1;
    const loserId = match?.player1_id === match?.winner_id ? match?.player2_id : match?.player1_id;
    if (loserId) rankByPlayerId.set(String(loserId), Math.max(2, totalPlayers - order + 1));
  });

  const finalMatch = gauntletMatches[gauntletMatches.length - 1];
  if (finalMatch?.winner_id) rankByPlayerId.set(String(finalMatch.winner_id), 1);

  return [...rankByPlayerId.entries()]
    .map(([playerId, rank]) => {
      const player = playerMap.get(playerId);
      return player ? snapshotPlayer(player, rank) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
}

export function getTournamentPlacings({ tournament, phases = [], players = [], matches = [] }) {
  const tournamentSnapshots = normalizeSnapshots(tournament?.placement_snapshots);
  const completedPhases = phases.filter((phase) => phase?.status === 'COMPLETED');
  const latestRoundRobinPhase = [...completedPhases].reverse().find((phase) => phase?.format === 'round_robin');
  const latestGauntletPhase = [...completedPhases].reverse().find((phase) => phase?.format === 'gauntlet');
  const latestCompletedPhase = completedPhases[completedPhases.length - 1] || null;

  const roundRobinPlacings = latestRoundRobinPhase
    ? (normalizeSnapshots(latestRoundRobinPhase.placement_snapshots).placings || [])
    : (tournamentSnapshots.round_robin || []);
  const gauntletPlacings = latestGauntletPhase
    ? (normalizeSnapshots(latestGauntletPhase.placement_snapshots).placings || [])
    : (tournamentSnapshots.gauntlet || []);
  const finalPlacings = latestCompletedPhase
    ? (normalizeSnapshots(latestCompletedPhase.placement_snapshots).placings || [])
    : (tournamentSnapshots.final || []);

  const fallbackRoundRobin = computeRoundRobinPlacings(players);
  const fallbackGauntlet = computeGauntletPlacings(players, matches);

  const resolvedRoundRobin = roundRobinPlacings.length > 0 ? roundRobinPlacings : fallbackRoundRobin;
  const resolvedGauntlet = gauntletPlacings.length > 0 ? gauntletPlacings : fallbackGauntlet;
  const resolvedFinal = finalPlacings.length > 0
    ? finalPlacings
    : (resolvedGauntlet.length > 0 ? resolvedGauntlet : resolvedRoundRobin);

  return {
    roundRobin: resolvedRoundRobin,
    gauntlet: resolvedGauntlet,
    final: resolvedFinal,
  };
}
