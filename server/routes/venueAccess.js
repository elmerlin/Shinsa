const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, isAdminUser, hasFeatureAccess } = require('./auth');
const { createUserNotification } = require('../lib/notifications');
const {
  getVisibleVenuePaymentPredicate,
  purgeStalePendingDayPassPayments,
} = require('../lib/dayPassPayments');
const {
  isSquareConfigured,
  createDayPassPaymentLink,
  createSubscriptionPaymentLink,
  verifyWebhookSignature,
  cancelSquareSubscription,
  retrieveOrder,
  retrievePaymentLink,
} = require('../lib/square');

// ── Helpers ─────────────────────────────────────────────────────────────

function requireDojoAdmin(req, res, next) {
  const db = getDb();
  if (!hasFeatureAccess(db, req.user, 'dojo_admin')) {
    return res.status(403).json({ error: 'Dojo admin access required' });
  }
  next();
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Returns true if the given YYYY-MM-DD date falls on Sat or Sun. */
function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Get the correct day pass plan type for a given date. */
function dayPassPlanTypeForDate(dateStr) {
  return isWeekend(dateStr) ? 'day_pass_weekend' : 'day_pass_weekday';
}

function parsePassDateFromDescription(description = '') {
  const match = String(description || '').match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function slugifyCadenceKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function parseMonthlyCadences(plan) {
  if (!plan || plan.plan_type !== 'monthly') return [];

  let rows = [];
  try {
    rows = JSON.parse(plan.monthly_cadences_json || '[]');
  } catch {
    rows = [];
  }

  const normalized = rows
    .map((row, idx) => {
      const months = Math.max(1, parseInt(row?.months, 10) || 0);
      const durationDays = Math.max(0, parseInt(row?.duration_days, 10) || 0);
      const priceAmount = Math.max(0, parseInt(row?.price_amount, 10) || 0);
      const label = String(row?.label || '').trim() || (durationDays === 7 ? 'Weekly Pass' : (months === 1 ? 'Monthly' : `${months} months`));
      const key = slugifyCadenceKey(row?.key || label || `cadence_${idx + 1}`) || `cadence_${idx + 1}`;
      return {
        key,
        label,
        months,
        duration_days: durationDays,
        price_amount: priceAmount,
        currency: String(row?.currency || plan.currency || 'gbp').toLowerCase(),
        square_plan_variation_id: String(row?.square_plan_variation_id || '').trim(),
      };
    })
    .filter((row) => row.months > 0 && row.price_amount >= 0);

  if (normalized.length > 0) {
    const seen = new Set();
    return normalized.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });
  }

  return plan.square_plan_variation_id || plan.price_amount
    ? [{
      key: 'monthly',
      label: 'Monthly',
      months: 1,
      duration_days: 0,
      price_amount: Math.max(0, parseInt(plan.price_amount, 10) || 0),
      currency: String(plan.currency || 'gbp').toLowerCase(),
      square_plan_variation_id: String(plan.square_plan_variation_id || '').trim(),
    }]
    : [];
}

function serializeMonthlyCadences(cadences, fallbackCurrency = 'gbp') {
  const normalized = (Array.isArray(cadences) ? cadences : [])
    .map((row, idx) => {
      const months = Math.max(1, parseInt(row?.months, 10) || 0);
      const durationDays = Math.max(0, parseInt(row?.duration_days, 10) || 0);
      const priceAmount = Math.max(0, parseInt(row?.price_amount, 10) || 0);
      const label = String(row?.label || '').trim() || (durationDays === 7 ? 'Weekly Pass' : (months === 1 ? 'Monthly' : `${months} months`));
      const key = slugifyCadenceKey(row?.key || label || `cadence_${idx + 1}`) || `cadence_${idx + 1}`;
      return {
        key,
        label,
        months,
        duration_days: durationDays,
        price_amount: priceAmount,
        currency: String(row?.currency || fallbackCurrency || 'gbp').toLowerCase(),
        square_plan_variation_id: String(row?.square_plan_variation_id || '').trim(),
      };
    })
    .filter((row) => row.months > 0 && row.price_amount >= 0);

  const seen = new Set();
  return normalized.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function attachPlanCadenceMeta(plan, discount = null) {
  const base = { ...plan };
  if (plan.plan_type !== 'monthly') return base;

  const cadences = parseMonthlyCadences(plan).map((cadence) => ({
    ...cadence,
    is_recurring: !!cadence.square_plan_variation_id,
    is_one_time: !cadence.square_plan_variation_id,
    discount_percent: discount ? discount.discount_percent : 0,
    discounted_amount: discount ? applyDiscount(cadence.price_amount, discount.discount_percent) : cadence.price_amount,
  }));

  return {
    ...base,
    monthly_cadences: cadences,
  };
}

function addMonthsToIsoDate(startDate, monthsToAdd) {
  const base = new Date(startDate);
  const next = new Date(base);
  next.setMonth(next.getMonth() + Math.max(1, parseInt(monthsToAdd, 10) || 1));
  return next.toISOString().slice(0, 10);
}

function addDaysToIsoDate(startDate, daysToAdd) {
  const base = new Date(startDate);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Math.max(1, parseInt(daysToAdd, 10) || 1));
  return next.toISOString().slice(0, 10);
}

function formatMembershipDuration({ months = 1, days = 0 } = {}) {
  const parsedDays = Math.max(0, parseInt(days, 10) || 0);
  if (parsedDays > 0) {
    if (parsedDays === 7) return '1 week';
    return `${parsedDays} days`;
  }
  const parsedMonths = Math.max(1, parseInt(months, 10) || 1);
  return parsedMonths === 1 ? '1 month' : `${parsedMonths} months`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || '').trim());
}

