import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getPushPublicKey,
  savePushSubscription,
} from '../utils/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

function supportsWebPush() {
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function NotificationProvider({ children }) {
  const { user, loading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);
  const streamRef = useRef(null);
  const webPushActiveRef = useRef(false);

  const parseNotificationDate = (value) => {
    const raw = String(value || '');
    if (!raw) return 0;
    const normalized = raw.endsWith('Z') ? raw : `${raw}Z`;
    const ms = new Date(normalized).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  const upsertIncomingNotification = useCallback((notification) => {
    if (!notification?.id) return;
    setNotifications(prev => {
      if (prev.some(n => n.id === notification.id)) return prev;
      const merged = [notification, ...prev];
      merged.sort((a, b) => parseNotificationDate(b.created_at) - parseNotificationDate(a.created_at));
      return merged.slice(0, 50);
    });
    if (!notification.read) {
      setUnreadCount(c => c + 1);
    }
  }, []);

  const showBrowserNotification = useCallback((notification) => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(notification.title || 'New notification', {
        body: notification.message || 'You have a new notification',
        icon: '/icons/app-icon-192.png',
        tag: `notification-${notification.id}`,
      });
      n.onclick = () => {
        window.focus();
        if (notification.link) window.location.href = notification.link;
      };
    } catch {}
  }, []);

  const syncPushSubscription = useCallback(async () => {
    webPushActiveRef.current = false;
    if (!user) return;
    if (!supportsWebPush()) return;

    try {
      const keyData = await getPushPublicKey();
      const publicKey = String(keyData?.public_key || '');
      if (!keyData?.enabled || !publicKey) return;

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return;

      let registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
      }
      if (!registration.active) {
        registration = await navigator.serviceWorker.ready;
      }
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          appServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const payload = subscription?.toJSON ? subscription.toJSON() : subscription;
      await savePushSubscription(payload);
      webPushActiveRef.current = true;
    } catch {
      webPushActiveRef.current = false;
    }
  }, [user]);

  const refresh = useCallback(() => {
    if (!user) return;
    getNotifications().then(data => {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
      setInvitationCount(data.invitation_count || 0);
    }).catch(() => {});
  }, [user]);

  // Poll every 15 seconds when logged in (fallback + invitations count)
  useEffect(() => {
    if (loading) return undefined;
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setInvitationCount(0);
      return;
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [user, refresh, loading]);

  // Request notification permission once after login (used by web push + in-tab fallback)
  useEffect(() => {
    if (loading || !user) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user, loading]);

  // Subscribe browser for web push after login
  useEffect(() => {
    if (loading) return;
    syncPushSubscription();
  }, [loading, syncPushSubscription]);

  // Real-time notification stream (SSE)
  useEffect(() => {
    if (loading) return undefined;
    if (!user) return undefined;
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    let closed = false;
    let retryTimer = null;

    const connect = () => {
      if (closed) return;
      const source = new EventSource(`/api/auth/notifications/stream?token=${encodeURIComponent(token)}`);
      streamRef.current = source;

      source.addEventListener('notification', (event) => {
        try {
          const incoming = JSON.parse(event.data || '{}');
          if (!incoming?.id) return;
          upsertIncomingNotification(incoming);
          if (!webPushActiveRef.current) {
            showBrowserNotification(incoming);
          }
        } catch {}
      });

      source.onerror = () => {
        source.close();
        if (closed) return;
        retryTimer = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, [user, upsertIncomingNotification, showBrowserNotification, loading]);

  const markRead = async (id) => {
    await markNotificationRead(id);
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: 1 } : x));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications(n => n.map(x => ({ ...x, read: 1 })));
    setUnreadCount(0);
  };

  const dismiss = async (id) => {
    await deleteNotification(id);
    const wasUnread = notifications.find(n => n.id === id && !n.read);
    setNotifications(n => n.filter(x => x.id !== id));
    if (wasUnread) setUnreadCount(c => Math.max(0, c - 1));
  };

  const totalBadge = unreadCount + invitationCount;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, invitationCount, totalBadge, refresh, markRead, markAllRead, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
