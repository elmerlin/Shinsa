const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  enrichClearRecord,
  enrichClearRows,
  enrichUpscoreRows,
} = require('./activityPostEnrichment');

function createMockDb({ charts = [], recentPlays = [], syncRow = null, bestScores = [] } = {}) {
  return {
    prepare(sql) {
      if (sql.includes('FROM user_piugame_sync')) {
        return {
          get() {
            return syncRow;
          },
        };
      }

      if (sql.includes('FROM user_best_scores')) {
        return {
          all(userId) {
            return bestScores.filter((row) => row.user_id === userId);
          },
        };
      }

      if (sql.includes('FROM songs') && sql.includes('WHERE title = ?')) {
        return {
          get(title, mode, level) {
            return charts.find((chart) =>
              chart.title === title && chart.mode === mode && chart.level === level
            ) || null;
          },
        };
      }

      if (sql.includes('FROM songs') && sql.includes('WHERE jacket_url = ?')) {
        return {
          get(jacketUrl, mode, level) {
            return charts.find((chart) =>
              chart.jacket_url === jacketUrl && chart.mode === mode && chart.level === level
            ) || null;
          },
        };
      }

      if (sql.includes('FROM user_recently_played') && sql.includes('COALESCE(NULLIF(played_at_utc')) {
        return {
          get(userId, songTitle, mode, level, score) {
            return recentPlays.find((play) =>
              play.user_id === userId
              && play.song_title === songTitle
              && play.mode === mode
              && play.level === level
              && play.score === score
            ) || null;
          },
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

describe('activity post enrichment replay handling', () => {
  it('prefers the exact recent-play replay for upscore rows', () => {
    const db = createMockDb({
      charts: [
        { chart_id: 1, title: 'Napalm', mode: 'Single', level: 15, jacket_url: '/jackets/napalm.jpg' },
      ],
      recentPlays: [
        {
          play_id: 15146,
          user_id: 'choose',
          song_title: 'Napalm',
          mode: 'Single',
          level: 15,
          score: 1000000,
          perfect: 500,
          great: 10,
          good: 0,
          bad: 0,
          miss: 0,
          max_combo: 510,
          plate: 'ACE',
          background_url: 'https://www.piugame.com/data/song_img/napalm.png',
          date_played: '2026-04-01 01:27:49 (GMT+9)',
          played_at_utc: '2026-03-31 16:27:49',
          over_top100_rank: 1,
          replay_embed_url: 'https://www.youtube.com/embed/yeHrN1L94CY?start=147&end=285',
          replay_video_id: 'yeHrN1L94CY',
          replay_start_seconds: 147,
          replay_end_seconds: 285,
          machine_name: 'London Pump Dojo 1',
        },
      ],
    });

    const [enriched] = enrichUpscoreRows(db, 'choose', [{
      song_title: 'Napalm',
      mode: 'Single',
      level: 15,
      new_score: 1000000,
      replay_embed_url: 'https://www.youtube.com/embed/OLDVIDEO123?start=1&end=2',
      replay_video_id: 'OLDVIDEO123',
    }], '2026-03-31 17:49:17');

    assert.equal(enriched.replay_embed_url, 'https://www.youtube.com/embed/yeHrN1L94CY?start=147&end=285');
    assert.equal(enriched.replay_video_id, 'yeHrN1L94CY');
    assert.equal(enriched.play_id, 15146);
    assert.equal(enriched.chart_id, 1);
  });

  it('clears stale replays when the exact recent play has no replay data', () => {
    const db = createMockDb({
      charts: [
        { chart_id: 2, title: 'Iolite Sky', mode: 'Double', level: 20, jacket_url: '/jackets/iolite.jpg' },
      ],
      recentPlays: [
        {
          play_id: 15189,
          user_id: 'soft',
          song_title: 'Iolite Sky',
          mode: 'Double',
          level: 20,
          score: 978984,
          perfect: 450,
          great: 20,
          good: 3,
          bad: 1,
          miss: 0,
          max_combo: 480,
          plate: 'ACE',
          background_url: 'https://www.piugame.com/data/song_img/iolite.png',
          date_played: '2026-04-01 04:15:32 (GMT+9)',
          played_at_utc: '2026-03-31 19:15:32',
          over_top100_rank: 0,
          replay_embed_url: '',
          replay_video_id: '',
          replay_start_seconds: 0,
          replay_end_seconds: 0,
          machine_name: 'London Pump Dojo 1',
        },
      ],
    });

    const [enriched] = enrichClearRows(db, 'soft', [{
      entry_type: 'song_clear',
      song_title: 'Iolite Sky',
      mode: 'Double',
      level: 20,
      score: 978984,
      replay_embed_url: 'https://www.youtube.com/embed/stncCQKJwj8?start=3320&end=3458',
      replay_video_id: 'stncCQKJwj8',
    }], '2026-03-31 20:26:07');

    assert.equal(enriched.replay_embed_url, '');
    assert.equal(enriched.replay_video_id, '');
    assert.equal(enriched.play_id, 15189);
    assert.equal(enriched.chart_id, 2);
  });

  it('backfills blank clear plates from recent-play metadata even when judgments already exist', () => {
    const db = createMockDb({
      recentPlays: [
        {
          play_id: 15346,
          user_id: 'ching',
          song_title: 'Phalanx "RS2018 edit"',
          mode: 'Double',
          level: 21,
          score: 877048,
          perfect: 773,
          great: 186,
          good: 23,
          bad: 5,
          miss: 24,
          max_combo: 0,
          plate: 'FG',
          background_url: 'https://www.piugame.com/data/song_img/phalanx.png',
          date_played: '2026-04-03 20:55:37 (GMT+9)',
          played_at_utc: '2026-04-03 11:55:37',
          over_top100_rank: 0,
          replay_embed_url: 'https://www.youtube.com/embed/dmPhT5OQEco?start=5546&end=5684',
          replay_video_id: 'dmPhT5OQEco',
          replay_start_seconds: 5546,
          replay_end_seconds: 5684,
          machine_name: 'London Pump Dojo 1',
        },
      ],
    });

    const enriched = enrichClearRecord(db, {
      id: 228,
      user_id: 'ching',
      song_title: 'Phalanx "RS2018 edit"',
      mode: 'Double',
      level: 21,
      score: 877048,
      grade: 'A+',
      plate: '',
      background_url: '',
      created_at: '2026-04-03 13:03:40',
      clears_json: JSON.stringify([{
        entry_type: 'song_clear',
        song_title: 'Phalanx "RS2018 edit"',
        mode: 'Double',
        level: 21,
        score: 877048,
        grade: 'A+',
        plate: '',
        perfect: 773,
        great: 186,
        good: 23,
        bad: 5,
        miss: 24,
      }]),
    });

    const [item] = JSON.parse(enriched.clears_json);
    assert.equal(enriched.plate, 'FG');
    assert.equal(enriched.played_at_utc, '2026-04-03 11:55:37');
    assert.equal(item.plate, 'FG');
    assert.equal(item.play_id, 15346);
  });

  it('backfills legacy title unlock posts with live title progress data', () => {
    const db = createMockDb({
      syncRow: {
        best_scores_imported: 1,
        last_best_scores_sync: '2026-04-05 10:55:37',
      },
      bestScores: [
        ...Array.from({ length: 80 }, (_, index) => ({
          user_id: 'aeron',
          level: 22,
          score: 905000 + index,
          grade: 'AA',
          mode: 'Single',
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
          user_id: 'aeron',
          level: 23,
          score: 901000 + index,
          grade: 'AA',
          mode: 'Single',
        })),
      ],
    });

    const enriched = enrichClearRecord(db, {
      id: 238,
      user_id: 'aeron',
      song_title: 'Advanced Lv.10',
      mode: 'Skill Title',
      level: 22,
      score: 70000,
      grade: 'SKILL TITLE',
      created_at: '2026-04-05 10:55:37',
      clears_json: JSON.stringify([{
        entry_type: 'title_unlock',
        song_title: 'Advanced Lv.10',
        mode: 'Skill Title',
        level: 22,
        score: 70000,
        grade: 'SKILL TITLE',
        title_name: 'Advanced Lv.10',
        title_family: 'Advanced',
        title_level: 10,
        title_tier: 'silver',
      }]),
    });

    const [item] = JSON.parse(enriched.clears_json);
    assert.equal(item.title_required_points, 70000);
    assert.equal(item.title_earned_points, 70400);
    assert.equal(item.title_previous_node?.name, 'Advanced Lv.9');
    assert.equal(item.title_current_node?.name, 'Advanced Lv.10');
    assert.equal(item.title_next_node?.name, 'Expert Lv.1');
    assert.equal(item.title_next_node?.earned_points, 3030);
    assert.equal(item.title_next_node?.required_points, 40000);
  });
});
