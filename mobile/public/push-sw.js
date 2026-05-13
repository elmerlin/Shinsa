// Shinsa mobile-web service worker.
//
// Two responsibilities:
//   1. Web push delivery — receive `push` events from the VAPID server and
//      surface them via `showNotification`. Tapping the notification routes
//      to the URL the server attached.
//   2. Light caching — precache the offline shell + cache-first for the
//      manifest/icons so the install state survives spotty networks. We
//      don't aggressively cache the JS bundle (Expo's static build already
//      hashes filenames so HTTP caching is enough).
//
// Bump APP_VERSION when changing this file so the install/activate flow
// evicts the old cache. Service workers are notorious for sticking around
// — see the Expo PWA guide caveat about over-aggressive caching.
self.__APP_VERSION__ = '2026-05-13-mobile-web-pwa-v1';
const STATIC_CACHE = `shinsa-mobile-static-${self.__APP_VERSION__}`;

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icons/app-icon-192.png',
  '/icons/app-icon-512.png',
  '/icons/notification-badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Use individual `cache.add` calls so a single 404 doesn't abort the
    // whole install — important during dev when icon paths shift.
    await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('shinsa-mobile-') && key !== STATIC_CACHE)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Cache-first for the precached shell items. Everything else passes through
// — Expo's bundle assets are versioned via filename hash so the browser's
// HTTP cache handles them.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!PRECACHE_URLS.includes(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.status === 200) {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});

// VAPID push handler. The server sends a JSON payload — we surface it as
// a system notification with a tag so duplicate pushes coalesce.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Shinsa';
  const body = payload.body || 'You have a new notification';
  const url = payload.url || '/';
  const icon = payload.icon || '/icons/app-icon-192.png';
  const badge = payload.badge || '/icons/notification-badge-96.png';
  const tag = payload.tag || 'shinsa-notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil((async () => {
    // If a Shinsa tab is already open, focus it (and route to the target
    // URL via postMessage so React Router can handle it without a reload).
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