function shiftMonthKey(monthKey, offset) {
  const raw = String(monthKey || '').trim();
  if (!isValidMonthKey(raw)) return currentMonthKey();
  const [year, month] = raw.split('-').map((part) => parseInt(part, 10));
  const next = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthDistance(laterMonthKey, earlierMonthKey) {
  if (!isValidMonthKey(laterMonthKey) || !isValidMonthKey(earlierMonthKey)) return 0;
  const [laterYear, laterMonth] = laterMonthKey.split('-').map((part) => parseInt(part, 10));
  const [earlierYear, earlierMonth] = earlierMonthKey.split('-').map((part) => parseInt(part, 10));
  return Math.max(0, ((laterYear - earlierYear) * 12) + (laterMonth - earlierMonth));
}

function formatMonthLabel(monthKey) {
  if (!isValidMonthKey(monthKey)) return monthKey || '';
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatCurrencyAmount(amount, currency = 'gbp') {
  const normalizedCurrency = String(currency || 'gbp').trim().toUpperCase() || 'GBP';
  const numericAmount = Number(amount || 0) / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${normalizedCurrency} ${numericAmount.toFixed(2)}`;
  }
}

function getVenueAccessNotificationState(db, subscriberUserId, venueId) {
  const row = db.prepare(`
    SELECT notify_subscription_events, notify_day_pass_purchases, notify_payments
    FROM venue_access_notification_subscriptions
    WHERE subscriber_user_id = ? AND venue_id = ?
  `).get(subscriberUserId, venueId);

  const notifySubscriptionEvents = !!row?.notify_subscription_events;
  const notifyDayPassPurchases = !!row?.notify_day_pass_purchases;
  const notifyPayments = !!row?.notify_payments;

  return {
    notify_subscription_events: notifySubscriptionEvents,
    notify_day_pass_purchases: notifyDayPassPurchases,
    notify_payments: notifyPayments,
    subscribed: notifySubscriptionEvents || notifyDayPassPurchases || notifyPayments,
  };
}

function notifyUsersAboutVenueAccessEvent(db, {
  venueId,
  eventType,
  username,
  venueName,
  planName,
  cadenceLabel,
  passDate,
  amount,
  currency,
  paymentType,
}) {
  if (!db || !venueId || !eventType) return 0;

  const normalizedType = String(eventType || '').trim().toLowerCase();
  const recipientRows = db.prepare(`
    SELECT subscriber_user_id AS user_id,
           notify_subscription_events,
           notify_day_pass_purchases,
           notify_payments
    FROM venue_access_notification_subscriptions
    WHERE venue_id = ?
  `).all(venueId);

  if (!recipientRows.length) return 0;

  const safeUsername = String(username || '').trim() || 'Someone';
  const safeVenueName = String(venueName || '').trim() || 'Pump Dojo';
  const safePlanName = String(planName || '').trim();
  const safeCadenceLabel = String(cadenceLabel || '').trim();
  const safePassDate = String(passDate || '').trim();
  const safeAmount = amount != null ? formatCurrencyAmount(amount, currency) : '';
  const cadenceSummary = safeCadenceLabel || safePlanName || 'membership';
  const paymentLabel = paymentType === 'day_pass'
    ? 'day pass'
    : paymentType === 'subscription_renewal'
      ? 'subscription renewal'
      : 'subscription';

  let title = 'Dojo Update';
  let message = `${safeUsername} triggered a dojo event.`;
  let shouldNotify = () => false;
  let notificationType = 'dojo_venue_access';

  if (normalizedType === 'subscription_created') {
    title = 'Dojo Subscription Started';
    message = `${safeUsername} started a ${cadenceSummary} at ${safeVenueName}.`;
    shouldNotify = (row) => !!row?.notify_subscription_events;
    notificationType = 'dojo_subscription_created';
  } else if (normalizedType === 'subscription_cancelled') {
    title = 'Dojo Subscription Cancelled';
    message = `${safeUsername} cancelled their ${cadenceSummary} at ${safeVenueName}.`;
    shouldNotify = (row) => !!row?.notify_subscription_events;
    notificationType = 'dojo_subscription_cancelled';
  } else if (normalizedType === 'day_pass_purchased') {
    title = 'Dojo Day Pass Purchased';
    message = `${safeUsername} bought a day pass${safePassDate ? ` for ${safePassDate}` : ''} at ${safeVenueName}.`;
    shouldNotify = (row) => !!row?.notify_day_pass_purchases;
    notificationType = 'dojo_day_pass_purchase';
  } else if (normalizedType === 'payment_received') {
    title = 'Dojo Payment Received';
    message = `${safeUsername} paid ${safeAmount || 'for access'} for ${paymentLabel}${safePassDate ? ` on ${safePassDate}` : ''} at ${safeVenueName}.`;
    shouldNotify = (row) => !!row?.notify_payments;
    notificationType = 'dojo_payment_received';
  } else {
    return 0;
  }

  let notified = 0;
  for (const row of recipientRows) {
    const recipientId = String(row?.user_id || '').trim();
    if (!recipientId || !shouldNotify(row)) continue;
    createUserNotification(db, recipientId, notificationType, title, message, '/dojoadmin');
    notified += 1;
  }
  return notified;
}

/**
 * Find the best active discount for a user at a venue.
 * @param {string} appliesTo - 'monthly' or 'day_pass'
 */
function getUserDiscount(db, userId, venueId, appliesTo) {
  const now = new Date().toISOString();
  const discount = db.prepare(`
    SELECT * FROM venue_user_discounts
    WHERE user_id = ? AND venue_id = ? AND active = 1
      AND (applies_to = 'all' OR applies_to = ?)
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY discount_percent DESC
    LIMIT 1
  `).get(userId, venueId, appliesTo, now);
  return discount || null;
}

/** Apply discount to an amount, returning the discounted amount (integer, floor). */
function applyDiscount(amount, discountPercent) {
  if (!discountPercent || discountPercent <= 0) return amount;
  return Math.floor(amount * (100 - discountPercent) / 100);
}

/** Check if a user is on the approved whitelist for a venue. */
function isUserApproved(db, userId, venueId) {
  const row = db.prepare('SELECT 1 FROM venue_approved_users WHERE user_id = ? AND venue_id = ?').get(userId, venueId);
  return !!row;
}

const DOJO_MEMBER_GROUP_NAME = 'Pump Dojo';
const DOJO_VISITOR_GROUP_NAME = 'Dojo Visitor';

function isUserInAdminGroup(db, userId, groupName) {
  const row = db.prepare(`
    SELECT 1 FROM admin_user_group_members gm
    JOIN admin_user_groups g ON g.id = gm.group_id
    WHERE gm.user_id = ? AND g.name = ? COLLATE NOCASE
    LIMIT 1
  `).get(userId, groupName);
  return !!row;
}

/** Check if user is in the "Pump Dojo" admin user group. */
function isDojoMember(db, userId) {
  return isUserInAdminGroup(db, userId, DOJO_MEMBER_GROUP_NAME);
}

/** Check if user is in the pay-as-you-go dojo visitor group. */
function isDojoVisitor(db, userId) {
  return isUserInAdminGroup(db, userId, DOJO_VISITOR_GROUP_NAME);
}

function getVenueApprovalState(db, userId, venueId) {
  const approved = isUserApproved(db, userId, venueId);
  const dojoVisitor = isDojoVisitor(db, userId);
  return {
    approved,
    dojoVisitor,
    purchaseApproved: approved || dojoVisitor,
  };
}

function getVenueAccessForMembership(db, userId, venueId) {
  const access = checkUserVenueAccess(db, userId, venueId);
  if (access.accessType === 'group_member' && isDojoVisitor(db, userId) && !isDojoMember(db, userId)) {
    return { hasAccess: false, accessType: 'dojo_visitor', detail: null };
  }
  return access;
}

/**
 * Ensure the "Pump Dojo" group exists and return its ID.
 * Creates it if it doesn't exist.
 */
function ensureDojoMemberGroup(db, createdByUserId) {
  let group = db.prepare('SELECT id FROM admin_user_groups WHERE name = ? COLLATE NOCASE').get(DOJO_MEMBER_GROUP_NAME);
  if (group) return group.id;

  const groupId = uuidv4();
  db.prepare(`
    INSERT INTO admin_user_groups (id, name, description, created_by)
    VALUES (?, ?, ?, ?)
  `).run(groupId, DOJO_MEMBER_GROUP_NAME, 'Pump Dojo members with venue access via subscription or admin grant', createdByUserId || null);

  return groupId;
}

/**
 * Ensure the "Dojo Visitor" group exists and return its ID.
 * Visitors are allowed to buy access but do not get check-in access from the group.
 */
function ensureDojoVisitorGroup(db, createdByUserId) {
  let group = db.prepare('SELECT id FROM admin_user_groups WHERE name = ? COLLATE NOCASE').get(DOJO_VISITOR_GROUP_NAME);
  if (group) return group.id;

  const groupId = uuidv4();
  db.prepare(`
    INSERT INTO admin_user_groups (id, name, description, created_by)
    VALUES (?, ?, ?, ?)
  `).run(groupId, DOJO_VISITOR_GROUP_NAME, 'Pay-as-you-go Dojo visitors approved to purchase venue access', createdByUserId || null);

  return groupId;
}

/**
 * Add a user to the "Pump Dojo" group if they are not already in it.
 * Also grants the 'checkin' feature to the group if not already granted.
 */
function addUserToDojoMemberGroup(db, userId, addedByUserId) {
  const groupId = ensureDojoMemberGroup(db, addedByUserId);

  // Add user to group (ignore if already a member)
  db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_members (group_id, user_id, added_by)
    VALUES (?, ?, ?)
  `).run(groupId, userId, addedByUserId || null);

  // Ensure the group has 'checkin' feature permission
  db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_feature_permissions (group_id, feature_key)
    VALUES (?, 'checkin')
  `).run(groupId);

  db.prepare(`
    DELETE FROM admin_user_group_members
    WHERE user_id = ?
      AND group_id IN (
        SELECT id FROM admin_user_groups WHERE name = ? COLLATE NOCASE
      )
  `).run(userId, DOJO_VISITOR_GROUP_NAME);
}

function addUserToDojoVisitorGroup(db, userId, addedByUserId) {
  const groupId = ensureDojoVisitorGroup(db, addedByUserId);
  db.prepare(`
    INSERT OR IGNORE INTO admin_user_group_members (group_id, user_id, added_by)
    VALUES (?, ?, ?)
  `).run(groupId, userId, addedByUserId || null);
}

function removeUserFromDojoMemberGroup(db, userId) {
  const result = db.prepare(`
    DELETE FROM admin_user_group_members
    WHERE user_id = ?
      AND group_id IN (
        SELECT id FROM admin_user_groups WHERE name = ? COLLATE NOCASE
      )
  `).run(userId, DOJO_MEMBER_GROUP_NAME);
  return result?.changes || 0;
}

function hasCurrentMonthlySubscription(db, userId, venueId) {
  const today = todayDateString();
  const row = db.prepare(`
    SELECT 1
    FROM venue_subscriptions
    WHERE user_id = ? AND venue_id = ? AND status = 'active'
      AND current_period_start <= ? AND current_period_end >= ?
    LIMIT 1
  `).get(userId, venueId, today, today);
  return !!row;
}

function moveExpiredDojoMemberToVisitor(db, userId, venueId, addedByUserId = null) {
  if (hasCurrentMonthlySubscription(db, userId, venueId)) return false;

  removeUserFromDojoMemberGroup(db, userId);
  addUserToDojoVisitorGroup(db, userId, addedByUserId);
  return true;
}

function reconcileExpiredVenueSubscriptions(db, userId, venueId, options = {}) {
  if (!db || !userId || !venueId) {
    return { expired_subscriptions: 0, moved_to_visitor: false };
  }

  const today = todayDateString();
  const result = db.prepare(`
    UPDATE venue_subscriptions
    SET status = 'expired',
        cancelled_at = COALESCE(cancelled_at, datetime('now')),
        updated_at = datetime('now')
    WHERE user_id = ? AND venue_id = ?
      AND status IN ('active', 'past_due')
      AND (square_subscription_id IS NULL OR TRIM(square_subscription_id) = '')
      AND current_period_end IS NOT NULL
      AND current_period_end < ?
  `).run(userId, venueId, today);

  const expiredCount = result?.changes || 0;
  const shouldSyncGroups = options.syncGroups !== false;
  const movedToVisitor = expiredCount > 0 && shouldSyncGroups
    ? moveExpiredDojoMemberToVisitor(db, userId, venueId, options.addedByUserId || null)
    : false;

  return {
    expired_subscriptions: expiredCount,
    moved_to_visitor: movedToVisitor,
  };
}

function finalizeVenuePaymentSuccess(db, paymentRow, options = {}) {
  if (!paymentRow?.id) return null;

  const squarePaymentId = String(options.squarePaymentId || paymentRow.square_payment_id || '').trim();
  db.prepare(`
    UPDATE venue_payments
    SET status = 'succeeded',
        square_payment_id = CASE WHEN ? != '' THEN ? ELSE square_payment_id END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(squarePaymentId, squarePaymentId, paymentRow.id);

  if (paymentRow.payment_type === 'day_pass') {
    const passDate = options.passDate || parsePassDateFromDescription(paymentRow.description) || todayDateString();
    const existingPass = db.prepare(`
      SELECT id
      FROM venue_day_passes
      WHERE payment_id = ?
         OR (user_id = ? AND venue_id = ? AND pass_date = ? AND status IN ('active', 'used'))
      LIMIT 1
    `).get(paymentRow.id, paymentRow.user_id, paymentRow.venue_id, passDate);

    if (!existingPass) {
      const passId = uuidv4();
      db.prepare(`
        INSERT INTO venue_day_passes (id, user_id, venue_id, plan_id, pass_date, status, payment_id)
        VALUES (?, ?, ?, ?, ?, 'active', ?)
      `).run(passId, paymentRow.user_id, paymentRow.venue_id, paymentRow.plan_id, passDate, paymentRow.id);
    }

    const paymentUser = db.prepare('SELECT username FROM users WHERE id = ?').get(paymentRow.user_id);
    const paymentVenue = db.prepare('SELECT name FROM venues WHERE id = ?').get(paymentRow.venue_id);
    const paymentPlan = db.prepare('SELECT name FROM venue_access_plans WHERE id = ?').get(paymentRow.plan_id);

    notifyUsersAboutVenueAccessEvent(db, {
      venueId: paymentRow.venue_id,
      eventType: 'day_pass_purchased',
      username: paymentUser?.username,
      venueName: paymentVenue?.name,
      planName: paymentPlan?.name,
      passDate,
    });
    notifyUsersAboutVenueAccessEvent(db, {
      venueId: paymentRow.venue_id,
      eventType: 'payment_received',
      username: paymentUser?.username,
      venueName: paymentVenue?.name,
      planName: paymentPlan?.name,
      passDate,
      amount: paymentRow.amount,
      currency: paymentRow.currency,
      paymentType: 'day_pass',
    });

    return { type: 'day_pass', pass_date: passDate };
  }

  if (paymentRow.payment_type === 'subscription') {
    reconcileExpiredVenueSubscriptions(db, paymentRow.user_id, paymentRow.venue_id);
    const today = todayDateString();
    const existingSub = db.prepare(`
      SELECT id
      FROM venue_subscriptions
      WHERE user_id = ? AND venue_id = ? AND status IN ('active', 'past_due')
        AND (current_period_end IS NULL OR current_period_end >= ?)
      LIMIT 1
    `).get(paymentRow.user_id, paymentRow.venue_id, today);

    if (!existingSub) {
      const subId = uuidv4();
      const periodStart = todayDateString();
      const billingIntervalMonths = Math.max(1, parseInt(paymentRow.billing_interval_months, 10) || 1);
      const billingIntervalDays = Math.max(0, parseInt(paymentRow.billing_interval_days, 10) || 0);
      const periodEnd = billingIntervalDays > 0
        ? addDaysToIsoDate(`${periodStart}T12:00:00Z`, billingIntervalDays)
        : addMonthsToIsoDate(`${periodStart}T12:00:00Z`, billingIntervalMonths);

      db.prepare(`
        INSERT INTO venue_subscriptions (
          id, user_id, venue_id, plan_id, status,
          subscription_cadence_key, subscription_cadence_label, billing_interval_months, billing_interval_days,
          current_period_start, current_period_end
        )
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
      `).run(
        subId,
        paymentRow.user_id,
        paymentRow.venue_id,
        paymentRow.plan_id,
        paymentRow.subscription_cadence_key || '',
        paymentRow.subscription_cadence_label || '',
        billingIntervalMonths,
        billingIntervalDays,
        periodStart,
        periodEnd,
      );
    }

    addUserToDojoMemberGroup(db, paymentRow.user_id, null);

    const paymentUser = db.prepare('SELECT username FROM users WHERE id = ?').get(paymentRow.user_id);
    const paymentVenue = db.prepare('SELECT name FROM venues WHERE id = ?').get(paymentRow.venue_id);
    const paymentPlan = db.prepare('SELECT name FROM venue_access_plans WHERE id = ?').get(paymentRow.plan_id);

    notifyUsersAboutVenueAccessEvent(db, {
      venueId: paymentRow.venue_id,
      eventType: 'subscription_created',
      username: paymentUser?.username,
      venueName: paymentVenue?.name,
      planName: paymentPlan?.name,
      cadenceLabel: paymentRow.subscription_cadence_label,
    });
    notifyUsersAboutVenueAccessEvent(db, {
      venueId: paymentRow.venue_id,
      eventType: 'payment_received',
      username: paymentUser?.username,
      venueName: paymentVenue?.name,
      planName: paymentPlan?.name,
      cadenceLabel: paymentRow.subscription_cadence_label,
      amount: paymentRow.amount,
      currency: paymentRow.currency,
      paymentType: 'subscription',
    });

    return { type: 'subscription' };
  }

  return null;
}

async function reconcilePendingVenuePaymentsForUser(db, userId) {
  if (!isSquareConfigured() || !userId) return { reconciled: 0 };

  purgeStalePendingDayPassPayments(db, { userId });

  const pendingRows = db.prepare(`
    SELECT *
    FROM venue_payments
    WHERE user_id = ?
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(userId);

  let reconciled = 0;

  for (const paymentRow of pendingRows) {
    let orderId = String(paymentRow.square_order_id || '').trim();
    try {
      if (!orderId && paymentRow.square_link_id) {
        const paymentLinkResponse = await retrievePaymentLink(paymentRow.square_link_id);
        orderId = String(paymentLinkResponse?.payment_link?.order_id || paymentLinkResponse?.paymentLink?.orderId || '').trim();
        if (orderId && !paymentRow.square_order_id) {
          db.prepare(`
            UPDATE venue_payments
            SET square_order_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(orderId, paymentRow.id);
          paymentRow.square_order_id = orderId;
        }
      }

      if (!orderId) continue;

      const orderResponse = await retrieveOrder(orderId);
      const order = orderResponse?.order || orderResponse?.result?.order || null;
      const tender = Array.isArray(order?.tenders) ? order.tenders.find((row) => {
        const cardStatus = String(row?.card_details?.status || '').toUpperCase();
        return !!row?.payment_id || cardStatus === 'CAPTURED';
      }) : null;
      const isPaid = !!tender || ((parseInt(order?.net_amount_due_money?.amount, 10) || 0) <= 0 && Array.isArray(order?.tenders) && order.tenders.length > 0);
      if (!isPaid) continue;

      finalizeVenuePaymentSuccess(db, paymentRow, {
        squarePaymentId: tender?.payment_id || tender?.id || '',
      });
      reconciled += 1;
    } catch (err) {
      console.error('[VenueAccess] Reconcile pending payment error:', err.message);
    }
  }

  return { reconciled };
}

