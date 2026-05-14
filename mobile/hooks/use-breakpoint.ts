/**
 * Responsive breakpoint hook for the web build.
 *
 * Above DESKTOP_BREAKPOINT (960 px) the app renders its desktop variant:
 * persistent left sidebar, no bottom tabs, master–detail layouts, right
 * rails instead of bottom sheets. Below the breakpoint the existing
 * mobile UI renders byte-for-byte unchanged.
 *
 * Between DESKTOP_BREAKPOINT and SIDEBAR_EXPANDED_BREAKPOINT (1100 px) the
 * sidebar collapses to an icon-only rail so screen real estate stays for
 * the actual content.
 *
 * `isPortrait` is true on desktop when the viewport is taller than it is
 * wide — common on rotated / vertical monitors. Screens that work best
 * with side-by-side panes on landscape (e.g. the Live session viewer)
 * branch on this to stack panes vertically instead.
 *
 * Native (iOS / Android) always returns isDesktop=false, even if a tablet
 * happens to be wider than the breakpoint — the native UI is the right
 * answer there.
 */
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_BREAKPOINT = 960;
export const SIDEBAR_EXPANDED_BREAKPOINT = 1100;
/** Minimum width at which a desktop viewport still counts as "wide
 *  enough to show two columns side-by-side." Below this we want desktop
 *  layouts to favour vertical stacks. */
export const WIDE_DESKTOP_BREAKPOINT = 1200;

export interface Breakpoint {
  width: number;
  height: number;
  isWeb: boolean;
  isDesktop: boolean;
  /** True when desktop layout is active but the sidebar should be icon-only. */
  isCompactSidebar: boolean;
  /** Aspect ratio is portrait (height > width). Calculated for any
   *  platform — screens choose how to react. */
  isPortrait: boolean;
  /** Desktop AND portrait — the "rotated monitor" combo where horizontal
   *  master-detail layouts feel cramped. Screens use this to stack
   *  vertically instead. */
  isDesktopPortrait: boolean;
  /** Desktop AND wide enough for two full columns side-by-side. */
  isWideDesktop: boolean;
}

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const isCompactSidebar = isDesktop && width < SIDEBAR_EXPANDED_BREAKPOINT;
  const isPortrait = height > width;
  const isDesktopPortrait = isDesktop && isPortrait;
  const isWideDesktop = isDesktop && width >= WIDE_DESKTOP_BREAKPOINT;
  return {
    width, height, isWeb, isDesktop, isCompactSidebar,
    isPortrait, isDesktopPortrait, isWideDesktop,
  };
}
