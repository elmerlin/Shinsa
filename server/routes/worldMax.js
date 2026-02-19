const express = require('express');
const axios = require('axios');
const multer = require('multer');
const sharp = require('sharp');
const { getDb } = require('../db/schema');
const { requireAuth, optionalAuth } = require('./auth');
const { normalizeUserAvatarForList } = require('../lib/avatarProxy');

const router = express.Router();

const PIU_BASE = 'https://www.piugame.com';

// Fixed options from https://piugame.com/game_info/piu_history.php
const PIU_GAME_OPTIONS = [
  { code: 'phoenix', name: 'PUMP IT UP PHOENIX', image_url: `${PIU_BASE}/l_img/logo.png` },
  { code: 'xx-20th-anniversary-edition', name: 'PUMP IT UP - XX 20TH ANNIVERSARY EDITION', image_url: `${PIU_BASE}/l_img/history_card_img20.png` },
  { code: 'prime-2', name: 'PUMP IT UP - 2017 PRIME 2', image_url: `${PIU_BASE}/l_img/history_card_img01.png` },
  { code: 'prime', name: 'PUMP IT UP - 2015 PRIME', image_url: `${PIU_BASE}/l_img/history_card_img02.png` },
  { code: 'fiesta-2', name: 'PUMP IT UP - 2013 FIESTA 2', image_url: `${PIU_BASE}/l_img/history_card_img03.png` },
  { code: 'fiesta-ex', name: 'PUMP IT UP - FIESTA EX', image_url: `${PIU_BASE}/l_img/history_card_img04.png` },
  { code: 'fiesta', name: 'PUMP IT UP - FIESTA', image_url: `${PIU_BASE}/l_img/history_card_img05.png` },
  { code: 'nx-absolute', name: 'PUMP IT UP NX - ABSOLUTE', image_url: `${PIU_BASE}/l_img/history_card_img06.png` },
  { code: 'nx2-next-xenesis', name: 'PUMP IT UP NX2 - NEXT XENESIS', image_url: `${PIU_BASE}/l_img/history_card_img07.png` },
  { code: 'nx-new-xenesis', name: 'PUMP IT UP NX - NEW XENESIS', image_url: `${PIU_BASE}/l_img/history_card_img08.png` },
  { code: 'zero', name: 'PUMP IT UP - ZERO', image_url: `${PIU_BASE}/l_img/history_card_img09.png` },
  { code: 'exceed-2', name: 'PUMP IT UP THE - EXCEED 2', image_url: `${PIU_BASE}/l_img/history_card_img10.png` },
  { code: 'exceed', name: 'PUMP IT UP - THE EXCEED', image_url: `${PIU_BASE}/l_img/history_card_img11.png` },
  { code: 'rebirth', name: 'PUMP IT UP THE REBIRTH - THE 8TH DANCE FLOOR', image_url: `${PIU_BASE}/l_img/history_card_img12.png` },
  { code: 'premiere', name: 'PUMP IT UP - THE PREMIERE', image_url: `${PIU_BASE}/l_img/history_card_img13.png` },
  { code: 'extra', name: 'PUMP IT UP - EXTRA', image_url: `${PIU_BASE}/l_img/history_card_img14.png` },
  { code: 'perfect-collection', name: 'PUMP IT UP - THE PERFECT COLLECTION', image_url: `${PIU_BASE}/l_img/history_card_img15.png` },
  { code: 'obg-season-evolution', name: 'PUMP IT UP THE O.B.G - SEASON EVOLUTION', image_url: `${PIU_BASE}/l_img/history_card_img16.png` },
  { code: 'obg-3rd-dance-floor', name: 'PUMP IT UP THE O.B.G - THE 3RD DANCE FLOOR', image_url: `${PIU_BASE}/l_img/history_card_img17.png` },
  { code: '2nd-ultimate-dance-floor', name: 'PUMP IT UP 2ND ULTIMATE DANCE FLOOR', image_url: `${PIU_BASE}/l_img/history_card_img18.png` },
  { code: '1st-dance-floor', name: 'PUMP IT UP 1ST DANCE FLOOR', image_url: `${PIU_BASE}/l_img/history_card_img19.png` },
];

