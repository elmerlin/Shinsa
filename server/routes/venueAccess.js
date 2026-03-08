const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { requireAuth, isAdminUser, hasFeatureAccess } = require('./auth');
const {
  isSquareConfigured,
  createDayPassPaymentLink,
  createSubscriptionPaymentLink,
  verifyWebhookSignature,
  cancelSquareSubscription,
  retrieveOrder,
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

/** Check if user is in the "Pump Dojo" admin user group. */
function isDojoMember(db, userId) {
  const row = db.prepare(`
    SELECT 1 FROM admin_user_group_members gm
    JOIN admin_user_groups g ON g.id = gm.group_id
    WHERE gm.user_id = ? AND g.name = ? COLLATE NOCASE
  `).get(userId, DOJO_MEMBER_GROUP_NAME);
  return !!row;
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
    SELECT id, plan_type, name, price_amount, currency
    FROM venue_access_plans
    WHERE venue_id = ? AND active = 1
    ORDER BY plan_type, price_amount
  `).all(venue.id);

  // Attach discount info for the requesting user
  const plansWithDiscount = plans.map(plan => {
    const appliesTo = plan.plan_type === 'monthly' ? 'monthly' : 'day_pass';
    const discount = getUserDiscount(db, req.user.id, venue.id, appliesTo);
    const discountedAmount = discount ? applyDiscount(plan.price_amount, discount.discount_percent) : plan.price_amount;
    return {
      ...plan,
      discount_percent: discount ? discount.discount_percent : 0,
      discounted_amount: discountedAmount,
    };
  });

  const approved = isUserApproved(db, req.user.id, venue.id);

  res.json({ venue, plans: plansWithDiscount, approved });
});

// GET /api/venue-access/my-access/:venueSlug — check current user's access status
router.get('/my-access/:venueSlug', requireAuth, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const access = checkUserVenueAccess(db, req.user.id, venue.id);

  const subscription = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ? AND vs.status IN ('active', 'past_due')
    ORDER BY vs.current_period_end DESC
    LIMIT 1
  `).get(req.user.id, venue.id);

  const today = todayDateString();
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

  const approved = isUserApproved(db, req.user.id, venue.id);

  res.json({
    venue,
    approved,
    has_access: access.hasAccess,
    access_type: access.accessType,
    subscription: subscription || null,
    day_passes: dayPasses,
    discounts,
  });
});

