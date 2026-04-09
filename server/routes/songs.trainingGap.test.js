const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let mockedProfiles = null;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router: () => ({
        get() { return this; },
        post() { return this; },
        put() { return this; },
        delete() { return this; },
        patch() { return this; },
        use() { return this; },
      }),
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
    return {
      getDb: () => {
        throw new Error('getDb should not be used in songs.trainingGap.test.js');
      },
    };
  }
  if (request === '../lib/trainingLoad') {
    return {
      QUERY_BUFFER_DAYS: 60,
      computeAllProfiles: () => mockedProfiles,
    };
  }
  return originalLoad(request, parent, isMain);
};

const songsRouter = require('../routes/songs');
Module._load = originalLoad;

function createDb({
  users = [{ id: 'u1', timezone: 'UTC' }],
  songs = [],
  chartSkills = [],
  bestScores = [],
  recentScores = [],
  pumbilityScores = [],
  sync = [{ user_id: 'u1', last_recently_played_sync: '2026-04-01T00:00:00Z' }],
} = {}) {
  return {
    prepare(sql) {
      const query = String(sql || '');
      return {
        get: (...args) => {
          if (query.includes('SELECT id, timezone FROM users WHERE id = ?')) {
            return users.find((user) => user.id === args[0]) || null;
          }
          if (query.includes('SELECT last_recently_played_sync FROM user_piugame_sync WHERE user_id = ?')) {
            return sync.find((row) => row.user_id === args[0]) || null;
          }
          if (query.includes('SELECT id FROM users WHERE id = ?')) {
            const user = users.find((row) => row.id === args[0]);
            return user ? { id: user.id } : null;
          }
          if (query.includes('(SELECT COUNT(*) FROM songs) as songs_count')) {
            return {
              songs_count: songs.length,
              songs_max_id: songs.reduce((max, row) => Math.max(max, row.id || 0), 0),
              duration_count: songs.filter((row) => row.duration_seconds != null).length,
              duration_max_updated_at: '',
              skills_count: chartSkills.length,
              skills_max_updated_at: chartSkills.reduce((latest, row) => (String(row.updated_at || '') > latest ? String(row.updated_at || '') : latest), ''),
            };
          }
          return null;
        },
        all: (...args) => {
          if (query.includes('FROM chart_skills') && query.includes('ORDER BY chart_id ASC')) {
            return chartSkills.slice().sort((a, b) => {
              if (a.chart_id !== b.chart_id) return a.chart_id - b.chart_id;
              return String(a.skill_slug || '').localeCompare(String(b.skill_slug || ''));
            });
          }
          if (query.includes('FROM songs') && query.includes('ORDER BY title COLLATE NOCASE ASC')) {
            return songs.slice().sort((a, b) => {
              const titleCompare = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
              if (titleCompare !== 0) return titleCompare;
              return (a.id || 0) - (b.id || 0);
            });
          }
          if (query.includes('FROM user_best_scores')) {
            return bestScores.filter((row) => row.user_id === args[0]);
          }
          if (query.includes('FROM user_recently_played') && query.includes('perfect, great, good')) {
            return recentScores.filter((row) => row.user_id === args[0]);
          }
          if (query.includes('FROM user_recently_played') && query.includes('played_at_utc >= datetime')) {
            return recentScores.filter((row) => row.user_id === args[0]);
          }
          if (query.includes('FROM user_pumbility_scores')) {
            return pumbilityScores.filter((row) => row.user_id === args[0]);
          }
          return [];
        },
      };
    },
  };
}

function makeSong({ id, title, mode, level, skills = [] }) {
  return {
    id,
    title,
    artist: 'Artist',
    jacket_url: '',
    mode,
    level,
    bpm: '180',
    song_key: String(id),
    flags: '',
    duration_seconds: null,
    duration_source: '',
    duration_updated_at: '',
    _skills: skills,
  };
}

function makeSkillRows(song) {
  return (song._skills || []).map((skill) => ({
    chart_id: song.id,
    skill_slug: skill,
    skill_name: skill,
    source: 'test',
    updated_at: '2026-04-01',
  }));
}

function makeBestScore({ title, mode, level, score, grade }) {
  return {
    user_id: 'u1',
    song_title: title,
    mode,
    level,
    score,
    grade,
    plate: '',
    background_url: '',
    over_top100_rank: 0,
  };
}

