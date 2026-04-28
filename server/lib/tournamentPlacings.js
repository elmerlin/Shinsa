function parsePlacementSnapshots(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializePlacementSnapshots(value) {
  return JSON.stringify(value && typeof value === 'object' ? value : {});
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

function parseMatchScores(match) {
  const scores = match?.scores;
  if (scores && typeof scores === 'object') return scores;
  try {
    const parsed = JSON.parse(scores || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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

    const scores = parseMatchScores(match);
    if (scores.shared_win) {
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

function sortRoundRobinPlayers(players = [], matches = []) {
  const eligiblePlayers = [...players].filter((player) => getPlayerId(player));
  const recordGroups = new Map();

  eligiblePlayers.forEach((player) => {
    const key = `${toInt(player?.wins)}:${toInt(player?.losses)}`;
    if (!recordGroups.has(key)) recordGroups.set(key, []);
    recordGroups.get(key).push(player);
  });

  return [...recordGroups.values()]
    .sort((a, b) => compareRoundRobinRecord(a[0], b[0]))
    .flatMap((group) => sortRoundRobinTieGroup(group, matches));
}

function buildRoundRobinPlacings(players = [], matches = []) {
  const ordered = sortRoundRobinPlayers(players, matches);

  return ordered.map((player, index) => snapshotPlayer(player, index + 1));
}

function buildGauntletPlacings(players = [], matches = []) {
  const orderedMatches = [...matches]
    .filter((match) => match?.match_type === 'gauntlet')
    .sort((a, b) => (parseInt(a?.gauntlet_order, 10) || 0) - (parseInt(b?.gauntlet_order, 10) || 0));

  if (orderedMatches.length === 0) return [];
  if (orderedMatches.some((match) => match?.status !== 'COMPLETED' || !match?.winner_id)) return [];

  const playerMap = new Map();
  players.forEach((player) => {
    const playerId = getPlayerId(player);
    if (playerId) playerMap.set(playerId, player);
  });

  const totalPlayers = [...new Set([
    ...players.map(getPlayerId).filter(Boolean),
    ...orderedMatches.flatMap((match) => [match?.player1_id, match?.player2_id]).filter(Boolean),
  ])].length;

  if (totalPlayers === 0) return [];

  const rankByPlayerId = new Map();
  orderedMatches.forEach((match, index) => {
    const order = parseInt(match?.gauntlet_order, 10) || index + 1;
    const loserId = match?.player1_id === match?.winner_id ? match?.player2_id : match?.player1_id;
    if (loserId) rankByPlayerId.set(String(loserId), Math.max(2, totalPlayers - order + 1));
  });

  const finalMatch = orderedMatches[orderedMatches.length - 1];
  if (finalMatch?.winner_id) rankByPlayerId.set(String(finalMatch.winner_id), 1);

  return [...rankByPlayerId.entries()]
    .map(([playerId, rank]) => {
      const player = playerMap.get(playerId);
      return player ? snapshotPlayer(player, rank) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
}

function buildLegacyTournamentPlacementSnapshots({ players = [], matches = [] }) {
  const roundRobin = buildRoundRobinPlacings(players, matches);
  const gauntlet = buildGauntletPlacings(players, matches);
  return {
    round_robin: roundRobin,
    gauntlet,
    final: gauntlet.length > 0 ? gauntlet : roundRobin,
  };
}

function buildPhasePlacementSnapshots({ phase, phasePlayers = [], matches = [] }) {
  if (!phase) return {};
  if (phase.format === 'round_robin' || phase.format === 'pools') {
    return { placings: buildRoundRobinPlacings(phasePlayers, matches) };
  }
  if (phase.format === 'gauntlet') {
    return { placings: buildGauntletPlacings(phasePlayers, matches) };
  }
  return {};
}

function syncTournamentPlacementSnapshots(db, tournamentId) {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return { tournament: {}, phases: 0 };

  const players = db.prepare('SELECT * FROM players WHERE tournament_id = ? ORDER BY seed_rank ASC, pumbility DESC').all(tournamentId);
  const matches = db.prepare('SELECT * FROM matches WHERE tournament_id = ? ORDER BY round_number ASC, gauntlet_order ASC, created_at ASC').all(tournamentId);
  const phases = db.prepare('SELECT * FROM tournament_phases WHERE tournament_id = ? ORDER BY phase_order ASC').all(tournamentId);

  let phaseUpdates = 0;
  const phaseSnapshotMap = new Map();

  for (const phase of phases) {
    const phasePlayers = db.prepare(`
      SELECT pp.*, p.name, p.avatar, p.nationality, p.skill_title, p.pumbility, p.seed_rank
      FROM tournament_phase_players pp
      JOIN players p ON p.id = pp.player_id
      WHERE pp.phase_id = ?
      ORDER BY pp.seed ASC
    `).all(phase.id);
    const phaseMatches = matches.filter((match) => match.phase_id === phase.id);
    const snapshot = buildPhasePlacementSnapshots({ phase, phasePlayers, matches: phaseMatches });
    phaseSnapshotMap.set(phase.id, snapshot);
    db.prepare('UPDATE tournament_phases SET placement_snapshots = ? WHERE id = ?')
      .run(serializePlacementSnapshots(snapshot), phase.id);
    phaseUpdates += 1;
  }

  let tournamentSnapshots;
  if (phases.length > 0) {
    const completedPhases = phases.filter((phase) => phase.status === 'COMPLETED');
    const latestRoundRobin = [...completedPhases].reverse().find((phase) => phase.format === 'round_robin');
    const latestGauntlet = [...completedPhases].reverse().find((phase) => phase.format === 'gauntlet');
    const latestCompleted = completedPhases[completedPhases.length - 1] || null;

    const roundRobinPlacings = latestRoundRobin ? (phaseSnapshotMap.get(latestRoundRobin.id)?.placings || []) : [];
    const gauntletPlacings = latestGauntlet ? (phaseSnapshotMap.get(latestGauntlet.id)?.placings || []) : [];
    const finalPlacings = latestCompleted ? (phaseSnapshotMap.get(latestCompleted.id)?.placings || []) : [];

    tournamentSnapshots = {
      round_robin: roundRobinPlacings,
      gauntlet: gauntletPlacings,
      final: finalPlacings.length > 0
        ? finalPlacings
        : (gauntletPlacings.length > 0 ? gauntletPlacings : roundRobinPlacings),
    };
  } else {
    tournamentSnapshots = buildLegacyTournamentPlacementSnapshots({ players, matches });
  }

  db.prepare('UPDATE tournaments SET placement_snapshots = ? WHERE id = ?')
    .run(serializePlacementSnapshots(tournamentSnapshots), tournamentId);

  return { tournament: tournamentSnapshots, phases: phaseUpdates };
}

module.exports = {
  parsePlacementSnapshots,
  serializePlacementSnapshots,
  sortRoundRobinPlayers,
  buildRoundRobinPlacings,
  buildGauntletPlacings,
  buildLegacyTournamentPlacementSnapshots,
  buildPhasePlacementSnapshots,
  syncTournamentPlacementSnapshots,
};