const PIU_MACHINE_OPTIONS = [
  { code: 'lx', name: 'LX', image_url: `${PIU_BASE}/l_img/history_product01.png` },
  { code: 'tx', name: 'TX', image_url: `${PIU_BASE}/l_img/history_product02.png` },
  { code: 'cx', name: 'CX', image_url: `${PIU_BASE}/l_img/history_product03.png` },
  { code: 'fx', name: 'FX', image_url: `${PIU_BASE}/l_img/history_product04.png` },
  { code: 'sx', name: 'SX', image_url: `${PIU_BASE}/l_img/history_product05.png` },
  { code: 'gx', name: 'GX', image_url: `${PIU_BASE}/l_img/history_product06.png` },
  { code: 'dx', name: 'DX', image_url: `${PIU_BASE}/l_img/history_product07.png` },
];

const PIU_MACHINE_OPTIONS_BY_GAME = (() => {
  const machineCodes = PIU_MACHINE_OPTIONS.map((machine) => machine.code);
  const map = {};
  for (const game of PIU_GAME_OPTIONS) {
    map[game.code] = machineCodes;
  }
  return map;
})();

const PIU_GAME_BY_CODE = new Map(PIU_GAME_OPTIONS.map((game) => [game.code, game]));
const PIU_MACHINE_BY_CODE = new Map(PIU_MACHINE_OPTIONS.map((machine) => [machine.code, machine]));

const WORLD_MAX_META = {
  game_options: PIU_GAME_OPTIONS,
  machine_options: PIU_MACHINE_OPTIONS,
  machine_options_by_game: PIU_MACHINE_OPTIONS_BY_GAME,
  source: 'static-piu-history',
};

const COUNTRY_CENTROIDS = {
  unitedstates: { lat: 39.7837, lng: -100.4459 },
  usa: { lat: 39.7837, lng: -100.4459 },
  canada: { lat: 61.0667, lng: -107.9917 },
  mexico: { lat: 23.6585, lng: -102.0077 },
  brazil: { lat: -10.3333, lng: -53.2 },
  argentina: { lat: -34.0, lng: -64.0 },
  chile: { lat: -30.0, lng: -71.0 },
  colombia: { lat: 4.0, lng: -72.0 },
  peru: { lat: -9.2, lng: -75.0 },
  uk: { lat: 54.0, lng: -2.0 },
  unitedkingdom: { lat: 54.0, lng: -2.0 },
  france: { lat: 46.6, lng: 2.3 },
  germany: { lat: 51.0, lng: 10.0 },
  spain: { lat: 40.2, lng: -3.7 },
  portugal: { lat: 39.5, lng: -8.0 },
  italy: { lat: 42.8, lng: 12.8 },
  netherlands: { lat: 52.3, lng: 5.3 },
  belgium: { lat: 50.8, lng: 4.4 },
  sweden: { lat: 63.0, lng: 16.0 },
  norway: { lat: 60.5, lng: 8.5 },
  finland: { lat: 64.0, lng: 26.0 },
  poland: { lat: 52.0, lng: 19.0 },
  turkey: { lat: 39.0, lng: 35.0 },
  russia: { lat: 61.5, lng: 105.3 },
  ukraine: { lat: 49.0, lng: 31.0 },
  egypt: { lat: 26.8, lng: 30.8 },
  morocco: { lat: 31.8, lng: -7.1 },
  southafrica: { lat: -30.6, lng: 22.9 },
  nigeria: { lat: 9.1, lng: 8.7 },
  kenya: { lat: 0.2, lng: 37.9 },
  india: { lat: 22.3, lng: 79.0 },
  pakistan: { lat: 30.3, lng: 69.3 },
  bangladesh: { lat: 23.7, lng: 90.3 },
  china: { lat: 35.9, lng: 104.2 },
  japan: { lat: 36.2, lng: 138.3 },
  southkorea: { lat: 36.5, lng: 127.9 },
  korea: { lat: 36.5, lng: 127.9 },
  taiwan: { lat: 23.7, lng: 121.0 },
  thailand: { lat: 15.6, lng: 101.0 },
  vietnam: { lat: 16.3, lng: 107.8 },
  malaysia: { lat: 4.6, lng: 102.0 },
  singapore: { lat: 1.35, lng: 103.8 },
  indonesia: { lat: -2.3, lng: 117.3 },
  philippines: { lat: 12.9, lng: 122.8 },
  australia: { lat: -25.3, lng: 133.8 },
  newzealand: { lat: -41.5, lng: 172.5 },
};

