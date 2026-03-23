'use strict';

/**
 * Pure utility functions for generating tournament brackets.
 */

function nextPowerOf2(n) {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Returns standard bracket seed position.
 * For a bracket of totalSlots (must be power of 2), returns the opponent seed
 * for a given position using the standard 1v16, 8v9, 5v12, 4v13 pattern.
 */
function getStandardBracketSeed(position, totalSlots) {
  // Build the full seeding array for first round using recursive splitting
  const seeds = buildBracketSeeds(totalSlots);
  return seeds[position] || 0;
}

/**
 * Builds the standard bracket seeding order for a given bracket size.
 * E.g. for 8: [1,8,5,4,3,6,7,2] -> pairs: (1v8), (5v4), (3v6), (7v2)
 */
function buildBracketSeeds(size) {
  if (size === 1) return [1];
  if (size === 2) return [1, 2];

  const half = size / 2;
  const prev = buildBracketSeeds(half);
  const result = [];
  for (let i = 0; i < half; i++) {
    result.push(prev[i]);
    result.push(size + 1 - prev[i]);
  }
  return result;
}

/**
 * Generates a single-elimination bracket.
 * @param {Array} players - Seeded array of players (index 0 = seed 1)
 * @param {Object} config - { difficulty_min, difficulty_max }
 * @returns {Array} Array of match objects
 */
function generateSingleElimBracket(players, config = {}) {
  const playerCount = players.length;
  if (playerCount < 2) return [];

  const totalSlots = nextPowerOf2(playerCount);
  const totalRounds = Math.ceil(Math.log2(playerCount));
  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  // Build first round seeding
  const seeds = buildBracketSeeds(totalSlots);

  // Create first round matches
  const matches = [];
  const firstRoundMatchCount = totalSlots / 2;

  for (let i = 0; i < firstRoundMatchCount; i++) {
    const seed1 = seeds[i * 2];
    const seed2 = seeds[i * 2 + 1];
    const p1 = seed1 <= playerCount ? players[seed1 - 1] : null;
    const p2 = seed2 <= playerCount ? players[seed2 - 1] : null;

    const isBye = !p1 || !p2;

    matches.push({
      player1_id: p1 ? p1.id || p1.player_id : null,
      player2_id: p2 ? p2.id || p2.player_id : null,
      bracket_round: 1,
      bracket_position: i,
      difficulty_min: diffMin,
      difficulty_max: diffMax,
      status: isBye ? 'BYE' : 'PENDING',
    });
  }

  // Create subsequent round placeholder matches
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = totalSlots / Math.pow(2, round);
    for (let pos = 0; pos < matchesInRound; pos++) {
      matches.push({
        player1_id: null,
        player2_id: null,
        bracket_round: round,
        bracket_position: pos,
        difficulty_min: diffMin,
        difficulty_max: diffMax,
        status: 'WAITING',
      });
    }
  }

  return matches;
}

/**
 * Generates a double-elimination bracket.
 * @param {Array} players - Seeded array of players
 * @param {Object} config - { difficulty_min, difficulty_max, grand_final_reset }
 * @returns {{ winners: Array, losers: Array, grandFinal: Object, resetMatch: Object|null }}
 */
