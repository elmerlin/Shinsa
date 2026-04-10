'use strict';

const sim = require('./simulation');
const bot = require('./bot');

// ─── In-memory storage ──────────────────────────────────────────
const rooms = new Map();

// ─── Callbacks ───────────────────────────────────────────────────
let tickCallback = null;
let roundStartCallback = null;
let roundEndCallback = null;
let matchEndCallback = null;

function setTickCallback(fn) { tickCallback = fn; }
function setRoundStartCallback(fn) { roundStartCallback = fn; }
function setRoundEndCallback(fn) { roundEndCallback = fn; }
function setMatchEndCallback(fn) { matchEndCallback = fn; }

// ─── Constants ───────────────────────────────────────────────────
const ROOM_ID_LENGTH = 6;
const COUNTDOWN_SECONDS = 3;
const ROUND_END_DELAY_MS = 3000;
const STALE_ROOM_MS = 30 * 60 * 1000; // 30 minutes
const DISCONNECT_GRACE_MS = 6000;
const BOT_CHARACTERS = ['dojocat', 'buu', 'devit', 'pixiu'];

// ─── Helpers ─────────────────────────────────────────────────────
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Avoid collisions
  return rooms.has(id) ? generateRoomId() : id;
}

function createMatchState() {
  return {
    roundsToWin: 2,
    roundWins: [0, 0, 0, 0],
    currentRound: 0,
    simulation: null,
    status: 'waiting', // waiting | countdown | playing | round_end | match_end
    tickInterval: null,
    countdownTimer: null,
  };
}

function makeSeat(userId, character, isBot = false) {
  return {
    userId,
    character,
    isBot,
    botCharacter: isBot ? character : null,
    ready: isBot,
  };
}

function roomSummary(room) {
  const playerCount = room.seats.filter(s => s !== null && !s.isBot).length;
  const spectatorCount = room.spectators.size;
  return {
    id: room.id,
    hostId: room.hostId,
    playerCount,
    spectatorCount,
    status: room.match.status,
    createdAt: room.createdAt,
  };
}

// ─── Room CRUD ───────────────────────────────────────────────────
function createRoom(hostId, hostCharacter) {
  const id = generateRoomId();
  const room = {
    id,
    hostId,
    seats: [makeSeat(hostId, hostCharacter), null, null, null],
    spectators: new Set(),
    match: createMatchState(),
    chat: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    disconnectTimers: new Map(),
  };
  rooms.set(id, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function listPublicRooms() {
  const result = [];
  for (const room of rooms.values()) {
    if (room.match.status !== 'match_end') {
      result.push(roomSummary(room));
    }
  }
  return result;
}

// ─── Seat management ─────────────────────────────────────────────
function joinSeat(roomId, userId, character) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.match.status !== 'waiting') return { success: false, error: 'Match in progress' };

  // If user is already in a seat, return success (idempotent)
  const existingIdx = room.seats.findIndex(s => s && s.userId === userId);
  if (existingIdx !== -1) return { success: true, seat: existingIdx };

  // Find first empty seat
  const emptyIdx = room.seats.findIndex(s => s === null);
  if (emptyIdx === -1) return { success: false, error: 'No empty seats' };

  room.seats[emptyIdx] = makeSeat(userId, character);
  room.lastActivity = Date.now();
  return { success: true, seat: emptyIdx };
}

function leaveSeat(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, wasHost: false };

  const idx = room.seats.findIndex(s => s && s.userId === userId);
  if (idx === -1) return { success: false, wasHost: false };

  const wasHost = room.hostId === userId;
  room.seats[idx] = null;
  room.lastActivity = Date.now();

  // If host leaves while waiting, transfer host or clean up
  if (wasHost && room.match.status === 'waiting') {
    const nextHuman = room.seats.find(s => s && !s.isBot);
    if (nextHuman) {
      room.hostId = nextHuman.userId;
    } else {
      // No humans left, clean up
      stopMatch(roomId);
      rooms.delete(roomId);
    }
  }

  return { success: true, wasHost };
}

// ─── Spectators ──────────────────────────────────────────────────
function joinSpectator(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false };
  room.spectators.add(userId);
  room.lastActivity = Date.now();
  return { success: true };
}

function leaveSpectator(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.spectators.delete(userId);
  room.lastActivity = Date.now();
}

// ─── Match lifecycle ─────────────────────────────────────────────
function pickBotCharacters(usedCharacters, count) {
  const available = BOT_CHARACTERS.filter(c => !usedCharacters.includes(c));
  const result = [];
  for (let i = 0; i < count; i++) {
    // Cycle through available, then repeat if needed
    result.push(available[i % available.length] || BOT_CHARACTERS[i % BOT_CHARACTERS.length]);
  }
  return result;
}

