const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');

// GET all notices (ordered: pinned first, then by date)
router.get('/', (req, res) => {
  const db = getDb();
  const notices = db.prepare(
    'SELECT * FROM notices ORDER BY pinned DESC, created_at DESC'
  ).all();
  db.close();
  res.json(notices);
});

// POST create notice
router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { title, content, pinned } = req.body;

  if (!title || !content) {
    db.close();
    return res.status(400).json({ error: 'Title and content are required' });
  }

  db.prepare('INSERT INTO notices (id, title, content, pinned) VALUES (?, ?, ?, ?)')
    .run(id, title, content, pinned ? 1 : 0);

  const notice = db.prepare('SELECT * FROM notices WHERE id = ?').get(id);
  db.close();
  res.status(201).json(notice);
});

// PUT update notice
router.put('/:id', (req, res) => {
  const db = getDb();
  const { title, content, pinned } = req.body;
  const existing = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  if (!existing) { db.close(); return res.status(404).json({ error: 'Not found' }); }

  db.prepare(`
    UPDATE notices SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      pinned = COALESCE(?, pinned)
    WHERE id = ?
  `).run(title, content, pinned !== undefined ? (pinned ? 1 : 0) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM notices WHERE id = ?').get(req.params.id);
  db.close();
  res.json(updated);
});

// DELETE notice
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM notices WHERE id = ?').run(req.params.id);
  db.close();
  res.json({ success: true });
});

module.exports = router;
