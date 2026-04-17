self.__APP_VERSION__ = '2026-04-17-piumon-mascot-variants';
const STATIC_CACHE = `shinsa-static-${self.__APP_VERSION__}`;
const RUNTIME_CACHE = `shinsa-runtime-${self.__APP_VERSION__}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/app-icon-192.png',
  '/icons/app-icon-512.png',
  '/icons/notification-badge-96.png',
  '/pump-shinsa-wordmark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('shinsa-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Never cache API traffic.
  if (isSameOrigin && url.pathname.startsWith('/api/')) return;

  // Network-first for navigation, fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, networkResponse.clone()).catch(() => {});
        return networkResponse;
      } catch {
        const cachedPage = await caches.match(request);
        if (cachedPage) return cachedPage;
        const offlinePage = await caches.match(OFFLINE_URL);
        return offlinePage || Response.error();
      }
    })());
    return;
  }

  // Network-first for app shell assets so production UI updates are immediate.
  const isAppAsset = isSameOrigin
    && (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));
  if (isAppAsset) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Stale-while-revalidate for static assets (including cross-origin fonts/images).
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then(async (response) => {
      if (!response) return response;
      if (response.status === 200 || response.type === 'opaque') {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;

    if (request.destination === 'document') {
      const offlinePage = await caches.match(OFFLINE_URL);
      return offlinePage || Response.error();
    }

    return Response.error();
  })());
});

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
  const icon = payload.icon || '/icons/app-icon-192.png';
  const badge = payload.badge || '/icons/notification-badge-96.png';
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
