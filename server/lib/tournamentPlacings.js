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

function buildRoundRobinPlacings(players = []) {
  const ordered = [...players]
    .filter((player) => getPlayerId(player))
    .sort(compareRoundRobinPlayers);

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
  const roundRobin = buildRoundRobinPlacings(players);
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
    return { placings: buildRoundRobinPlacings(phasePlayers) };
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
  buildRoundRobinPlacings,
  buildGauntletPlacings,
  buildLegacyTournamentPlacementSnapshots,
  buildPhasePlacementSnapshots,
  syncTournamentPlacementSnapshots,
};
