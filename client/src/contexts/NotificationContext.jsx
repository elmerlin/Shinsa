import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../utils/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) return;
    getNotifications().then(data => {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
      setInvitationCount(data.invitation_count || 0);
    }).catch(() => {});
  }, [user]);

  // Poll every 15 seconds when logged in
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