/**
 * Check whether a user currently has valid access to a venue.
 * Returns { hasAccess, accessType, detail }.
 *
 * Access is granted if any of:
 *  1. User has an active monthly subscription covering today
 *  2. User has a day pass for today
 *  3. User is in the "Pump Dojo" admin user group (backward-compat)
 */
function checkUserVenueAccess(db, userId, venueId) {
  reconcileExpiredVenueSubscriptions(db, userId, venueId);
  const today = todayDateString();

  // 1. Active monthly subscription whose period covers today
  const sub = db.prepare(`
    SELECT id, plan_id, current_period_start, current_period_end
    FROM venue_subscriptions
    WHERE user_id = ? AND venue_id = ? AND status = 'active'
      AND current_period_start <= ? AND current_period_end >= ?
    ORDER BY current_period_end DESC
    LIMIT 1
  `).get(userId, venueId, today, today);

  if (sub) {
    return { hasAccess: true, accessType: 'monthly', detail: sub };
  }

  // 2. Day pass for today
  const dayPass = db.prepare(`
    SELECT id, plan_id, pass_date
    FROM venue_day_passes
    WHERE user_id = ? AND venue_id = ? AND pass_date = ? AND status IN ('active', 'used')
    LIMIT 1
  `).get(userId, venueId, today);

  if (dayPass) {
    return { hasAccess: true, accessType: 'day_pass', detail: dayPass };
  }

  // 3. Backward-compat: user is in "Pump Dojo" group
  if (isDojoMember(db, userId)) {
    return { hasAccess: true, accessType: 'group_member', detail: null };
  }

  return { hasAccess: false, accessType: null, detail: null };
}

// ── Public endpoints ────────────────────────────────────────────────────

// GET /api/venue-access/config
router.get('/config', (req, res) => {
  res.json({
    payments_configured: isSquareConfigured(),
  });
});

// GET /api/venue-access/plans/:venueSlug — list active plans for a venue (with user discount info)
router.get('/plans/:venueSlug', requireAuth, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const plans = db.prepare(`
    SELECT id, plan_type, name, price_amount, currency, square_plan_variation_id, monthly_cadences_json
    FROM venue_access_plans
    WHERE venue_id = ? AND active = 1
    ORDER BY plan_type, price_amount
  `).all(venue.id);

  // Attach discount info for the requesting user
  const plansWithDiscount = plans.map(plan => {
    const appliesTo = plan.plan_type === 'monthly' ? 'monthly' : 'day_pass';
    const discount = getUserDiscount(db, req.user.id, venue.id, appliesTo);
    const discountedAmount = discount ? applyDiscount(plan.price_amount, discount.discount_percent) : plan.price_amount;
    return attachPlanCadenceMeta({
      ...plan,
      discount_percent: discount ? discount.discount_percent : 0,
      discounted_amount: discountedAmount,
    }, discount);
  });

  const approval = getVenueApprovalState(db, req.user.id, venue.id);

  res.json({
    venue,
    plans: plansWithDiscount,
    approved: approval.purchaseApproved,
    approved_direct: approval.approved,
    dojo_visitor: approval.dojoVisitor,
  });
});

