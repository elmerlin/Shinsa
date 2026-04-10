'use strict';

const { URL } = require('url');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const room = require('./room');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';

// userId -> { ws, roomId }
const clients = new Map();

// ---------------------------------------------------------------------------
//  Broadcasting helpers
// ---------------------------------------------------------------------------

function sendToClient(userId, message) {
  const client = clients.get(userId);
  if (!client || client.ws.readyState !== 1) return;
  try {
    client.ws.send(JSON.stringify(message));
  } catch { /* ignore broken sockets */ }
}

function broadcastToRoom(roomId, message) {
  const r = room.getRoom(roomId);
  if (!r) return;
  const payload = JSON.stringify(message);
  const allUserIds = [
    ...r.seats.filter(s => s.userId).map(s => s.userId),
    ...(r.spectators || []),
  ];
  for (const uid of allUserIds) {
    const client = clients.get(uid);
    if (client && client.ws.readyState === 1) {
      try { client.ws.send(payload); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
//  Room callbacks (called from room.js simulation loop)
// ---------------------------------------------------------------------------

room.setTickCallback((roomId, snapshot, gridChanges) => {
  broadcastToRoom(roomId, { type: 'tick', snapshot, gridChanges });
});

room.setRoundEndCallback((roomId, winner, roundWins) => {
  broadcastToRoom(roomId, { type: 'round_end', winner, roundWins });
});

room.setMatchEndCallback((roomId, winner, stats) => {
  broadcastToRoom(roomId, { type: 'match_end', winner, stats });
});

// ---------------------------------------------------------------------------
//  Message handlers
// ---------------------------------------------------------------------------

function handleMessage(userId, data) {
  switch (data.type) {
    case 'create_room': {
      const result = room.createRoom(userId, data.character);
      if (!result) {
        sendToClient(userId, { type: 'error', message: 'Failed to create room' });
        return;
      }
      const client = clients.get(userId);
      if (client) client.roomId = result.roomId;
      sendToClient(userId, { type: 'room_created', room: result });
      break;
    }

    case 'join_room': {
      const result = room.joinSeat(data.roomId, userId, data.character);
      if (!result) {
        sendToClient(userId, { type: 'error', message: 'Failed to join room' });
        return;
      }
      const client = clients.get(userId);
      if (client) client.roomId = data.roomId;
      broadcastToRoom(data.roomId, { type: 'player_joined', userId, character: data.character, room: result });
      break;
    }

    case 'spectate': {
      const result = room.joinSpectator(data.roomId, userId);
      if (!result) {
        sendToClient(userId, { type: 'error', message: 'Failed to spectate room' });
        return;
      }
      const client = clients.get(userId);
      if (client) client.roomId = data.roomId;
      sendToClient(userId, { type: 'room_state', room: result });
      break;
    }

    case 'leave': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      const result = room.leaveSeat(roomId, userId);
      if (client) client.roomId = null;
      broadcastToRoom(roomId, { type: 'player_left', userId, room: result });
      break;
    }

    case 'start': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      const result = room.startMatch(roomId, userId, data.botMode);
      if (!result) {
        sendToClient(userId, { type: 'error', message: 'Failed to start match' });
        return;
      }
      broadcastToRoom(roomId, { type: 'round_start', room: result });
      break;
    }

    case 'input': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      room.processInput(roomId, userId, { dir: data.dir, bomb: data.bomb });
      break;
    }

    case 'chat': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      room.addChat(roomId, userId, data.text);
      broadcastToRoom(roomId, { type: 'chat', userId, text: data.text });
      break;
    }

    case 'emote': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      broadcastToRoom(roomId, { type: 'emote', userId, emote: data.emote });
      break;
    }

    case 'rematch': {
      const client = clients.get(userId);
      const roomId = data.roomId || (client && client.roomId);
      if (!roomId) return;
      const result = room.handleRematch(roomId, userId);
      if (result && result.started) {
        broadcastToRoom(roomId, { type: 'round_start', room: result });
      } else {
        broadcastToRoom(roomId, { type: 'rematch_vote', userId, room: result });
      }
      break;
    }

    default:
      sendToClient(userId, { type: 'error', message: `Unknown message type: ${data.type}` });
  }
}

// ---------------------------------------------------------------------------
//  Disconnect handler
// ---------------------------------------------------------------------------

function handleDisconnect(userId) {
  const client = clients.get(userId);
  const roomId = client && client.roomId;
  clients.delete(userId);
  if (roomId) {
    room.handleDisconnect(roomId, userId);
    broadcastToRoom(roomId, { type: 'player_disconnected', userId });
  }
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

    if (parsed.pathname !== '/ws/pet-bomber') return;

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

    // Close any existing connection for this user
    const existing = clients.get(userId);
    if (existing && existing.ws.readyState === 1) {
      try { existing.ws.close(4000, 'Replaced by new connection'); } catch { /* ignore */ }
    }

    clients.set(userId, { ws, roomId: null });
    sendToClient(userId, { type: 'connected', userId });

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        sendToClient(userId, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      handleMessage(userId, data);
    });

    ws.on('close', () => {
      handleDisconnect(userId);
    });

    ws.on('error', () => {
      handleDisconnect(userId);
    });
  });

  return wss;
}

module.exports = { attachToServer };
