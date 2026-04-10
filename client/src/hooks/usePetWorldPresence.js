import { useCallback, useEffect, useRef, useState } from 'react';
import { postPetWorldPresence } from '../utils/api';

/**
 * WebSocket co-presence hook for Pet World villages.
 *
 * Connects to /ws/pet-world, joins the specified village room, and
 * maintains a live visitors list via push events. Falls back to HTTP
 * heartbeat polling if the WS connection fails.
 *
 * @param {string|null} hostUserId  - village owner's user id (room key)
 * @param {object}      options
 * @param {function}    options.onVisitorJoined  - callback({ userId, username, since })
 * @param {function}    options.onVisitorLeft    - callback({ userId })
 * @returns {{ visitors: Array, connected: boolean }}
 */
export default function usePetWorldPresence(hostUserId, { onVisitorJoined, onVisitorLeft } = {}) {
  const [visitors, setVisitors] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const fallbackRef = useRef(null);
  const mountedRef = useRef(true);
  const onJoinRef = useRef(onVisitorJoined);
  const onLeaveRef = useRef(onVisitorLeft);

  // Keep callback refs current
  useEffect(() => { onJoinRef.current = onVisitorJoined; }, [onVisitorJoined]);
  useEffect(() => { onLeaveRef.current = onVisitorLeft; }, [onVisitorLeft]);

  // Start HTTP fallback polling
  const startFallback = useCallback((hostId) => {
    if (fallbackRef.current) return; // already running
    const tick = () => {
      postPetWorldPresence(hostId)
        .then((res) => {
          if (mountedRef.current && res?.online) {
            setVisitors(res.online);
          }
        })
        .catch(() => {});
    };
    tick();
    fallbackRef.current = setInterval(tick, 2 * 60 * 1000);
  }, []);

  const stopFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!hostUserId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      // No token -- use HTTP fallback only
      startFallback(hostUserId);
      return () => { mountedRef.current = false; stopFallback(); };
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/pet-world?token=${encodeURIComponent(token)}`;

    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      startFallback(hostUserId);
      return () => { mountedRef.current = false; stopFallback(); };
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      stopFallback(); // WS is live, stop any fallback polling
      ws.send(JSON.stringify({ type: 'join_village', hostUserId }));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      switch (data.type) {
        case 'presence_list':
          setVisitors(data.visitors || []);
          break;

        case 'visitor_joined':
          setVisitors((prev) => {
            // Avoid duplicate
            const without = prev.filter((v) => v.user_id !== data.userId);
            return [...without, { user_id: data.userId, username: data.username, since: data.since }];
          });
          if (onJoinRef.current) onJoinRef.current(data);
          break;

        case 'visitor_left':
          setVisitors((prev) => prev.filter((v) => v.user_id !== data.userId));
          if (onLeaveRef.current) onLeaveRef.current(data);
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      wsRef.current = null;
      // Fall back to HTTP polling
      startFallback(hostUserId);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    return () => {
      mountedRef.current = false;
      stopFallback();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [hostUserId, startFallback, stopFallback]);

  return { visitors, connected };
}