// GET /api/venue-access/my-access/:venueSlug — check current user's access status
router.get('/my-access/:venueSlug', requireAuth, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const access = getVenueAccessForMembership(db, req.user.id, venue.id);
  const today = todayDateString();

  const subscription = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at,
           vs.subscription_cadence_key, vs.subscription_cadence_label, vs.billing_interval_months, vs.billing_interval_days,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ? AND vs.status IN ('active', 'past_due')
      AND current_period_start <= ? AND current_period_end >= ?
    ORDER BY vs.current_period_end DESC
    LIMIT 1
  `).get(req.user.id, venue.id, today, today);

  const dayPasses = db.prepare(`
    SELECT vdp.id, vdp.pass_date, vdp.status,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_day_passes vdp
    JOIN venue_access_plans vap ON vap.id = vdp.plan_id
    WHERE vdp.user_id = ? AND vdp.venue_id = ? AND vdp.pass_date >= ? AND vdp.status IN ('active', 'used')
    ORDER BY vdp.pass_date ASC
    LIMIT 10
  `).all(req.user.id, venue.id, today);

  // Active discounts
  const discounts = db.prepare(`
    SELECT id, discount_percent, applies_to, expires_at, note
    FROM venue_user_discounts
    WHERE user_id = ? AND venue_id = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY discount_percent DESC
  `).all(req.user.id, venue.id);

  const approval = getVenueApprovalState(db, req.user.id, venue.id);

  res.json({
    venue,
    approved: approval.purchaseApproved,
    approved_direct: approval.approved,
    dojo_visitor: approval.dojoVisitor,
    has_access: access.hasAccess,
    access_type: access.accessType,
    subscription: subscription || null,
    day_passes: dayPasses,
    discounts,
  });
});

// GET /api/venue-access/notifications/:venueSlug — get current dojo admin venue-access notification prefs
router.get('/notifications/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const prefs = getVenueAccessNotificationState(db, req.user.id, venue.id);
  res.json({
    venue_id: venue.id,
    venue_slug: venue.slug,
    ...prefs,
  });
});

// PUT /api/venue-access/notifications/:venueSlug — set current dojo admin venue-access notification prefs
router.put('/notifications/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const payload = req.body || {};
  const hasSubscribed = Object.prototype.hasOwnProperty.call(payload, 'subscribed');
  const hasNotifySubscriptionEvents = Object.prototype.hasOwnProperty.call(payload, 'notify_subscription_events');
  const hasNotifyDayPassPurchases = Object.prototype.hasOwnProperty.call(payload, 'notify_day_pass_purchases');
  const hasNotifyPayments = Object.prototype.hasOwnProperty.call(payload, 'notify_payments');

  if (!hasSubscribed && !hasNotifySubscriptionEvents && !hasNotifyDayPassPurchases && !hasNotifyPayments) {
    return res.status(400).json({ error: 'At least one notification field must be provided' });
  }

  const existing = getVenueAccessNotificationState(db, req.user.id, venue.id);
  if (hasSubscribed && !payload.subscribed) {
    db.prepare(`
      DELETE FROM venue_access_notification_subscriptions
      WHERE subscriber_user_id = ? AND venue_id = ?
    `).run(req.user.id, venue.id);

    return res.json({
      venue_id: venue.id,
      venue_slug: venue.slug,
      subscribed: false,
      notify_subscription_events: false,
      notify_day_pass_purchases: false,
      notify_payments: false,
    });
  }

  let notifySubscriptionEvents = hasNotifySubscriptionEvents
    ? !!payload.notify_subscription_events
    : !!existing.notify_subscription_events;
  let notifyDayPassPurchases = hasNotifyDayPassPurchases
    ? !!payload.notify_day_pass_purchases
    : !!existing.notify_day_pass_purchases;
  let notifyPayments = hasNotifyPayments
    ? !!payload.notify_payments
    : !!existing.notify_payments;

  if (
    hasSubscribed
    && !!payload.subscribed
    && !hasNotifySubscriptionEvents
    && !hasNotifyDayPassPurchases
    && !hasNotifyPayments
    && !existing.subscribed
  ) {
    notifySubscriptionEvents = true;
    notifyDayPassPurchases = true;
    notifyPayments = true;
  }

  if (!notifySubscriptionEvents && !notifyDayPassPurchases && !notifyPayments) {
    db.prepare(`
      DELETE FROM venue_access_notification_subscriptions
      WHERE subscriber_user_id = ? AND venue_id = ?
    `).run(req.user.id, venue.id);

    return res.json({
      venue_id: venue.id,
      venue_slug: venue.slug,
      subscribed: false,
      notify_subscription_events: false,
      notify_day_pass_purchases: false,
      notify_payments: false,
    });
  }

  db.prepare(`
    INSERT INTO venue_access_notification_subscriptions (
      subscriber_user_id,
      venue_id,
      notify_subscription_events,
      notify_day_pass_purchases,
      notify_payments,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(subscriber_user_id, venue_id) DO UPDATE SET
      notify_subscription_events = excluded.notify_subscription_events,
      notify_day_pass_purchases = excluded.notify_day_pass_purchases,
      notify_payments = excluded.notify_payments,
      updated_at = datetime('now')
  `).run(
    req.user.id,
    venue.id,
    notifySubscriptionEvents ? 1 : 0,
    notifyDayPassPurchases ? 1 : 0,
    notifyPayments ? 1 : 0,
  );

  return res.json({
    venue_id: venue.id,
    venue_slug: venue.slug,
    subscribed: true,
    notify_subscription_events: notifySubscriptionEvents,
    notify_day_pass_purchases: notifyDayPassPurchases,
    notify_payments: notifyPayments,
  });
});

// POST /api/venue-access/purchase/day-pass — create Square payment link for a day pass
router.post('/purchase/day-pass', requireAuth, async (req, res) => {
  let paymentId = '';
  try {
    if (!isSquareConfigured()) {
      return res.status(503).json({ error: 'Payment processing is not configured' });
    }

    const db = getDb();
    const { plan_id, pass_date } = req.body;
    if (!plan_id || !pass_date) {
      return res.status(400).json({ error: 'plan_id and pass_date are required' });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(pass_date)) {
      return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
    }
    const today = todayDateString();
    if (pass_date < today) {
      return res.status(400).json({ error: 'Cannot purchase a day pass for a past date' });
    }

    // Check whitelist
    const venue = db.prepare(`SELECT v.id FROM venues v JOIN venue_access_plans vap ON v.id = vap.venue_id WHERE vap.id = ?`).get(plan_id);
    if (venue && !getVenueApprovalState(db, req.user.id, venue.id).purchaseApproved) {
      return res.status(403).json({ error: 'You are not approved for this venue. Please contact the venue admin.' });
    }

    // Validate the plan type matches the date (weekday vs weekend)
    const expectedPlanType = dayPassPlanTypeForDate(pass_date);

    const plan = db.prepare(`
      SELECT vap.*, v.name AS venue_name, v.slug AS venue_slug
      FROM venue_access_plans vap
      JOIN venues v ON v.id = vap.venue_id
      WHERE vap.id = ? AND vap.plan_type = ? AND vap.active = 1
    `).get(plan_id, expectedPlanType);

    if (!plan) {
      // Also allow if they pick any day_pass plan type for that venue
      const fallbackPlan = db.prepare(`
        SELECT vap.*, v.name AS venue_name, v.slug AS venue_slug
        FROM venue_access_plans vap
        JOIN venues v ON v.id = vap.venue_id
        WHERE vap.id = ? AND vap.plan_type IN ('day_pass_weekday', 'day_pass_weekend') AND vap.active = 1
      `).get(plan_id);
      if (!fallbackPlan) return res.status(404).json({ error: 'Day pass plan not found' });
      // Use fallback but warn
      Object.assign(plan || {}, fallbackPlan);
    }

    const activePlan = plan || db.prepare(`
      SELECT vap.*, v.name AS venue_name, v.slug AS venue_slug
      FROM venue_access_plans vap
      JOIN venues v ON v.id = vap.venue_id
      WHERE vap.id = ? AND vap.plan_type IN ('day_pass_weekday', 'day_pass_weekend') AND vap.active = 1
    `).get(plan_id);

    if (!activePlan) return res.status(404).json({ error: 'Day pass plan not found' });

    // Check if user already has a pass for this date
    const existing = db.prepare(`
      SELECT id FROM venue_day_passes
      WHERE user_id = ? AND venue_id = ? AND pass_date = ? AND status IN ('active', 'used')
    `).get(req.user.id, activePlan.venue_id, pass_date);
    if (existing) {
      return res.status(409).json({ error: 'You already have a day pass for this date' });
    }

    // Apply discount if available
    const discount = getUserDiscount(db, req.user.id, activePlan.venue_id, 'day_pass');
    const chargeAmount = discount ? applyDiscount(activePlan.price_amount, discount.discount_percent) : activePlan.price_amount;
    const discountNote = discount ? ` (${discount.discount_percent}% discount applied)` : '';

    // Create payment record
    paymentId = uuidv4();
    db.prepare(`
      INSERT INTO venue_payments (id, user_id, venue_id, plan_id, payment_type, amount, currency, status, description)
      VALUES (?, ?, ?, ?, 'day_pass', ?, ?, 'pending', ?)
    `).run(paymentId, req.user.id, activePlan.venue_id, activePlan.id, chargeAmount, activePlan.currency,
      `Day pass for ${activePlan.venue_name} on ${pass_date}${discountNote}`);

    const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user.id);

    const link = await createDayPassPaymentLink({
      userId: req.user.id,
      email: user?.email || '',
      username: user?.username || '',
      venueId: activePlan.venue_id,
      planId: activePlan.id,
      planName: `${activePlan.venue_name} — ${activePlan.name}${discountNote}`,
      priceAmount: chargeAmount,
      currency: activePlan.currency,
      passDate: pass_date,
    });

    db.prepare(`UPDATE venue_payments SET square_link_id = ?, square_order_id = ? WHERE id = ?`)
      .run(link.id, link.orderId || null, paymentId);

    res.json({ checkout_url: link.url, link_id: link.id });
  } catch (err) {
    if (paymentId) {
      try {
        getDb().prepare(`
          DELETE FROM venue_payments
          WHERE id = ?
            AND payment_type = 'day_pass'
            AND status = 'pending'
        `).run(paymentId);
      } catch (cleanupErr) {
        console.error('[VenueAccess] Failed to clean up pending day pass payment:', cleanupErr.message);
      }
    }
    console.error('[VenueAccess] Day pass checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/venue-access/purchase/subscription — create Square payment link for monthly subscription
router.post('/purchase/subscription', requireAuth, async (req, res) => {
  try {
    if (!isSquareConfigured()) {
      return res.status(503).json({ error: 'Payment processing is not configured' });
    }

    const db = getDb();
    const { plan_id, cadence_key } = req.body;
    if (!plan_id) {
      return res.status(400).json({ error: 'plan_id is required' });
    }

    const plan = db.prepare(`
      SELECT vap.*, v.name AS venue_name, v.slug AS venue_slug
      FROM venue_access_plans vap
      JOIN venues v ON v.id = vap.venue_id
      WHERE vap.id = ? AND vap.plan_type = 'monthly' AND vap.active = 1
    `).get(plan_id);
    if (!plan) return res.status(404).json({ error: 'Monthly plan not found' });

    const cadenceOptions = parseMonthlyCadences(plan);
    const selectedCadence = cadenceOptions.find((row) => row.key === String(cadence_key || '').trim())
      || cadenceOptions[0]
      || null;
    if (!selectedCadence) {
      return res.status(400).json({ error: 'No monthly cadence configured for this plan' });
    }

    // Check whitelist
    if (!getVenueApprovalState(db, req.user.id, plan.venue_id).purchaseApproved) {
      return res.status(403).json({ error: 'You are not approved for this venue. Please contact the venue admin.' });
    }

    reconcileExpiredVenueSubscriptions(db, req.user.id, plan.venue_id);
    const today = todayDateString();
    const existing = db.prepare(`
      SELECT id FROM venue_subscriptions
      WHERE user_id = ? AND venue_id = ? AND status IN ('active', 'past_due')
        AND (current_period_end IS NULL OR current_period_end >= ?)
    `).get(req.user.id, plan.venue_id, today);
    if (existing) {
      return res.status(409).json({ error: 'You already have an active subscription for this venue' });
    }

    // Apply discount if available
    const discount = getUserDiscount(db, req.user.id, plan.venue_id, 'monthly');
    const chargeAmount = discount ? applyDiscount(selectedCadence.price_amount, discount.discount_percent) : selectedCadence.price_amount;
    const discountNote = discount ? ` (${discount.discount_percent}% discount applied)` : '';
    const billingIntervalDays = Math.max(0, parseInt(selectedCadence.duration_days, 10) || 0);
    const isOneTimeMonthly = !String(selectedCadence.square_plan_variation_id || '').trim();
    const checkoutDescription = isOneTimeMonthly
      ? `${formatMembershipDuration({ months: selectedCadence.months, days: billingIntervalDays })} unlimited entry to the Dojo`
      : `${selectedCadence.label} membership for ${plan.venue_name}`;

    const paymentId = uuidv4();
    db.prepare(`
      INSERT INTO venue_payments (
        id, user_id, venue_id, plan_id, payment_type, amount, currency, status,
        subscription_cadence_key, subscription_cadence_label, billing_interval_months, billing_interval_days, description
      )
      VALUES (?, ?, ?, ?, 'subscription', ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      req.user.id,
      plan.venue_id,
      plan.id,
      chargeAmount,
      selectedCadence.currency || plan.currency,
      selectedCadence.key,
      selectedCadence.label,
      selectedCadence.months,
      billingIntervalDays,
      `${checkoutDescription}${discountNote}`,
    );

    const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user.id);

    const link = await createSubscriptionPaymentLink({
      userId: req.user.id,
      email: user?.email || '',
      username: user?.username || '',
      venueId: plan.venue_id,
      planId: plan.id,
      squarePlanVariationId: selectedCadence.square_plan_variation_id || null,
      cadenceKey: selectedCadence.key,
      cadenceLabel: selectedCadence.label,
      billingIntervalMonths: selectedCadence.months,
      billingIntervalDays,
      planName: `${plan.venue_name} — ${plan.name} (${selectedCadence.label})${discountNote}`,
      priceAmount: chargeAmount,
      currency: selectedCadence.currency || plan.currency,
    });

    db.prepare(`UPDATE venue_payments SET square_link_id = ?, square_order_id = ? WHERE id = ?`)
      .run(link.id, link.orderId || null, paymentId);

    res.json({ checkout_url: link.url, link_id: link.id });
  } catch (err) {
    console.error('[VenueAccess] Subscription checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/venue-access/cancel-subscription
router.post('/cancel-subscription', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { subscription_id } = req.body;
    if (!subscription_id) {
      return res.status(400).json({ error: 'subscription_id is required' });
    }

    const sub = db.prepare(`
      SELECT vs.*, u.username, v.name AS venue_name, vap.name AS plan_name
      FROM venue_subscriptions vs
      JOIN users u ON u.id = vs.user_id
      JOIN venues v ON v.id = vs.venue_id
      JOIN venue_access_plans vap ON vap.id = vs.plan_id
      WHERE vs.id = ? AND vs.user_id = ? AND vs.status = 'active'
    `).get(subscription_id, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Active subscription not found' });

    if (isSquareConfigured() && sub.square_subscription_id) {
      await cancelSquareSubscription(sub.square_subscription_id);
    }

    db.prepare(`
      UPDATE venue_subscriptions SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(subscription_id);

    notifyUsersAboutVenueAccessEvent(db, {
      venueId: sub.venue_id,
      eventType: 'subscription_cancelled',
      username: sub.username,
      venueName: sub.venue_name,
      planName: sub.plan_name,
      cadenceLabel: sub.subscription_cadence_label,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[VenueAccess] Cancel subscription error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// GET /api/venue-access/my-payments
router.get('/my-payments', requireAuth, async (req, res) => {
  const db = getDb();
  await reconcilePendingVenuePaymentsForUser(db, req.user.id);
  purgeStalePendingDayPassPayments(db, { userId: req.user.id });
  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description, vp.created_at,
           v.name AS venue_name, v.slug AS venue_slug,
           vap.name AS plan_name
    FROM venue_payments vp
    JOIN venues v ON v.id = vp.venue_id
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE vp.user_id = ?
      AND ${getVisibleVenuePaymentPredicate('vp')}
    ORDER BY vp.created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({ payments });
});

// GET /api/venue-access/my-membership/:venueSlug — full membership dashboard data
router.get('/my-membership/:venueSlug', requireAuth, async (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const userId = req.user.id;
  await reconcilePendingVenuePaymentsForUser(db, userId);
  purgeStalePendingDayPassPayments(db, { userId, venueId: venue.id });
  const access = getVenueAccessForMembership(db, userId, venue.id);
  const approval = getVenueApprovalState(db, userId, venue.id);
  const dojoMember = isDojoMember(db, userId);
  const today = todayDateString();

  // Active subscription
  const subscription = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           vs.subscription_cadence_key, vs.subscription_cadence_label, vs.billing_interval_months, vs.billing_interval_days,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ? AND vs.status IN ('active', 'past_due')
      AND current_period_start <= ? AND current_period_end >= ?
    ORDER BY vs.current_period_end DESC
    LIMIT 1
  `).get(userId, venue.id, today, today);

  // Past subscriptions
  const pastSubscriptions = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           vs.subscription_cadence_key, vs.subscription_cadence_label, vs.billing_interval_months, vs.billing_interval_days,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ? AND vs.status IN ('cancelled', 'expired')
    ORDER BY vs.current_period_end DESC
    LIMIT 10
  `).all(userId, venue.id);

  // Day passes (upcoming + recent past)
  const dayPasses = db.prepare(`
    SELECT vdp.id, vdp.pass_date, vdp.status, vdp.created_at,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_day_passes vdp
    JOIN venue_access_plans vap ON vap.id = vdp.plan_id
    WHERE vdp.user_id = ? AND vdp.venue_id = ?
    ORDER BY vdp.pass_date DESC
    LIMIT 30
  `).all(userId, venue.id);

  // All payments
  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description, vp.created_at,
           vap.name AS plan_name
    FROM venue_payments vp
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE vp.user_id = ? AND vp.venue_id = ?
      AND ${getVisibleVenuePaymentPredicate('vp')}
    ORDER BY vp.created_at DESC
    LIMIT 50
  `).all(userId, venue.id);

  // Active discounts
  const discounts = db.prepare(`
    SELECT id, discount_percent, applies_to, expires_at, note
    FROM venue_user_discounts
    WHERE user_id = ? AND venue_id = ? AND active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY discount_percent DESC
  `).all(userId, venue.id);

  // Available plans (for purchasing)
  const plans = db.prepare(`
    SELECT id, plan_type, name, price_amount, currency, square_plan_variation_id, monthly_cadences_json
    FROM venue_access_plans
    WHERE venue_id = ? AND active = 1
    ORDER BY plan_type, price_amount
  `).all(venue.id);

  const plansWithDiscount = plans.map(plan => {
    const appliesTo = plan.plan_type === 'monthly' ? 'monthly' : 'day_pass';
    const discount = getUserDiscount(db, userId, venue.id, appliesTo);
    const discountedAmount = discount ? applyDiscount(plan.price_amount, discount.discount_percent) : plan.price_amount;
    return attachPlanCadenceMeta({
      ...plan,
      discount_percent: discount ? discount.discount_percent : 0,
      discounted_amount: discountedAmount,
    }, discount);
  });

  // Stats
  const totalSpent = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
    FROM venue_payments
    WHERE user_id = ? AND venue_id = ? AND status = 'succeeded'
  `).get(userId, venue.id);

  const totalDayPasses = db.prepare(`
    SELECT COUNT(*) AS cnt FROM venue_day_passes WHERE user_id = ? AND venue_id = ?
  `).get(userId, venue.id);

  res.json({
    venue,
    has_access: access.hasAccess,
    access_type: access.accessType,
    approved: approval.purchaseApproved,
    approved_direct: approval.approved,
    dojo_visitor: approval.dojoVisitor,
    dojo_member: dojoMember,
    subscription: subscription || null,
    past_subscriptions: pastSubscriptions,
    day_passes: dayPasses,
    payments,
    discounts,
    plans: plansWithDiscount,
    stats: {
      total_spent: totalSpent.total,
      payment_count: totalSpent.cnt,
      total_day_passes: totalDayPasses.cnt,
    },
  });
});

// ── Square Webhook ──────────────────────────────────────────────────────

router.post('/webhook', (req, res) => {
  if (!isSquareConfigured()) {
    return res.status(503).json({ error: 'Square not configured' });
  }

  const sig = req.headers['x-square-hmacsha256-signature'];
  const rawBody = typeof req.rawBody === 'string'
    ? req.rawBody
    : Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});
  try {
    if (!verifyWebhookSignature(rawBody, sig)) {
      console.error('[Square Webhook] Signature verification failed');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  } catch (err) {
    console.error('[Square Webhook] Signature verification error:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  let event = null;
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      event = req.body;
    } else {
      event = JSON.parse(rawBody);
    }
  } catch (err) {
    console.error('[Square Webhook] Invalid payload:', err.message);
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
  const db = getDb();

  try {
    switch (event.type) {
      // Square emits payment.updated when the payment status changes.
      // Treat COMPLETED as the successful checkout signal, while still accepting
      // the older payment.completed name for compatibility.
      case 'payment.updated':
      case 'payment.completed': {
        const payment = event.data.object?.payment || event.data.object;
        const paymentStatus = String(payment?.status || '').toUpperCase();
        const orderId = payment?.orderId || payment?.order_id;
        const squarePaymentId = payment?.id;

        if (event.type === 'payment.updated' && paymentStatus !== 'COMPLETED') break;
        if (!orderId) break;

        // Find the pending venue payment by square_order_id
        const paymentRow = db.prepare(`
          SELECT * FROM venue_payments WHERE square_order_id = ? AND status = 'pending'
        `).get(orderId);

        if (!paymentRow) {
          // Also try by square_link_id — try matching via order
          break;
        }

        finalizeVenuePaymentSuccess(db, paymentRow, {
          squarePaymentId: squarePaymentId || '',
        });
        break;
      }

      // Square subscription events
      case 'subscription.created': {
        const subscription = event.data.object?.subscription || event.data.object;
        const squareSubId = subscription?.id;
        // Update any matching subscription record
        if (squareSubId) {
          db.prepare(`
            UPDATE venue_subscriptions SET square_subscription_id = ?, updated_at = datetime('now')
            WHERE square_subscription_id IS NULL AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
          `).run(squareSubId);
        }
        break;
      }

      case 'subscription.updated': {
        const subscription = event.data.object?.subscription || event.data.object;
        const squareSubId = subscription?.id;
        const status = subscription?.status;
        if (!squareSubId) break;

        const sub = db.prepare(`
          SELECT * FROM venue_subscriptions WHERE square_subscription_id = ?
        `).get(squareSubId);

        if (sub) {
          const previousStatus = String(sub.status || '').toLowerCase();
          if (status === 'ACTIVE') {
            db.prepare(`
              UPDATE venue_subscriptions SET status = 'active', updated_at = datetime('now')
              WHERE id = ?
            `).run(sub.id);
          } else if (status === 'DELINQUENT') {
            db.prepare(`
              UPDATE venue_subscriptions SET status = 'past_due', updated_at = datetime('now')
              WHERE id = ?
            `).run(sub.id);
          } else if (status === 'CANCELED' || status === 'TERMINATED') {
            db.prepare(`
              UPDATE venue_subscriptions SET status = 'expired', cancelled_at = datetime('now'), updated_at = datetime('now')
              WHERE id = ?
            `).run(sub.id);

            if (previousStatus !== 'cancelled' && previousStatus !== 'expired') {
              const subscriptionUser = db.prepare('SELECT username FROM users WHERE id = ?').get(sub.user_id);
              const subscriptionVenue = db.prepare('SELECT name FROM venues WHERE id = ?').get(sub.venue_id);
              const subscriptionPlan = db.prepare('SELECT name FROM venue_access_plans WHERE id = ?').get(sub.plan_id);
              notifyUsersAboutVenueAccessEvent(db, {
                venueId: sub.venue_id,
                eventType: 'subscription_cancelled',
                username: subscriptionUser?.username,
                venueName: subscriptionVenue?.name,
                planName: subscriptionPlan?.name,
                cadenceLabel: sub.subscription_cadence_label,
              });
            }
          }
        }
        break;
      }

      // Subscription invoice paid (renewal)
      case 'invoice.payment_made': {
        const invoice = event.data.object?.invoice || event.data.object;
        const subscriptionId = invoice?.subscriptionId || invoice?.subscription_id;
        if (!subscriptionId) break;

        const sub = db.prepare(`
          SELECT * FROM venue_subscriptions WHERE square_subscription_id = ?
        `).get(subscriptionId);

        if (sub) {
          const subscriptionUser = db.prepare('SELECT username FROM users WHERE id = ?').get(sub.user_id);
          const subscriptionVenue = db.prepare('SELECT name FROM venues WHERE id = ?').get(sub.venue_id);
          const subscriptionPlan = db.prepare('SELECT name FROM venue_access_plans WHERE id = ?').get(sub.plan_id);
          const periodStart = todayDateString();
          const billingIntervalMonths = Math.max(1, parseInt(sub.billing_interval_months, 10) || 1);
          const billingIntervalDays = Math.max(0, parseInt(sub.billing_interval_days, 10) || 0);
          const periodEnd = billingIntervalDays > 0
            ? addDaysToIsoDate(`${periodStart}T12:00:00Z`, billingIntervalDays)
            : addMonthsToIsoDate(`${periodStart}T12:00:00Z`, billingIntervalMonths);

          db.prepare(`
            UPDATE venue_subscriptions
            SET status = 'active', current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(periodStart, periodEnd, sub.id);

          const paymentId = uuidv4();
          const amountMoney = invoice?.paymentRequests?.[0]?.computedAmountMoney || {};
          const amount = amountMoney?.amount || 0;
          const currency = String(amountMoney?.currency || 'GBP').toLowerCase();
          db.prepare(`
            INSERT INTO venue_payments (
              id, user_id, venue_id, plan_id, payment_type, amount, currency, status,
              subscription_cadence_key, subscription_cadence_label, billing_interval_months, billing_interval_days,
              square_payment_id, description
            )
            VALUES (?, ?, ?, ?, 'subscription_renewal', ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?)
          `).run(
            paymentId,
            sub.user_id,
            sub.venue_id,
            sub.plan_id,
            Number(amount),
            currency,
            sub.subscription_cadence_key || '',
            sub.subscription_cadence_label || '',
            billingIntervalMonths,
            billingIntervalDays,
            invoice?.id || '',
            sub.subscription_cadence_label
              ? `Subscription renewal (${sub.subscription_cadence_label})`
              : 'Subscription renewal',
          );

          notifyUsersAboutVenueAccessEvent(db, {
            venueId: sub.venue_id,
            eventType: 'payment_received',
            username: subscriptionUser?.username,
            venueName: subscriptionVenue?.name,
            planName: subscriptionPlan?.name,
            cadenceLabel: sub.subscription_cadence_label,
            amount,
            currency,
            paymentType: 'subscription_renewal',
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[Square Webhook] Error processing event:', err.message);
  }

  res.json({ received: true });
});

// ── Admin endpoints ─────────────────────────────────────────────────────

// GET /api/venue-access/admin/plans/:venueSlug — all plans (including inactive)
router.get('/admin/plans/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const plans = db.prepare(`
    SELECT * FROM venue_access_plans WHERE venue_id = ? ORDER BY plan_type, price_amount
  `).all(venue.id);

  res.json({ venue, plans: plans.map((plan) => attachPlanCadenceMeta(plan)) });
});

// POST /api/venue-access/admin/plans — create a new plan
router.post('/admin/plans', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { venue_id, plan_type, name, price_amount, currency, square_plan_variation_id, monthly_cadences } = req.body;

  if (!venue_id || !plan_type || !name || price_amount == null) {
    return res.status(400).json({ error: 'venue_id, plan_type, name, and price_amount are required' });
  }
  if (!['day_pass_weekday', 'day_pass_weekend', 'monthly'].includes(plan_type)) {
    return res.status(400).json({ error: 'plan_type must be day_pass_weekday, day_pass_weekend, or monthly' });
  }
  if (typeof price_amount !== 'number' || price_amount < 0) {
    return res.status(400).json({ error: 'price_amount must be a non-negative number (in smallest currency unit, e.g. pence)' });
  }

  const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(venue_id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const normalizedCadences = plan_type === 'monthly'
    ? serializeMonthlyCadences(monthly_cadences, currency || 'gbp')
    : [];
  const primaryCadence = normalizedCadences[0] || null;
  const effectivePriceAmount = plan_type === 'monthly'
    ? (primaryCadence ? primaryCadence.price_amount : price_amount)
    : price_amount;
  const effectiveCurrency = plan_type === 'monthly'
    ? (primaryCadence?.currency || currency || 'gbp')
    : (currency || 'gbp').toLowerCase();
  const effectiveVariationId = plan_type === 'monthly'
    ? (primaryCadence?.square_plan_variation_id || square_plan_variation_id || null)
    : (square_plan_variation_id || null);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO venue_access_plans (
      id, venue_id, plan_type, name, price_amount, currency, square_plan_variation_id, monthly_cadences_json, active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    venue_id,
    plan_type,
    name.trim(),
    effectivePriceAmount,
    effectiveCurrency,
    effectiveVariationId,
    JSON.stringify(normalizedCadences),
  );

  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(id);
  res.json(attachPlanCadenceMeta(plan));
});

// PUT /api/venue-access/admin/plans/:planId — update a plan
router.put('/admin/plans/:planId', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, price_amount, currency, square_plan_variation_id, monthly_cadences, active } = req.body;

  const updates = [];
  const params = [];
  let nextCurrency = currency !== undefined ? String(currency).toLowerCase() : String(plan.currency || 'gbp').toLowerCase();
  let nextPriceAmount = price_amount !== undefined ? price_amount : plan.price_amount;
  let nextVariationId = square_plan_variation_id !== undefined ? (square_plan_variation_id || null) : (plan.square_plan_variation_id || null);
  let nextCadenceJson = plan.monthly_cadences_json || '[]';

  if (plan.plan_type === 'monthly' && monthly_cadences !== undefined) {
    const normalizedCadences = serializeMonthlyCadences(monthly_cadences, nextCurrency);
    const primaryCadence = normalizedCadences[0] || null;
    nextCadenceJson = JSON.stringify(normalizedCadences);
    nextCurrency = primaryCadence?.currency || nextCurrency;
    nextPriceAmount = primaryCadence ? primaryCadence.price_amount : nextPriceAmount;
    nextVariationId = primaryCadence?.square_plan_variation_id || nextVariationId;
    updates.push('monthly_cadences_json = ?');
    params.push(nextCadenceJson);
  }

  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (price_amount !== undefined || (plan.plan_type === 'monthly' && monthly_cadences !== undefined)) { updates.push('price_amount = ?'); params.push(nextPriceAmount); }
  if (currency !== undefined || (plan.plan_type === 'monthly' && monthly_cadences !== undefined)) { updates.push('currency = ?'); params.push(nextCurrency); }
  if (square_plan_variation_id !== undefined || (plan.plan_type === 'monthly' && monthly_cadences !== undefined)) { updates.push('square_plan_variation_id = ?'); params.push(nextVariationId); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.planId);

  db.prepare(`UPDATE venue_access_plans SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(req.params.planId);
  res.json(attachPlanCadenceMeta(updated));
});

// ── Admin Discount Management ───────────────────────────────────────────

// GET /api/venue-access/admin/discounts/:venueSlug — list all discounts for a venue
router.get('/admin/discounts/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const discounts = db.prepare(`
    SELECT vud.*, u.username, u.avatar, u.avatar_v,
           g.username AS granted_by_username
    FROM venue_user_discounts vud
    JOIN users u ON u.id = vud.user_id
    LEFT JOIN users g ON g.id = vud.granted_by
    WHERE vud.venue_id = ?
    ORDER BY vud.active DESC, vud.created_at DESC
  `).all(venue.id);

  res.json({ venue, discounts });
});

// POST /api/venue-access/admin/discounts — grant a discount to a user
router.post('/admin/discounts', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { user_id, venue_id, discount_percent, applies_to, note, expires_at } = req.body;

  if (!user_id || !venue_id || !discount_percent) {
    return res.status(400).json({ error: 'user_id, venue_id, and discount_percent are required' });
  }
  if (![10, 20, 50].includes(discount_percent)) {
    return res.status(400).json({ error: 'discount_percent must be 10, 20, or 50' });
  }
  const validAppliesTo = applies_to || 'all';
  if (!['all', 'monthly', 'day_pass'].includes(validAppliesTo)) {
    return res.status(400).json({ error: 'applies_to must be all, monthly, or day_pass' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(venue_id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  // Deactivate any existing active discount of the same applies_to for this user+venue
  db.prepare(`
    UPDATE venue_user_discounts SET active = 0
    WHERE user_id = ? AND venue_id = ? AND active = 1 AND (applies_to = ? OR applies_to = 'all' OR ? = 'all')
  `).run(user_id, venue_id, validAppliesTo, validAppliesTo);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO venue_user_discounts (id, user_id, venue_id, discount_percent, applies_to, active, granted_by, note, expires_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, user_id, venue_id, discount_percent, validAppliesTo, req.user.id, note || null, expires_at || null);

  const discount = db.prepare(`
    SELECT vud.*, u.username, u.avatar, u.avatar_v
    FROM venue_user_discounts vud
    JOIN users u ON u.id = vud.user_id
    WHERE vud.id = ?
  `).get(id);

  res.json(discount);
});

// DELETE /api/venue-access/admin/discounts/:discountId — revoke a discount
router.delete('/admin/discounts/:discountId', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const discount = db.prepare('SELECT * FROM venue_user_discounts WHERE id = ?').get(req.params.discountId);
  if (!discount) return res.status(404).json({ error: 'Discount not found' });

  db.prepare('UPDATE venue_user_discounts SET active = 0 WHERE id = ?').run(req.params.discountId);
  res.json({ success: true });
});

// ── Admin Overview ──────────────────────────────────────────────────────

// GET /api/venue-access/admin/overview/:venueSlug
router.get('/admin/overview/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  purgeStalePendingDayPassPayments(db, { venueId: venue.id });
  const selectedMonth = isValidMonthKey(req.query.month) ? String(req.query.month) : currentMonthKey();
  const currentMonth = currentMonthKey();
  const selectedYear = parseInt(selectedMonth.slice(0, 4), 10) || parseInt(currentMonth.slice(0, 4), 10);
  const monthKeys = Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, '0')}`);

  const subscribers = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN users u ON u.id = vs.user_id
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.venue_id = ? AND substr(vs.created_at, 1, 7) = ?
    ORDER BY vs.created_at DESC
  `).all(venue.id, selectedMonth);

  const activeSubscribers = db.prepare(`
    SELECT vs.id, vs.user_id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           vs.subscription_cadence_key, vs.subscription_cadence_label, vs.billing_interval_months, vs.billing_interval_days,
           u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN users u ON u.id = vs.user_id
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.venue_id = ? AND vs.status = 'active'
    ORDER BY vs.current_period_end DESC, vs.created_at ASC
  `).all(venue.id);

  const today = todayDateString();
  const dayPasses = db.prepare(`
    SELECT vdp.id, vdp.pass_date, vdp.status, vdp.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_day_passes vdp
    JOIN users u ON u.id = vdp.user_id
    JOIN venue_access_plans vap ON vap.id = vdp.plan_id
    WHERE vdp.venue_id = ? AND substr(vdp.pass_date, 1, 7) = ?
    ORDER BY vdp.pass_date ASC, vdp.created_at DESC
    LIMIT 100
  `).all(venue.id, selectedMonth);

  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description, vp.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name
    FROM venue_payments vp
    JOIN users u ON u.id = vp.user_id
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE vp.venue_id = ? AND substr(vp.created_at, 1, 7) = ?
      AND ${getVisibleVenuePaymentPredicate('vp')}
    ORDER BY vp.created_at DESC
    LIMIT 100
  `).all(venue.id, selectedMonth);

  const discounts = db.prepare(`
    SELECT vud.*, u.username, u.avatar, u.avatar_v,
           g.username AS granted_by_username
    FROM venue_user_discounts vud
    JOIN users u ON u.id = vud.user_id
    LEFT JOIN users g ON g.id = vud.granted_by
    WHERE vud.venue_id = ? AND vud.active = 1
    ORDER BY vud.created_at DESC
  `).all(venue.id);

  const totalRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM venue_payments WHERE venue_id = ? AND status = 'succeeded'
  `).get(venue.id);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM venue_payments WHERE venue_id = ? AND status = 'succeeded' AND created_at >= ?
  `).get(venue.id, monthStartStr);

  const activeSubCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM venue_subscriptions WHERE venue_id = ? AND status = 'active'
  `).get(venue.id);

  const todayPassCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM venue_day_passes
    WHERE venue_id = ? AND pass_date = ? AND status IN ('active', 'used')
  `).get(venue.id, today);

  const plans = db.prepare(`
    SELECT * FROM venue_access_plans WHERE venue_id = ? ORDER BY plan_type, price_amount
  `).all(venue.id);

  const paymentMonthRows = db.prepare(`
    SELECT substr(created_at, 1, 7) AS month_key,
           COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END), 0) AS revenue,
           SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS payment_count
    FROM venue_payments
    WHERE venue_id = ? AND substr(created_at, 1, 7) IN (${monthKeys.map(() => '?').join(', ')})
    GROUP BY substr(created_at, 1, 7)
  `).all(venue.id, ...monthKeys);
  const paymentMonthLookup = Object.fromEntries(paymentMonthRows.map((row) => [row.month_key, row]));

  const dayPassMonthRows = db.prepare(`
    SELECT substr(pass_date, 1, 7) AS month_key, COUNT(*) AS day_pass_count
    FROM venue_day_passes
    WHERE venue_id = ? AND substr(pass_date, 1, 7) IN (${monthKeys.map(() => '?').join(', ')})
    GROUP BY substr(pass_date, 1, 7)
  `).all(venue.id, ...monthKeys);
  const dayPassMonthLookup = Object.fromEntries(dayPassMonthRows.map((row) => [row.month_key, row]));

  const subscriptionMonthRows = db.prepare(`
    SELECT substr(created_at, 1, 7) AS month_key, COUNT(*) AS subscription_count
    FROM venue_subscriptions
    WHERE venue_id = ? AND substr(created_at, 1, 7) IN (${monthKeys.map(() => '?').join(', ')})
    GROUP BY substr(created_at, 1, 7)
  `).all(venue.id, ...monthKeys);
  const subscriptionMonthLookup = Object.fromEntries(subscriptionMonthRows.map((row) => [row.month_key, row]));

  const monthCards = monthKeys.map((monthKey) => ({
    month_key: monthKey,
    month_label: formatMonthLabel(monthKey),
    revenue: Number(paymentMonthLookup[monthKey]?.revenue || 0),
    payment_count: Number(paymentMonthLookup[monthKey]?.payment_count || 0),
    day_pass_count: Number(dayPassMonthLookup[monthKey]?.day_pass_count || 0),
    subscription_count: Number(subscriptionMonthLookup[monthKey]?.subscription_count || 0),
    selected: monthKey === selectedMonth,
  }));

  const selectedMonthRevenue = Number(paymentMonthLookup[selectedMonth]?.revenue || 0);
  const selectedMonthPayments = Number(paymentMonthLookup[selectedMonth]?.payment_count || 0);
  const selectedMonthDayPasses = Number(dayPassMonthLookup[selectedMonth]?.day_pass_count || 0);
  const selectedMonthSubscriptions = Number(subscriptionMonthLookup[selectedMonth]?.subscription_count || 0);

  res.json({
    venue,
    plans: plans.map((plan) => attachPlanCadenceMeta(plan)),
    subscribers,
    active_subscribers: activeSubscribers,
    day_passes: dayPasses,
    payments,
    discounts,
    stats: {
      total_revenue: totalRevenue.total,
      month_revenue: monthRevenue.total,
      active_subscriptions: activeSubCount.cnt,
      today_day_passes: todayPassCount.cnt,
      selected_month_revenue: selectedMonthRevenue,
      selected_month_payments: selectedMonthPayments,
      selected_month_day_passes: selectedMonthDayPasses,
      selected_month_subscriptions: selectedMonthSubscriptions,
    },
    selected_month: selectedMonth,
    selected_month_label: formatMonthLabel(selectedMonth),
    month_cards: monthCards,
  });
});

