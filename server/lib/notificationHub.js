const clientsByUserId = new Map();

function addNotificationClient(userId, res) {
  if (!userId || !res) return () => {};

  const key = String(userId);
  let clients = clientsByUserId.get(key);
  if (!clients) {
    clients = new Set();
    clientsByUserId.set(key, clients);
  }
  clients.add(res);

  return () => {
    const current = clientsByUserId.get(key);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) {
      clientsByUserId.delete(key);
    }
  };
}

function emitNotification(userId, notification) {
  const key = String(userId || '');
  if (!key) return 0;
  const clients = clientsByUserId.get(key);
  if (!clients || clients.size === 0) return 0;

  const payload = JSON.stringify(notification || {});
  let sent = 0;
  for (const res of clients) {
    try {
      res.write(`event: notification\ndata: ${payload}\n\n`);
      sent += 1;
    } catch {
      // Ignore broken sockets; they are cleaned up on close handlers.
    }
  }
  return sent;
}

function emitEvent(userId, eventType, data) {
  const key = String(userId || '');
  if (!key) return 0;
  const clients = clientsByUserId.get(key);
  if (!clients || clients.size === 0) return 0;

  const payload = JSON.stringify(data || {});
  let sent = 0;
  for (const res of clients) {
    try {
      res.write(`event: ${eventType}\ndata: ${payload}\n\n`);
      sent += 1;
    } catch {
      // Ignore broken sockets
    }
  }
  return sent;
}

module.exports = {
  addNotificationClient,
  emitNotification,
  emitEvent,
};
