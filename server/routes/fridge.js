const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('./auth');
const {
  isSquareConfigured,
  createQuickPayLink,
  retrievePaymentLink,
  retrieveOrder,
} = require('../lib/square');

// Dojo fridge tab. Trusted-community honor system: tap what you take, settle
// the running tab in one Square payment whenever you like (one fixed card fee
// per settlement instead of per £1 can). Walk-ins use the piggy bank.

const MAX_QTY = 12;
// A settle attempt locks the entries it covers; if the checkout is abandoned
// the lock auto-expires so the tab is editable again.
const PENDING_LOCK_HOURS = 24;

function unlockStalePayments(db, userId) {
  const stale = db.prepare(`
    SELECT id FROM fridge_payments
    WHERE user_id = ? AND status = 'pending'
      AND created_at < datetime('now', '-${PENDING_LOCK_HOURS} hours')
  `).all(userId);
  for (const row of stale) {
    db.prepare("UPDATE fridge_payments SET status = 'expired' WHERE id = ?").run(row.id);
    db.prepare('UPDATE fridge_tab_entries SET settling_payment_id = NULL WHERE settling_payment_id = ?').run(row.id);
  }
}

function getOpenTab(db, userId) {
  const entries = db.prepare(`
    SELECT e.id, e.item_id, e.item_name, e.price_pence, e.qty, e.created_at,
           e.settling_payment_id,
           COALESCE(i.emoji, '') AS emoji
    FROM fridge_tab_entries e
    LEFT JOIN fridge_items i ON i.id = e.item_id
    WHERE e.user_id = ? AND e.settled_at IS NULL
    ORDER BY e.created_at DESC, e.id DESC
  `).all(userId);
  const total = entries.reduce((sum, e) => sum + e.price_pence * e.qty, 0);
  const settling = entries.some((e) => e.settling_payment_id != null);
  return { entries, total_pence: total, settling };
}

// GET /api/fridge/items
router.get('/items', requireAuth, (req, res) => {
  const db = getDb();
  const items = db.prepare(
    'SELECT id, name, emoji, price_pence FROM fridge_items WHERE active = 1 ORDER BY sort_order, id',
  ).all();
  res.json({ items, square_enabled: isSquareConfigured() });
});

// GET /api/fridge/tab — open tab + recent settled history
router.get('/tab', requireAuth, (req, res) => {
  const db = getDb();
  unlockStalePayments(db, req.user.id);
  const tab = getOpenTab(db, req.user.id);
  const history = db.prepare(`
    SELECT id, amount_pence, status, created_at, paid_at
    FROM fridge_payments
    WHERE user_id = ? AND status = 'paid'
    ORDER BY paid_at DESC, id DESC
    LIMIT 10
  `).all(req.user.id);
  res.json({ ...tab, history });
});