// GET /api/venue-access/admin/members/:venueSlug
router.get('/admin/members/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const members = db.prepare(`
    SELECT DISTINCT u.id, u.username, u.avatar, u.avatar_v
    FROM users u
    WHERE u.id IN (
      SELECT user_id FROM venue_subscriptions WHERE venue_id = ?
      UNION
      SELECT user_id FROM venue_day_passes WHERE venue_id = ?
    )
    ORDER BY u.username
  `).all(venue.id, venue.id);

  const result = members.map(member => {
    const access = checkUserVenueAccess(db, member.id, venue.id);

    const totalPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
      FROM venue_payments
      WHERE user_id = ? AND venue_id = ? AND status = 'succeeded'
    `).get(member.id, venue.id);

    const totalDayPasses = db.prepare(`
      SELECT COUNT(*) AS cnt FROM venue_day_passes WHERE user_id = ? AND venue_id = ?
    `).get(member.id, venue.id);

    const activeDiscount = getUserDiscount(db, member.id, venue.id, 'all');

    return {
      ...member,
      has_access: access.hasAccess,
      access_type: access.accessType,
      total_spent: totalPayments.total,
      payment_count: totalPayments.cnt,
      day_pass_count: totalDayPasses.cnt,
      discount: activeDiscount ? { percent: activeDiscount.discount_percent, applies_to: activeDiscount.applies_to } : null,
    };
  });

  res.json({ venue, members: result });
});

