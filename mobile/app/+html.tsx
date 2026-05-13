import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Custom HTML template (web only). Two jobs:
 *   1. Inject Expo's scroll-view reset (so RN ScrollView styles apply correctly).
 *   2. Style scrollbars to be slim and theme-friendly. Default OS scrollbars on
 *      web look out of place on a phone-sized layout — we hide the system bar
 *      on `body` and render thin auto-hiding bars inside scroll containers.
 *
 * On iOS/Android this file is ignored; native ScrollView indicators are turned
 * off via the wrapper components instead (`showsVerticalScrollIndicator={false}`).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover so the iOS notch + bottom inset are reachable
            once the user installs the PWA. `user-scalable=no` would block
            pinch-zoom, so we leave it off — accessibility wins. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/* PWA bits — manifest + theme color + iOS standalone hints. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#050505" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Shinsa" />
        <link rel="apple-touch-icon" href="/icons/app-icon-180.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/app-icon-152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/app-icon-180.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/app-icon-512.png" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />

        {/* Register the service worker. Runs on every page load — calling
            register again with the same URL is a no-op so this is safe.
            Must run AFTER the body so the page paints first; we use `defer`. */}
        <script defer dangerouslySetInnerHTML={{ __html: SW_REGISTER_JS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Service worker bootstrap. Registers /push-sw.js after page load so it
// doesn't block first paint, and listens for `controllerchange` to nudge
// pending updates through. Push subscription itself is opt-in via
// useWebPush() — not auto-subscribed here.
const SW_REGISTER_JS = `
  (function () {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/push-sw.js', { scope: '/' }).then(function (reg) {
        if (!reg) return;
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener && reg.addEventListener('updatefound', function () {
          var installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', function () {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage && installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(function (err) {
        console && console.warn && console.warn('Service worker registration failed:', err && err.message);
      });
    });
  })();
`;

const SCROLLBAR_CSS = `
  /* Hide the document-level scrollbar — the page scrolls inside RN scrollers. */
  html, body {
    scrollbar-width: none;
    /* Stop the page from rubber-banding past the top/bottom on mobile.
       Without this, dragging up from the bottom-tab bar would lift the
       whole app and reveal a strip of body background behind it. */
    overscroll-behavior: none;
    overflow: hidden;
    /* Lock the viewport to the actual visual height — visualViewport
       measurements aren't supported on every browser, so fall back to
       100% when needed. Combined with overflow:hidden above, this kills
       the bounce-by-dragging-the-tab-bar bug entirely. */
    height: 100%;
    width: 100%;
    position: fixed;
    overscroll-behavior-y: none;
  }
  body {
    /* RN ScrollViews live inside body and handle their own scroll, so
       body itself never needs to scroll. Setting touch-action stops
       Chrome's pull-to-refresh from firing when a finger drags down
       from the top of the page. */
    touch-action: pan-x pan-y;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  /* Slim, auto-hiding scrollbar for inner scrollable regions (Firefox). */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 196, 0, 0.4) transparent;
  }

  /* Webkit (Chrome / Safari / mobile-Safari) — thin track, themed thumb. */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 196, 0, 0.35);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 196, 0, 0.55);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
`;
