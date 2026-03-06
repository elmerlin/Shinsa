const webpush = require('web-push');

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@pumpshinsa.com';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

let vapidConfigured = false;

function isWebPushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  if (!isWebPushConfigured()) return false;

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error('Failed to configure VAPID for web push:', err.message);
    return false;
  }
}

function getPublicVapidKey() {
  return VAPID_PUBLIC_KEY;
}

function buildPushPayload(notification) {
  const id = notification?.id || '';
  const title = notification?.title || 'New notification';
  const body = notification?.message || 'You have a new notification';
  const url = notification?.link || '/';
  return {
    title,
    body,
    url,
    icon: '/icons/app-icon-192.png',
    badge: '/icons/notification-badge-96.png',
    tag: id ? `notification-${id}` : 'notification',
    notification_id: id,
  };
}

function getUserSubscriptions(db, userId) {
  if (!db || !userId) return [];
  return db.prepare(`
    SELECT endpoint, p256dh, auth
    FROM user_push_subscriptions
    WHERE user_id = ? AND endpoint != ''
  `).all(userId);
}

function deleteSubscriptionByEndpoint(db, endpoint) {
  if (!db || !endpoint) return;
  db.prepare('DELETE FROM user_push_subscriptions WHERE endpoint = ?').run(endpoint);
}

async function sendWebPushToUser(db, userId, notification) {
  if (!db || !userId || !notification) return { sent: 0, removed: 0, skipped: true };
  if (!ensureVapidConfigured()) return { sent: 0, removed: 0, skipped: true };

  const subscriptions = getUserSubscriptions(db, userId);
  if (subscriptions.length === 0) return { sent: 0, removed: 0, skipped: false };

  const payload = JSON.stringify(buildPushPayload(notification));
  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async (sub) => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(subscription, payload);
      sent += 1;
    } catch (err) {
      const status = Number(err?.statusCode || 0);
      if (status === 404 || status === 410) {
        deleteSubscriptionByEndpoint(db, sub.endpoint);
        removed += 1;
        return;
      }
      console.error('Web push delivery failed:', err?.message || 'Unknown error');
    }
  }));

  return { sent, removed, skipped: false };
}

module.exports = {
  getPublicVapidKey,
  isWebPushConfigured,
  sendWebPushToUser,
};