// GET /api/venue-access/admin/member-details/:venueSlug/:userId
router.get('/admin/member-details/:venueSlug/:userId', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  purgeStalePendingDayPassPayments(db, { venueId: venue.id, userId: req.params.userId });

  const member = db.prepare(`
    SELECT id, username, avatar, avatar_v
    FROM users
    WHERE id = ?
  `).get(req.params.userId);
  if (!member) return res.status(404).json({ error: 'User not found' });

  const subscriptions = db.prepare(`
    SELECT vs.id, vs.status, vs.created_at, vs.current_period_start, vs.current_period_end, vs.cancelled_at,
           vs.subscription_cadence_key, vs.subscription_cadence_label, vs.billing_interval_months, vs.billing_interval_days,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ?
    ORDER BY vs.created_at ASC
  `).all(member.id, venue.id);

  const dayPasses = db.prepare(`
    SELECT vdp.id, vdp.pass_date, vdp.status, vdp.created_at,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_day_passes vdp
    JOIN venue_access_plans vap ON vap.id = vdp.plan_id
    WHERE vdp.user_id = ? AND vdp.venue_id = ?
    ORDER BY vdp.pass_date DESC, vdp.created_at DESC
    LIMIT 50
  `).all(member.id, venue.id);

  const payments = db.prepare(`
    SELECT id, payment_type, amount, currency, status, description, created_at
    FROM venue_payments
    WHERE user_id = ? AND venue_id = ? AND status = 'succeeded'
      AND ${getVisibleVenuePaymentPredicate()}
    ORDER BY created_at DESC
    LIMIT 50
  `).all(member.id, venue.id);

  const checkins = db.prepare(`
    SELECT c.id, c.checked_in_at, c.checked_out_at,
           m.name AS machine_name
    FROM checkins c
    LEFT JOIN venue_machines m ON m.id = c.machine_id
    WHERE c.user_id = ? AND c.venue_id = ?
    ORDER BY c.checked_in_at DESC
    LIMIT 100
  `).all(member.id, venue.id);

  const firstSubscription = subscriptions[0] || null;
  const totalSpentRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM venue_payments
    WHERE user_id = ? AND venue_id = ? AND status = 'succeeded'
  `).get(member.id, venue.id);

  const totalSubscribedMonths = subscriptions.reduce((sum, sub) => {
    const days = Math.max(0, parseInt(sub.billing_interval_days, 10) || 0);
    if (days > 0) return sum + (days / 30);
    return sum + Math.max(1, parseInt(sub.billing_interval_months, 10) || 1);
  }, 0);
  const firstSubscriptionDate = firstSubscription?.created_at
    ? new Date(String(firstSubscription.created_at).endsWith('Z') ? String(firstSubscription.created_at) : `${firstSubscription.created_at}Z`)
    : null;
  const weeksSinceStart = firstSubscriptionDate
    ? Math.max(1, (Date.now() - firstSubscriptionDate.getTime()) / (1000 * 60 * 60 * 24 * 7))
    : 1;
  const avgVisitsPerWeek = checkins.length > 0 ? Math.round((checkins.length / weeksSinceStart) * 10) / 10 : 0;

  res.json({
    venue,
    member: {
      ...member,
      total_spent: Number(totalSpentRow?.total || 0),
      first_subscribed_at: firstSubscription?.created_at || '',
      total_subscribed_months: totalSubscribedMonths,
      average_visits_per_week: avgVisitsPerWeek,
      total_checkins: checkins.length,
      active_subscription: subscriptions.find((sub) => sub.status === 'active') || null,
    },
    subscriptions,
    day_passes: dayPasses,
    payments,
    checkins,
  });
});

// GET /api/venue-access/admin/payments/:venueSlug
router.get('/admin/payments/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });
  purgeStalePendingDayPassPayments(db, { venueId: venue.id });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status || '';
  const typeFilter = req.query.type || '';

  let where = 'vp.venue_id = ?';
  const params = [venue.id];
  where += ` AND ${getVisibleVenuePaymentPredicate('vp')}`;
  if (statusFilter) { where += ' AND vp.status = ?'; params.push(statusFilter); }
  if (typeFilter) { where += ' AND vp.payment_type = ?'; params.push(typeFilter); }

  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM venue_payments vp WHERE ${where}`).get(...params);

  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description,
           vp.square_payment_id, vp.square_order_id, vp.square_link_id,
           vp.created_at, vp.updated_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.plan_type
    FROM venue_payments vp
    JOIN users u ON u.id = vp.user_id
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE ${where}
    ORDER BY vp.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    venue,
    payments,
    total: total.cnt,
    page,
    total_pages: Math.ceil(total.cnt / limit),
  });
});