const PHOTO_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-png', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hashString(input) {
  const str = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function fallbackGeo(city, country) {
  const seed = hashString(`${country}|${city}`);
  const countrySeed = hashString(country);
  const normalizedCountry = normalizeKey(country);
  const centroid = COUNTRY_CENTROIDS[normalizedCountry] || null;

  if (centroid) {
    const latJitter = ((seed % 2400) / 2400) * 10 - 5;
    const lngJitter = ((Math.floor(seed / 2400) % 3000) / 3000) * 12 - 6;
    return {
      lat: clamp(centroid.lat + latJitter, -75, 75),
      lng: clamp(centroid.lng + lngJitter, -180, 180),
      source: 'fallback-country-centroid',
    };
  }

  const lat = ((seed % 150000) / 150000) * 130 - 65;
  const lng = ((countrySeed % 360000) / 360000) * 360 - 180;
  return {
    lat: clamp(lat, -75, 75),
    lng: clamp(lng, -180, 180),
    source: 'fallback-hash',
  };
}

async function geocodeCityCountry(city, country) {
  const query = `${city}, ${country}`.trim();

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'jsonv2',
        limit: 1,
        addressdetails: 0,
      },
      timeout: 7000,
      headers: {
        'User-Agent': 'PumpShinsa WorldMax/1.0 (+https://shinsa.pump)',
      },
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const row = Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null;
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat: clamp(lat, -85, 85),
        lng: clamp(lng, -180, 180),
        source: 'nominatim',
      };
    }
  } catch {
    // fall through to deterministic fallback
  }

  return fallbackGeo(city, country);
}

function normalizeAvatar(row, size = 96) {
  if (!row) return row;
  return {
    ...row,
    avatar: normalizeUserAvatarForList(row.avatar, row.id || row.user_id || '', size),
  };
}

function getGameByCode(code) {
  return PIU_GAME_BY_CODE.get(code) || null;
}

function getMachineByCode(code) {
  return PIU_MACHINE_BY_CODE.get(code) || null;
}

function gameMachineAllowed(gameCode, machineCode) {
  const allowed = PIU_MACHINE_OPTIONS_BY_GAME?.[gameCode] || [];
  return allowed.includes(machineCode);
}

function serializeMachineRow(row) {
  if (!row) return null;
  const game = getGameByCode(row.game_code);
  const machine = getMachineByCode(row.machine_code);
  return {
    ...row,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    review_count: Number(row.review_count || 0),
    photo_count: Number(row.photo_count || 0),
    avg_rating: row.avg_rating === null || row.avg_rating === undefined ? 0 : Number(row.avg_rating),
    added_by_avatar: normalizeUserAvatarForList(row.added_by_avatar, row.added_by_user_id, 72),
    game_image_url: game?.image_url || '',
    machine_image_url: machine?.image_url || '',
  };
}

// GET /api/world-max/meta
router.get('/meta', (req, res) => {
  res.json(WORLD_MAX_META);
});

// GET /api/world-max/pins
router.get('/pins', optionalAuth, (req, res) => {
  const db = getDb();

  const users = db.prepare(`
    SELECT id, username, avatar, nationality,
           location_country, location_country_code, location_city, location_lat, location_lng,
           created_at
    FROM users
    WHERE TRIM(COALESCE(location_country, '')) != ''
      AND TRIM(COALESCE(location_city, '')) != ''
      AND location_lat IS NOT NULL
      AND location_lng IS NOT NULL
    ORDER BY username COLLATE NOCASE ASC
  `).all().map((u) => ({
    ...normalizeAvatar(u, 96),
    location_lat: Number(u.location_lat),
    location_lng: Number(u.location_lng),
  }));

  const machines = db.prepare(`
    SELECT m.*,
      u.username as added_by_username,
      u.avatar as added_by_avatar,
      COALESCE((SELECT COUNT(*) FROM world_max_machine_reviews r WHERE r.machine_id = m.id), 0) as review_count,
      COALESCE((SELECT COUNT(*) FROM world_max_machine_photos p WHERE p.machine_id = m.id), 0) as photo_count,
      COALESCE((SELECT ROUND(AVG(CASE WHEN r.rating BETWEEN 1 AND 5 THEN r.rating END), 2)
        FROM world_max_machine_reviews r WHERE r.machine_id = m.id), 0) as avg_rating
    FROM world_max_machines m
    LEFT JOIN users u ON u.id = m.added_by_user_id
    WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL
    ORDER BY datetime(m.created_at) DESC
  `).all().map(serializeMachineRow);

  res.json({
    users,
    machines,
    me: req.user ? { id: req.user.id } : null,
  });
});

