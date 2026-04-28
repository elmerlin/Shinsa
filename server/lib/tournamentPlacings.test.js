const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRoundRobinPlacings,
  buildGauntletPlacings,
  buildLegacyTournamentPlacementSnapshots,
} = require('./tournamentPlacings');

describe('buildRoundRobinPlacings', () => {
  it('sorts by record, then head-to-head, then lowest pumbility', () => {
    const players = [
      { id: 'p1', name: 'Alpha', points: 2, wins: 2, losses: 1, pumbility: 900, seed_rank: 1 },
      { id: 'p2', name: 'Bravo', points: 2, wins: 2, losses: 1, pumbility: 1500, seed_rank: 2 },
      { id: 'p3', name: 'Charlie', points: 1, wins: 1, losses: 2, pumbility: 700, seed_rank: 3 },
    ];
    const matches = [
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p1', player2_id: 'p2', winner_id: 'p2', scores: {} },
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p1', player2_id: 'p3', winner_id: 'p1', scores: {} },
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p2', player2_id: 'p3', winner_id: 'p2', scores: {} },
    ];

    const placings = buildRoundRobinPlacings(players, matches);

    assert.deepEqual(
      placings.map((entry) => [entry.rank, entry.player_id, entry.name]),
      [
        [1, 'p2', 'Bravo'],
        [2, 'p1', 'Alpha'],
        [3, 'p3', 'Charlie'],
      ]
    );
  });

  it('uses lower pumbility when tied head-to-head records are equal', () => {
    const players = [
      { id: 'p1', name: 'Alpha', wins: 1, losses: 1, pumbility: 1300, seed_rank: 1 },
      { id: 'p2', name: 'Bravo', wins: 1, losses: 1, pumbility: 900, seed_rank: 2 },
      { id: 'p3', name: 'Charlie', wins: 1, losses: 1, pumbility: 1100, seed_rank: 3 },
    ];
    const matches = [
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p1', player2_id: 'p2', winner_id: 'p1', scores: {} },
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p2', player2_id: 'p3', winner_id: 'p2', scores: {} },
      { status: 'COMPLETED', match_type: 'round_robin', player1_id: 'p3', player2_id: 'p1', winner_id: 'p3', scores: {} },
    ];

    const placings = buildRoundRobinPlacings(players, matches);

    assert.deepEqual(
      placings.map((entry) => entry.player_id),
      ['p2', 'p3', 'p1']
    );
  });
});

describe('buildGauntletPlacings', () => {
  it('builds full final placings from gauntlet losers and champion', () => {
    const players = [
      { id: 'p1', name: 'Top Seed' },
      { id: 'p2', name: 'Second Seed' },
      { id: 'p3', name: 'Third Seed' },
      { id: 'p4', name: 'Bottom Seed' },
    ];
    const matches = [
      { match_type: 'gauntlet', gauntlet_order: 1, status: 'COMPLETED', player1_id: 'p3', player2_id: 'p4', winner_id: 'p3' },
      { match_type: 'gauntlet', gauntlet_order: 2, status: 'COMPLETED', player1_id: 'p2', player2_id: 'p3', winner_id: 'p2' },
      { match_type: 'gauntlet', gauntlet_order: 3, status: 'COMPLETED', player1_id: 'p1', player2_id: 'p2', winner_id: 'p1' },
    ];

    const placings = buildGauntletPlacings(players, matches);

    assert.deepEqual(
      placings.map((entry) => [entry.rank, entry.player_id, entry.name]),
      [
        [1, 'p1', 'Top Seed'],
        [2, 'p2', 'Second Seed'],
        [3, 'p3', 'Third Seed'],
        [4, 'p4', 'Bottom Seed'],
      ]
    );
  });

  it('returns an empty list until the gauntlet is fully completed', () => {
    const placings = buildGauntletPlacings(
      [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Bravo' }],
      [{ match_type: 'gauntlet', gauntlet_order: 1, status: 'PENDING', player1_id: 'p1', player2_id: 'p2', winner_id: null }]
    );

    assert.deepEqual(placings, []);
  });
});

describe('buildLegacyTournamentPlacementSnapshots', () => {
  it('uses gauntlet placings as the final result when a gauntlet was played', () => {
    const players = [
      { id: 'p1', name: 'Alpha', wins: 3, losses: 0, points: 3, buchholz: 6, pumbility: 1200 },
      { id: 'p2', name: 'Bravo', wins: 2, losses: 1, points: 2, buchholz: 5, pumbility: 1100 },
      { id: 'p3', name: 'Charlie', wins: 1, losses: 2, points: 1, buchholz: 4, pumbility: 1000 },
    ];
    const matches = [
      { match_type: 'gauntlet', gauntlet_order: 1, status: 'COMPLETED', player1_id: 'p2', player2_id: 'p3', winner_id: 'p2' },
      { match_type: 'gauntlet', gauntlet_order: 2, status: 'COMPLETED', player1_id: 'p1', player2_id: 'p2', winner_id: 'p1' },
    ];

    const snapshots = buildLegacyTournamentPlacementSnapshots({ players, matches });

    assert.equal(snapshots.round_robin[0].player_id, 'p1');
    assert.equal(snapshots.gauntlet[0].player_id, 'p1');
    assert.deepEqual(snapshots.final, snapshots.gauntlet);
  });
});
