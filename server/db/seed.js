const fs = require('fs');
const path = require('path');
const { initializeDb, getDb, DB_PATH } = require('./schema');

function seedDatabase() {
  const jsonPath = path.join(__dirname, '..', '..', 'pump-phoenix.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('pump-phoenix.json not found at', jsonPath);
    console.error('Download from: https://raw.githubusercontent.com/noahm/DDRCardDraw/main/src/songs/pump-phoenix.json');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const songs = data.songs;

  // Delete existing DB for clean start
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  initializeDb();
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, jacket_url, mode, level, bpm, song_key, flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let chartCount = 0;
  const insertAll = db.transaction(() => {
    for (const song of songs) {
      // Use local jacket path served from client/public/jackets/
      const jacketUrl = song.jacket ? '/jackets/' + song.jacket : '';
      const flags = (song.flags || []).join(',');

      for (const chart of song.charts) {
        if ((chart.diffClass === 'S' || chart.diffClass === 'D') && chart.style === 'solo') {
          const mode = chart.diffClass === 'S' ? 'Single' : 'Double';
          stmt.run(
            song.name,
            song.artist,
            jacketUrl,
            mode,
            chart.lvl,
            song.bpm || '',
            song.saIndex || '',
            flags
          );
          chartCount++;
        }
      }
    }
  });

  insertAll();

  console.log(`Seeded ${chartCount} charts from ${songs.length} songs into database`);

  const stats = db.prepare(
    'SELECT level, mode, COUNT(*) as count FROM songs GROUP BY level, mode ORDER BY level, mode'
  ).all();

  console.log('\nChart distribution:');
  for (const s of stats) {
    console.log(`  Level ${s.level} ${s.mode}: ${s.count}`);
  }

  const total = db.prepare('SELECT COUNT(*) as count FROM songs').get();
  console.log(`\nTotal: ${total.count} charts`);

  db.close();
}

seedDatabase();