// PUT /api/world-max/location
router.put('/location', requireAuth, async (req, res) => {
  const db = getDb();
  const country = String(req.body?.country || '').trim();
  const city = String(req.body?.city || '').trim();
  const countryCodeInput = String(req.body?.country_code || '').trim().toUpperCase();
  const countryCode = countryCodeInput.slice(0, 2);

  // Allow clearing location from profile.
  if (!country && !city) {
    db.prepare(`
      UPDATE users
      SET location_country = '',
          location_country_code = '',
          location_city = '',
          location_lat = NULL,
          location_lng = NULL
      WHERE id = ?
    `).run(req.user.id);

    const user = db.prepare(`
      SELECT id, username, avatar, nationality,
             location_country, location_country_code, location_city, location_lat, location_lng
      FROM users WHERE id = ?
    `).get(req.user.id);

    return res.json({ ...normalizeAvatar(user, 96), geocode_source: 'cleared' });
  }

  if (!country || !city) {
    return res.status(400).json({ error: 'Country and city are required' });
  }
  if (country.length > 80 || city.length > 80) {
    return res.status(400).json({ error: 'Country and city must be 80 characters or less' });
  }

  const geo = await geocodeCityCountry(city, country);

  db.prepare(`
    UPDATE users
    SET location_country = ?,
        location_country_code = ?,
        location_city = ?,
        location_lat = ?,
        location_lng = ?
    WHERE id = ?
  `).run(country, countryCode, city, geo.lat, geo.lng, req.user.id);

  const user = db.prepare(`
    SELECT id, username, avatar, nationality,
           location_country, location_country_code, location_city, location_lat, location_lng
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({
    ...normalizeAvatar(user, 96),
    location_lat: Number(user.location_lat),
    location_lng: Number(user.location_lng),
    geocode_source: geo.source,
  });
});

// POST /api/world-max/machines
router.post('/machines', requireAuth, async (req, res) => {
  const db = getDb();
  const country = String(req.body?.country || '').trim();
  const city = String(req.body?.city || '').trim();
  const countryCodeInput = String(req.body?.country_code || '').trim().toUpperCase();
  const countryCode = countryCodeInput.slice(0, 2);
  const venueName = String(req.body?.venue_name || '').trim();
  const address = String(req.body?.address || '').trim();
  const pricePerCredit = String(req.body?.price_per_credit || '').trim();
  const gameCode = String(req.body?.game_code || '').trim();
  const machineCode = String(req.body?.machine_code || '').trim();

  if (!country || !city) {
    return res.status(400).json({ error: 'Country and city are required' });
  }
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }
  if (!pricePerCredit) {
    return res.status(400).json({ error: 'Price per credit is required' });
  }
  if (address.length > 240) {
    return res.status(400).json({ error: 'Address is too long (max 240 chars)' });
  }
  if (pricePerCredit.length > 60) {
    return res.status(400).json({ error: 'Price per credit is too long (max 60 chars)' });
  }

  const game = getGameByCode(gameCode);
  if (!game) {
    return res.status(400).json({ error: 'Invalid game selection' });
  }

  const machine = getMachineByCode(machineCode);
  if (!machine) {
    return res.status(400).json({ error: 'Invalid machine selection' });
  }

  if (!gameMachineAllowed(gameCode, machineCode)) {
    return res.status(400).json({ error: 'Selected machine is not valid for the selected game' });
  }

  const geo = await geocodeCityCountry(city, country);

  const insert = db.prepare(`
    INSERT INTO world_max_machines (
      added_by_user_id, country, country_code, city, venue_name, address, price_per_credit,
      game_code, game_name, machine_code, machine_name,
      latitude, longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    country,
    countryCode,
    city,
    venueName,
    address,
    pricePerCredit,
    gameCode,
    game.name,
    machineCode,
    machine.name,
    geo.lat,
    geo.lng
  );

  const machineRow = db.prepare(`
    SELECT m.*,
      u.username as added_by_username,
      u.avatar as added_by_avatar,
      0 as review_count,
      0 as photo_count,
      0 as avg_rating
    FROM world_max_machines m
    LEFT JOIN users u ON u.id = m.added_by_user_id
    WHERE m.id = ?
  `).get(insert.lastInsertRowid);

  res.status(201).json({
    machine: serializeMachineRow(machineRow),
    geocode_source: geo.source,
  });
});

// GET /api/world-max/machines/:id
router.get('/machines/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const machineId = parseInt(req.params.id, 10);
  if (!Number.isFinite(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });

  const machine = db.prepare(`
    SELECT m.*,
      u.username as added_by_username,
      u.avatar as added_by_avatar,
      COALESCE((SELECT COUNT(*) FROM world_max_machine_reviews r WHERE r.machine_id = m.id), 0) as review_count,
      COALESCE((SELECT COUNT(*) FROM world_max_machine_photos p WHERE p.machine_id = m.id), 0) as photo_count,
      COALESCE((SELECT ROUND(AVG(CASE WHEN r.rating BETWEEN 1 AND 5 THEN r.rating END), 2)
        FROM world_max_machine_reviews r WHERE r.machine_id = m.id), 0) as avg_rating
    FROM world_max_machines m
    LEFT JOIN users u ON u.id = m.added_by_user_id
    WHERE m.id = ?
  `).get(machineId);

  if (!machine) return res.status(404).json({ error: 'Machine not found' });

  const reviews = db.prepare(`
    SELECT r.id, r.machine_id, r.user_id, r.rating, r.comment, r.created_at,
           u.username, u.avatar, u.nationality
    FROM world_max_machine_reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.machine_id = ?
    ORDER BY datetime(r.created_at) DESC
    LIMIT 200
  `).all(machineId).map((row) => normalizeAvatar(row, 64));

  const photos = db.prepare(`
    SELECT p.id, p.machine_id, p.user_id, p.image_data, p.caption, p.created_at,
           u.username, u.avatar
    FROM world_max_machine_photos p
    JOIN users u ON u.id = p.user_id
    WHERE p.machine_id = ?
    ORDER BY datetime(p.created_at) DESC
    LIMIT 200
  `).all(machineId).map((row) => normalizeAvatar(row, 48));

  res.json({
    machine: serializeMachineRow(machine),
    reviews,
    photos,
  });
});

