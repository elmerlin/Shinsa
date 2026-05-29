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
function isScrollContainer(el: HTMLElement): boolean {
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll';
}

export function useHorizontalWheelScroll() {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // NB: findNodeHandle() throws on react-native-web. getScrollableNode()
    // returns a real DOM node (web), but it can be the inner content node
    // rather than the overflow container — so start there and walk out
    // (then in) to the element that actually owns the horizontal overflow.
    const inst = ref.current as unknown as { getScrollableNode?: () => unknown } | null;
    const start = inst?.getScrollableNode?.();
    if (!start || !(start instanceof HTMLElement)) return;

    let scroller: HTMLElement | null = null;
    for (let el: HTMLElement | null = start, hops = 0; el && hops < 6; el = el.parentElement, hops++) {
      if (isScrollContainer(el)) { scroller = el; break; }
    }
    if (!scroller) {
      scroller = (Array.from(start.querySelectorAll('*')) as HTMLElement[]).find(isScrollContainer) || null;
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
