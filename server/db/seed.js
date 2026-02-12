const { getDb, initializeDb } = require('./schema');

// PIU Phoenix song database - comprehensive selection of popular tournament songs
const songs = [
  // === Level 16 ===
  { title: "Bee", artist: "BanYa", mode: "Single", level: 16, category: "Original", bpm: "162" },
  { title: "Pumping Jumping", artist: "BanYa", mode: "Single", level: 16, category: "Original", bpm: "140" },
  { title: "Final Audition Ep. 2-2", artist: "BanYa", mode: "Single", level: 16, category: "Original", bpm: "145" },

  // === Level 17 ===
  { title: "Tepris", artist: "BanYa", mode: "Single", level: 17, category: "Original", bpm: "175" },
  { title: "Love is a Danger Zone", artist: "BanYa", mode: "Single", level: 17, category: "Original", bpm: "140" },
  { title: "Vacuum", artist: "DOIN", mode: "Single", level: 17, category: "Original", bpm: "160" },

  // === Level 18 ===
  { title: "Infiinity", artist: "BanYa", mode: "Single", level: 18, category: "Original", bpm: "155" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 18, category: "Xross", bpm: "170" },
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 18, category: "Original", bpm: "175" },
  { title: "Super Fantasy", artist: "SHK", mode: "Single", level: 18, category: "Original", bpm: "155" },
  { title: "Crossing Delta", artist: "DOIN", mode: "Single", level: 18, category: "Original", bpm: "170" },
  { title: "Ignis Fatuus", artist: "Memme", mode: "Single", level: 18, category: "Xross", bpm: "174" },
  { title: "HTTP", artist: "Quree", mode: "Single", level: 18, category: "Original", bpm: "180" },
  { title: "Ugly Dee", artist: "BanYa", mode: "Single", level: 18, category: "Original", bpm: "145" },
  { title: "Kokugen Kairou Labyrinth", artist: "ATAS", mode: "Single", level: 18, category: "Xross", bpm: "186" },
  { title: "Rokutousei no Yoru", artist: "Aether", mode: "Single", level: 18, category: "Xross", bpm: "158" },
  { title: "Heart Rabbit Coaster", artist: "ATAS", mode: "Single", level: 18, category: "Xross", bpm: "188" },
  { title: "Sarabande", artist: "MAX", mode: "Single", level: 18, category: "Original", bpm: "164" },

  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 18, category: "Original", bpm: "175" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 18, category: "Xross", bpm: "170" },
  { title: "Super Fantasy", artist: "SHK", mode: "Double", level: 18, category: "Original", bpm: "155" },
  { title: "Crossing Delta", artist: "DOIN", mode: "Double", level: 18, category: "Original", bpm: "170" },
  { title: "HTTP", artist: "Quree", mode: "Double", level: 18, category: "Original", bpm: "180" },

  // === Level 19 ===
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 19, category: "Original", bpm: "175" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 19, category: "Xross", bpm: "170" },
  { title: "Final Audition Ep. 2-X", artist: "BanYa", mode: "Single", level: 19, category: "Original", bpm: "180" },
  { title: "Destination", artist: "SHK", mode: "Single", level: 19, category: "Original", bpm: "162" },
  { title: "Headless Chicken", artist: "r300k", mode: "Single", level: 19, category: "Original", bpm: "180" },
  { title: "Love is a Danger Zone pt.2", artist: "BanYa", mode: "Single", level: 19, category: "Original", bpm: "150" },
  { title: "Phalanx", artist: "Cranky", mode: "Single", level: 19, category: "Xross", bpm: "180" },
  { title: "Papasito", artist: "DOIN", mode: "Single", level: 19, category: "Original", bpm: "135" },
  { title: "Bad Apple!! feat. nomico", artist: "Masayoshi Minoshima", mode: "Single", level: 19, category: "Xross", bpm: "138" },
  { title: "Fires of Destiny", artist: "Sanxion7", mode: "Single", level: 19, category: "Original", bpm: "160" },
  { title: "Imagination", artist: "SHK", mode: "Single", level: 19, category: "Original", bpm: "154" },
  { title: "Cross Ray", artist: "YAHPP", mode: "Single", level: 19, category: "Original", bpm: "200" },
  { title: "Prime Time", artist: "Cashew", mode: "Single", level: 19, category: "Original", bpm: "190" },

  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 19, category: "Original", bpm: "175" },
  { title: "Headless Chicken", artist: "r300k", mode: "Double", level: 19, category: "Original", bpm: "180" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 19, category: "Xross", bpm: "170" },
  { title: "Phalanx", artist: "Cranky", mode: "Double", level: 19, category: "Xross", bpm: "180" },
  { title: "Destination", artist: "SHK", mode: "Double", level: 19, category: "Original", bpm: "162" },

  // === Level 20 ===
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 20, category: "Original", bpm: "175" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 20, category: "Xross", bpm: "170" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 20, category: "Original", bpm: "200" },
  { title: "Ignis Fatuus", artist: "Memme", mode: "Single", level: 20, category: "Xross", bpm: "174" },
  { title: "Vacuum Cleaner", artist: "DOIN", mode: "Single", level: 20, category: "Original", bpm: "160" },
  { title: "Paradoxx", artist: "NATO", mode: "Single", level: 20, category: "Original", bpm: "200" },
  { title: "Asterion", artist: "Cranky", mode: "Single", level: 20, category: "Xross", bpm: "180" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 20, category: "Original", bpm: "195" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 20, category: "Original", bpm: "200" },
  { title: "Trashy Innocence", artist: "Last Note.", mode: "Single", level: 20, category: "Xross", bpm: "180" },
  { title: "MSG", artist: "ATAS", mode: "Single", level: 20, category: "Xross", bpm: "175" },
  { title: "Rock the House", artist: "Cashew", mode: "Single", level: 20, category: "Original", bpm: "192" },
  { title: "Le Grand Rouge", artist: "WAX", mode: "Single", level: 20, category: "Original", bpm: "156" },

  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 20, category: "Xross", bpm: "170" },
  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 20, category: "Original", bpm: "175" },
  { title: "Chimera", artist: "YAHPP", mode: "Double", level: 20, category: "Original", bpm: "200" },
  { title: "Ignis Fatuus", artist: "Memme", mode: "Double", level: 20, category: "Xross", bpm: "174" },
  { title: "Asterion", artist: "Cranky", mode: "Double", level: 20, category: "Xross", bpm: "180" },

  // === Level 21 ===
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 21, category: "Xross", bpm: "170" },
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 21, category: "Original", bpm: "175" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 21, category: "Original", bpm: "200" },
  { title: "Vacuum", artist: "DOIN", mode: "Single", level: 21, category: "Original", bpm: "160" },
  { title: "Hestia", artist: "Cranky", mode: "Single", level: 21, category: "Xross", bpm: "185" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 21, category: "Original", bpm: "195" },
  { title: "Cross Over", artist: "YAHPP", mode: "Single", level: 21, category: "Original", bpm: "200" },
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 21, category: "Original", bpm: "210" },
  { title: "Forgotten Vampire", artist: "WAX", mode: "Single", level: 21, category: "Original", bpm: "168" },
  { title: "Skeptic", artist: "WAX", mode: "Single", level: 21, category: "Original", bpm: "162" },
  { title: "Gloria", artist: "Croire", mode: "Single", level: 21, category: "Original", bpm: "186" },
  { title: "Dream to Nightmare", artist: "Cashew", mode: "Single", level: 21, category: "Original", bpm: "205" },

  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 21, category: "Xross", bpm: "170" },
  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 21, category: "Original", bpm: "175" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Double", level: 21, category: "Original", bpm: "200" },
  { title: "Hestia", artist: "Cranky", mode: "Double", level: 21, category: "Xross", bpm: "185" },

  // === Level 22 ===
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 22, category: "Original", bpm: "175" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 22, category: "Xross", bpm: "170" },
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 22, category: "Original", bpm: "210" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 22, category: "Original", bpm: "200" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 22, category: "Original", bpm: "195" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 22, category: "Original", bpm: "200" },
  { title: "Arcturus", artist: "Memme", mode: "Single", level: 22, category: "Xross", bpm: "185" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 22, category: "Original", bpm: "220" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 22, category: "Original", bpm: "200" },
  { title: "Cross Over", artist: "YAHPP", mode: "Single", level: 22, category: "Original", bpm: "200" },
  { title: "Skeptic", artist: "WAX", mode: "Single", level: 22, category: "Original", bpm: "162" },

  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 22, category: "Original", bpm: "175" },
  { title: "Chimera", artist: "YAHPP", mode: "Double", level: 22, category: "Original", bpm: "200" },
  { title: "Loki", artist: "Lotze", mode: "Double", level: 22, category: "Original", bpm: "195" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 22, category: "Xross", bpm: "170" },

  // === Level 23 ===
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 23, category: "Original", bpm: "175" },
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 23, category: "Original", bpm: "210" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 23, category: "Original", bpm: "200" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 23, category: "Original", bpm: "200" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 23, category: "Xross", bpm: "170" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 23, category: "Original", bpm: "220" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 23, category: "Original", bpm: "200" },
  { title: "Cross Over", artist: "YAHPP", mode: "Single", level: 23, category: "Original", bpm: "200" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 23, category: "Original", bpm: "195" },
  { title: "Arcturus", artist: "Memme", mode: "Single", level: 23, category: "Xross", bpm: "185" },

  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 23, category: "Original", bpm: "175" },
  { title: "Chimera", artist: "YAHPP", mode: "Double", level: 23, category: "Original", bpm: "200" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Double", level: 23, category: "Xross", bpm: "170" },

  // === Level 24 ===
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 24, category: "Original", bpm: "175" },
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 24, category: "Original", bpm: "210" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 24, category: "Original", bpm: "200" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 24, category: "Original", bpm: "220" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 24, category: "Original", bpm: "200" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 24, category: "Original", bpm: "200" },
  { title: "Cross Over", artist: "YAHPP", mode: "Single", level: 24, category: "Original", bpm: "200" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 24, category: "Original", bpm: "195" },
  { title: "Conflict", artist: "Siromaru + Cranky", mode: "Single", level: 24, category: "Xross", bpm: "170" },

  { title: "Gargoyle", artist: "Sanxion7", mode: "Double", level: 24, category: "Original", bpm: "175" },
  { title: "Chimera", artist: "YAHPP", mode: "Double", level: 24, category: "Original", bpm: "200" },

  // === Level 25 ===
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 25, category: "Original", bpm: "210" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 25, category: "Original", bpm: "200" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 25, category: "Original", bpm: "220" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 25, category: "Original", bpm: "200" },
  { title: "Gargoyle", artist: "Sanxion7", mode: "Single", level: 25, category: "Original", bpm: "175" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 25, category: "Original", bpm: "200" },
  { title: "Loki", artist: "Lotze", mode: "Single", level: 25, category: "Original", bpm: "195" },

  // === Level 26 ===
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 26, category: "Original", bpm: "210" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 26, category: "Original", bpm: "220" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 26, category: "Original", bpm: "200" },
  { title: "Nyarlathotep", artist: "NATO", mode: "Single", level: 26, category: "Original", bpm: "200" },
  { title: "Chimera", artist: "YAHPP", mode: "Single", level: 26, category: "Original", bpm: "200" },

  // === Level 27 ===
  { title: "Shub Niggurath", artist: "NATO", mode: "Single", level: 27, category: "Original", bpm: "210" },
  { title: "Yog Sothoth", artist: "NATO", mode: "Single", level: 27, category: "Original", bpm: "220" },
  { title: "V3", artist: "YAHPP", mode: "Single", level: 27, category: "Original", bpm: "200" },
];

function seedDatabase() {
  initializeDb();
  const db = getDb();

  // Clear existing songs
  db.prepare('DELETE FROM songs').run();

  const stmt = db.prepare(`
    INSERT INTO songs (title, artist, jacket_url, mode, level, category, bpm)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction((songList) => {
    for (const song of songList) {
      stmt.run(song.title, song.artist, song.jacket_url || '', song.mode, song.level, song.category || '', song.bpm || '');
    }
  });

  insertAll(songs);

  const count = db.prepare('SELECT COUNT(*) as count FROM songs').get();
  console.log(`Seeded ${count.count} songs into database`);

  // Print stats
  const stats = db.prepare('SELECT level, mode, COUNT(*) as count FROM songs GROUP BY level, mode ORDER BY level, mode').all();
  console.log('\nSong distribution:');
  stats.forEach(s => console.log(`  Level ${s.level} ${s.mode}: ${s.count} songs`));

  db.close();
}

seedDatabase();
