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
 * container itself). The `ready` arg re-runs the effect once the rail is
 * actually mounted (it usually isn't on first render while data loads):
 *
 *   useHorizontalWheelScroll('pet-tab-rail', !!data);
 *   <ScrollView nativeID="pet-tab-rail" horizontal showsHorizontalScrollIndicator={false}>
 */
function isScrollContainer(el: HTMLElement): boolean {
  const ox = getComputedStyle(el).overflowX;
  return ox === 'auto' || ox === 'scroll';
}

export function useHorizontalWheelScroll(domId: string, ready: unknown = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !ready) return;

    let raf = 0;
    let tries = 0;
    let detach: (() => void) | null = null;

    const attach = () => {
      const root = document.getElementById(domId);
      if (!root) {
        if (tries++ < 60) raf = requestAnimationFrame(attach);
        return;
      }
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
      node.setAttribute('data-wheelscroll', '1'); // diagnostic marker
      detach = () => {
        node.removeEventListener('wheel', onWheel);
        node.removeAttribute('data-wheelscroll');
      };
    };

    attach();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (detach) detach();
    };
  }, [domId, ready]);
}