function generateDoubleElimBracket(players, config = {}) {
  const playerCount = players.length;
  if (playerCount < 2) return { winners: [], losers: [], grandFinal: null, resetMatch: null };

  const diffMin = config.difficulty_min || 18;
  const diffMax = config.difficulty_max || 19;

  // Generate winners bracket (same as single elim)
  const winnersMatches = generateSingleElimBracket(players, config);
  winnersMatches.forEach(m => { m.bracket = 'winners'; });

  const totalSlots = nextPowerOf2(playerCount);
  const winnersRounds = Math.ceil(Math.log2(playerCount));

  // Losers bracket: for each winners round (except the last), losers drop down.
  // Losers bracket has approximately 2 * (winnersRounds - 1) rounds.
  // Each "pair" of losers rounds: one round absorbs dropdowns from winners, next is internal.
  const losersMatches = [];
  let losersRound = 0;

  for (let wRound = 1; wRound < winnersRounds; wRound++) {
    const droppedCount = totalSlots / Math.pow(2, wRound);

    // Round A: losers from winners round wRound face losers bracket survivors
    losersRound++;
    const matchesInRoundA = Math.ceil(droppedCount / 2);
    for (let pos = 0; pos < matchesInRoundA; pos++) {
      losersMatches.push({
        player1_id: null,
        player2_id: null,
        bracket: 'losers',
        bracket_round: losersRound,
        bracket_position: pos,
        difficulty_min: diffMin,
        difficulty_max: diffMax,
        status: 'WAITING',
      });
    }

    // Round B: internal losers bracket round (survivors play each other)
    if (matchesInRoundA > 1) {
      losersRound++;
      const matchesInRoundB = Math.ceil(matchesInRoundA / 2);
      for (let pos = 0; pos < matchesInRoundB; pos++) {
        losersMatches.push({
          player1_id: null,
          player2_id: null,
          bracket: 'losers',
          bracket_round: losersRound,
          bracket_position: pos,
          difficulty_min: diffMin,
          difficulty_max: diffMax,
          status: 'WAITING',
        });
      }
    }
  }

  // Grand final
  const grandFinal = {
    player1_id: null,
    player2_id: null,
    bracket: 'grand_final',
    bracket_round: 1,
    bracket_position: 0,
    difficulty_min: diffMin,
    difficulty_max: diffMax,
    status: 'WAITING',
  };

  // Optional reset match
  let resetMatch = null;
  if (config.grand_final_reset) {
    resetMatch = {
      player1_id: null,
      player2_id: null,
      bracket: 'grand_final',
      bracket_round: 2,
      bracket_position: 0,
      difficulty_min: diffMin,
      difficulty_max: diffMax,
      status: 'WAITING',
    };
  }

  return { winners: winnersMatches, losers: losersMatches, grandFinal, resetMatch };
}

/**
 * Snake-draft players into pools.
 * E.g. 8 players, 2 pools -> Pool 0: seeds 1,4,5,8; Pool 1: seeds 2,3,6,7
 * @param {Array} players - Seeded array of players
 * @param {number} poolCount - Number of pools
 * @returns {Array<{ pool_id: number, players: Array }>}
 */
function generatePoolAssignments(players, poolCount) {
  if (poolCount < 1) poolCount = 1;
  const pools = [];
  for (let i = 0; i < poolCount; i++) {
    pools.push({ pool_id: i, players: [] });
  }

  let direction = 1; // 1 = forward, -1 = backward
  let poolIdx = 0;

  for (let i = 0; i < players.length; i++) {
    pools[poolIdx].players.push(players[i]);

    // Snake: reverse direction at edges
    const nextIdx = poolIdx + direction;
    if (nextIdx >= poolCount || nextIdx < 0) {
      direction *= -1;
    } else {
      poolIdx = nextIdx;
    }
  }

  return pools;
}

/**
 * Advances winner of a bracket match to the next round.
 * Used after a bracket match result is recorded.
 * @param {Object} db - Database instance
 * @param {Object} completedMatch - The completed match
 * @param {string} winnerId - Winner's player ID
 * @param {string} loserId - Loser's player ID
 */
