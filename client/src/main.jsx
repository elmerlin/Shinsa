import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ToastProvider } from './contexts/ToastContext';
import { TranslationProvider } from './i18n/TranslationContext';
import App from './App';
import './index.css';

const KOREAN_LOCALE_ENABLED = import.meta.env.VITE_ENABLE_KR_LOCALE === 'true';

function enableAppleMobileInputZoomGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ua = window.navigator.userAgent || '';
  const isAppleMobile = /iPhone|iPod|iPad/i.test(ua)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  if (!isAppleMobile) return;

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) return;

  const currentContent = viewportMeta.getAttribute('content') || 'width=device-width, initial-scale=1.0';
  const nextContent = currentContent
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^maximum-scale=/i.test(part));

  nextContent.push('maximum-scale=1');
  viewportMeta.setAttribute('content', nextContent.join(', '));
}

// Prevent Apple mobile browsers from auto-zooming focused form fields.
enableAppleMobileInputZoomGuard();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/push-sw.js', { scope: '/' }).then((registration) => {
      // Activate a waiting worker immediately after deploy.
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});
  });
}

function detectLocaleFromPathname(pathname) {
  const path = String(pathname || '/').toLowerCase();
  if (KOREAN_LOCALE_ENABLED && (path === '/kr' || path.startsWith('/kr/'))) {
    return 'ko';
  }
  return 'en';
}

if (typeof window !== 'undefined' && !KOREAN_LOCALE_ENABLED) {
  const path = String(window.location.pathname || '/');
  if (path === '/kr' || path.startsWith('/kr/')) {
    const nextPath = path === '/kr' ? '/' : path.slice(3);
    window.location.replace(`${nextPath}${window.location.search || ''}${window.location.hash || ''}`);
  }
}

const initialLocale = typeof window !== 'undefined'
  ? detectLocaleFromPathname(window.location.pathname)
  : 'en';
const routerBasename = initialLocale === 'ko' ? '/kr' : undefined;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <TranslationProvider locale={initialLocale}>
        <AuthProvider>
          <NotificationProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </NotificationProvider>
        </AuthProvider>
      </TranslationProvider>
    </BrowserRouter>
  </React.StrictMode>
);
