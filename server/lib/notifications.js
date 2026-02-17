const { emitNotification } = require('./notificationHub');

function createUserNotification(db, userId, type, title, message = '', link = '') {
  if (!db || !userId) return null;

  const insert = db.prepare(
    'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  );
  const result = insert.run(userId, type, title, message || '', link || '');

  const notification = db.prepare('SELECT * FROM user_notifications WHERE id = ?').get(result.lastInsertRowid);
  if (notification) {
    emitNotification(userId, notification);
  }
  return notification || null;
}

module.exports = {
  createUserNotification,
};