// POST /api/world-max/machines/:id/reviews
router.post('/machines/:id/reviews', requireAuth, (req, res) => {
  const db = getDb();
  const machineId = parseInt(req.params.id, 10);
  if (!Number.isFinite(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });

  const machine = db.prepare('SELECT id FROM world_max_machines WHERE id = ?').get(machineId);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });

  const ratingRaw = parseInt(req.body?.rating, 10);
  const rating = Number.isFinite(ratingRaw) ? clamp(ratingRaw, 0, 5) : 0;
  const comment = String(req.body?.comment || '').trim();
  if (!comment) return res.status(400).json({ error: 'Comment is required' });
  if (comment.length > 800) return res.status(400).json({ error: 'Comment is too long (max 800 chars)' });

  const insert = db.prepare(`
    INSERT INTO world_max_machine_reviews (machine_id, user_id, rating, comment)
    VALUES (?, ?, ?, ?)
  `).run(machineId, req.user.id, rating, comment);

  const review = db.prepare(`
    SELECT r.id, r.machine_id, r.user_id, r.rating, r.comment, r.created_at,
           u.username, u.avatar, u.nationality
    FROM world_max_machine_reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ?
  `).get(insert.lastInsertRowid);

  res.status(201).json({ review: normalizeAvatar(review, 64) });
});

// POST /api/world-max/machines/:id/photos
router.post('/machines/:id/photos', requireAuth, PHOTO_UPLOAD.single('photo'), async (req, res) => {
  const db = getDb();
  const machineId = parseInt(req.params.id, 10);
  if (!Number.isFinite(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });

  const machine = db.prepare('SELECT id FROM world_max_machines WHERE id = ?').get(machineId);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });

  if (!req.file) return res.status(400).json({ error: 'Photo is required' });

  const caption = String(req.body?.caption || '').trim().slice(0, 180);

  let dataUrl = '';
  try {
    let buffer = await sharp(req.file.buffer)
      .rotate()
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74 })
      .toBuffer();

    if (buffer.length > 180 * 1024) {
      buffer = await sharp(req.file.buffer)
        .rotate()
        .resize(1100, 1100, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 58 })
        .toBuffer();
    }

    dataUrl = `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch {
    const mime = req.file.mimetype || 'image/png';
    dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
  }

  const insert = db.prepare(`
    INSERT INTO world_max_machine_photos (machine_id, user_id, image_data, caption)
    VALUES (?, ?, ?, ?)
  `).run(machineId, req.user.id, dataUrl, caption);

  const photo = db.prepare(`
    SELECT p.id, p.machine_id, p.user_id, p.image_data, p.caption, p.created_at,
           u.username, u.avatar
    FROM world_max_machine_photos p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(insert.lastInsertRowid);

  res.status(201).json({ photo: normalizeAvatar(photo, 48) });
});

module.exports = router;
