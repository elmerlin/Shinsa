const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  const db = getDb();
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user?.id);
  if (!row || parseInt(row.is_admin, 10) !== 1) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// GET /api/changelog — public changelog list
router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, title, content, pinned, created_at, updated_at
    FROM changelog_entries
    ORDER BY pinned DESC, datetime(created_at) DESC
  `).all();
  res.json(rows);
});

// POST /api/changelog — create changelog entry (admin)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  const pinned = req.body?.pinned ? 1 : 0;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO changelog_entries (id, title, content, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, title, content, pinned);

  const created = db.prepare(`
    SELECT id, title, content, pinned, created_at, updated_at
    FROM changelog_entries
    WHERE id = ?
  `).get(id);
  res.status(201).json(created);
});

// PUT /api/changelog/:id — update changelog entry (admin)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM changelog_entries WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
  const hasContent = Object.prototype.hasOwnProperty.call(req.body || {}, 'content');
  const hasPinned = Object.prototype.hasOwnProperty.call(req.body || {}, 'pinned');

  const nextTitle = hasTitle ? String(req.body.title || '').trim() : null;
  const nextContent = hasContent ? String(req.body.content || '').trim() : null;
  if (hasTitle && !nextTitle) return res.status(400).json({ error: 'Title is required' });
  if (hasContent && !nextContent) return res.status(400).json({ error: 'Content is required' });

  db.prepare(`
    UPDATE changelog_entries
    SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      pinned = COALESCE(?, pinned),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    hasTitle ? nextTitle : null,
    hasContent ? nextContent : null,
    hasPinned ? (req.body.pinned ? 1 : 0) : null,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT id, title, content, pinned, created_at, updated_at
    FROM changelog_entries
    WHERE id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE /api/changelog/:id — delete changelog entry (admin)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM changelog_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
