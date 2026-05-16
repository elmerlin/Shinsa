import { useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';

/**
 * react-native-web's `RefreshControl` is purely cosmetic on web — it doesn't
 * bind a touch gesture, so on new.pumpshinsa.com pull-down does nothing.
 * The global CSS also sets `overscroll-behavior: none` on body to prevent
 * rubber-banding, which suppresses Chrome's native pull-to-refresh.
 *
 * This hook re-implements the gesture: when the user touches the scroller
 * at scrollTop=0 and drags more than `threshold` pixels down (without
 * scrolling up first), it calls `onRefresh` once. Released without
 * crossing the threshold cancels.
 *
 * No-op on native — use `RefreshControl` there (already wired everywhere).
 *
 * Returns a ref to attach to the ScrollView. ScrollView's ref exposes
 * `getScrollableNode()` in RN-Web which returns the underlying DOM div;
 * we fall back to the raw ref for older RN-Web builds.
 */
export function useWebPullToRefresh(
  onRefresh: () => void | Promise<void>,
  options: { threshold?: number; enabled?: boolean; externalRef?: RefObject<unknown> } = {},
) {
  const { threshold = 70, enabled = true, externalRef } = options;
  // Allow the caller to bring their own ref (e.g. FlatList already needs
  // one for scrollToOffset). When omitted we create a fresh one.
  const internalRef = useRef<unknown>(null);
  const ref = externalRef ?? internalRef;
  // Stash the latest callback in a ref so the effect doesn't rebind on
  // every parent re-render (caller doesn't have to memoize).
  const handlerRef = useRef(onRefresh);
  useEffect(() => { handlerRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const instance = ref.current as { getScrollableNode?: () => HTMLElement } | HTMLElement | null;
    if (!instance) return;
    const node: HTMLElement | null =
      typeof (instance as { getScrollableNode?: () => HTMLElement }).getScrollableNode === 'function'
        ? (instance as { getScrollableNode: () => HTMLElement }).getScrollableNode()
        : (instance as HTMLElement);
    if (!node || typeof node.addEventListener !== 'function') return;

    let startY: number | null = null;
    let triggered = false;

    const onStart = (e: TouchEvent) => {
      // Only arm the gesture when the scroller is already at the top.
      if (node.scrollTop > 0) return;
      startY = e.touches[0]?.clientY ?? null;
      triggered = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null || triggered) return;
      const y = e.touches[0]?.clientY;
      if (y === undefined) return;
      if (y - startY > threshold) {
        triggered = true;
        try {
          const result = handlerRef.current();
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            (result as Promise<unknown>).catch(() => { /* swallow — UI surfaces failures */ });
          }
        } catch {
          /* swallow — UI surfaces failures */
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
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, threshold]);

  return ref;
}
