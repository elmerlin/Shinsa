/**
 * Square integration helper for venue day passes and monthly subscriptions.
 *
 * Required environment variables:
 *   SQUARE_ACCESS_TOKEN     – Square access token (sandbox or production)
 *   SQUARE_LOCATION_ID      – Square location ID
 *   SQUARE_WEBHOOK_SIGNATURE_KEY – Square webhook signature key
 *   SQUARE_ENVIRONMENT      – 'sandbox' or 'production' (default: 'sandbox')
 *   APP_URL                 – Public URL of the app (e.g. https://shinsa.example.com)
 */

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || '';
const SQUARE_WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT || 'sandbox';
const SQUARE_WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SQUARE_API_VERSION = '2026-01-22';

let squareClient = null;

function getSquareClient() {
  if (!SQUARE_ACCESS_TOKEN) {
    throw new Error('SQUARE_ACCESS_TOKEN is not configured');
  }
  if (!squareClient) {
    const { SquareClient, SquareEnvironment } = require('square');
    squareClient = new SquareClient({
      token: SQUARE_ACCESS_TOKEN,
      environment: SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    });
  }
  return squareClient;
}

function isSquareConfigured() {
  return !!(SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID);
}

/**
 * Create a Square Payment Link for a one-off day pass purchase.
 * Uses Quick Pay for simplicity — creates a hosted checkout page.
 */
async function createDayPassPaymentLink({ userId, email, username, venueId, planId, planName, priceAmount, currency, passDate }) {
  const client = getSquareClient();
  const { v4: uuidv4 } = require('uuid');

  const result = await client.checkout.paymentLinks.create({
    idempotencyKey: uuidv4(),
    quickPay: {
      name: planName || 'Day Pass',
      priceMoney: {
        amount: BigInt(priceAmount),
        currency: (currency || 'GBP').toUpperCase(),
      },
      locationId: SQUARE_LOCATION_ID,
    },
    checkoutOptions: {
      redirectUrl: `${APP_URL}/membership?payment=success`,
    },
    paymentNote: `Day pass for ${planName || 'Day Pass'} on ${passDate}`,
  });

  return {
    id: result.paymentLink.id,
    url: result.paymentLink.url,
    orderId: result.paymentLink.orderId,
  };
}

/**
 * Create a Square Payment Link for a monthly subscription.
 * Requires a subscription plan variation to be set up in Square.
 * If no Square plan variation ID is provided, falls back to a one-off payment.
 */
async function createSubscriptionPaymentLink({ userId, email, username, venueId, planId, squarePlanVariationId, cadenceKey, cadenceLabel, billingIntervalMonths, planName, priceAmount, currency }) {
  const client = getSquareClient();
  const { v4: uuidv4 } = require('uuid');

  if (squarePlanVariationId) {
    // Use subscription checkout
    const result = await client.checkout.paymentLinks.create({
      idempotencyKey: uuidv4(),
      checkoutOptions: {
        subscriptionPlanId: squarePlanVariationId,
        redirectUrl: `${APP_URL}/membership?payment=success`,
      },
      prePopulatedData: email ? { buyerEmail: email } : undefined,
      paymentNote: `${cadenceLabel || 'Membership'} for ${planName || 'Monthly Subscription'}`,
    });

    return {
      id: result.paymentLink.id,
      url: result.paymentLink.url,
      orderId: result.paymentLink.orderId,
    };
  }

  // Fallback: one-off payment link (admin will need to manage renewal manually)
  const result = await client.checkout.paymentLinks.create({
    idempotencyKey: uuidv4(),
    quickPay: {
      name: planName || 'Monthly Subscription',
      priceMoney: {
        amount: BigInt(priceAmount),
        currency: (currency || 'GBP').toUpperCase(),
      },
      locationId: SQUARE_LOCATION_ID,
    },
    checkoutOptions: {
      redirectUrl: `${APP_URL}/membership?payment=success`,
    },
    paymentNote: `${cadenceLabel || 'Membership'} for ${planName || 'Monthly Subscription'}`,
  });

  return {
    id: result.paymentLink.id,
    url: result.paymentLink.url,
    orderId: result.paymentLink.orderId,
  };
}

/**
 * Verify a Square webhook signature.
 * Returns true if valid.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!SQUARE_WEBHOOK_SIGNATURE_KEY) {
    throw new Error('SQUARE_WEBHOOK_SIGNATURE_KEY is not configured');
  }
  const { WebhooksHelper } = require('square');
  return WebhooksHelper.verifySignature(
    rawBody,
    signatureHeader,
    SQUARE_WEBHOOK_SIGNATURE_KEY,
    SQUARE_WEBHOOK_URL
  );
}

/**
 * Cancel a Square subscription.
 */
async function cancelSquareSubscription(subscriptionId) {
  const client = getSquareClient();
  return client.subscriptions.cancelSubscription(subscriptionId);
}

/**
 * Retrieve a Square payment by ID.
 */
async function retrievePayment(paymentId) {
  const client = getSquareClient();
  return client.payments.getPayment(paymentId);
}

/**
 * Retrieve a Square order by ID.
 */
async function retrieveOrder(orderId) {
  const client = getSquareClient();
  return client.orders.retrieveOrder(orderId);
}

async function retrievePaymentLink(paymentLinkId) {
  if (!paymentLinkId) {
    throw new Error('paymentLinkId is required');
  }
  const response = await fetch(`https://connect.squareup.com/v2/online-checkout/payment-links/${encodeURIComponent(paymentLinkId)}`, {
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Square-Version': SQUARE_API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to retrieve payment link (${response.status})`);
  }
  return response.json();
}

module.exports = {
  getSquareClient,
  isSquareConfigured,
  createDayPassPaymentLink,
  createSubscriptionPaymentLink,
  verifyWebhookSignature,
  cancelSquareSubscription,
  retrievePayment,
  retrieveOrder,
  retrievePaymentLink,
  SQUARE_LOCATION_ID,
  APP_URL,
};
