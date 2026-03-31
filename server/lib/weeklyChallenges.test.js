const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedWeeklyChallengeLoad(request, parent, isMain) {
  if (request === '../db/schema') {
    return { SYSTEM_USER_ID: 'system-user' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { getWeekBoundary, persistWeeklyChallengePlayPosts } = require('./weeklyChallenges');
Module._load = originalLoad;

describe('weekly challenge week boundaries', () => {
  it('keeps the pre-rollover week before London midnight on the BST transition', () => {
    const boundary = getWeekBoundary(new Date('2026-03-29T22:59:00Z'));

    assert.deepEqual(boundary, {
      weekKey: '2026-W13',
      startsAtUtc: '2026-03-23T00:00:00.000Z',
      endsAtUtc: '2026-03-29T22:59:59.000Z',
    });
  });

  it('rolls into the new ISO week at Monday 00:00 Europe/London after DST starts', () => {
    const boundary = getWeekBoundary(new Date('2026-03-29T23:01:00Z'));

    assert.deepEqual(boundary, {
      weekKey: '2026-W14',
      startsAtUtc: '2026-03-29T23:00:00.000Z',
      endsAtUtc: '2026-04-05T22:59:59.000Z',
    });
  });
});

describe('persistWeeklyChallengePlayPosts', () => {
  it('groups live-session improvements into one weekly challenge post per week', () => {
    const inserted = [];
    const db = {
      prepare(sql) {
        if (sql === 'SELECT id FROM weekly_challenge_weeks WHERE week_key = ?') {
          return {
            get(weekKey) {
              return weekKey === '2026-W14' ? { id: 7 } : undefined;
            },
          };
        }
        if (sql === 'SELECT id, plays_json FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? ORDER BY id ASC') {
          return {
            all() {
              return [
                {
                  id: 3,
                  plays_json: JSON.stringify([
                    { song_title: 'Bee', mode: 'Single', level: 20, score: 900000 },
                  ]),
                },
              ];
            },
          };
        }
        if (sql === 'SELECT id FROM user_weekly_challenge_plays WHERE user_id = ? AND week_id = ? AND content_hash = ? LIMIT 1') {
          return {
            get() {
              return null;
            },
          };
        }
        if (sql === 'INSERT INTO user_weekly_challenge_plays (user_id, week_id, plays_json, content_hash) VALUES (?, ?, ?, ?)') {
          return {
            run(userId, weekId, playsJson, contentHash) {
              inserted.push({
                userId,
                weekId,
                plays: JSON.parse(playsJson),
                contentHash,
              });
              return { lastInsertRowid: 42 };
            },
          };
        }
        throw new Error(`Unexpected SQL in test: ${sql}`);
      },
    };

    const created = persistWeeklyChallengePlayPosts(db, [
      {
        song_title: 'Bee',
        mode: 'Single',
        level: 20,
        score: 910000,
        grade: 'A',
        weekly_challenge_week_key: '2026-W14',
        weekly_challenge_chart_id: 101,
      },
      {
        song_title: 'Bee',
        mode: 'Single',
        level: 20,
        score: 920000,
        grade: 'AA',
        weekly_challenge_week_key: '2026-W14',
        weekly_challenge_chart_id: 101,
      },
      {
        song_title: 'Cat',
        mode: 'Single',
        level: 21,
        score: 930000,
        grade: 'AA',
        weekly_challenge_week_key: '2026-W14',
        weekly_challenge_chart_id: 102,
      },
      {
        song_title: 'Dog',
        mode: 'Single',
        level: 22,
        score: 0,
        grade: 'F',
        weekly_challenge_week_key: '2026-W14',
        weekly_challenge_chart_id: 103,
      },
    ], 'elmer', { annotate: false, ensureCurrentWeek: false });

    assert.deepEqual(created, [42]);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].userId, 'elmer');
    assert.equal(inserted[0].weekId, 7);
    assert.equal(inserted[0].plays.length, 2);
    assert.deepEqual(
      inserted[0].plays.map((play) => ({
        song_title: play.song_title,
        mode: play.mode,
        level: play.level,
        score: play.score,
      })),
      [
        { song_title: 'Bee', mode: 'Single', level: 20, score: 920000 },
        { song_title: 'Cat', mode: 'Single', level: 21, score: 930000 },
      ]
    );
  });
});
