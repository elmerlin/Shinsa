const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { enrichTournamentSummaries, parseTournamentConfig } = require('../lib/tournamentSummary');
const { requireAuth, optionalAuth } = require('./auth');
const {
  addTournamentDiscussionClient,
  emitTournamentDiscussionEvent,
  getTournamentDiscussionViewerCount,
} = require('../lib/tournamentDiscussionHub');

// GET all tournaments (excludes archived by default, ?include_archived=1 to include)
router.get('/', (req, res) => {
  const db = getDb();
  const includeArchived = req.query.include_archived === '1';
  const tournaments = includeArchived
    ? db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM tournaments WHERE archived = 0 ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

// GET search tournaments (searches name, location, and player names)
router.get('/search', (req, res) => {
  const db = getDb();
  const q = req.query.q || '';
  if (!q.trim()) {
    db.close();
    return res.json([]);
  }
  const pattern = `%${q}%`;
  const tournaments = db.prepare(`
    SELECT DISTINCT t.* FROM tournaments t
    LEFT JOIN players p ON p.tournament_id = t.id
    WHERE t.archived = 0
      AND (t.name LIKE ? OR t.location LIKE ? OR p.name LIKE ?)
    ORDER BY t.created_at DESC
  `).all(pattern, pattern, pattern);
  const enriched = enrichTournamentSummaries(db, tournaments);
  db.close();
  res.json(enriched);
});

// GET archived tournaments
router.get('/archived', (req, res) => {
  const db = getDb();
  const tournaments = db.prepare('SELECT * FROM tournaments WHERE archived = 1 ORDER BY created_at DESC').all();
  db.close();
  res.json(tournaments);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  tournament.config = parseTournamentConfig(tournament.config);
  res.json(tournament);
});

router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { name, location, date, total_rounds, config, avatar, gif_avatar } = req.body;

  const defaultConfig = {
    round_levels: [
      { round: 1, min: 18, max: 19 },
      { round: 2, min: 20, max: 21 },
      { round: 3, min: 22, max: 23 },
    ],
    cards_per_draw: 5,
    vetoes_per_player: 1,
    best_of: 3,
  };

  db.prepare(`
    INSERT INTO tournaments (id, name, location, date, total_rounds, config, avatar, gif_avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, location || '', date || new Date().toISOString().split('T')[0],
    total_rounds || 3, JSON.stringify(config || defaultConfig), avatar || '', gif_avatar || '');

  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  db.close();
  tournament.config = parseTournamentConfig(tournament.config);
  res.status(201).json(tournament);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, location, date, phase, current_round, total_rounds, config, avatar, gif_avatar, poster_bg } = req.body;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare(`
    UPDATE tournaments SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      date = COALESCE(?, date),
      phase = COALESCE(?, phase),
      current_round = COALESCE(?, current_round),
      total_rounds = COALESCE(?, total_rounds),
      config = COALESCE(?, config),
      avatar = COALESCE(?, avatar),
      gif_avatar = COALESCE(?, gif_avatar),
      poster_bg = COALESCE(?, poster_bg)
    WHERE id = ?
  `).run(name, location, date, phase, current_round, total_rounds,
    config ? JSON.stringify(config) : null,
    avatar !== undefined ? avatar : null,
    gif_avatar !== undefined ? gif_avatar : null,
    poster_bg !== undefined ? poster_bg : null,
    req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  updated.config = parseTournamentConfig(updated.config);
  res.json(updated);
});

// PUT archive/unarchive a tournament
router.put('/:id/archive', (req, res) => {
  const db = getDb();
  const { archived } = req.body;
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare('UPDATE tournaments SET archived = ? WHERE id = ?')
    .run(archived ? 1 : 0, req.params.id);

  const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  db.close();
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

// ── Tournament Discussion ──

function normalizeTournamentMessage(row, userId) {
  if (!row) return null;
  const db = getDb();
  const pumpCount = db.prepare('SELECT COUNT(*) as c FROM tournament_discussion_pumps WHERE message_id = ?').get(row.id)?.c || 0;
  const userPumped = userId
    ? !!(db.prepare('SELECT 1 FROM tournament_discussion_pumps WHERE message_id = ? AND user_id = ?').get(row.id, userId))
    : false;
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    user_id: row.user_id,
    username: row.username || '',
    avatar: row.avatar || '',
    skill_title: row.skill_title || '',
    message: row.message || '',
    is_participant: !!row.is_participant,
    pump_count: pumpCount,
    user_pumped: userPumped,
    created_at: row.created_at || '',
  };
}

// SSE stream for real-time discussion updates
router.get('/:id/discussion/stream', optionalAuth, (req, res) => {
  const tournamentId = req.params.id;
  const userId = req.user?.id || `anon-${Date.now()}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  const remove = addTournamentDiscussionClient(tournamentId, userId, res);
  const keepAlive = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { /* ignore */ }
  }, 25000);

  // Send viewer count on connect
  const vc = getTournamentDiscussionViewerCount(tournamentId);
  emitTournamentDiscussionEvent(tournamentId, 'viewer_count', { count: vc });

  req.on('close', () => {
    clearInterval(keepAlive);
    remove();
    const vc2 = getTournamentDiscussionViewerCount(tournamentId);
    emitTournamentDiscussionEvent(tournamentId, 'viewer_count', { count: vc2 });
  });
});

