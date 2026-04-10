'use strict';

const { URL } = require('url');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';

// ---------------------------------------------------------------------------
//  Village presence tracking
//  rooms: Map<hostUserId, Map<visitorUserId, { ws, username, since }>>
// ---------------------------------------------------------------------------

const rooms = new Map();

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function sendJson(ws, message) {
  if (ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(message)); } catch { /* ignore broken sockets */ }
}

function broadcastToRoom(hostUserId, message, excludeUserId = null) {
  const room = rooms.get(hostUserId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const [uid, entry] of room.entries()) {
    if (uid === excludeUserId) continue;
    if (entry.ws.readyState === 1) {
      try { entry.ws.send(payload); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
//  Public: query presence for HTTP fallback endpoints
// ---------------------------------------------------------------------------

function getVillagePresence(hostUserId) {
  const room = rooms.get(hostUserId);
  if (!room) return [];
  const result = [];
  for (const [userId, entry] of room.entries()) {
    result.push({ user_id: userId, username: entry.username, since: entry.since });
  }
  return result;
}

// ---------------------------------------------------------------------------
//  Message handlers
// ---------------------------------------------------------------------------

function handleJoinVillage(userId, username, ws, data) {
  const hostUserId = data.hostUserId;
  if (!hostUserId) {
    sendJson(ws, { type: 'error', message: 'Missing hostUserId' });
    return;
  }

  // Leave any previous room this connection was in
  leaveCurrentRoom(userId);

  // Join the new room
  if (!rooms.has(hostUserId)) rooms.set(hostUserId, new Map());
  const room = rooms.get(hostUserId);
  room.set(userId, { ws, username, since: Date.now() });

  // Tag the ws so we know which room to leave on disconnect
  ws._pwRoom = hostUserId;

  // Send current presence list to the joining user
  sendJson(ws, { type: 'presence_list', visitors: getVillagePresence(hostUserId) });

  // Broadcast visitor_joined to everyone else in the room
  broadcastToRoom(hostUserId, {
    type: 'visitor_joined',
    userId,
    username,
    since: Date.now(),
  }, userId);
}

function leaveCurrentRoom(userId) {
  for (const [hostUserId, room] of rooms.entries()) {
    if (room.has(userId)) {
      room.delete(userId);
      broadcastToRoom(hostUserId, { type: 'visitor_left', userId });
      if (room.size === 0) rooms.delete(hostUserId);
      return;
    }
  }
}

function handleMessage(userId, username, ws, data) {
  switch (data.type) {
    case 'join_village':
      handleJoinVillage(userId, username, ws, data);
      break;

    case 'leave_village':
      leaveCurrentRoom(userId);
      break;

    default:
      sendJson(ws, { type: 'error', message: `Unknown message type: ${data.type}` });
  }
}

function handleDisconnect(userId) {
  leaveCurrentRoom(userId);
}

// ---------------------------------------------------------------------------
//  Server attachment
// ---------------------------------------------------------------------------

function attachToServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let parsed;
    try {
      parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      socket.destroy();
      return;
    }

    if (parsed.pathname !== '/ws/pet-world') return;

    const token = parsed.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, user);
    });
  });

  wss.on('connection', (ws, _req, user) => {
    const userId = user.id;
    const username = user.username || '';

    sendJson(ws, { type: 'connected', userId });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        sendJson(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      handleMessage(userId, username, ws, data);
    });

    ws.on('close', () => {
      handleDisconnect(userId);
    });

    ws.on('error', () => {
      handleDisconnect(userId);
    });
  });

  // Ping/pong heartbeat every 30s to detect dead connections
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30 * 1000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return wss;
}

module.exports = { attachToServer, getVillagePresence };
