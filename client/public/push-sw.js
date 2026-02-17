self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'New notification';
  const body = payload.body || 'You have a new notification';
  const url = payload.url || '/';
  const icon = payload.icon || '/pump-shinsa-logo.svg';
  const badge = payload.badge || '/pump-shinsa-logo.svg';
  const tag = payload.tag || 'notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        if (client.url === targetUrl) {
          await client.focus();
          return;
        }
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