function startMatch(roomId, hostId, botMode) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.hostId !== hostId) return { success: false, error: 'Not the host' };
  if (room.match.status !== 'waiting') return { success: false, error: 'Match already started' };

  // Collect human characters to avoid for bots
  const humanCharacters = room.seats
    .filter(s => s && !s.isBot)
    .map(s => s.character);

  if (botMode === 'duel') {
    // Fill seat 1 with a bot (seat 0 = host)
    const botChars = pickBotCharacters(humanCharacters, 1);
    room.seats[1] = makeSeat(`bot-1`, botChars[0], true);
    // Leave seats 2-3 empty but we need at least 2 players
  } else if (botMode === 'full') {
    // Fill seats 1-3 with bots
    const botChars = pickBotCharacters(humanCharacters, 3);
    for (let i = 1; i <= 3; i++) {
      if (!room.seats[i] || room.seats[i] === null) {
        room.seats[i] = makeSeat(`bot-${i}`, botChars[i - 1], true);
      }
    }
  } else {
    // null botMode: fill empty seats with bots up to 4
    const takenCharacters = room.seats
      .filter(s => s !== null)
      .map(s => s.character);
    let botIdx = 0;
    for (let i = 0; i < 4; i++) {
      if (room.seats[i] === null) {
        const botChars = pickBotCharacters([...takenCharacters], 1);
        room.seats[i] = makeSeat(`bot-${i}`, botChars[0], true);
        takenCharacters.push(botChars[0]);
        botIdx++;
      }
    }
  }

  // Store bot mode for rematch
  room.botMode = botMode || null;

  // Reset match state
  room.match.roundWins = [0, 0, 0, 0];
  room.match.currentRound = 0;
  room.match.status = 'countdown';
  room.lastActivity = Date.now();

  // Start countdown
  let count = COUNTDOWN_SECONDS;
  room.match.countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(room.match.countdownTimer);
      room.match.countdownTimer = null;
      startRound(roomId);
    }
  }, 1000);

  return { success: true };
}

function startRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.match.currentRound++;
  room.match.status = 'playing';

  // Build player list for simulation from occupied seats
  const players = [];
  for (let i = 0; i < 4; i++) {
    const seat = room.seats[i];
    if (seat) {
      players.push({
        id: seat.userId,
        seat: i,
        character: seat.character,
        isBot: seat.isBot,
      });
    }
  }

  // Create new simulation state for the round
  room.match.simulation = sim.createRound(players);

  // Pending human inputs keyed by userId
  room._pendingInputs = new Map();

  // Notify round start with grid data
  if (roundStartCallback) {
    roundStartCallback(room.id, getRoomSnapshot(room));
  }

  // Start tick loop
  const tickMs = 1000 / (sim.TICK_RATE || 20);
  room.match.tickInterval = setInterval(() => {
    tickLoop(room);
  }, tickMs);
}

function tickLoop(room) {
  const state = room.match.simulation;
  if (!state) return;

  // Collect inputs as a Map (sim.tick iterates with for...of)
  const allInputs = new Map();
  for (let i = 0; i < 4; i++) {
    const seat = room.seats[i];
    if (!seat) continue;

    if (seat.isBot) {
      // state.players is a Map, so use .get()
      const botPlayer = state.players.get(seat.userId);
      if (botPlayer && botPlayer.alive) {
        allInputs.set(seat.userId, bot.getInput(state, botPlayer));
      }
    } else {
      // Merge pending human input
      const humanInput = room._pendingInputs ? room._pendingInputs.get(seat.userId) : null;
      if (humanInput) {
        allInputs.set(seat.userId, humanInput);
        room._pendingInputs.delete(seat.userId);
      }
    }
  }

  // Advance simulation — tick() returns an array of grid changes
  const gridChanges = sim.tick(state, allInputs);

  // Build compact snapshot
  const snapshot = sim.getSnapshot(state);

  // Notify via callback
  if (tickCallback) {
    tickCallback(room.id, snapshot, gridChanges);
  }

  // Check round over
  if (sim.isRoundOver(state)) {
    handleRoundEnd(room, sim.getRoundWinner(state));
  }
}

function handleRoundEnd(room, winnerSeat) {
  // Stop tick loop
  if (room.match.tickInterval) {
    clearInterval(room.match.tickInterval);
    room.match.tickInterval = null;
  }

  room.match.status = 'round_end';

  // Record winner
  if (winnerSeat !== null && winnerSeat !== undefined && winnerSeat >= 0 && winnerSeat < 4) {
    room.match.roundWins[winnerSeat]++;
  }

  if (roundEndCallback) {
    roundEndCallback(room.id, winnerSeat, [...room.match.roundWins]);
  }

  // Check for match winner
  const matchWinnerSeat = room.match.roundWins.findIndex(w => w >= room.match.roundsToWin);
  if (matchWinnerSeat !== -1) {
    handleMatchEnd(room, matchWinnerSeat);
    return;
  }

  // Start next round after delay
  setTimeout(() => {
    if (room.match.status === 'round_end') {
      room.match.status = 'countdown';
      let count = COUNTDOWN_SECONDS;
      room.match.countdownTimer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(room.match.countdownTimer);
          room.match.countdownTimer = null;
          startRound(room.id);
        }
      }, 1000);
    }
  }, ROUND_END_DELAY_MS);
}

