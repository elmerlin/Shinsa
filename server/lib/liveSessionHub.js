const clientsBySessionId = new Map();

function addLiveSessionClient(sessionId, userId, res) {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedSessionId || !normalizedUserId || !res) return () => {};

  let clients = clientsBySessionId.get(normalizedSessionId);
  if (!clients) {
    clients = new Set();
    clientsBySessionId.set(normalizedSessionId, clients);
  }

  const client = { userId: normalizedUserId, res };
  clients.add(client);

  return () => {
    const current = clientsBySessionId.get(normalizedSessionId);
    if (!current) return;
    current.delete(client);
    if (current.size === 0) {
      clientsBySessionId.delete(normalizedSessionId);
    }
  };
}

function emitLiveSessionEvent(sessionId, eventName, payloadOrFactory) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return 0;

  const clients = clientsBySessionId.get(normalizedSessionId);
  if (!clients || clients.size === 0) return 0;

  let sent = 0;
  for (const client of clients) {
    try {
      const payload = typeof payloadOrFactory === 'function'
        ? payloadOrFactory({ userId: client.userId, res: client.res })
        : payloadOrFactory;
      if (payload === undefined) continue;
      client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload || {})}\n\n`);
      sent += 1;
    } catch {
      // Broken sockets are removed by the route close handler.
    }
  }

  return sent;
}

module.exports = {
  addLiveSessionClient,
  emitLiveSessionEvent,
};
