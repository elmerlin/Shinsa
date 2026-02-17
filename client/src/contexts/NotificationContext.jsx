import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../utils/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);
  const streamRef = useRef(null);
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
        icon: '/pump-shinsa-logo.svg',
        tag: `notification-${notification.id}`,
      });
      n.onclick = () => {
        window.focus();
        if (notification.link) window.location.href = notification.link;
      };
    } catch {}
  }, []);

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
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setInvitationCount(0);
      return;
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  // Request system notification permission once after login
  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  // Real-time notification stream (SSE)
  useEffect(() => {
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
          showBrowserNotification(incoming);
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
  }, [user, upsertIncomingNotification, showBrowserNotification]);

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