// POST /api/venue-access/purchase/day-pass — create Square payment link for a day pass
router.post('/purchase/day-pass', requireAuth, async (req, res) => {
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
    const venue = db.prepare(`SELECT id FROM venues v JOIN venue_access_plans vap ON v.id = vap.venue_id WHERE vap.id = ?`).get(plan_id);
    if (venue && !isUserApproved(db, req.user.id, venue.id)) {
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
    const paymentId = uuidv4();
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
    const { plan_id } = req.body;
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

    // Check whitelist
    if (!isUserApproved(db, req.user.id, plan.venue_id)) {
      return res.status(403).json({ error: 'You are not approved for this venue. Please contact the venue admin.' });
    }

    const existing = db.prepare(`
      SELECT id FROM venue_subscriptions
      WHERE user_id = ? AND venue_id = ? AND status IN ('active', 'past_due')
    `).get(req.user.id, plan.venue_id);
    if (existing) {
      return res.status(409).json({ error: 'You already have an active subscription for this venue' });
    }

    // Apply discount if available
    const discount = getUserDiscount(db, req.user.id, plan.venue_id, 'monthly');
    const chargeAmount = discount ? applyDiscount(plan.price_amount, discount.discount_percent) : plan.price_amount;
    const discountNote = discount ? ` (${discount.discount_percent}% discount applied)` : '';

    const paymentId = uuidv4();
    db.prepare(`
      INSERT INTO venue_payments (id, user_id, venue_id, plan_id, payment_type, amount, currency, status, description)
      VALUES (?, ?, ?, ?, 'subscription', ?, ?, 'pending', ?)
    `).run(paymentId, req.user.id, plan.venue_id, plan.id, chargeAmount, plan.currency,
      `Monthly subscription for ${plan.venue_name}${discountNote}`);

    const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user.id);

    const link = await createSubscriptionPaymentLink({
      userId: req.user.id,
      email: user?.email || '',
      username: user?.username || '',
      venueId: plan.venue_id,
      planId: plan.id,
      squarePlanVariationId: plan.square_plan_variation_id || null,
      planName: `${plan.venue_name} — ${plan.name}${discountNote}`,
      priceAmount: chargeAmount,
      currency: plan.currency,
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
      SELECT * FROM venue_subscriptions WHERE id = ? AND user_id = ? AND status = 'active'
    `).get(subscription_id, req.user.id);
    if (!sub) return res.status(404).json({ error: 'Active subscription not found' });

    if (isSquareConfigured() && sub.square_subscription_id) {
      await cancelSquareSubscription(sub.square_subscription_id);
    }

    db.prepare(`
      UPDATE venue_subscriptions SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(subscription_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[VenueAccess] Cancel subscription error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// GET /api/venue-access/my-payments
router.get('/my-payments', requireAuth, (req, res) => {
  const db = getDb();
  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description, vp.created_at,
           v.name AS venue_name, v.slug AS venue_slug,
           vap.name AS plan_name
    FROM venue_payments vp
    JOIN venues v ON v.id = vp.venue_id
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE vp.user_id = ?
    ORDER BY vp.created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({ payments });
});

// GET /api/venue-access/my-membership/:venueSlug — full membership dashboard data
router.get('/my-membership/:venueSlug', requireAuth, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const userId = req.user.id;
  const access = checkUserVenueAccess(db, userId, venue.id);
  const approved = isUserApproved(db, userId, venue.id);
  const dojoMember = isDojoMember(db, userId);
  const today = todayDateString();

  // Active subscription
  const subscription = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.user_id = ? AND vs.venue_id = ? AND vs.status IN ('active', 'past_due')
    ORDER BY vs.current_period_end DESC
    LIMIT 1
  `).get(userId, venue.id);

  // Past subscriptions
  const pastSubscriptions = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
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
    SELECT id, plan_type, name, price_amount, currency
    FROM venue_access_plans
    WHERE venue_id = ? AND active = 1
    ORDER BY plan_type, price_amount
  `).all(venue.id);

  const plansWithDiscount = plans.map(plan => {
    const appliesTo = plan.plan_type === 'monthly' ? 'monthly' : 'day_pass';
    const discount = getUserDiscount(db, userId, venue.id, appliesTo);
    const discountedAmount = discount ? applyDiscount(plan.price_amount, discount.discount_percent) : plan.price_amount;
    return {
      ...plan,
      discount_percent: discount ? discount.discount_percent : 0,
      discounted_amount: discountedAmount,
    };
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
    approved,
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

router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!isSquareConfigured()) {
    return res.status(503).json({ error: 'Square not configured' });
  }

  const sig = req.headers['x-square-hmacsha256-signature'];
  try {
    const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf8');
    if (!verifyWebhookSignature(rawBody, sig)) {
      console.error('[Square Webhook] Signature verification failed');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  } catch (err) {
    console.error('[Square Webhook] Signature verification error:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const event = typeof req.body === 'string' ? JSON.parse(req.body) : JSON.parse(req.body.toString('utf8'));
  const db = getDb();

  try {
    switch (event.type) {
      // Payment completed — handles both day pass and subscription one-off payments
      case 'payment.completed': {
        const payment = event.data.object?.payment || event.data.object;
        const orderId = payment?.orderId || payment?.order_id;
        const squarePaymentId = payment?.id;

        if (!orderId) break;

        // Find the pending venue payment by square_order_id
        const paymentRow = db.prepare(`
          SELECT * FROM venue_payments WHERE square_order_id = ? AND status = 'pending'
        `).get(orderId);

        if (!paymentRow) {
          // Also try by square_link_id — try matching via order
          break;
        }

        // Try to extract metadata from payment note
        let meta = {};
        try {
          const noteStr = payment?.note || payment?.receiptUrl || '';
          // Payment note was set as JSON during link creation
          // Square may not return it in webhook, so we use our DB record instead
        } catch (e) { /* ignore */ }

        db.prepare(`
          UPDATE venue_payments SET status = 'succeeded', square_payment_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(squarePaymentId || '', paymentRow.id);

        if (paymentRow.payment_type === 'day_pass') {
          // We need to figure out the pass_date — stored in the description
          const dateMatch = paymentRow.description?.match(/(\d{4}-\d{2}-\d{2})/);
          const passDate = dateMatch ? dateMatch[1] : todayDateString();

          const passId = uuidv4();
          db.prepare(`
            INSERT INTO venue_day_passes (id, user_id, venue_id, plan_id, pass_date, status, payment_id)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
          `).run(passId, paymentRow.user_id, paymentRow.venue_id, paymentRow.plan_id, passDate, paymentRow.id);
        } else if (paymentRow.payment_type === 'subscription') {
          const subId = uuidv4();
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          db.prepare(`
            INSERT INTO venue_subscriptions (id, user_id, venue_id, plan_id, status, current_period_start, current_period_end)
            VALUES (?, ?, ?, ?, 'active', ?, ?)
          `).run(subId, paymentRow.user_id, paymentRow.venue_id, paymentRow.plan_id,
            now.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10));

          // Auto-add user to "Pump Dojo" group
          addUserToDojoMemberGroup(db, paymentRow.user_id, null);
        }
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
          `);
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
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          db.prepare(`
            UPDATE venue_subscriptions
            SET status = 'active', current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(now.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10), sub.id);

          const paymentId = uuidv4();
          const amount = invoice?.paymentRequests?.[0]?.computedAmountMoney?.amount || 0;
          db.prepare(`
            INSERT INTO venue_payments (id, user_id, venue_id, plan_id, payment_type, amount, currency, status, square_payment_id, description)
            VALUES (?, ?, ?, ?, 'subscription_renewal', ?, ?, 'succeeded', ?, ?)
          `).run(paymentId, sub.user_id, sub.venue_id, sub.plan_id,
            Number(amount), 'gbp',
            invoice?.id || '', 'Subscription renewal');
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

  res.json({ venue, plans });
});

// POST /api/venue-access/admin/plans — create a new plan
router.post('/admin/plans', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const { venue_id, plan_type, name, price_amount, currency, square_plan_variation_id } = req.body;

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

  const id = uuidv4();
  db.prepare(`
    INSERT INTO venue_access_plans (id, venue_id, plan_type, name, price_amount, currency, square_plan_variation_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, venue_id, plan_type, name.trim(), price_amount, (currency || 'gbp').toLowerCase(), square_plan_variation_id || null);

  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(id);
  res.json(plan);
});

// PUT /api/venue-access/admin/plans/:planId — update a plan
router.put('/admin/plans/:planId', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(req.params.planId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, price_amount, currency, square_plan_variation_id, active } = req.body;

  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
  if (price_amount !== undefined) { updates.push('price_amount = ?'); params.push(price_amount); }
  if (currency !== undefined) { updates.push('currency = ?'); params.push(String(currency).toLowerCase()); }
  if (square_plan_variation_id !== undefined) { updates.push('square_plan_variation_id = ?'); params.push(square_plan_variation_id || null); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.planId);

  db.prepare(`UPDATE venue_access_plans SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM venue_access_plans WHERE id = ?').get(req.params.planId);
  res.json(updated);
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

  const subscribers = db.prepare(`
    SELECT vs.id, vs.status, vs.current_period_start, vs.current_period_end, vs.cancelled_at, vs.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_subscriptions vs
    JOIN users u ON u.id = vs.user_id
    JOIN venue_access_plans vap ON vap.id = vs.plan_id
    WHERE vs.venue_id = ? AND vs.status IN ('active', 'past_due')
    ORDER BY vs.created_at DESC
  `).all(venue.id);

  const today = todayDateString();
  const dayPasses = db.prepare(`
    SELECT vdp.id, vdp.pass_date, vdp.status, vdp.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name, vap.price_amount, vap.currency
    FROM venue_day_passes vdp
    JOIN users u ON u.id = vdp.user_id
    JOIN venue_access_plans vap ON vap.id = vdp.plan_id
    WHERE vdp.venue_id = ? AND vdp.pass_date >= ?
    ORDER BY vdp.pass_date ASC, vdp.created_at DESC
    LIMIT 100
  `).all(venue.id, today);

  const payments = db.prepare(`
    SELECT vp.id, vp.payment_type, vp.amount, vp.currency, vp.status, vp.description, vp.created_at,
           u.id AS user_id, u.username, u.avatar, u.avatar_v,
           vap.name AS plan_name
    FROM venue_payments vp
    JOIN users u ON u.id = vp.user_id
    LEFT JOIN venue_access_plans vap ON vap.id = vp.plan_id
    WHERE vp.venue_id = ?
    ORDER BY vp.created_at DESC
    LIMIT 100
  `).all(venue.id);

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

  res.json({
    venue,
    plans,
    subscribers,
    day_passes: dayPasses,
    payments,
    discounts,
    stats: {
      total_revenue: totalRevenue.total,
      month_revenue: monthRevenue.total,
      active_subscriptions: activeSubCount.cnt,
      today_day_passes: todayPassCount.cnt,
    },
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

// GET /api/venue-access/admin/payments/:venueSlug
router.get('/admin/payments/:venueSlug', requireAuth, requireDojoAdmin, (req, res) => {
  const db = getDb();
  const venue = db.prepare('SELECT id, name, slug FROM venues WHERE slug = ?').get(req.params.venueSlug);
  if (!venue) return res.status(404).json({ error: 'Venue not found' });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status || '';
  const typeFilter = req.query.type || '';

  let where = 'vp.venue_id = ?';
  const params = [venue.id];
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
  db.prepare(`
    INSERT INTO venue_payments (id, user_id, venue_id, plan_id, payment_type, amount, currency, status, description)
    VALUES (?, ?, ?, ?, 'subscription', 0, ?, 'succeeded', ?)
  `).run(paymentId, user_id, venue_id, plan_id, plan.currency, `Admin-granted subscription (${months} month${months > 1 ? 's' : ''})`);

  const subId = uuidv4();
  db.prepare(`
    INSERT INTO venue_subscriptions (id, user_id, venue_id, plan_id, status, current_period_start, current_period_end)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(subId, user_id, venue_id, plan_id,
    now.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10));

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
    const sub = db.prepare('SELECT * FROM venue_subscriptions WHERE id = ?').get(id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    db.prepare("UPDATE venue_subscriptions SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    if (isSquareConfigured() && sub.square_subscription_id) {
      cancelSquareSubscription(sub.square_subscription_id).catch(err => {
        console.error('[VenueAccess] Failed to cancel Square subscription:', err.message);
      });
    }
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
