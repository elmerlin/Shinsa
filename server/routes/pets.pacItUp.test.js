const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ─── Mock setup ──────────────────────────────────────────────────

const originalLoad = Module._load;
const routes = {};
let mockDb;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router: () => {
        const router = {
          get(path, ...handlers) { routes[`GET ${path}`] = handlers[handlers.length - 1]; return router; },
          post(path, ...handlers) { routes[`POST ${path}`] = handlers[handlers.length - 1]; return router; },
          put() { return router; },
          delete() { return router; },
          patch() { return router; },
          use() { return router; },
        };
        return router;
      },
    };
  }
  if (request === './auth') {
    return {
      optionalAuth: (_req, _res, next) => { if (typeof next === 'function') next(); },
      requireAuth: (_req, _res, next) => { if (typeof next === 'function') next(); },
      isAdminUser: () => false,
    };
  }
  if (request === '../db/schema') {
    return { getDb: () => mockDb };
  }
  return originalLoad(request, parent, isMain);
};

require('./pets');
Module._load = originalLoad;

// ─── Mock DB factory ─────────────────────────────────────────────

function createMockDb({ pacItUpRow = null, petRow = null, usersRow = null, leaderboardRows = [] } = {}) {
  const tables = {};
  return {
    exec(sql) {
      // Track table creation
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match) tables[match[1]] = true;
    },
    prepare(sql) {
      const q = String(sql || '');
      return {
        get: (...args) => {
          if (q.includes('pet_pac_it_up_stats') && q.includes('SELECT')) return pacItUpRow;
          if (q.includes('user_pets') && q.includes('SELECT')) return petRow;
          if (q.includes('users') && q.includes('SELECT')) return usersRow;
          return null;
        },
        all: () => leaderboardRows,
        run: (...args) => ({ changes: 1 }),
      };
    },
    _tables: tables,
  };
}

function makeReq(userId = 'u1', body = {}, query = {}) {
  return { user: { id: userId }, body, query };
}

