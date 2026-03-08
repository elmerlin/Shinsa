/**
 * Stripe integration helper for venue day passes and monthly subscriptions.
 *
 * Required environment variables:
 *   STRIPE_SECRET_KEY      – Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET  – Stripe webhook signing secret (whsec_...)
 *   STRIPE_PUBLIC_KEY      – Stripe publishable key (pk_live_... or pk_test_...) — exposed to frontend
 *   APP_URL                – Public URL of the app (e.g. https://shinsa.example.com)
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

let stripe = null;

function getStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!stripe) {
    const Stripe = require('stripe');
    stripe = new Stripe(STRIPE_SECRET_KEY);
  }
  return stripe;
}

function isStripeConfigured() {
  return !!STRIPE_SECRET_KEY;
}

/**
 * Create a Stripe Checkout Session for a one-off day pass purchase.
 */
async function createDayPassCheckoutSession({ userId, email, username, venueId, planId, planName, priceAmount, currency, passDate }) {
  const s = getStripe();
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: [{
      price_data: {
        currency: currency || 'gbp',
        product_data: {
          name: planName || 'Day Pass',
          description: `Day pass for ${passDate}`,
        },
        unit_amount: priceAmount,
      },
      quantity: 1,
    }],
    metadata: {
      type: 'day_pass',
      user_id: userId,
      username: username || '',
      venue_id: venueId,
      plan_id: planId,
      pass_date: passDate,
    },
    success_url: `${APP_URL}/checkin?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/checkin?payment=cancelled`,
  });
  return session;
}

/**
 * Create a Stripe Checkout Session for a monthly subscription.
 */
async function createSubscriptionCheckoutSession({ userId, email, username, venueId, planId, stripePriceId, planName, priceAmount, currency }) {
  const s = getStripe();

  const sessionConfig = {
    mode: 'subscription',
    customer_email: email,
    metadata: {
      type: 'subscription',
      user_id: userId,
      username: username || '',
      venue_id: venueId,
      plan_id: planId,
    },
    subscription_data: {
      metadata: {
        user_id: userId,
        venue_id: venueId,
        plan_id: planId,
      },
    },
    success_url: `${APP_URL}/checkin?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/checkin?payment=cancelled`,
  };

  if (stripePriceId) {
    sessionConfig.line_items = [{ price: stripePriceId, quantity: 1 }];
  } else {
    sessionConfig.line_items = [{
      price_data: {
        currency: currency || 'gbp',
        product_data: {
          name: planName || 'Monthly Subscription',
        },
        unit_amount: priceAmount,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }];
  }

  const session = await s.checkout.sessions.create(sessionConfig);
  return session;
}

/**
 * Verify and construct a Stripe webhook event from the raw body + signature.
 */
function constructWebhookEvent(rawBody, signature) {
  const s = getStripe();
  return s.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

/**
 * Cancel a Stripe subscription (at period end by default).
 */
async function cancelStripeSubscription(subscriptionId, { immediately = false } = {}) {
  const s = getStripe();
  if (immediately) {
    return s.subscriptions.cancel(subscriptionId);
  }
  return s.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/**
 * Retrieve a Stripe Checkout Session with expanded fields.
 */
async function retrieveCheckoutSession(sessionId) {
  const s = getStripe();
  return s.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'payment_intent'],
  });
}

module.exports = {
  getStripe,
  isStripeConfigured,
  createDayPassCheckoutSession,
  createSubscriptionCheckoutSession,
  constructWebhookEvent,
  cancelStripeSubscription,
  retrieveCheckoutSession,
  STRIPE_PUBLIC_KEY,
  APP_URL,
};
