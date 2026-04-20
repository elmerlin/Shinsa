const { initializeDb, getDb, DB_PATH } = require('../server/db/schema');
const { syncTournamentPlacementSnapshots } = require('../server/lib/tournamentPlacings');

initializeDb();
const db = getDb();

const onlyCompleted = process.argv.includes('--completed-only');
const tournaments = onlyCompleted
  ? db.prepare("SELECT id, name, phase FROM tournaments WHERE phase = 'COMPLETED' ORDER BY created_at ASC").all()
  : db.prepare('SELECT id, name, phase FROM tournaments ORDER BY created_at ASC').all();

let updatedCount = 0;
let phaseSnapshotCount = 0;

console.log(`Backfilling tournament placings in ${DB_PATH}`);
console.log(`Scope: ${onlyCompleted ? 'completed tournaments only' : 'all tournaments'} (${tournaments.length} tournaments)\n`);

for (const tournament of tournaments) {
  const result = syncTournamentPlacementSnapshots(db, tournament.id);
  const finalCount = Array.isArray(result?.tournament?.final) ? result.tournament.final.length : 0;
  updatedCount += 1;
  phaseSnapshotCount += result?.phases || 0;
  console.log(`- ${tournament.name} [${tournament.phase}] -> final placings: ${finalCount}, phase snapshots: ${result?.phases || 0}`);
}

console.log(`\nDone. Updated ${updatedCount} tournaments and ${phaseSnapshotCount} phases.`);