function handleMatchEnd(room, winnerSeat) {
  room.match.status = 'match_end';

  // Clean up simulation
  if (room.match.tickInterval) {
    clearInterval(room.match.tickInterval);
    room.match.tickInterval = null;
  }

  const stats = {
    rounds: room.match.currentRound,
    roundWins: [...room.match.roundWins],
  };

  if (matchEndCallback) {
    matchEndCallback(room.id, winnerSeat, stats);
  }
}

function stopMatch(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.match.tickInterval) {
    clearInterval(room.match.tickInterval);
    room.match.tickInterval = null;
  }
  if (room.match.countdownTimer) {
    clearInterval(room.match.countdownTimer);
    room.match.countdownTimer = null;
  }

  room.match.simulation = null;
  room.match.status = 'waiting';
  room._pendingInputs = null;

  // Remove bots from seats
  for (let i = 0; i < 4; i++) {
    if (room.seats[i] && room.seats[i].isBot) {
      room.seats[i] = null;
    }
  }
}

// ─── Input processing ────────────────────────────────────────────
function processInput(roomId, userId, input) {
  const room = rooms.get(roomId);
  if (!room || room.match.status !== 'playing') return;
  if (!room._pendingInputs) return;

  // Only accept input from seated human players
  const seat = room.seats.find(s => s && s.userId === userId && !s.isBot);
  if (!seat) return;

  room._pendingInputs.set(userId, input);
  room.lastActivity = Date.now();
}

// ─── Disconnect / Reconnect ─────────────────────────────────────
function handleDisconnect(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const seatIdx = room.seats.findIndex(s => s && s.userId === userId && !s.isBot);
  if (seatIdx === -1) {
    // Maybe a spectator
    room.spectators.delete(userId);
    return;
  }

  // If match is not active, just remove
  if (room.match.status === 'waiting') {
    leaveSeat(roomId, userId);
    return;
  }

  // Start grace period - convert to bot after timeout
  const timer = setTimeout(() => {
    room.disconnectTimers.delete(userId);
    const seat = room.seats[seatIdx];
    if (seat && seat.userId === userId && !seat.isBot) {
      // Convert to bot
      seat.isBot = true;
      seat.botCharacter = seat.character;
    }
  }, DISCONNECT_GRACE_MS);

  room.disconnectTimers.set(userId, timer);
}

function handleReconnect(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Cancel grace timer if pending
  const timer = room.disconnectTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    room.disconnectTimers.delete(userId);
  }

  // Reclaim seat if still exists (even if converted to bot)
  const seatIdx = room.seats.findIndex(s => s && s.userId === userId);
  if (seatIdx !== -1) {
    const seat = room.seats[seatIdx];
    seat.isBot = false;
    seat.botCharacter = null;
  }
}

// ─── Chat ────────────────────────────────────────────────────────
function addChat(roomId, userId, text) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const message = {
    userId,
    text: String(text).slice(0, 200), // cap length
    ts: Date.now(),
  };
  room.chat.push(message);

  // Keep only last 100 messages
  if (room.chat.length > 100) {
    room.chat = room.chat.slice(-100);
  }

  room.lastActivity = Date.now();
  return message;
}

// ─── Room snapshot (serializable for WS broadcast) ──────────────
function getRoomSnapshot(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    seats: room.seats,
    status: room.match.status,
    roundWins: [...room.match.roundWins],
    currentRound: room.match.currentRound,
    round: room.match.simulation ? {
      grid: room.match.simulation.grid,
    } : null,
  };
}

// ─── Cleanup ─────────────────────────────────────────────────────
function cleanupStaleRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > STALE_ROOM_MS) {
      stopMatch(id);
      // Clear disconnect timers
      for (const timer of room.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      rooms.delete(id);
    }
  }
}

// ─── Rematch ────────────────────────────────────────────────────
function handleRematch(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (!room.rematchVotes) room.rematchVotes = new Set();
  room.rematchVotes.add(userId);

  // Count seated human players
  const humanSeats = room.seats.filter(s => s && s.userId && !s.isBot);
  const threshold = Math.max(1, humanSeats.length);

  if (room.rematchVotes.size >= threshold) {
    room.rematchVotes = new Set();
    // Reset match state
    stopMatch(roomId);
    room.match.status = 'waiting';
    room.lastActivity = Date.now();
    const result = startMatch(roomId, room.hostId, room.botMode);
    if (result && result.success) {
      result.started = true;
      return result;
    }
  }

  return { roomId, rematchVotes: room.rematchVotes.size, needed: threshold };
}

// ─── Exports ─────────────────────────────────────────────────────
module.exports = {
  createRoom,
  getRoom,
  getRoomSnapshot,
  listPublicRooms,
  joinSeat,
  leaveSeat,
  joinSpectator,
  leaveSpectator,
  startMatch,
  startRound,
  stopMatch,
  processInput,
  handleDisconnect,
  handleReconnect,
  addChat,
  handleRematch,
  cleanupStaleRooms,
  setTickCallback,
  setRoundStartCallback,
  setRoundEndCallback,
  setMatchEndCallback,
};
