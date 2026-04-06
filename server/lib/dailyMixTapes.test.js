const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClipManifest,
  buildMixTapePayload,
  determineMixTapeStatus,
  upsertDailyMixTape,
  getLatestPublishedDailyMixTape,
} = require('./dailyMixTapes');

function createMockDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      if (sql.includes('INSERT INTO daily_mix_tapes')) {
        return {
          run(
            dateKey,
            status,
            selectionJson,
            successCount,
            failureCount,
            videoUrl,
            thumbnailUrl,
            durationSeconds,
            publishedAt,
            errorSummary,
          ) {
            rows.set(dateKey, {
              date_key: dateKey,
              status,
              selection_json: selectionJson,
              success_count: successCount,
              failure_count: failureCount,
              video_url: videoUrl,
              thumbnail_url: thumbnailUrl,
              duration_seconds: durationSeconds,
              published_at: publishedAt,
              created_at: '2026-04-06T00:00:00.000Z',
              updated_at: '2026-04-06T00:00:00.000Z',
              error_summary: errorSummary,
            });
            return { changes: 1 };
          },
        };
      }

      if (sql.includes('FROM daily_mix_tapes') && sql.includes('WHERE date_key = ?')) {
        return {
          get(dateKey) {
            return rows.get(dateKey) || null;
          },
        };
      }

      if (sql.includes('FROM daily_mix_tapes') && sql.includes("WHERE status IN ('completed', 'partial')")) {
        return {
          get() {
            return [...rows.values()]
              .filter((row) => ['completed', 'partial'].includes(row.status) && row.video_url)
              .sort((a, b) => String(b.date_key).localeCompare(String(a.date_key)))[0] || null;
          },
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

describe('daily mix tape helpers', () => {
  it('builds a clip manifest from only valid timed clips and caps segment duration', () => {
    const manifest = buildClipManifest([
      {
        replay_embed_url: 'https://www.youtube.com/embed/aaaaaaaaaaa?start=10&end=70',
        replay_start_seconds: 10,
        replay_end_seconds: 70,
        user_id: 'a',
        username: 'A',
        song_title: 'Valid Clip',
        mode: 'Single',
        level: 21,
      },
      {
        replay_embed_url: 'https://www.youtube.com/embed/bbbbbbbbbbb?start=10&end=10',
        replay_start_seconds: 10,
        replay_end_seconds: 10,
        user_id: 'b',
        username: 'B',
        song_title: 'Zero Clip',
      },
      {
        replay_embed_url: '',
        replay_start_seconds: 5,
        replay_end_seconds: 20,
        user_id: 'c',
        username: 'C',
        song_title: 'Missing Video',
      },
    ]);

    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].replay_video_id, 'aaaaaaaaaaa');
    assert.equal(manifest[0].clip_duration_seconds, 30);
  });

  it('derives completed, partial, and failed publish states correctly', () => {
    assert.equal(determineMixTapeStatus({ totalSelected: 5, successfulCount: 5, failureCount: 0 }), 'completed');
    assert.equal(determineMixTapeStatus({ totalSelected: 5, successfulCount: 3, failureCount: 2 }), 'partial');
    assert.equal(determineMixTapeStatus({ totalSelected: 5, successfulCount: 2, failureCount: 3 }), 'failed');
  });

  it('stores and exposes the latest published mix tape payload', () => {
    const db = createMockDb();

    upsertDailyMixTape(db, {
      date_key: '2026-04-05',
      status: 'partial',
      selection: [{ song_title: 'Emperor', mode: 'Single', level: 24 }],
      success_count: 4,
      failure_count: 1,
      video_url: '/uploads/mix-tapes/2026-04-05.mp4',
      thumbnail_url: '/uploads/mix-tapes/2026-04-05.jpg',
      duration_seconds: 97,
      published_at: '2026-04-06T00:10:00.000Z',
      error_summary: '',
    });

    const latest = getLatestPublishedDailyMixTape(db);
    const payload = buildMixTapePayload(latest);

    assert.equal(latest.date_key, '2026-04-05');
    assert.equal(payload.videoUrl, '/uploads/mix-tapes/2026-04-05.mp4');
    assert.equal(payload.thumbnailUrl, '/uploads/mix-tapes/2026-04-05.jpg');
    assert.equal(payload.durationLabel, '1:37');
    assert.equal(payload.clipCount, 1);
  });
});
