const clientsByTournamentId = new Map();

function addTournamentDiscussionClient(tournamentId, userId, res) {
  const tid = String(tournamentId || '').trim();
  const uid = String(userId || '').trim();
  if (!tid || !uid || !res) return () => {};

  let clients = clientsByTournamentId.get(tid);
  if (!clients) {
    clients = new Set();
    clientsByTournamentId.set(tid, clients);
  }

  const client = { userId: uid, res };
  clients.add(client);

  return () => {
    const current = clientsByTournamentId.get(tid);
    if (!current) return;
    current.delete(client);
    if (current.size === 0) {
      clientsByTournamentId.delete(tid);
    }
  };
}

function emitTournamentDiscussionEvent(tournamentId, eventName, payload) {
  const tid = String(tournamentId || '').trim();
  if (!tid) return 0;

  const clients = clientsByTournamentId.get(tid);
  if (!clients || clients.size === 0) return 0;

  let sent = 0;
  for (const client of clients) {
    try {
      client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload || {})}\n\n`);
      sent += 1;
    } catch {
      // Broken sockets are removed by the route close handler.
    }
  }
  return sent;
}

function getTournamentDiscussionViewerCount(tournamentId) {
  const tid = String(tournamentId || '').trim();
  const clients = clientsByTournamentId.get(tid);
  return clients ? clients.size : 0;
}

module.exports = {
  addTournamentDiscussionClient,
  emitTournamentDiscussionEvent,
  getTournamentDiscussionViewerCount,
};