beforeEach(() => {
  mockedProfiles = {
    overall: {},
    single: {
      play_days: 10,
      training_ratio: 100,
      avg_play_load: 650,
      training_status: 'In The Zone',
      comfortable_level: 20,
      likely_pass: null,
      calibrating: false,
    },
    double: {
      play_days: 10,
      training_ratio: 100,
      avg_play_load: 650,
      training_status: 'In The Zone',
      comfortable_level: 20,
      likely_pass: null,
      calibrating: false,
    },
    sync_stale: false,
    last_synced_at: '2026-04-01T00:00:00Z',
  };
  songsRouter._test.resetCaches();
});

describe('songs training-gap route helper', () => {
  it('defaults target level to likely_pass when it exists', () => {
    mockedProfiles.single.likely_pass = { level: 23 };
    const song = makeSong({ id: 101, title: 'Single 23', mode: 'Single', level: 23, skills: ['run'] });
    const db = createDb({ songs: [song], chartSkills: makeSkillRows(song) });

    const result = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'single' });
    assert.equal(result.status, 200);
    assert.equal(result.body.target_level, 23);
  });

  it('falls back to comfortable_level + 1 when likely_pass is absent', () => {
    mockedProfiles.single.likely_pass = null;
    mockedProfiles.single.comfortable_level = 20;
    const song = makeSong({ id: 111, title: 'Single 21', mode: 'Single', level: 21, skills: ['run'] });
    const db = createDb({ songs: [song], chartSkills: makeSkillRows(song) });

    const result = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'single' });
    assert.equal(result.status, 200);
    assert.equal(result.body.target_level, 21);
  });

  it('uses the median-demand chart when every target chart is unplayed', () => {
    mockedProfiles.single.comfortable_level = 19;

    const songs = [
      makeSong({ id: 201, title: 'L20 Run', mode: 'Single', level: 20, skills: ['run'] }),
      makeSong({ id: 202, title: 'L20 Bracket', mode: 'Single', level: 20, skills: ['bracket'] }),
      makeSong({ id: 203, title: 'L20 Stamina', mode: 'Single', level: 20, skills: ['sustained'] }),
      makeSong({ id: 204, title: 'L19 Anchor', mode: 'Single', level: 19, skills: ['run'] }),
    ];
    const db = createDb({
      songs,
      chartSkills: songs.flatMap(makeSkillRows),
      bestScores: [makeBestScore({ title: 'L19 Anchor', mode: 'Single', level: 19, score: 940000, grade: 'AA+' })],
    });

    const result = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'single' });
    assert.equal(result.status, 200);
    const ordered = result.body.charts.slice().sort((a, b) => a.derived.actual_demand - b.derived.actual_demand);
    assert.equal(result.body.default_chart_id, ordered[1].chart_id);
  });

  it('keeps single and double mode profiles isolated', () => {
    mockedProfiles.single.avg_play_load = 720;
    mockedProfiles.double.avg_play_load = 260;
    mockedProfiles.single.comfortable_level = 19;
    mockedProfiles.double.comfortable_level = 15;

    const songs = [
      makeSong({ id: 301, title: 'Single 20', mode: 'Single', level: 20, skills: ['run'] }),
      makeSong({ id: 302, title: 'Double 16', mode: 'Double', level: 16, skills: ['mid6_doubles'] }),
    ];
    const db = createDb({ songs, chartSkills: songs.flatMap(makeSkillRows) });

    const singleResult = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'single' });
    songsRouter._test.resetCaches();
    const doubleResult = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'double' });

    assert.equal(singleResult.body.profile.analytics_avg_play_load, 720);
    assert.equal(doubleResult.body.profile.analytics_avg_play_load, 260);
    assert.ok(singleResult.body.charts.every((chart) => chart.mode === 'Single'));
    assert.ok(doubleResult.body.charts.every((chart) => chart.mode === 'Double'));
  });

  it('returns a stable empty-data response with scenarios and no evidence', () => {
    mockedProfiles.single.play_days = 0;
    mockedProfiles.single.training_ratio = null;
    mockedProfiles.single.avg_play_load = null;
    mockedProfiles.single.comfortable_level = 19;
    mockedProfiles.single.training_status = 'Idle';

    const song = makeSong({ id: 401, title: 'Single 20', mode: 'Single', level: 20, skills: ['run'] });
    const db = createDb({ songs: [song], chartSkills: makeSkillRows(song) });

    const result = songsRouter._test.buildTrainingGapResponse(db, 'u1', { mode: 'single' });
    assert.equal(result.status, 200);
    assert.equal(result.body.evidence.best_scores.length, 0);
    assert.equal(result.body.scenarios.length, 3);
    assert.equal(result.body.profile.analytics_avg_play_load_source, 'fallback_estimate');
  });
});
