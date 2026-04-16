const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';

const PIUMON_DIR = path.join(__dirname, '../../data/piumon');
const ASSET_TYPES = ['bodies', 'traits', 'habitats'];

for (const type of ASSET_TYPES) {
  fs.mkdirSync(path.join(PIUMON_DIR, type), { recursive: true });
}

const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_USERNAMES || 'elmerlin,dojocat')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.is_admin === true || parseInt(user.is_admin, 10) === 1) return true;
  if (user.id && ADMIN_USER_IDS.has(String(user.id).trim())) return true;
  const username = String(user.username || '').trim().toLowerCase();
  if (username && ADMIN_USERNAMES.has(username)) return true;
  if (user.id) {
    const db = getDb();
    const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(user.id);
    if (parseInt(row?.is_admin, 10) === 1) return true;
  }
  return false;
}

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const type = req.params.type;
      if (!ASSET_TYPES.includes(type)) return cb(new Error('Invalid asset type'));
      cb(null, path.join(PIUMON_DIR, type));
    },
    filename: (req, file, cb) => {
      const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) return cb(new Error('Invalid asset id'));
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${id}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// List all assets across all types
router.get('/assets', requireAuth, requireAdmin, (req, res) => {
  const result = {};
  for (const type of ASSET_TYPES) {
    const dir = path.join(PIUMON_DIR, type);
    try {
      result[type] = fs.readdirSync(dir)
        .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
        .map((f) => ({ filename: f, id: f.replace(/\.[^.]+$/, '') }));
    } catch {
      result[type] = [];
    }
  }
  res.json(result);
});

// Upload an asset
router.post('/assets/:type/:id', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({
    id: req.params.id,
    type: req.params.type,
    filename: req.file.filename,
    path: `/piumon-assets/${req.params.type}/${req.file.filename}`,
  });
});

// Delete an asset
router.delete('/assets/:type/:id', requireAuth, requireAdmin, (req, res) => {
  const { type, id } = req.params;
  if (!ASSET_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const dir = path.join(PIUMON_DIR, type);
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    const files = fs.readdirSync(dir).filter((f) => f.replace(/\.[^.]+$/, '') === safeId);
    for (const f of files) fs.unlinkSync(path.join(dir, f));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
