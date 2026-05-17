import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { checkinsApi } from '@/lib/api';
import { getCheckinClientSessionId } from '@/lib/checkin-session';

/**
 * Drives the foreground proximity-ping loop that keeps the server's
 * auto-checkout sweep informed of the user's distance from the venue.
 *
 * Behavior:
 *   - Only runs when `enabled` (i.e. the user is currently checked in).
 *   - Sends a ping immediately on mount, then on an adaptive interval:
 *       10 min when the device is near the venue
 *       60 min when far (server still sweeps every minute server-side,
 *       so we don't need to be aggressive once the user has left).
 *   - Pauses while the app is backgrounded — RN doesn't deliver
 *     background JS reliably without expo-task-manager, and the server
 *     handles long away-stretches on its own via the 1-hour timeout.
 *
 * Permission UX: if the user hasn't granted location, we never throw.
 * The hook just doesn't ping, so the server falls back to its server-
 * side timeout for the eventual auto-checkout.
 *
 * Mirrors the desktop poll cadence in `client/src/App.jsx` (DOJO_RECHECK_*
 * constants). Auto-checkout from server is observed via React Query —
 * the consumer should invalidate ['checkin-status'] when this hook
 * reports the server returned `auto_checked_out: true`.
 */
const NEAR_INTERVAL_MS = 10 * 60_000;
const FAR_INTERVAL_MS = 60 * 60_000;

export function useCheckinProximity({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  // Refs so the AppState / interval handlers always see the latest value
  // without forcing a re-subscribe.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !enabledRef.current) return;
      let nextDelay = FAR_INTERVAL_MS;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) {
          // No permission → can't ping; back off to the slower cadence
          // so we don't burn battery polling the permission status.
          nextDelay = FAR_INTERVAL_MS;
        } else {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const sessionId = await getCheckinClientSessionId();
          const resp = await checkinsApi.proximity({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            client_session_id: sessionId,
          });
          // Speed up the poll when we're inside the geofence so the
          // server has a recent "near" timestamp before any auto-
          // checkout window kicks in.
          if (resp.tracked && resp.is_near) {
            nextDelay = NEAR_INTERVAL_MS;
          }
          // If the server auto-checked-out during this ping, refresh
          // the status query so the UI swaps out of "active session"
          // mode and the proximity loop ends on the next render.
          if (resp.tracked && resp.auto_checked_out) {
            queryClient.invalidateQueries({ queryKey: ['checkin-status'] });
          }
        }
      } catch {
        // Swallow — location can fail transiently (no GPS lock, airplane
        // mode). The next tick will retry.
      } finally {
        if (!cancelled && enabledRef.current) {
          timer = setTimeout(tick, nextDelay);
        }
      }
    };

    void tick();

    // Pause/resume on app state changes — there's no point pinging from
    // the background, and resuming a stale interval risks immediately
    // firing right after the user re-opens the app (which is fine,
    // actually — we *want* a ping then).
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && enabledRef.current && !timer) {
        void tick();
      }
      if (next !== 'active' && timer) {
        clearTimeout(timer);
        timer = null;
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [enabled, queryClient]);
}
