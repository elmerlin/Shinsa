const fs = require('fs');
const http2 = require('http2');
const crypto = require('crypto');

const APNS_KEY_ID = process.env.APNS_KEY_ID || '';
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || '';
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.elmerlin.shinsa';
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY || '';
const APNS_PRIVATE_KEY_PATH = process.env.APNS_PRIVATE_KEY_PATH || '';
const APNS_PRODUCTION = String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true';

let cachedPrivateKey = null;
let cachedJwt = null;
let cachedJwtIssuedAt = 0;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (APNS_PRIVATE_KEY) {
    cachedPrivateKey = APNS_PRIVATE_KEY.replace(/\\n/g, '\n');
    return cachedPrivateKey;
  }
  if (APNS_PRIVATE_KEY_PATH && fs.existsSync(APNS_PRIVATE_KEY_PATH)) {
    cachedPrivateKey = fs.readFileSync(APNS_PRIVATE_KEY_PATH, 'utf8');
    return cachedPrivateKey;
  }
  return '';
}

function derToJose(signature) {
  let offset = 0;
  if (signature[offset++] !== 0x30) throw new Error('Invalid ECDSA signature');

  let length = signature[offset++];
  if (length & 0x80) {
    const byteCount = length & 0x7f;
    length = 0;
    for (let i = 0; i < byteCount; i += 1) {
      length = (length << 8) | signature[offset++];
    }
  }

  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
  const rLength = signature[offset++];
  let r = signature.slice(offset, offset + rLength);
  offset += rLength;

  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
  const sLength = signature[offset++];
  let s = signature.slice(offset, offset + sLength);

  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);

  const rPadded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - r.length), 0), r]);
  const sPadded = Buffer.concat([Buffer.alloc(Math.max(0, 32 - s.length), 0), s]);
  return base64Url(Buffer.concat([rPadded, sPadded]));
}

function isNativePushConfigured() {
  return Boolean(APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && readPrivateKey());
}

function getApnsJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwtIssuedAt < 45 * 60) return cachedJwt;

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }));
  const claims = base64Url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), readPrivateKey());
  cachedJwt = `${signingInput}.${derToJose(signature)}`;
  cachedJwtIssuedAt = now;
  return cachedJwt;
}

function buildApnsPayload(notification) {
  const title = notification?.title || 'New notification';
  const body = notification?.message || 'You have a new notification';
  return {
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
    },
    notification_id: notification?.id || '',
    type: notification?.type || 'notification',
    url: notification?.link || '',
  };
}

function getUserNativeTokens(db, userId) {
  if (!db || !userId) return [];
  return db.prepare(`
    SELECT device_token, environment
    FROM user_native_push_tokens
    WHERE user_id = ? AND platform = 'ios' AND device_token != ''
  `).all(userId);
}

function deleteNativeToken(db, token) {
  if (!db || !token) return;
  db.prepare('DELETE FROM user_native_push_tokens WHERE device_token = ?').run(token);
}

function sendApnsNotification(token, notification, environment = '') {
  return new Promise((resolve) => {
    const production = environment === 'production' || (!environment && APNS_PRODUCTION);
    const authority = production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    const client = http2.connect(authority);
    const payload = JSON.stringify(buildApnsPayload(notification));
    const path = `/3/device/${token}`;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };

    client.on('error', (err) => {
      finish({ status: 0, error: err });
    });

    const req = client.request({
      ':method': 'POST',
      ':path': path,
      authorization: `bearer ${getApnsJwt()}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let body = '';

    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      finish({ status, body });
    });
    req.on('error', (err) => {
      finish({ status: 0, error: err });
    });
    req.end(payload);
  });
}

async function sendNativePushToUser(db, userId, notification) {
  if (!db || !userId || !notification) return { sent: 0, removed: 0, skipped: true };
  if (!isNativePushConfigured()) return { sent: 0, removed: 0, skipped: true };

  const tokens = getUserNativeTokens(db, userId);
  if (tokens.length === 0) return { sent: 0, removed: 0, skipped: false };

  let sent = 0;
  let removed = 0;

  await Promise.all(tokens.map(async (row) => {
    const result = await sendApnsNotification(row.device_token, notification, row.environment);
    if (result.status >= 200 && result.status < 300) {
      sent += 1;
      return;
    }
    const shouldRemoveToken = result.status === 410
      || (result.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/i.test(result.body || ''));
    if (shouldRemoveToken) {
      deleteNativeToken(db, row.device_token);
      removed += 1;
      return;
    }
    const reason = result.body || result.error?.message || `status ${result.status}`;
    console.error('APNs delivery failed:', reason);
  }));

  return { sent, removed, skipped: false };
}

module.exports = {
  isNativePushConfigured,
  sendNativePushToUser,
};
