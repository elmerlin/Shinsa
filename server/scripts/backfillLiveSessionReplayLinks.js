const { getDb } = require('../db/schema');
const liveRoutes = require('../routes/live');

async function main() {
  const sessionIds = process.argv.slice(2).map((value) => String(value || '').trim()).filter(Boolean);
  if (sessionIds.length === 0) {
    console.error('Usage: node server/scripts/backfillLiveSessionReplayLinks.js <session-id> [session-id...]');
    process.exit(1);
  }

  const db = getDb();
  const results = [];

  for (const sessionId of sessionIds) {
    try {
      const result = await liveRoutes.backfillLiveSessionReplayData(db, sessionId);
      results.push(result);
    } catch (err) {
      results.push({
        session_id: sessionId,
        skipped: true,
        error: err.message,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
