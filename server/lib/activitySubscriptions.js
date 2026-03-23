const { createUserNotification } = require('./notifications');

const ACTIVITY_COLUMN_BY_TYPE = {
  posts: 'notify_posts',
  upscores: 'notify_upscores',
  new_clears: 'notify_new_clears',
};

function buildProfilePath(username) {
  const clean = String(username || '').trim().replace(/^@+/, '');
  return clean ? `/@${encodeURIComponent(clean)}` : '';
}

function normalizeSubscriptionRow(row) {
  return {
    subscribed: !!row,
    notify_posts: !!row?.notify_posts,
    notify_upscores: !!row?.notify_upscores,
    notify_new_clears: !!row?.notify_new_clears,
  };
}

function getActivitySubscription(db, subscriberUserId, targetUserId) {
  if (!db || !subscriberUserId || !targetUserId) {
    return {
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    };
  }

  const row = db.prepare(`
    SELECT notify_posts, notify_upscores, notify_new_clears
    FROM user_activity_notification_subscriptions
    WHERE subscriber_user_id = ? AND target_user_id = ?
  `).get(subscriberUserId, targetUserId);

  return normalizeSubscriptionRow(row);
}

function setActivitySubscription(db, subscriberUserId, targetUserId, prefs = {}) {
  if (!db || !subscriberUserId || !targetUserId || subscriberUserId === targetUserId) {
    return {
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    };
  }

  const notifyPosts = prefs.notify_posts ? 1 : 0;
  const notifyUpscores = prefs.notify_upscores ? 1 : 0;
  const notifyNewClears = prefs.notify_new_clears ? 1 : 0;
  const enabled = notifyPosts || notifyUpscores || notifyNewClears;

  if (!enabled) {
    db.prepare(`
      DELETE FROM user_activity_notification_subscriptions
      WHERE subscriber_user_id = ? AND target_user_id = ?
    `).run(subscriberUserId, targetUserId);
    return {
      subscribed: false,
      notify_posts: false,
      notify_upscores: false,
      notify_new_clears: false,
    };
  }

  db.prepare(`
    INSERT INTO user_activity_notification_subscriptions
      (subscriber_user_id, target_user_id, notify_posts, notify_upscores, notify_new_clears, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(subscriber_user_id, target_user_id) DO UPDATE SET
      notify_posts = excluded.notify_posts,
      notify_upscores = excluded.notify_upscores,
      notify_new_clears = excluded.notify_new_clears,
      updated_at = datetime('now')
  `).run(subscriberUserId, targetUserId, notifyPosts, notifyUpscores, notifyNewClears);

  return {
    subscribed: true,
    notify_posts: !!notifyPosts,
    notify_upscores: !!notifyUpscores,
    notify_new_clears: !!notifyNewClears,
  };
}

function notifyActivitySubscribers(db, options = {}) {
  const {
    actorUserId = '',
    actorUsername = 'Someone',
    activityType = 'posts',
    title = 'New Activity',
    message = '',
    link = '',
    notificationType = 'followed_user_activity',
  } = options;

  const activityColumn = ACTIVITY_COLUMN_BY_TYPE[activityType];
  if (!db || !actorUserId || !activityColumn) return 0;

  const subscribers = db.prepare(`
    SELECT subscriber_user_id AS user_id
    FROM user_activity_notification_subscriptions
    WHERE target_user_id = ?
      AND subscriber_user_id != ?
      AND ${activityColumn} = 1
  `).all(actorUserId, actorUserId);

  if (!Array.isArray(subscribers) || subscribers.length === 0) return 0;

  let created = 0;
  const defaultMessage = `${actorUsername} has new activity`;
  for (const subscriber of subscribers) {
    if (!subscriber?.user_id) continue;
    createUserNotification(
      db,
      subscriber.user_id,
      notificationType,
      title,
      message || defaultMessage,
      link || buildProfilePath(actorUsername) || `/profile/${actorUserId}`
    );
    created += 1;
  }
  return created;
}

module.exports = {
  ACTIVITY_COLUMN_BY_TYPE,
  buildProfilePath,
  getActivitySubscription,
  setActivitySubscription,
  notifyActivitySubscribers,
};
