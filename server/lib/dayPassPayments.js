const STALE_DAY_PASS_PENDING_MINUTES = Math.max(
  5,
  parseInt(process.env.STALE_DAY_PASS_PENDING_MINUTES, 10) || 30
);

function getVisibleVenuePaymentPredicate(alias = '') {
  const prefix = String(alias || '').trim();
  const scoped = prefix ? `${prefix}.` : '';
  return `(${scoped}payment_type != 'day_pass' OR ${scoped}status = 'succeeded')`;
}

function purgeStalePendingDayPassPayments(db, options = {}) {
  if (!db) return 0;

  let where = `payment_type = 'day_pass' AND status = 'pending' AND datetime(created_at) <= datetime('now', ?)`;
  const params = [`-${STALE_DAY_PASS_PENDING_MINUTES} minutes`];

  const userId = String(options.userId || '').trim();
  if (userId) {
    where += ' AND user_id = ?';
    params.push(userId);
  }

  const venueId = String(options.venueId || '').trim();
  if (venueId) {
    where += ' AND venue_id = ?';
    params.push(venueId);
  }

  const result = db.prepare(`DELETE FROM venue_payments WHERE ${where}`).run(...params);
  return result.changes || 0;
}

module.exports = {
  STALE_DAY_PASS_PENDING_MINUTES,
  getVisibleVenuePaymentPredicate,
  purgeStalePendingDayPassPayments,
};
