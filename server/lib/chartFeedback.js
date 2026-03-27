// Private chart feedback helpers.
// Passability ratings and notes are private to the player — never exposed publicly.

const PASSABILITY_LABELS = {
  1: 'Ready now',
  2: 'Soon',
  3: 'Stretch',
  4: 'Hard',
  5: 'Not yet',
};

const PASSABILITY_WEIGHTS = {
  1: 1.30,
  2: 1.15,
  3: 1.00,
  4: 0.82,
  5: 0.55,
};

function getPassabilityLabel(rating) {
  const r = parseInt(rating, 10);
  return PASSABILITY_LABELS[r] || null;
}

function getPassabilityWeight(rating) {
  if (rating == null) return 1.0;
  const r = parseInt(rating, 10);
  return PASSABILITY_WEIGHTS[r] || 1.0;
}

function formatFeedbackResponse(row) {
  if (!row) return null;
  return {
    passability_rating: row.passability_rating != null ? parseInt(row.passability_rating, 10) : null,
    passability_label: getPassabilityLabel(row.passability_rating),
    note: row.note || '',
    note_updated_at: row.note_updated_at || null,
  };
}

/**
 * Load feedback for a batch of chart IDs.
 * Returns Map<chartId, { passability_rating, passability_label, note, note_updated_at }>
 */
function getChartFeedbackMap(db, userId, chartIds) {
  const map = new Map();
  if (!chartIds || !chartIds.length) return map;

  const rows = db.prepare(`
    SELECT chart_id, passability_rating, note, note_updated_at
    FROM user_chart_feedback
    WHERE user_id = ?
  `).all(userId);

  for (const row of rows) {
    const cid = parseInt(row.chart_id, 10);
    map.set(cid, formatFeedbackResponse(row));
  }
  return map;
}

/**
 * Upsert chart feedback. Deletes the row if both rating and note are empty.
 * Returns the feedback object, or null if the row was deleted.
 */
function upsertChartFeedback(db, userId, chartId, payload) {
  const rating = payload.passability_rating != null
    ? parseInt(payload.passability_rating, 10)
    : null;
  const note = String(payload.note || '').trim().slice(0, 1000);

  // If both empty, delete
  if (rating == null && !note) {
    db.prepare('DELETE FROM user_chart_feedback WHERE user_id = ? AND chart_id = ?')
      .run(userId, chartId);
    return null;
  }

  const existing = db.prepare(
    'SELECT passability_rating, note FROM user_chart_feedback WHERE user_id = ? AND chart_id = ?',
  ).get(userId, chartId);

  const noteChanged = !existing || (existing.note || '') !== note;

  if (existing) {
    db.prepare(`
      UPDATE user_chart_feedback
      SET passability_rating = ?,
          note = ?,
          note_updated_at = CASE WHEN ? THEN datetime('now') ELSE note_updated_at END,
          updated_at = datetime('now')
      WHERE user_id = ? AND chart_id = ?
    `).run(rating, note, noteChanged ? 1 : 0, userId, chartId);
  } else {
    db.prepare(`
      INSERT INTO user_chart_feedback (user_id, chart_id, passability_rating, note, note_updated_at)
      VALUES (?, ?, ?, ?, CASE WHEN ? != '' THEN datetime('now') ELSE NULL END)
    `).run(userId, chartId, rating, note, note);
  }

  const row = db.prepare(
    'SELECT passability_rating, note, note_updated_at FROM user_chart_feedback WHERE user_id = ? AND chart_id = ?',
  ).get(userId, chartId);

  return formatFeedbackResponse(row);
}

module.exports = {
  PASSABILITY_LABELS,
  PASSABILITY_WEIGHTS,
  getPassabilityLabel,
  getPassabilityWeight,
  getChartFeedbackMap,
  upsertChartFeedback,
  formatFeedbackResponse,
};