// POST /api/venue-access/admin/grant-day-pass
router.post('/admin/grant-day-pass', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { user_id, venue_id, plan_id, pass_date } = req.body;

  if (!user_id || !venue_id || !plan_id || !pass_date) {
    return res.status(400).json({ error: 'user_id, venue_id, plan_id, and pass_date are required' });
  }

  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ? AND venue_id = ?').get(plan_id, venue_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare(`
    SELECT id FROM venue_day_passes
    WHERE user_id = ? AND venue_id = ? AND pass_date = ? AND status IN ('active', 'used')
  `).get(user_id, venue_id, pass_date);
  if (existing) return res.status(409).json({ error: 'User already has a pass for this date' });

  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO venue_payments (id, user_id, venue_id, plan_id, payment_type, amount, currency, status, description)
    VALUES (?, ?, ?, ?, 'day_pass', 0, ?, 'succeeded', ?)
  `).run(paymentId, user_id, venue_id, plan_id, plan.currency, `Admin-granted day pass for ${pass_date}`);

  const passId = uuidv4();
  db.prepare(`
    INSERT INTO venue_day_passes (id, user_id, venue_id, plan_id, pass_date, status, payment_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(passId, user_id, venue_id, plan_id, pass_date, paymentId);

  res.json({ id: passId, pass_date, status: 'active' });
});

// POST /api/venue-access/admin/grant-subscription
router.post('/admin/grant-subscription', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { user_id, venue_id, plan_id, period_months } = req.body;
  const months = parseInt(period_months, 10) || 1;

  if (!user_id || !venue_id || !plan_id) {
    return res.status(400).json({ error: 'user_id, venue_id, and plan_id are required' });
  }

  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ? AND venue_id = ?').get(plan_id, venue_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare(`
    SELECT id FROM venue_subscriptions
    WHERE user_id = ? AND venue_id = ? AND status IN ('active', 'past_due')
  `).get(user_id, venue_id);
  if (existing) return res.status(409).json({ error: 'User already has an active subscription' });

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const paymentId = uuidv4();
  const cadenceLabel = months === 1 ? 'Monthly' : `${months} months`;
  db.prepare(`
    INSERT INTO venue_payments (
      id, user_id, venue_id, plan_id, payment_type, amount, currency, status,
      subscription_cadence_key, subscription_cadence_label, billing_interval_months, billing_interval_days, description
    )
    VALUES (?, ?, ?, ?, 'subscription', 0, ?, 'succeeded', ?, ?, ?, 0, ?)
  `).run(
    paymentId,
    user_id,
    venue_id,
    plan_id,
    plan.currency,
    months === 1 ? 'monthly' : `${months}_months`,
    cadenceLabel,
    months,
    `Admin-granted subscription (${months} month${months > 1 ? 's' : ''})`,
  );

  const subId = uuidv4();
  db.prepare(`
    INSERT INTO venue_subscriptions (
      id, user_id, venue_id, plan_id, status,
      subscription_cadence_key, subscription_cadence_label, billing_interval_months, billing_interval_days,
      current_period_start, current_period_end
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 0, ?, ?)
  `).run(
    subId,
    user_id,
    venue_id,
    plan_id,
    months === 1 ? 'monthly' : `${months}_months`,
    cadenceLabel,
    months,
    now.toISOString().slice(0, 10),
    periodEnd.toISOString().slice(0, 10),
  );

  // Auto-add user to "Pump Dojo" group
  addUserToDojoMemberGroup(db, user_id, req.user.id);

  res.json({ id: subId, status: 'active', current_period_end: periodEnd.toISOString().slice(0, 10) });
});

// POST /api/venue-access/admin/revoke/:type/:id
router.post('/admin/revoke/:type/:id', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { type, id } = req.params;

  if (type === 'day_pass') {
    const pass = db.prepare('SELECT * FROM venue_day_passes WHERE id = ?').get(id);
    if (!pass) return res.status(404).json({ error: 'Day pass not found' });
    db.prepare("UPDATE venue_day_passes SET status = 'cancelled' WHERE id = ?").run(id);
    res.json({ success: true });
  } else if (type === 'subscription') {
    const sub = db.prepare(`
      SELECT vs.*, u.username, v.name AS venue_name, vap.name AS plan_name
      FROM venue_subscriptions vs
      JOIN users u ON u.id = vs.user_id
      JOIN venues v ON v.id = vs.venue_id
      JOIN venue_access_plans vap ON vap.id = vs.plan_id
      WHERE vs.id = ?
    `).get(id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    db.prepare("UPDATE venue_subscriptions SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    if (isSquareConfigured() && sub.square_subscription_id) {
      cancelSquareSubscription(sub.square_subscription_id).catch(err => {
        console.error('[VenueAccess] Failed to cancel Square subscription:', err.message);
      });
    }
    notifyUsersAboutVenueAccessEvent(db, {
      venueId: sub.venue_id,
      eventType: 'subscription_cancelled',
      username: sub.username,
      venueName: sub.venue_name,
      planName: sub.plan_name,
      cadenceLabel: sub.subscription_cadence_label,
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid type (day_pass or subscription)' });
  }
});

// ── Admin Whitelist Management ──────────────────────────────────────────

// GET /api/venue-access/admin/approved-users/:venueSlug
router.get('/admin/approved-users/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const approvedUsers = db.prepare(`
    SELECT vau.user_id, vau.note, vau.created_at,
           u.username, u.avatar, u.avatar_v,
           a.username AS approved_by_username
    FROM venue_approved_users vau
    JOIN users u ON u.id = vau.user_id
    LEFT JOIN users a ON a.id = vau.approved_by
    WHERE vau.venue_id = ?
    ORDER BY vau.created_at DESC
  `).all(venue.id);

  res.json({ venue, approved_users: approvedUsers });
});

// POST /api/venue-access/admin/approved-users — add user to whitelist
router.post('/admin/approved-users', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { user_id, venue_id, note } = req.body;

  if (!user_id || !venue_id) {
    return res.status(400).json({ error: 'user_id and venue_id are required' });
  }

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const venue = db.prepare('SELECT id FROM venues WHERE id = ?').get(venue_id);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const existing = db.prepare('SELECT 1 FROM venue_approved_users WHERE user_id = ? AND venue_id = ?').get(user_id, venue_id);
  if (existing) return res.status(409).json({ error: 'User is already approved' });

  db.prepare(`
    INSERT INTO venue_approved_users (user_id, venue_id, approved_by, note)
    VALUES (?, ?, ?, ?)
  `).run(user_id, venue_id, req.user.id, note || null);

  res.json({ success: true, user_id, username: user.username });
});

// DELETE /api/venue-access/admin/approved-users/:venueId/:userId — remove user from whitelist
router.delete('/admin/approved-users/:venueId/:userId', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { venueId, userId } = req.params;

  const result = db.prepare('DELETE FROM venue_approved_users WHERE user_id = ? AND venue_id = ?').run(userId, venueId);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found in approved list' });

  res.json({ success: true });
});

module.exports = router;
module.exports.checkUserVenueAccess = checkUserVenueAccess;
module.exports.reconcileExpiredVenueSubscriptions = reconcileExpiredVenueSubscriptions;