// POST /api/fridge/tab { item_id, qty? } — grab something from the fridge
router.post('/tab', requireAuth, (req, res) => {
  const db = getDb();
  const itemId = parseInt(req.body?.item_id, 10);
  const qty = Math.max(1, Math.min(MAX_QTY, parseInt(req.body?.qty, 10) || 1));
  const item = db.prepare('SELECT id, name, price_pence FROM fridge_items WHERE id = ? AND active = 1').get(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  db.prepare(`
    INSERT INTO fridge_tab_entries (user_id, item_id, item_name, price_pence, qty)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, item.id, item.name, item.price_pence, qty);
  res.json(getOpenTab(db, req.user.id));
});

// DELETE /api/fridge/tab/:id — undo a mis-tap (own, unsettled, not mid-settle)
router.delete('/tab/:id', requireAuth, (req, res) => {
  const db = getDb();
  const info = db.prepare(`
    DELETE FROM fridge_tab_entries
    WHERE id = ? AND user_id = ? AND settled_at IS NULL AND settling_payment_id IS NULL
  `).run(parseInt(req.params.id, 10) || 0, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Entry not found (already settling or settled?)' });
  res.json(getOpenTab(db, req.user.id));
});

// POST /api/fridge/settle — one Square quick-pay link for the whole open tab
router.post('/settle', requireAuth, async (req, res) => {
  const db = getDb();
  if (!isSquareConfigured()) return res.status(503).json({ error: 'Payments are not configured' });
  unlockStalePayments(db, req.user.id);

  const tab = getOpenTab(db, req.user.id);
  if (tab.settling) return res.status(409).json({ error: 'A settle is already in progress — finish or wait for it to expire.' });
  if (tab.total_pence <= 0) return res.status(400).json({ error: 'Nothing on your tab.' });

  const itemCount = tab.entries.reduce((n, e) => n + e.qty, 0);
  try {
    const paymentInsert = db.prepare(`
      INSERT INTO fridge_payments (user_id, amount_pence) VALUES (?, ?)
    `).run(req.user.id, tab.total_pence);
    const paymentDbId = paymentInsert.lastInsertRowid;

    const link = await createQuickPayLink({
      name: `Dojo fridge — ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      amountPence: tab.total_pence,
      redirectPath: '/fridge?payment=success',
      paymentNote: `Fridge tab settle by @${req.user.username || req.user.id}`,
    });

    db.prepare(`
      UPDATE fridge_payments SET square_link_id = ?, square_order_id = ? WHERE id = ?
    `).run(link.id || '', link.orderId || '', paymentDbId);
    db.prepare(`
      UPDATE fridge_tab_entries SET settling_payment_id = ?
      WHERE user_id = ? AND settled_at IS NULL AND settling_payment_id IS NULL
    `).run(paymentDbId, req.user.id);

    res.json({ checkout_url: link.url, payment_id: paymentDbId, amount_pence: tab.total_pence });
  } catch (err) {
    console.error('[Fridge] settle error:', err.message);
    res.status(502).json({ error: 'Could not create the Square checkout — try again.' });
  }
});

// POST /api/fridge/reconcile — confirm pending settles against Square (called
// on return from checkout + on tab screen focus). Mirrors the venue-access
// reconcile: link → order → tender captured ⇒ paid.
router.post('/reconcile', requireAuth, async (req, res) => {
  const db = getDb();
  const pendingRows = db.prepare(`
    SELECT * FROM fridge_payments
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 5
  `).all(req.user.id);

  let reconciled = 0;
  for (const paymentRow of pendingRows) {
    try {
      let orderId = String(paymentRow.square_order_id || '').trim();
      if (!orderId && paymentRow.square_link_id) {
        const linkResponse = await retrievePaymentLink(paymentRow.square_link_id);
        orderId = String(linkResponse?.payment_link?.order_id || linkResponse?.paymentLink?.orderId || '').trim();
        if (orderId) {
          db.prepare('UPDATE fridge_payments SET square_order_id = ? WHERE id = ?').run(orderId, paymentRow.id);
        }
      }
      if (!orderId) continue;

      const orderResponse = await retrieveOrder(orderId);
      const order = orderResponse?.order || orderResponse?.result?.order || null;
      const tender = Array.isArray(order?.tenders) ? order.tenders.find((row) => {
        const cardStatus = String(row?.card_details?.status || '').toUpperCase();
        return !!row?.payment_id || cardStatus === 'CAPTURED';
      }) : null;
      const isPaid = !!tender
        || ((parseInt(order?.net_amount_due_money?.amount, 10) || 0) <= 0
          && Array.isArray(order?.tenders) && order.tenders.length > 0);
      if (!isPaid) continue;

      db.prepare(`
        UPDATE fridge_payments
        SET status = 'paid', paid_at = datetime('now'), square_payment_id = ?
        WHERE id = ?
      `).run(tender?.payment_id || tender?.id || '', paymentRow.id);
      db.prepare(`
        UPDATE fridge_tab_entries SET settled_at = datetime('now')
        WHERE settling_payment_id = ?
      `).run(paymentRow.id);
      reconciled += 1;
    } catch (err) {
      console.error('[Fridge] reconcile error:', err.message);
    }
  }

  const tab = getOpenTab(db, req.user.id);
  res.json({ reconciled, ...tab });
});

module.exports = router;
