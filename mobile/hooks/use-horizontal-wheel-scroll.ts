import { useEffect, useRef } from 'react';
import { Platform, findNodeHandle } from 'react-native';
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
function isHorizontalScroller(el: HTMLElement): boolean {
  const ox = getComputedStyle(el).overflowX;
  return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
}

export function useHorizontalWheelScroll() {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // react-native-web nests several divs; getScrollableNode() can return the
    // inner content node (no overflow) rather than the overflow container, so
    // resolve the actual horizontal scroller ourselves: check the host node,
    // then its ancestors, then its descendants.
    const host = findNodeHandle(ref.current) as unknown as HTMLElement | null;
    if (!host || typeof host.getBoundingClientRect !== 'function') return;

    let scroller: HTMLElement | null = null;
    for (let el: HTMLElement | null = host, hops = 0; el && hops < 6; el = el.parentElement, hops++) {
      if (isHorizontalScroller(el)) { scroller = el; break; }
    }
    if (!scroller) {
      scroller = ([...host.querySelectorAll('*')] as HTMLElement[]).find(isHorizontalScroller) || null;
    }
    if (!scroller) return;
    const node = scroller;

    const onWheel = (e: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      // Only hijack a primarily-vertical gesture (a mouse wheel). A trackpad
      // horizontal swipe (deltaX dominant) already scrolls the rail natively.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return ref;
}
