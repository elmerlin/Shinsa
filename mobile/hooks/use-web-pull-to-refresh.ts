import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { Platform } from 'react-native';

interface Options {
  /** Pixels of pull required before release triggers refresh. Default 70. */
  threshold?: number;
  /** Set to false to no-op (e.g. while a refresh is already in flight). */
  enabled?: boolean;
  /**
   * If the consumer needs the underlying ScrollView / FlatList ref for
   * something else (FlatList's `scrollToOffset`, etc.), pass it here and
   * the hook will forward the instance into it on mount/unmount.
   */
  externalRef?: MutableRefObject<unknown> | null;
}

/**
 * Resolve the consumer's ref instance down to an actual scrollable DOM
 * node. RN-Web's `ScrollView` and `FlatList` (via `VirtualizedList`) both
 * expose `getScrollableNode()`; FlatList sometimes only exposes it via
 * its scroll responder. We try each shape and fall back to assuming the
 * ref is already the DOM node (which happens when the host wraps things
 * in a plain `View` whose ref is the underlying `div`).
 */
function resolveScrollableNode(instance: unknown): HTMLElement | null {
  if (!instance) return null;
  const tryFn = (fn: unknown): HTMLElement | null => {
    if (typeof fn !== 'function') return null;
    try {
      const result = (fn as () => unknown).call(instance);
      if (result && typeof (result as HTMLElement).addEventListener === 'function') {
        return result as HTMLElement;
      }
    } catch {
      /* swallow — probe only */
    }
    return null;
  };
  const recordInstance = instance as Record<string, unknown>;
  const direct = tryFn(recordInstance.getScrollableNode);
  if (direct) return direct;
  if (typeof recordInstance.getScrollResponder === 'function') {
    try {
      const responder = (recordInstance.getScrollResponder as () => unknown).call(instance);
      if (responder) {
        const fromResponder = tryFn((responder as Record<string, unknown>).getScrollableNode);
        if (fromResponder) return fromResponder;
      }
    } catch {
      /* swallow — probe only */
    }
  }
  if (typeof (instance as HTMLElement).addEventListener === 'function') {
    return instance as HTMLElement;
  }
  return null;
}

/**
 * react-native-web's `RefreshControl` is purely cosmetic on web — it
 * doesn't bind a touch gesture, so on new.pumpshinsa.com pulling down
 * does nothing. The global CSS also sets `overscroll-behavior: none` on
 * body to prevent rubber-banding, which suppresses Chrome's native
 * pull-to-refresh too.
 *
 * This hook re-implements the gesture: returns a **callback ref** that
 * the consumer attaches to a `ScrollView` or `FlatList`. When the user
 * touches the scroller at `scrollTop=0` and drags more than `threshold`
 * pixels down without scrolling up first, it calls `onRefresh`. Released
 * without crossing the threshold cancels.
 *
 * No-op on native — use `RefreshControl` there (already wired everywhere).
 *
 * The callback ref pattern (vs returning an object ref) means we re-bind
 * listeners whenever the underlying component remounts — e.g. Feed's
 * FlatList only mounts after `isLoading` resolves, which a one-shot
 * `useEffect` would miss because the effect runs before the FlatList ref
 * is populated.
 */
export function useWebPullToRefresh(
  onRefresh: () => void | Promise<void>,
  options: Options = {},
): (instance: unknown) => void {
  const { threshold = 70, enabled = true, externalRef } = options;
  // Stash the latest callback so the ref-setter doesn't have to rebind on
  // every parent re-render.
  const handlerRef = useRef(onRefresh);
  useEffect(() => { handlerRef.current = onRefresh; }, [onRefresh]);
  const enabledRef = useRef(enabled);
  const thresholdRef = useRef(threshold);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);

  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (instance: unknown) => {
      // Detach from the previous node if there was one (covers remounts).
      cleanupRef.current?.();
      cleanupRef.current = null;

      // Forward to the caller's ref if provided (FlatList's scrollToOffset
      // etc. still works). Forward null on unmount too.
      if (externalRef) externalRef.current = instance;

      if (Platform.OS !== 'web' || !enabledRef.current || instance == null) return;
      const node = resolveScrollableNode(instance);
      if (!node) return;

      let startY: number | null = null;
      let triggered = false;

      const onStart = (e: TouchEvent) => {
        if (node.scrollTop > 0) return;
        startY = e.touches[0]?.clientY ?? null;
        triggered = false;
      };
      const onMove = (e: TouchEvent) => {
        if (startY === null || triggered) return;
        const y = e.touches[0]?.clientY;
        if (y === undefined) return;
        if (y - startY > thresholdRef.current) {
          triggered = true;
          try {
            const result = handlerRef.current();
            if (result && typeof (result as Promise<unknown>).then === 'function') {
              (result as Promise<unknown>).catch(() => { /* UI surfaces failures */ });
            }
          } catch {
            /* UI surfaces failures */
          }
        }
      };
      const onEnd = () => {
        startY = null;
        triggered = false;
      };

      node.addEventListener('touchstart', onStart, { passive: true });
      node.addEventListener('touchmove', onMove, { passive: true });
      node.addEventListener('touchend', onEnd, { passive: true });
      node.addEventListener('touchcancel', onEnd, { passive: true });
      cleanupRef.current = () => {
        node.removeEventListener('touchstart', onStart);
        node.removeEventListener('touchmove', onMove);
        node.removeEventListener('touchend', onEnd);
        node.removeEventListener('touchcancel', onEnd);
      };
    },
    [externalRef],
  );

  // Tear down on consumer unmount too — defensive in case the ref
  // callback isn't called with null (e.g. parent unmount without remount).
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  return setRef;
}
