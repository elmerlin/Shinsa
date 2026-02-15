const express = require('express');
const router = express.Router();
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// POST /api/parser/score - Parse a PIU result photo
router.post('/score', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  const tmpFile = path.join(os.tmpdir(), `piu_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  fs.writeFileSync(tmpFile, req.file.buffer);

  const parserPath = path.join(__dirname, '..', 'piu_score_parser.py');
  const python = spawn('python3', [parserPath, tmpFile, '--pretty']);

  let stdout = '';
  let stderr = '';

  python.stdout.on('data', (data) => { stdout += data.toString(); });
  python.stderr.on('data', (data) => { stderr += data.toString(); });

  python.on('close', (code) => {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

    if (code !== 0) {
      console.error('Parser error:', stderr);
      return res.status(400).json({ error: 'Failed to parse photo. Make sure the result screen is clearly visible.' });
    }

    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (e) {
      console.error('Parser JSON error:', e.message, stdout);
      res.status(400).json({ error: 'Parser returned invalid data' });
    }
  });

  python.on('error', (err) => {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
    console.error('Parser spawn error:', err);
    res.status(500).json({ error: 'Photo parser not available. Ensure Python 3 and dependencies are installed.' });
  });
});

module.exports = router;
