import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Lets a horizontal ScrollView respond to a vertical mouse wheel on web by
 * translating wheel deltaY into horizontal scroll. Without this, desktop
 * mouse users can't scroll a horizontal rail at all (browsers only map the
 * wheel to vertical scroll, and a trackpad horizontal swipe isn't available
 * on a mouse).
 *
 * Native (iOS/Android) is a no-op — touch already scrolls horizontally.
 *
 * Pass a stable id and set the SAME id as the ScrollView's `nativeID`
 * (react-native-web maps nativeID -> DOM id, which lands on the scroll
 * container itself — far more reliable than chasing refs/getScrollableNode):
 *
 *   useHorizontalWheelScroll('pet-tab-rail');
 *   <ScrollView nativeID="pet-tab-rail" horizontal showsHorizontalScrollIndicator={false}>
 */
function isScrollContainer(el: HTMLElement): boolean {
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll';
}

export function useHorizontalWheelScroll(domId: string) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = document.getElementById(domId);
    if (!root) return;

    // nativeID lands on the ScrollView's scroll container, but fall back to a
    // descendant scroller just in case the DOM shape changes across RNW versions.
    const node: HTMLElement =
      isScrollContainer(root)
        ? root
        : ((Array.from(root.querySelectorAll('*')) as HTMLElement[]).find(isScrollContainer) || root);

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
  }, [domId]);
}
