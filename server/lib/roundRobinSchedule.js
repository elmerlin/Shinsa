'use strict';

function getPlayerId(player) {
  return player?.player_id || player?.id || null;
}

function buildRoundRobinPairings(players = []) {
  const pairings = [];
  for (let i = 0; i < players.length; i += 1) {
    const player1Id = getPlayerId(players[i]);
    if (!player1Id) continue;

    for (let j = i + 1; j < players.length; j += 1) {
      const player2Id = getPlayerId(players[j]);
      if (!player2Id) continue;

      pairings.push({
        player1_id: player1Id,
        player2_id: player2Id,
        seed_a: i + 1,
        seed_b: j + 1,
      });
    }
  }
  return pairings;
}

function getMatchPlayerIds(match) {
  return [match?.player1_id, match?.player2_id].filter(Boolean);
}

function sharesPlayers(match, playerIds) {
  if (!playerIds || playerIds.size === 0) return false;
  return getMatchPlayerIds(match).some((playerId) => playerIds.has(playerId));
}

function getCountSpread(match, playedCounts, allPlayerIds) {
  const nextCounts = allPlayerIds.map((playerId) => {
    const current = playedCounts.get(playerId) || 0;
    return match.player1_id === playerId || match.player2_id === playerId
      ? current + 1
      : current;
  });
  return Math.max(...nextCounts) - Math.min(...nextCounts);
}

function getCurrentCountLoad(match, playedCounts) {
  return getMatchPlayerIds(match)
    .map((playerId) => playedCounts.get(playerId) || 0)
    .reduce((sum, count) => sum + count, 0);
}

function getRestStats(match, lastPlayedAt, matchIndex, playerCount) {
  const rests = getMatchPlayerIds(match).map((playerId) => {
    const lastPlayed = lastPlayedAt.get(playerId);
    if (!Number.isFinite(lastPlayed)) return matchIndex + playerCount;
    return matchIndex - lastPlayed - 1;
  });

  return {
    minRest: Math.min(...rests),
    totalRest: rests.reduce((sum, rest) => sum + rest, 0),
  };
}

function compareNumbersAsc(a, b) {
  return a - b;
}

function compareNumbersDesc(a, b) {
  return b - a;
}

function compareMatches(a, b, context) {
  const {
    playedCounts,
    lastPlayedAt,
    allPlayerIds,
    matchIndex,
  } = context;

  const spreadDiff = compareNumbersAsc(
    getCountSpread(a, playedCounts, allPlayerIds),
    getCountSpread(b, playedCounts, allPlayerIds)
  );
  if (spreadDiff !== 0) return spreadDiff;

  const loadDiff = compareNumbersAsc(
    getCurrentCountLoad(a, playedCounts),
    getCurrentCountLoad(b, playedCounts)
  );
  if (loadDiff !== 0) return loadDiff;

  const aRest = getRestStats(a, lastPlayedAt, matchIndex, allPlayerIds.length);
  const bRest = getRestStats(b, lastPlayedAt, matchIndex, allPlayerIds.length);

  const minRestDiff = compareNumbersDesc(aRest.minRest, bRest.minRest);
  if (minRestDiff !== 0) return minRestDiff;

  const totalRestDiff = compareNumbersDesc(aRest.totalRest, bRest.totalRest);
  if (totalRestDiff !== 0) return totalRestDiff;

  const seedDiff = compareNumbersAsc(
    (a.seed_a + a.seed_b),
    (b.seed_a + b.seed_b)
  );
  if (seedDiff !== 0) return seedDiff;

  const firstSeedDiff = compareNumbersAsc(a.seed_a, b.seed_a);
  if (firstSeedDiff !== 0) return firstSeedDiff;

  return compareNumbersAsc(a.seed_b, b.seed_b);
}

function scheduleRoundRobinMatches(players = []) {
  const allPlayerIds = players
    .map((player) => getPlayerId(player))
    .filter(Boolean);

  const playedCounts = new Map(allPlayerIds.map((playerId) => [playerId, 0]));
  const lastPlayedAt = new Map();
  const remaining = buildRoundRobinPairings(players);
  const schedule = [];
  let previousPlayers = new Set();

  while (remaining.length > 0) {
    const matchIndex = schedule.length;
    const context = { playedCounts, lastPlayedAt, allPlayerIds, matchIndex };
    const nonConsecutive = remaining.filter((match) => !sharesPlayers(match, previousPlayers));
    const candidates = nonConsecutive.length > 0 ? nonConsecutive : remaining;
    const chosen = [...candidates].sort((a, b) => compareMatches(a, b, context))[0];
    const chosenIndex = remaining.findIndex((match) =>
      match.player1_id === chosen.player1_id && match.player2_id === chosen.player2_id
    );

    remaining.splice(chosenIndex, 1);

    const scheduledMatch = {
      player1_id: chosen.player1_id,
      player2_id: chosen.player2_id,
      schedule_order: matchIndex + 1,
    };
    schedule.push(scheduledMatch);

    previousPlayers = new Set(getMatchPlayerIds(chosen));
    for (const playerId of previousPlayers) {
      playedCounts.set(playerId, (playedCounts.get(playerId) || 0) + 1);
      lastPlayedAt.set(playerId, matchIndex);
    }
  }

  return schedule;
}

module.exports = {
  buildRoundRobinPairings,
  scheduleRoundRobinMatches,
};
