const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveDailyHighlightReplayRows,
} = require('./dailyHighlights');

function createMockDb({ replaySourcePlay = null } = {}) {
  return {
    prepare(sql) {
      if (sql.includes('FROM user_recently_played rp') && sql.includes('rp.replay_embed_url = ?')) {
        return {
          get(userId, songTitle, mode, level, replayEmbedUrl, replayVideoId) {
            if (!replaySourcePlay) return null;
            const sourceVideoId = String(replaySourcePlay.replay_video_id || '').trim();
            const sourceEmbedUrl = String(replaySourcePlay.replay_embed_url || '').trim();
            const requestedVideoId = String(replayVideoId || '').trim();
            if (
              replaySourcePlay.user_id === userId
              && replaySourcePlay.song_title === songTitle
              && replaySourcePlay.mode === mode
              && replaySourcePlay.level === level
              && (
                sourceEmbedUrl === replayEmbedUrl
                || (requestedVideoId && sourceVideoId === requestedVideoId)
                || (requestedVideoId && sourceEmbedUrl.includes(requestedVideoId))
              )
            ) {
              return replaySourcePlay;
            }
            return null;
          },
        };
      }

      // findSongChartMetadata (via applyChartMetadata) probes the songs
      // catalog for jacket_url/chart_id. These tests don't exercise jacket
      // resolution, so every catalog lookup returns null — applyChartMetadata
      // then leaves jacket_url empty, which is fine for the replay-metadata
      // assertions below.
      if (sql.includes('FROM songs')) {
        return { get: () => null };
      }

      // attachHeartRateById probes per-play HR (+ the user's effective max
      // HR). These tests don't exercise HR — return nothing.
      if (sql.includes('hr_avg') || sql.includes('max_hr')) {
        return { get: () => null };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

describe('daily highlight replay resolution', () => {
  it('replaces stale chart-linked replay metadata with the actual replay-bearing play', () => {
    const db = createMockDb({
      replaySourcePlay: {
        play_id: 14523,
        user_id: 'elmer',
        song_title: 'Feel My Happiness',
        mode: 'Double',
        level: 21,
        score: 986870,
        grade: 'SS+',
        plate: '',
        perfect: 993,
        great: 9,
        good: 1,
        bad: 6,
        miss: 1,
        max_combo: 0,
        background_url: 'https://www.piugame.com/data/song_img/70863cab2c4dde4b17a9efe9c124cc30.png?v=20251219163819',
        date_played: '2026-03-27 02:07:06 (GMT+9)',
        played_at_utc: '2026-03-26 17:07:06',
        machine_name: 'London Pump Dojo 2',
        replay_embed_url: 'https://www.youtube.com/embed/w1qNAEh-TA8?start=2430&end=2546',
        replay_video_id: 'w1qNAEh-TA8',
        replay_start_seconds: 2430,
        replay_end_seconds: 2546,
        comment_count: 3,
      },
    });

    const [resolved] = resolveDailyHighlightReplayRows(db, [{
      id: 15283,
      user_id: 'elmer',
      song_title: 'Feel My Happiness',
      mode: 'Double',
      level: 21,
      score: 0,
      grade: 'F',
      perfect: 589,
      great: 6,
      good: 7,
      bad: 10,
      miss: 13,
      replay_embed_url: 'https://www.youtube.com/embed/w1qNAEh-TA8?start=2430&end=2546',
      replay_video_id: '',
      replay_start_seconds: 0,
      replay_end_seconds: 0,
      background_url: 'https://www.piugame.com/data/song_img/70863cab2c4dde4b17a9efe9c124cc30.png?v=20251219163819',
      date_played: '2026-04-03 04:25:46 (GMT+9)',
      played_at_utc: '2026-04-02 19:25:46',
      machine_name: 'London Pump Dojo 1',
      replay_source_kind: 'chart_linked',
      comment_count: 0,
    }]);

    assert.equal(resolved.score, 986870);
    assert.equal(resolved.grade, 'SS+');
    assert.equal(resolved.perfect, 993);
    assert.equal(resolved.play_id, 14523);
    assert.equal(resolved.replay_source_play_id, 14523);
    assert.equal(resolved.highlight_play_id, 15283);
    assert.equal(resolved.comment_count, 3);
    assert.equal(resolved.machine_name, 'London Pump Dojo 2');
  });

  it('leaves direct replay rows untouched apart from a default play_id', () => {
    const db = createMockDb();
    const [resolved] = resolveDailyHighlightReplayRows(db, [{
      id: 15277,
      user_id: 'elmer',
      song_title: 'Acquire',
      mode: 'Single',
      level: 17,
      score: 992933,
      grade: 'SSS',
      replay_embed_url: 'https://www.youtube.com/embed/5ELrtS_M6HU?start=4468&end=4615',
      replay_source_kind: 'direct',
    }]);

    assert.equal(resolved.score, 992933);
    assert.equal(resolved.grade, 'SSS');
    assert.equal(resolved.play_id, 15277);
    assert.equal(resolved.highlight_play_id, undefined);
  });
});
