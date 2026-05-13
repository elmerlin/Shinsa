/**
 * Web push (VAPID) — wrapper around the browser's `pushManager.subscribe`
 * flow. Mirrors the web client's NotificationContext.syncPushSubscription.
 *
 * - On native (iOS/Android), this is a no-op stub. We'll wire native
 *   notifications via Firebase / APNS in a follow-up; until then the hook
 *   simply reports `supported: false` and the UI hides the toggle.
 * - On web, the hook:
 *     1. Fetches the VAPID public key from the server
 *     2. Registers /push-sw.js (the service worker) and waits for it
 *     3. Requests Notification permission (must be in a user gesture)
 *     4. Subscribes via pushManager and POSTs the resulting endpoint to
 *        the server
 *     5. Re-syncs whenever the server's public key rotates (the SW already
 *        has the previous key baked in via applicationServerKey — when it
 *        differs we unsubscribe+resubscribe).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

export type WebPushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface WebPushStatus {
  /** True only on web with the necessary browser APIs available. */
  supported: boolean;
  /** Mirrors `Notification.permission`. */
  permission: WebPushPermission;
  /** True when the viewer has an active subscription saved server-side. */
  active: boolean;
  /** True while a request is in flight. */
  syncing: boolean;
  /** Last error message from the subscribe flow (empty when none). */
  error: string;
}

const DEFAULT_STATUS: WebPushStatus = {
  supported: false,
  permission: 'unsupported',
  active: false,
  syncing: false,
  error: '',
};

function isWebPushSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToUrlBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function useWebPush(): {
  status: WebPushStatus;
  enable: () => Promise<{ ok: boolean; reason?: string }>;
  disable: () => Promise<{ ok: boolean; reason?: string }>;
} {
  const { user } = useAuth();
  const [status, setStatus] = useState<WebPushStatus>(DEFAULT_STATUS);
  const activeRef = useRef(false);

  // On mount (web only): probe the existing subscription so the toggle
  // shows the right state without forcing a permission prompt.
  useEffect(() => {
    if (!isWebPushSupported()) {
      setStatus({
        ...DEFAULT_STATUS,
        supported: false,
        permission: typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as WebPushPermission),
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const permission = (Notification.permission || 'default') as WebPushPermission;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager.getSubscription().catch(() => null);
        if (cancelled) return;
        activeRef.current = !!sub;
        setStatus({
          supported: true,
          permission,
          active: !!sub,
          syncing: false,
          error: '',
        });
      } catch {
        if (cancelled) return;
        setStatus({ supported: true, permission, active: false, syncing: false, error: '' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    if (!isWebPushSupported()) {
      setStatus((p) => ({ ...p, supported: false, error: 'Push notifications are not supported in this browser.' }));
      return { ok: false, reason: 'unsupported' };
    }
    if (!user) {
      setStatus((p) => ({ ...p, error: 'Sign in first to enable notifications.' }));
      return { ok: false, reason: 'not_logged_in' };
    }
    setStatus((p) => ({ ...p, syncing: true, error: '' }));
    try {
      const keyData = await authApi.pushPublicKey();
      const publicKey = String(keyData?.public_key || '');
      if (!keyData?.enabled || !publicKey) {
        setStatus((p) => ({ ...p, syncing: false, error: 'Push is not enabled on the server yet.' }));
        return { ok: false, reason: 'server_disabled' };
      }

      // The permission prompt MUST be triggered from a user gesture on
      // Chrome/Android — that's why this lives inside `enable()` not the
      // mount effect.
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          setStatus((p) => ({ ...p, permission: result as WebPushPermission, syncing: false }));
          return { ok: false, reason: result };
        }
      }

      let registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
      }
      if (!registration.active) {
        registration = await navigator.serviceWorker.ready;
      }

      let subscription = await registration.pushManager.getSubscription();
      // If the server's VAPID key rotated since the last subscribe, the
      // existing subscription is dead — drop it and re-subscribe so the
      // server gets a fresh endpoint signed with the current key.
      if (subscription?.options?.applicationServerKey) {
        const currentKey = arrayBufferToUrlBase64(subscription.options.applicationServerKey);
        if (currentKey && currentKey !== publicKey) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          if (endpoint) await authApi.removePushSubscription(endpoint).catch(() => {});
          subscription = null;
        }
      }
      if (!subscription) {
        // PushSubscriptionOptionsInit's `applicationServerKey` types vary
        // across DOM/Node lib versions; cast through unknown to satisfy
        // both — the Uint8Array view is what every browser actually wants.
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
      }
      const payload = subscription?.toJSON ? subscription.toJSON() : subscription;
      await authApi.savePushSubscription(payload as { endpoint: string; keys?: { p256dh?: string; auth?: string } });

      activeRef.current = true;
      setStatus({
        supported: true,
        permission: 'granted',
        active: true,
        syncing: false,
        error: '',
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not enable push notifications.';
      setStatus((p) => ({ ...p, syncing: false, error: msg }));
      return { ok: false, reason: 'error' };
    }
  }, [user]);

  const disable = useCallback(async () => {
    if (!isWebPushSupported()) return { ok: true };
    setStatus((p) => ({ ...p, syncing: true, error: '' }));
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        if (endpoint) await authApi.removePushSubscription(endpoint).catch(() => {});
      }
      activeRef.current = false;
      setStatus({
        supported: true,
        permission: (Notification.permission || 'default') as WebPushPermission,
        active: false,
        syncing: false,
        error: '',
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not disable push notifications.';
      setStatus((p) => ({ ...p, syncing: false, error: msg }));
      return { ok: false, reason: 'error' };
    }
  }, []);

  return { status, enable, disable };
}
