import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { ScrollView } from 'react-native';

/**
 * Lets a horizontal ScrollView respond to a vertical mouse wheel on web by
 * translating wheel deltaY into horizontal scroll. Without this, desktop
 * mouse users can't scroll a horizontal rail at all (browsers only map the
 * wheel to vertical scroll, and a trackpad horizontal swipe isn't available
 * on a mouse).
 *
 * Native (iOS/Android) is a no-op — touch already scrolls horizontally.
 *
 * Usage:
 *   const ref = useHorizontalWheelScroll();
 *   <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false}>
 */
export function useHorizontalWheelScroll() {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sv = ref.current as unknown as { getScrollableNode?: () => unknown } | null;
    const node = sv?.getScrollableNode?.() as HTMLElement | undefined;
    if (!node || typeof node.addEventListener !== 'function') return;

    const onWheel = (e: WheelEvent) => {
      // Nothing to scroll — let the page handle it.
      if (node.scrollWidth <= node.clientWidth) return;
      // Only hijack a primarily-vertical gesture (a mouse wheel). A trackpad
      // horizontal swipe (deltaX dominant) already scrolls the rail natively,
      // so leave it alone.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return ref;
}
