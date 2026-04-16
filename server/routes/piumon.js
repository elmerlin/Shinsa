const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { getDb } = require('../db/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'shinsa-pump-dojo-secret-key';
const PIXELLAB_API_KEY = process.env.PIXELLAB_API_KEY || '';
const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';

const PIUMON_DIR = path.join(__dirname, '../../data/piumon');
const CLIENT_PUBLIC = path.join(__dirname, '../../client/public');
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

// ---------------------------------------------------------------------------
// PixelLab generation
// ---------------------------------------------------------------------------

const activeJobs = new Map(); // jobId -> { characterId, status, error, result }

function resolvePreviewPath(previewUrl) {
  // preview URLs are like /avatars/foo.png, /piumon/dojocat-reference.jpeg, etc.
  const relative = String(previewUrl || '').replace(/^\//, '');
  return path.join(CLIENT_PUBLIC, relative);
}

const PIXELLAB_MAX_CONCEPT_PX = 1024;

async function imageToBase64Payload(filePath) {
  let img = sharp(await fs.promises.readFile(filePath));
  const meta = await img.metadata();
  let { width, height } = meta;

  // Resize if either dimension exceeds PixelLab's 1024px limit
  if (width > PIXELLAB_MAX_CONCEPT_PX || height > PIXELLAB_MAX_CONCEPT_PX) {
    const scale = PIXELLAB_MAX_CONCEPT_PX / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    img = img.resize(width, height, { fit: 'inside' });
  }

  const buf = await img.png().toBuffer();
  return {
    image: { type: 'base64', base64: buf.toString('base64') },
    width,
    height,
  };
}

async function pixellabPost(endpoint, body, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${PIXELLAB_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PIXELLAB_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < retries) {
      const wait = Math.min(15000, 5000 * (attempt + 1));
      console.log(`[Piumon] 429 rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PixelLab ${endpoint} ${res.status}: ${text}`);
    }
    return res.json();
  }
}

async function pixellabGet(endpoint) {
  const res = await fetch(`${PIXELLAB_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${PIXELLAB_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PixelLab ${endpoint} ${res.status}: ${text}`);
  }
  return res.json();
}

// Start generation for a character body
router.post('/generate/body', requireAuth, requireAdmin, async (req, res) => {
  if (!PIXELLAB_API_KEY) return res.status(500).json({ error: 'PIXELLAB_API_KEY not configured' });

  const { characterId, previewUrl, name, size, description } = req.body;
  if (!characterId || !previewUrl) return res.status(400).json({ error: 'characterId and previewUrl required' });

  try {
    const filePath = resolvePreviewPath(previewUrl);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: `Source image not found: ${previewUrl}` });

    const conceptImage = await imageToBase64Payload(filePath);
    const pixelSize = size || 48;

    const body = {
      method: 'create_from_concept',
      concept_image: conceptImage,
      image_size: { width: pixelSize, height: pixelSize },
      view: 'side',
      description: description || `pixel art character sprite of ${name || 'character'}, front-facing, fixed standing pose, clean anchors for layered accessories`,
    };

    const result = await pixellabPost('/generate-8-rotations-v2', body);
    const jobId = result.background_job_id || result.job_id;
    if (!jobId) return res.status(500).json({ error: 'No job ID returned from PixelLab', result });

    activeJobs.set(jobId, { characterId, status: 'processing', startedAt: Date.now() });

    res.json({ jobId, characterId });
  } catch (err) {
    console.error('[Piumon] generate body error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Poll job status and save when complete
router.get('/generate/job/:jobId', requireAuth, requireAdmin, async (req, res) => {
  if (!PIXELLAB_API_KEY) return res.status(500).json({ error: 'PIXELLAB_API_KEY not configured' });

  const { jobId } = req.params;
  const tracked = activeJobs.get(jobId);

  try {
    const job = await pixellabGet(`/background-jobs/${jobId}`);
    const status = job.status || 'unknown';

    if (status === 'completed' && job.last_response?.images?.length) {
      // Save the south-facing image (first in the array) as the body
      const southImage = job.last_response.images[0];
      const characterId = tracked?.characterId || req.query.characterId || 'unknown';
      const safeId = String(characterId).replace(/[^a-zA-Z0-9_-]/g, '');

      if (southImage.image) {
        const base64Data = southImage.image.replace(/^data:image\/\w+;base64,/, '');
        const outPath = path.join(PIUMON_DIR, 'bodies', `${safeId}.png`);
        await fs.promises.writeFile(outPath, Buffer.from(base64Data, 'base64'));
      }

      if (tracked) {
        tracked.status = 'completed';
        tracked.result = { savedAs: `${safeId}.png`, imageCount: job.last_response.images.length };
      }

      res.json({
        status: 'completed',
        characterId: safeId,
        filename: `${safeId}.png`,
        path: `/piumon-assets/bodies/${safeId}.png`,
        imageCount: job.last_response.images.length,
      });
    } else if (status === 'failed' || status === 'error') {
      if (tracked) tracked.status = 'failed';
      res.json({ status: 'failed', error: job.error || 'Generation failed' });
    } else {
      res.json({ status: 'processing' });
    }
  } catch (err) {
    console.error('[Piumon] poll job error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
