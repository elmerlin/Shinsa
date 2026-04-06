const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');
const { optionalAuth, requireAuth, isAdminUser } = require('./auth');

const router = express.Router();
const CATALOG_PATH = path.join(__dirname, '..', '..', 'client', 'src', 'i18n', 'translationCatalog.json');
const SUPPORTED_LOCALES = new Set(['ko', 'es']);
const SUPPORTED_STATUSES = new Set(['draft', 'accepted']);
const LOCALE_CATALOG_FIELD = { ko: 'korean', es: 'spanish' };

function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase();
  if (locale === 'kr') return 'ko';
  return SUPPORTED_LOCALES.has(locale) ? locale : 'ko';
}

function loadCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load translation catalog:', err.message);
    return [];
  }
}

function sanitizeValue(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function getOverrideMap(db, locale) {
  const rows = db.prepare(`
    SELECT o.translation_key, o.value, o.status, o.updated_at, u.username AS updated_by_username
    FROM ui_translation_overrides o
    LEFT JOIN users u ON u.id = o.updated_by_user_id
    WHERE o.locale = ?
  `).all(locale);

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.translation_key || ''), row);
  }
  return map;
}

router.get('/translations', optionalAuth, (req, res) => {
  const db = getDb();
  const locale = normalizeLocale(req.query.locale);
  if (!SUPPORTED_LOCALES.has(locale)) {
    return res.status(400).json({ error: 'Unsupported locale' });
  }

  const catalog = loadCatalog();
  const overrides = getOverrideMap(db, locale);
  const canAccept = isAdminUser(db, req.user);
  const canEdit = !!req.user?.id;

  const catalogField = LOCALE_CATALOG_FIELD[locale] || 'korean';

  const items = catalog.map((item) => {
    const override = overrides.get(String(item.key || ''));
    const catalogValue = String(item[catalogField] || item.english || '');
    return {
      key: item.key,
      category: item.category || '',
      pages: Array.isArray(item.pages) ? item.pages : [],
      english: String(item.english || ''),
      proposed: catalogValue,
      current: override ? String(override.value || '') : catalogValue,
      keepEnglish: !!item.keepEnglish,
      status: override ? String(override.status || 'draft') : 'seeded',
      source: override ? 'override' : 'seeded',
      updatedAt: override?.updated_at || '',
      updatedBy: override?.updated_by_username || '',
    };
  });

  res.json({
    locale,
    permissions: {
      canEdit,
      canAccept,
    },
    items,
  });
});

router.put('/translations/:key', requireAuth, (req, res) => {
  const db = getDb();
  const locale = normalizeLocale(req.body?.locale);
  if (!SUPPORTED_LOCALES.has(locale)) {
    return res.status(400).json({ error: 'Unsupported locale' });
  }

  const key = String(req.params.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Translation key is required' });

  const catalog = loadCatalog();
  const catalogItem = catalog.find((item) => String(item.key || '') === key);
  if (!catalogItem) return res.status(404).json({ error: 'Translation key not found' });

  const value = sanitizeValue(req.body?.value);
  if (!value) return res.status(400).json({ error: 'Translation text is required' });

  const requestedStatus = String(req.body?.status || 'draft').trim().toLowerCase();
  if (!SUPPORTED_STATUSES.has(requestedStatus)) {
    return res.status(400).json({ error: 'Invalid translation status' });
  }

  const admin = isAdminUser(db, req.user);
  if (requestedStatus === 'accepted' && !admin) {
    return res.status(403).json({ error: 'Only admins can accept translations' });
  }

  db.prepare(`
    INSERT INTO ui_translation_overrides (
      locale,
      translation_key,
      value,
      status,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(locale, translation_key) DO UPDATE SET
      value = excluded.value,
      status = excluded.status,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = datetime('now')
  `).run(
    locale,
    key,
    value,
    requestedStatus,
    req.user.id
  );

  const saved = db.prepare(`
    SELECT o.translation_key, o.value, o.status, o.updated_at, u.username AS updated_by_username
    FROM ui_translation_overrides o
    LEFT JOIN users u ON u.id = o.updated_by_user_id
    WHERE o.locale = ? AND o.translation_key = ?
    LIMIT 1
  `).get(locale, key);

  res.json({
    success: true,
    item: {
      key,
      current: String(saved?.value || value),
      status: String(saved?.status || requestedStatus),
      updatedAt: saved?.updated_at || '',
      updatedBy: saved?.updated_by_username || '',
    },
  });
});

module.exports = router;
