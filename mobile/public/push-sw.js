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
self.__APP_VERSION__ = '2026-05-18-notification-nav-v2';
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
    // Three cases, in priority order:
    //   1. A Shinsa tab is open at the exact targetUrl → just focus.
    //   2. A Shinsa tab is open somewhere else → focus it AND post a
    //      NAVIGATE message; the in-page listener calls router.push(url)
    //      so we don't open a duplicate tab. The previous version of
    //      this handler only matched exact URLs and fell through to
    //      openWindow, which on PWAs just re-focuses the existing
    //      window without navigating — the bug the user reported as
    //      "tapping a notification doesn't go to the post".
    //   3. No tab open → openWindow.
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOriginClients = clientsList.filter((c) => {
      try { return new URL(c.url).origin === self.location.origin; }
      catch { return false; }
    });

    const exact = sameOriginClients.find((c) => c.url === targetUrl);
    if (exact && 'focus' in exact) {
      await exact.focus();
      return;
    }

    const fallbackClient = sameOriginClients.find((c) => 'focus' in c);
    if (fallbackClient) {
      try {
        fallbackClient.postMessage({ type: 'SHINSA_NAVIGATE', url: rawUrl });
      } catch (_) { /* not fatal */ }
      await fallbackClient.focus();
      return;
    }

    await clients.openWindow(targetUrl);
  })());
});
