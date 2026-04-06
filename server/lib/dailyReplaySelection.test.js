const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUtcDateKey,
  selectTopReplayHighlights,
} = require('./dailyReplaySelection');

function createMockDb({ directReplays = [], chartLinkedReplays = [] } = {}) {
  return {
    prepare(sql) {
      if (sql.includes("FROM user_recently_played rp") && sql.includes("'direct' AS replay_source_kind")) {
        return {
          all(limit) {
            return directReplays.slice(0, limit);
          },
        };
      }

      if (sql.includes("FROM user_recently_played rp") && sql.includes("'chart_linked' AS replay_source_kind")) {
        return {
          all(limit) {
            return chartLinkedReplays.slice(0, limit);
          },
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

describe('daily replay selection', () => {
  it('normalizes dates to UTC date keys', () => {
    assert.equal(normalizeUtcDateKey('2026-04-06T22:30:00+01:00'), '2026-04-06');
    assert.equal(normalizeUtcDateKey('2026-04-06'), '2026-04-06');
  });

  it('keeps the top replay list player-diverse and chart-deduped', () => {
    const db = createMockDb({
      directReplays: [
        {
          id: 101,
          user_id: 'aeron',
          username: 'Aeron',
          avatar: '',
          nationality: 'NL',
          song_title: 'Emperor',
          mode: 'Single',
          level: 24,
          score: 985000,
          grade: 'SS+',
          replay_embed_url: 'https://www.youtube.com/embed/aaaaaaaaaaa?start=1&end=20',
          replay_video_id: 'aaaaaaaaaaa',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
        {
          id: 102,
          user_id: 'aeron',
          username: 'Aeron',
          avatar: '',
          nationality: 'NL',
          song_title: 'Emperor',
          mode: 'Single',
          level: 24,
          score: 980000,
          grade: 'SS',
          replay_embed_url: 'https://www.youtube.com/embed/bbbbbbbbbbb?start=1&end=20',
          replay_video_id: 'bbbbbbbbbbb',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
        {
          id: 103,
          user_id: 'elmer',
          username: 'Elmer',
          avatar: '',
          nationality: 'GB',
          song_title: 'Avalanche',
          mode: 'Double',
          level: 23,
          score: 990000,
          grade: 'SSS',
          replay_embed_url: 'https://www.youtube.com/embed/ccccccccccc?start=1&end=20',
          replay_video_id: 'ccccccccccc',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
        {
          id: 104,
          user_id: 'h4chi',
          username: 'h4chi',
          avatar: '',
          nationality: 'TH',
          song_title: 'Final Audition 3',
          mode: 'Double',
          level: 22,
          score: 996000,
          grade: 'SSS+',
          replay_embed_url: 'https://www.youtube.com/embed/ddddddddddd?start=1&end=20',
          replay_video_id: 'ddddddddddd',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
        {
          id: 105,
          user_id: 'mint',
          username: 'Mint',
          avatar: '',
          nationality: 'US',
          song_title: '4NT',
          mode: 'Double',
          level: 24,
          score: 970000,
          grade: 'S',
          replay_embed_url: 'https://www.youtube.com/embed/eeeeeeeeeee?start=1&end=20',
          replay_video_id: 'eeeeeeeeeee',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
        {
          id: 106,
          user_id: 'nova',
          username: 'Nova',
          avatar: '',
          nationality: 'CA',
          song_title: 'Gargoyle',
          mode: 'Single',
          level: 25,
          score: 960000,
          grade: 'AAA+',
          replay_embed_url: 'https://www.youtube.com/embed/fffffffffff?start=1&end=20',
          replay_video_id: 'fffffffffff',
          replay_start_seconds: 1,
          replay_end_seconds: 20,
          replay_source_kind: 'direct',
        },
      ],
    });

    const result = selectTopReplayHighlights(db, '2026-04-05', { limit: 5, candidateLimit: 20 });

    assert.equal(result.length, 5);
    assert.deepEqual(result.map((item) => item.user_id), ['nova', 'aeron', 'mint', 'elmer', 'h4chi']);
    assert.equal(result.filter((item) => item.user_id === 'aeron').length, 1);
    const aeronReplay = result.find((item) => item.user_id === 'aeron');
    assert.equal(aeronReplay?.song_title, 'Emperor');
    assert.equal(aeronReplay?.replay_video_id, 'aaaaaaaaaaa');
  });
});