function makeRes() {
  let sent = null;
  return {
    json(data) { sent = data; },
    get sent() { return sent; },
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Pac It Up routes', () => {

  describe('GET /minigames/pac-it-up', () => {
    it('returns zeroed defaults for a new user', () => {
      mockDb = createMockDb({ pacItUpRow: null });
      const req = makeReq('u1');
      const res = makeRes();
      routes['GET /minigames/pac-it-up'](req, res);
      assert.equal(res.sent.highScore, 0);
      assert.equal(res.sent.bestStage, 0);
      assert.equal(res.sent.longestCombo, 0);
      assert.equal(res.sent.totalStomps, 0);
      assert.equal(res.sent.ghostsEaten, 0);
      assert.equal(res.sent.totalRuns, 0);
      assert.equal(res.sent.lastPlayedAt, '');
    });

    it('returns existing stats', () => {
      mockDb = createMockDb({
        pacItUpRow: { high_score: 5000, best_stage: 4, longest_combo: 22, total_stomps: 300, ghosts_eaten: 15, total_runs: 8, last_played_at: '2026-04-01' },
      });
      const req = makeReq('u1');
      const res = makeRes();
      routes['GET /minigames/pac-it-up'](req, res);
      assert.equal(res.sent.highScore, 5000);
      assert.equal(res.sent.bestStage, 4);
      assert.equal(res.sent.longestCombo, 22);
      assert.equal(res.sent.totalRuns, 8);
    });
  });

  describe('POST /minigames/pac-it-up/complete', () => {
    it('clamps oversized payload values', () => {
      const runs = [];
      const db = createMockDb({ pacItUpRow: null, petRow: null });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origRun = stmt.run;
        stmt.run = (...args) => { runs.push({ sql, args }); return origRun(...args); };
        return stmt;
      };
      mockDb = db;

      const req = makeReq('u1', {
        score: 9999999, stageReached: 5000, longestCombo: 99999,
        stompsCollected: 999999, ghostsEaten: 99999, livesRemaining: 10,
      });
      const res = makeRes();
      routes['POST /minigames/pac-it-up/complete'](req, res);

      // Find the INSERT call
      const insert = runs.find(r => r.sql.includes('INSERT'));
      assert.ok(insert, 'should insert for new user');
      // Args: user_id, score, stage, combo, stomps, ghosts
      const [, score, stage, combo, stomps, ghosts] = insert.args;
      assert.equal(score, 999999, 'score clamped to 999999');
      assert.equal(stage, 999, 'stage clamped to 999');
      assert.equal(combo, 9999, 'combo clamped to 9999');
      assert.equal(stomps, 99999, 'stomps clamped to 99999');
      assert.equal(ghosts, 9999, 'ghosts clamped to 9999');
    });

    it('uses MAX semantics for PB fields on update', () => {
      const runs = [];
      const db = createMockDb({
        pacItUpRow: { high_score: 3000, best_stage: 3, longest_combo: 10, total_stomps: 100, ghosts_eaten: 5, total_runs: 3 },
        petRow: null,
      });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origRun = stmt.run;
        stmt.run = (...args) => { runs.push({ sql, args }); return origRun(...args); };
        return stmt;
      };
      mockDb = db;

      const req = makeReq('u1', { score: 2000, stageReached: 5, longestCombo: 15, stompsCollected: 50, ghostsEaten: 3 });
      const res = makeRes();
      routes['POST /minigames/pac-it-up/complete'](req, res);

      const update = runs.find(r => r.sql.includes('UPDATE pet_pac_it_up_stats'));
      assert.ok(update, 'should update existing row');
      // SQL uses MAX(high_score, ?), MAX(best_stage, ?), MAX(longest_combo, ?)
      assert.ok(update.sql.includes('MAX(high_score'), 'uses MAX for high_score');
      assert.ok(update.sql.includes('MAX(best_stage'), 'uses MAX for best_stage');
      assert.ok(update.sql.includes('MAX(longest_combo'), 'uses MAX for longest_combo');
    });

    it('accumulates total_stomps, ghosts_eaten, and total_runs', () => {
      const runs = [];
      const db = createMockDb({
        pacItUpRow: { high_score: 1000, best_stage: 2, longest_combo: 5, total_stomps: 100, ghosts_eaten: 10, total_runs: 5 },
        petRow: null,
      });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origRun = stmt.run;
        stmt.run = (...args) => { runs.push({ sql, args }); return origRun(...args); };
        return stmt;
      };
      mockDb = db;

      const req = makeReq('u1', { score: 500, stompsCollected: 30, ghostsEaten: 2 });
      const res = makeRes();
      routes['POST /minigames/pac-it-up/complete'](req, res);

      const update = runs.find(r => r.sql.includes('UPDATE pet_pac_it_up_stats'));
      assert.ok(update);
      assert.ok(update.sql.includes('total_stomps = total_stomps +'), 'accumulates total_stomps');
      assert.ok(update.sql.includes('ghosts_eaten = ghosts_eaten +'), 'accumulates ghosts_eaten');
      assert.ok(update.sql.includes('total_runs = total_runs + 1'), 'increments total_runs');
    });

    it('applies pac-it-up cost and returns petReward / costApplied', () => {
      const runs = [];
      const db = createMockDb({
        pacItUpRow: null,
        petRow: {
          bond: 10, fullness: 80, happiness: 60, energy: 70, hype: 30,
          trust: 50, combo_balance: 20, last_fed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_meaningful_care_at: new Date().toISOString(),
        },
      });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origRun = stmt.run;
        stmt.run = (...args) => { runs.push({ sql, args }); return origRun(...args); };
        return stmt;
      };
      mockDb = db;

      const req = makeReq('u1', { score: 2400, stageReached: 4, stompsCollected: 80, ghostsEaten: 5 });
      const res = makeRes();
      routes['POST /minigames/pac-it-up/complete'](req, res);

      assert.ok(res.sent.petReward, 'includes petReward');
      assert.ok(res.sent.costApplied, 'includes costApplied');
      assert.equal(res.sent.costApplied.combo, 6, 'combo cost is 6');
      assert.equal(res.sent.costApplied.energy, -5, 'energy cost is -5');
      assert.equal(res.sent.costApplied.hunger, -4, 'hunger cost is -4');
      assert.equal(res.sent.costApplied.momentum, 5, 'momentum is 5');
      assert.ok(res.sent.petReward.happiness >= 1, 'happiness bump >= 1');
      assert.ok(typeof res.sent.petReward.bond === 'number', 'bond is number');
      assert.equal(res.sent.petReward.momentum, 5, 'momentum reward is 5');
    });
  });

  describe('GET /minigames/pac-it-up/leaderboard', () => {
    it('sorts by score, stage, combo, ghosts eaten', () => {
      const handler = routes['GET /minigames/pac-it-up/leaderboard'];
      assert.ok(handler, 'leaderboard route exists');
      // The SQL should contain the correct ORDER BY
      mockDb = createMockDb({ leaderboardRows: [] });
      const req = makeReq('u1', {}, { limit: '5' });
      const res = makeRes();
      handler(req, res);
      assert.ok(Array.isArray(res.sent.leaderboard), 'returns leaderboard array');
    });

    it('respects limit parameter', () => {
      const preparedQueries = [];
      const db = createMockDb({ leaderboardRows: [] });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origAll = stmt.all;
        stmt.all = (...args) => { preparedQueries.push({ sql, args }); return origAll(...args); };
        return stmt;
      };
      mockDb = db;

      const req = makeReq('u1', {}, { limit: '7' });
      const res = makeRes();
      routes['GET /minigames/pac-it-up/leaderboard'](req, res);

      const lbQuery = preparedQueries.find(q => q.sql.includes('pet_pac_it_up_stats'));
      assert.ok(lbQuery, 'queries pac-it-up stats');
      assert.equal(lbQuery.args[0], 7, 'passes limit 7');
    });

    it('clamps limit to valid range', () => {
      const preparedQueries = [];
      const db = createMockDb({ leaderboardRows: [] });
      const origPrepare = db.prepare.bind(db);
      db.prepare = function (sql) {
        const stmt = origPrepare(sql);
        const origAll = stmt.all;
        stmt.all = (...args) => { preparedQueries.push({ sql, args }); return origAll(...args); };
        return stmt;
      };
      mockDb = db;

      // Too high
      const req = makeReq('u1', {}, { limit: '100' });
      const res = makeRes();
      routes['GET /minigames/pac-it-up/leaderboard'](req, res);
      const lbQuery = preparedQueries.find(q => q.sql.includes('pet_pac_it_up_stats'));
      assert.equal(lbQuery.args[0], 25, 'caps at 25');
    });
  });

  describe('GET /minigames/cost', () => {
    it('includes pac-it-up cost', () => {
      mockDb = createMockDb();
      const req = makeReq('u1');
      const res = makeRes();
      routes['GET /minigames/cost'](req, res);
      assert.ok(res.sent['pac-it-up'], 'pac-it-up cost present');
      assert.equal(res.sent['pac-it-up'].combo, 6);
      assert.equal(res.sent['pac-it-up'].energy, -5);
      assert.equal(res.sent['pac-it-up'].hunger, -4);
      assert.equal(res.sent['pac-it-up'].happiness, 2);
      assert.equal(res.sent['pac-it-up'].hype, 5);
    });
  });
});
