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

function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRoundRobinTieBreakerMatch(match) {
  if (!match || match.status !== 'COMPLETED') return false;
  if (!match.player1_id || !match.player2_id) return false;
  if (match.match_type === 'gauntlet' || match.match_type === 'hour_of_power') return false;
  if (match.bracket) return false;
  return true;
}

function snapshotPlayer(player, rank) {
  return {
    rank,
    player_id: getPlayerId(player),
    name: String(player?.name || 'Unknown').trim(),
    avatar: String(player?.avatar || '').trim(),
    nationality: String(player?.nationality || '').trim(),
    skill_title: String(player?.skill_title || '').trim(),
    pumbility: toInt(player?.pumbility),
    wins: toInt(player?.wins),
    losses: toInt(player?.losses),
    points: toNumber(player?.points),
    buchholz: toNumber(player?.buchholz),
    seed_rank: toInt(player?.seed_rank ?? player?.seed),
  };
}

function compareRoundRobinRecord(a, b) {
  const winDelta = toInt(b?.wins) - toInt(a?.wins);
  if (winDelta !== 0) return winDelta;

  const lossDelta = toInt(a?.losses) - toInt(b?.losses);
  if (lossDelta !== 0) return lossDelta;

  return 0;
}

function compareRoundRobinFallback(a, b) {
  const pumbilityDelta = toInt(a?.pumbility) - toInt(b?.pumbility);
  if (pumbilityDelta !== 0) return pumbilityDelta;

  const seedDelta = toInt(a?.seed_rank ?? a?.seed) - toInt(b?.seed_rank ?? b?.seed);
  if (seedDelta !== 0) return seedDelta;

  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function buildHeadToHeadStats(tiedPlayers, matches = []) {
  const tiedIds = new Set(tiedPlayers.map(getPlayerId).filter(Boolean));
  const stats = new Map();
  tiedIds.forEach((id) => {
    stats.set(id, { wins: 0, losses: 0 });
  });

  for (const match of matches) {
    if (!isRoundRobinTieBreakerMatch(match)) continue;
    const p1Id = String(match.player1_id || '');
    const p2Id = String(match.player2_id || '');
    if (!tiedIds.has(p1Id) || !tiedIds.has(p2Id)) continue;

    if (match.scores?.shared_win) {
      stats.get(p1Id).wins += 1;
      stats.get(p2Id).wins += 1;
      continue;
    }

    const winnerId = String(match.winner_id || '');
    if (!tiedIds.has(winnerId)) continue;

    const loserId = winnerId === p1Id ? p2Id : p1Id;
    stats.get(winnerId).wins += 1;
    stats.get(loserId).losses += 1;
  }

  return stats;
}

function sortRoundRobinTieGroup(group, matches = []) {
  if (group.length <= 1) return group;
  const h2hStats = buildHeadToHeadStats(group, matches);

  return [...group].sort((a, b) => {
    const aStats = h2hStats.get(getPlayerId(a)) || { wins: 0, losses: 0 };
    const bStats = h2hStats.get(getPlayerId(b)) || { wins: 0, losses: 0 };

    const h2hWinDelta = bStats.wins - aStats.wins;
    if (h2hWinDelta !== 0) return h2hWinDelta;

    const h2hLossDelta = aStats.losses - bStats.losses;
    if (h2hLossDelta !== 0) return h2hLossDelta;

    return compareRoundRobinFallback(a, b);
  });
}

export function sortRoundRobinPlayers(players = [], matches = []) {
  const recordGroups = new Map();
  [...players]
    .filter((player) => getPlayerId(player))
    .forEach((player) => {
      const key = `${toInt(player?.wins)}:${toInt(player?.losses)}`;
      if (!recordGroups.has(key)) recordGroups.set(key, []);
      recordGroups.get(key).push(player);
    });

  return [...recordGroups.values()]
    .sort((a, b) => compareRoundRobinRecord(a[0], b[0]))
    .flatMap((group) => sortRoundRobinTieGroup(group, matches));
}

export function computeRoundRobinPlacings(players = [], matches = []) {
  return sortRoundRobinPlayers(players, matches)
    .map((player, index) => snapshotPlayer(player, index + 1));
}

function rerankRoundRobinPlacings(entries = [], matches = []) {
  return sortRoundRobinPlayers(entries, matches)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
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

  const roundRobinMatches = latestRoundRobinPhase
    ? matches.filter((match) => match?.phase_id === latestRoundRobinPhase.id)
    : matches;
  const finalMatches = latestCompletedPhase
    ? matches.filter((match) => match?.phase_id === latestCompletedPhase.id)
    : matches;

  const fallbackRoundRobin = computeRoundRobinPlacings(players, roundRobinMatches);
  const fallbackGauntlet = computeGauntletPlacings(players, matches);

  const resolvedRoundRobin = roundRobinPlacings.length > 0
    ? rerankRoundRobinPlacings(roundRobinPlacings, roundRobinMatches)
    : fallbackRoundRobin;
  const resolvedGauntlet = gauntletPlacings.length > 0 ? gauntletPlacings : fallbackGauntlet;
  const finalIsRoundRobin = latestCompletedPhase
    ? (latestCompletedPhase.format === 'round_robin' || latestCompletedPhase.format === 'pools')
    : resolvedGauntlet.length === 0;
  const resolvedFinal = finalPlacings.length > 0
    ? (finalIsRoundRobin ? rerankRoundRobinPlacings(finalPlacings, finalMatches) : finalPlacings)
    : (resolvedGauntlet.length > 0 ? resolvedGauntlet : resolvedRoundRobin);

  return {
    roundRobin: resolvedRoundRobin,
    gauntlet: resolvedGauntlet,
    final: resolvedFinal,
  };
}