function advanceWinner(db, completedMatch, winnerId, loserId) {
  if (!completedMatch.bracket || !completedMatch.phase_id) return;

  const phaseId = completedMatch.phase_id;
  const bracket = completedMatch.bracket;
  const round = completedMatch.bracket_round;
  const pos = completedMatch.bracket_position;

  if (bracket === 'winners' || bracket === 'losers') {
    // Find next match in same bracket
    const nextRound = round + 1;
    const nextPos = Math.floor(pos / 2);
    const slot = pos % 2 === 0 ? 'player1_id' : 'player2_id';

    const nextMatch = db.prepare(
      'SELECT * FROM matches WHERE phase_id = ? AND bracket = ? AND bracket_round = ? AND bracket_position = ?'
    ).get(phaseId, bracket, nextRound, nextPos);

    if (nextMatch) {
      db.prepare(`UPDATE matches SET ${slot} = ?, status = CASE WHEN status = 'WAITING' AND ${slot === 'player1_id' ? 'player2_id' : 'player1_id'} IS NOT NULL THEN 'PENDING' ELSE status END WHERE id = ?`)
        .run(winnerId, nextMatch.id);

      // If both players are now set and status is still WAITING, make it PENDING
      const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(nextMatch.id);
      if (updated.player1_id && updated.player2_id && updated.status === 'WAITING') {
        db.prepare("UPDATE matches SET status = 'PENDING' WHERE id = ?").run(nextMatch.id);
      }
    }

    // For winners bracket: also drop loser to losers bracket
    if (bracket === 'winners' && loserId) {
      // Find the corresponding losers bracket match that receives this round's losers
      // Losers bracket round mapping: winners round N losers go to losers round (2*N - 1)
      const losersTargetRound = 2 * round - 1;
      const losersPos = Math.floor(pos / 2);
      const losersSlot = pos % 2 === 0 ? 'player1_id' : 'player2_id';

      const losersMatch = db.prepare(
        'SELECT * FROM matches WHERE phase_id = ? AND bracket = ? AND bracket_round = ? AND bracket_position = ?'
      ).get(phaseId, 'losers', losersTargetRound, losersPos);

      if (losersMatch) {
        db.prepare(`UPDATE matches SET ${losersSlot} = ? WHERE id = ?`)
          .run(loserId, losersMatch.id);

        const updatedLosers = db.prepare('SELECT * FROM matches WHERE id = ?').get(losersMatch.id);
        if (updatedLosers.player1_id && updatedLosers.player2_id && updatedLosers.status === 'WAITING') {
          db.prepare("UPDATE matches SET status = 'PENDING' WHERE id = ?").run(updatedLosers.id);
        }
      }
    }

    // Check if this is the final match of winners/losers bracket -> advance to grand final
    const remainingInBracket = db.prepare(
      "SELECT COUNT(*) as cnt FROM matches WHERE phase_id = ? AND bracket = ? AND bracket_round = ? AND status != 'COMPLETED' AND status != 'BYE'"
    ).get(phaseId, bracket, round);

    // Check if winner just won the final round of their bracket
    const higherRoundExists = db.prepare(
      'SELECT COUNT(*) as cnt FROM matches WHERE phase_id = ? AND bracket = ? AND bracket_round > ?'
    ).get(phaseId, bracket, round);

    if (higherRoundExists.cnt === 0) {
      // This was the final round of this bracket - advance to grand final
      const gfSlot = bracket === 'winners' ? 'player1_id' : 'player2_id';
      const grandFinal = db.prepare(
        "SELECT * FROM matches WHERE phase_id = ? AND bracket = 'grand_final' AND bracket_round = 1"
      ).get(phaseId);

      if (grandFinal) {
        db.prepare(`UPDATE matches SET ${gfSlot} = ? WHERE id = ?`)
          .run(winnerId, grandFinal.id);

        const updatedGF = db.prepare('SELECT * FROM matches WHERE id = ?').get(grandFinal.id);
        if (updatedGF.player1_id && updatedGF.player2_id && updatedGF.status === 'WAITING') {
          db.prepare("UPDATE matches SET status = 'PENDING' WHERE id = ?").run(updatedGF.id);
        }
      }
    }
  }

  if (bracket === 'grand_final' && round === 1) {
    // Check if there's a reset match and loser came from winners bracket
    const resetMatch = db.prepare(
      "SELECT * FROM matches WHERE phase_id = ? AND bracket = 'grand_final' AND bracket_round = 2"
    ).get(phaseId);

    if (resetMatch && loserId) {
      // The losers bracket champion beat the winners bracket champion - play reset
      // We need to check which player came from winners bracket
      // Winners bracket champion is player1_id in grand final
      if (winnerId === completedMatch.player2_id) {
        // Losers bracket champion won -> reset match needed
        db.prepare("UPDATE matches SET player1_id = ?, player2_id = ?, status = 'PENDING' WHERE id = ?")
          .run(winnerId, loserId, resetMatch.id);
      }
      // If winners bracket champion won, no reset needed
    }
  }
}

/**
 * Processes BYE matches in a bracket: auto-advances the present player.
 * Call after generating bracket matches.
 * @param {Object} db - Database instance
 * @param {string} phaseId - Phase ID
 */
function processByes(db, phaseId) {
  const byeMatches = db.prepare(
    "SELECT * FROM matches WHERE phase_id = ? AND status = 'BYE'"
  ).all(phaseId);

  for (const match of byeMatches) {
    const winnerId = match.player1_id || match.player2_id;
    if (winnerId) {
      db.prepare("UPDATE matches SET winner_id = ?, status = 'COMPLETED' WHERE id = ?")
        .run(winnerId, match.id);
      advanceWinner(db, match, winnerId, null);
    }
  }
}

module.exports = {
  generateSingleElimBracket,
  generateDoubleElimBracket,
  generatePoolAssignments,
  getStandardBracketSeed,
  nextPowerOf2,
  advanceWinner,
  processByes,
  buildBracketSeeds,
};
