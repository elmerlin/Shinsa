const { getDb } = require('../db/schema');
const {
  enrichClearRecord,
  enrichUpscoreRecord,
} = require('../lib/activityPostEnrichment');

function main() {
  const db = getDb();

  const upscores = db.prepare(`
    SELECT id, user_id, upscores_json, created_at, pumbility_gain, singles_pumbility_gain
    FROM user_upscores
    ORDER BY id ASC
  `).all();
  const clears = db.prepare(`
    SELECT id, user_id, song_title, mode, level, score, grade, plate, background_url, clears_json,
           pumbility_gain, singles_pumbility_gain, created_at
    FROM user_new_clears
    ORDER BY id ASC
  `).all();

  const updateUpscore = db.prepare('UPDATE user_upscores SET upscores_json = ? WHERE id = ?');
  const updateClear = db.prepare('UPDATE user_new_clears SET clears_json = ? WHERE id = ?');

  let updatedUpscores = 0;
  let updatedClears = 0;

  const tx = db.transaction(() => {
    for (const row of upscores) {
      const enriched = enrichUpscoreRecord(db, row);
      if (enriched.upscores_json !== row.upscores_json) {
        updateUpscore.run(enriched.upscores_json, row.id);
        updatedUpscores += 1;
      }
    }

    for (const row of clears) {
      const enriched = enrichClearRecord(db, row);
      if (enriched.clears_json !== row.clears_json) {
        updateClear.run(enriched.clears_json, row.id);
        updatedClears += 1;
      }
    }
  });

  tx();

  console.log(JSON.stringify({
    scanned_upscores: upscores.length,
    updated_upscores: updatedUpscores,
    scanned_clears: clears.length,
    updated_clears: updatedClears,
  }, null, 2));
}

main();
