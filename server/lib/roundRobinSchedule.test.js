'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRoundRobinPairings,
  scheduleRoundRobinMatches,
} = require('./roundRobinSchedule');

function makePlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    seed_rank: index + 1,
  }));
}

function countConsecutiveOverlaps(matches = []) {
  let overlaps = 0;
  for (let i = 1; i < matches.length; i += 1) {
    const previous = new Set([matches[i - 1].player1_id, matches[i - 1].player2_id]);
    if (previous.has(matches[i].player1_id) || previous.has(matches[i].player2_id)) {
      overlaps += 1;
    }
  }
  return overlaps;
}

function maxSpreadDuringSchedule(players, schedule) {
  const playedCounts = new Map(players.map((player) => [player.id, 0]));
  let maxSpread = 0;

  for (const match of schedule) {
    playedCounts.set(match.player1_id, (playedCounts.get(match.player1_id) || 0) + 1);
    playedCounts.set(match.player2_id, (playedCounts.get(match.player2_id) || 0) + 1);
    const counts = players.map((player) => playedCounts.get(player.id) || 0);
    maxSpread = Math.max(maxSpread, Math.max(...counts) - Math.min(...counts));
  }

  return maxSpread;
}

test('buildRoundRobinPairings returns every unique pairing once', () => {
  const players = makePlayers(4);
  const pairings = buildRoundRobinPairings(players);

  assert.equal(pairings.length, 6);
  assert.deepEqual(
    pairings.map((match) => `${match.player1_id}-${match.player2_id}`),
    ['p1-p2', 'p1-p3', 'p1-p4', 'p2-p3', 'p2-p4', 'p3-p4']
  );
});

test('scheduleRoundRobinMatches keeps play counts tightly balanced throughout the schedule', () => {
  const players = makePlayers(6);
  const schedule = scheduleRoundRobinMatches(players);
  const openingWindow = schedule.slice(0, 3);
  const openingPlayers = new Set(openingWindow.flatMap((match) => [match.player1_id, match.player2_id]));

  assert.equal(schedule.length, 15);
  assert.equal(maxSpreadDuringSchedule(players, schedule), 2);
  assert.equal(openingPlayers.size, 6);
  assert.deepEqual(
    schedule.map((match) => match.schedule_order),
    Array.from({ length: 15 }, (_, index) => index + 1)
  );
});

test('scheduleRoundRobinMatches reduces consecutive appearances compared with naive ordering', () => {
  const players = makePlayers(6);
  const naive = buildRoundRobinPairings(players).map((match, index) => ({
    ...match,
    schedule_order: index + 1,
  }));
  const optimized = scheduleRoundRobinMatches(players);

  assert.ok(countConsecutiveOverlaps(optimized) < countConsecutiveOverlaps(naive));
});
