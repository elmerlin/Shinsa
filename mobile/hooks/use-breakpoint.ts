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
 * Native (iOS / Android) always returns isDesktop=false, even if a tablet
 * happens to be wider than the breakpoint — the native UI is the right
 * answer there.
 */
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_BREAKPOINT = 960;
export const SIDEBAR_EXPANDED_BREAKPOINT = 1100;

export interface Breakpoint {
  width: number;
  height: number;
  isWeb: boolean;
  isDesktop: boolean;
  /** True when desktop layout is active but the sidebar should be icon-only. */
  isCompactSidebar: boolean;
}

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const isCompactSidebar = isDesktop && width < SIDEBAR_EXPANDED_BREAKPOINT;
  return { width, height, isWeb, isDesktop, isCompactSidebar };
}
