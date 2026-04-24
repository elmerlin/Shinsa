const { emitNotification } = require('./notificationHub');
const { sendWebPushToUser } = require('./webPush');
const { sendNativePushToUser } = require('./nativePush');

function createUserNotification(db, userId, type, title, message = '', link = '') {
  if (!db || !userId) return null;

  const insert = db.prepare(
    'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insert.run(userId, type, title, message || '', link || '');

  const notification = db.prepare('SELECT * FROM user_notifications WHERE id = ?').get(result.lastInsertRowid);
  if (notification) {
    emitNotification(userId, notification);
    sendWebPushToUser(db, userId, notification).catch((err) => {
      console.error('Web push dispatch error:', err?.message || 'Unknown error');
    });
    sendNativePushToUser(db, userId, notification).catch((err) => {
      console.error('Native push dispatch error:', err?.message || 'Unknown error');
    });
  }
  return notification || null;
}

module.exports = {
  createUserNotification,
};