// GET discussion messages
router.get('/:id/discussion', optionalAuth, (req, res) => {
  const db = getDb();
  const tournamentId = req.params.id;
  const userId = req.user?.id || '';
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  const rows = db.prepare(
    'SELECT * FROM tournament_discussion_messages WHERE tournament_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(tournamentId, limit);

  const messages = rows.map(r => normalizeTournamentMessage(r, userId));
  const viewerCount = getTournamentDiscussionViewerCount(tournamentId);

  res.json({ messages, viewer_count: viewerCount });
});

// POST a new discussion message
router.post('/:id/discussion', requireAuth, (req, res) => {
  const db = getDb();
  const tournamentId = req.params.id;
  const userId = req.user.id;
  const rawMessage = String(req.body.message || '').trim();
  if (!rawMessage) return res.status(400).json({ error: 'Message is required' });
  if (rawMessage.length > 500) return res.status(400).json({ error: 'Message too long (max 500 characters)' });

  const tournament = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const user = db.prepare('SELECT id, username, avatar, skill_title FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Check if user is a participant (player) in this tournament
  const isParticipant = !!(db.prepare(
    'SELECT 1 FROM players WHERE tournament_id = ? AND (LOWER(name) = LOWER(?) OR avatar = ?) AND is_active = 1'
  ).get(tournamentId, user.username, user.avatar));

  const id = uuidv4();
  db.prepare(`
    INSERT INTO tournament_discussion_messages (id, tournament_id, user_id, username, avatar, skill_title, message, is_participant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, tournamentId, userId, user.username || '', user.avatar || '', user.skill_title || '', rawMessage, isParticipant ? 1 : 0);

  const row = db.prepare('SELECT * FROM tournament_discussion_messages WHERE id = ?').get(id);
  const message = normalizeTournamentMessage(row, userId);

  emitTournamentDiscussionEvent(tournamentId, 'message_added', { message });

  res.status(201).json({ message });
});

// POST pump/un-pump a discussion message
router.post('/:id/discussion/:messageId/pump', requireAuth, (req, res) => {
  const db = getDb();
  const tournamentId = req.params.id;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const msg = db.prepare('SELECT * FROM tournament_discussion_messages WHERE id = ? AND tournament_id = ?').get(messageId, tournamentId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const existing = db.prepare('SELECT 1 FROM tournament_discussion_pumps WHERE message_id = ? AND user_id = ?').get(messageId, userId);
  if (existing) {
    db.prepare('DELETE FROM tournament_discussion_pumps WHERE message_id = ? AND user_id = ?').run(messageId, userId);
  } else {
    db.prepare('INSERT INTO tournament_discussion_pumps (message_id, user_id) VALUES (?, ?)').run(messageId, userId);
  }

  const message = normalizeTournamentMessage(
    db.prepare('SELECT * FROM tournament_discussion_messages WHERE id = ?').get(messageId),
    userId
  );

  emitTournamentDiscussionEvent(tournamentId, 'message_updated', { message });

  res.json({ message, pumped: !existing });
});

// DELETE a discussion message (only the author)
router.delete('/:id/discussion/:messageId', requireAuth, (req, res) => {
  const db = getDb();
  const tournamentId = req.params.id;
  const messageId = req.params.messageId;
  const userId = req.user.id;

  const msg = db.prepare('SELECT * FROM tournament_discussion_messages WHERE id = ? AND tournament_id = ?').get(messageId, tournamentId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.user_id !== userId) return res.status(403).json({ error: 'Not authorized' });

  db.prepare('DELETE FROM tournament_discussion_messages WHERE id = ?').run(messageId);

  emitTournamentDiscussionEvent(tournamentId, 'message_removed', { message_id: messageId });

  res.json({ success: true });
});

module.exports = router;
