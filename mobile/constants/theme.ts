/**
 * Pump Shinsa theme tokens.
 *
 * Two themes only: Pump Gold Dark (default) and Pump Gold Light. Tokens are
 * sourced from `mobile/assets/brand/` (the brand pack) — see
 * `feedback_avoid_swiftui_ios_design.md` in user memory.
 *
 * Always read colors via `useTheme()` / `useThemedStyles(...)`; never hardcode
 * hex values in screen styles.
 */

import { Platform } from 'react-native';

export type ThemeKey = 'dark' | 'light' | 'classic';

export interface ThemeColors {
  /** Page background. */
  bg: string;
  /** Slightly raised surface (tab bar bg, header bg). */
  surface: string;
  /** Card background (post card, list section, etc.). */
  card: string;
  /** Translucent neutral fill — used for input bg, faint chips. */
  surfaceMuted: string;
  /** Subtle hairline border. */
  border: string;
  /** Stronger border for emphasized cards. */
  borderStrong: string;
  /** Brand accent (used for active states, CTAs, highlights). */
  accent: string;
  /** Lighter accent for hover/secondary emphasis. */
  accentMuted: string;
  /** Deeper accent for pressed/legible-on-light states. */
  accentDeep: string;
  /** Subtle accent backdrop (used as low-opacity fill). */
  accentTint: string;
  /** Primary text on bg. */
  text: string;
  /** De-emphasized text (subtitles, meta). */
  textMuted: string;
  /** Very dim text (footnotes, placeholder). */
  textDim: string;
  /** Inverse text (used on accent buttons). */
  textOnAccent: string;
  /** Error/warning text. */
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  /** Success/clear color. */
  success: string;
  /** Skill/category accent (kept distinct from gold). */
  skill: string;
  /** Tier colors (gold/silver/bronze). */
  gold: string;
  silver: string;
  bronze: string;
  /** Loading spinner color. */
  spinner: string;
}

const BRAND = {
  gold: '#FFC400',
  goldHighlight: '#FFE06B',
  goldDeep: '#F2A900',
  white: '#F7FAFF',
  black: '#050505',
  charcoal: '#101012',
  graphite: '#1B1B1E',
  muted: '#7C7C82',
};

const dark: ThemeColors = {
  bg: BRAND.black,
  surface: BRAND.charcoal,
  card: BRAND.graphite,
  surfaceMuted: 'rgba(124,124,130,0.12)',
  border: 'rgba(124,124,130,0.18)',
  borderStrong: 'rgba(124,124,130,0.32)',
  accent: BRAND.gold,
  accentMuted: BRAND.goldHighlight,
  accentDeep: BRAND.goldDeep,
  accentTint: 'rgba(255,196,0,0.12)',
  text: BRAND.white,
  textMuted: '#A8A8AE',
  textDim: BRAND.muted,
  textOnAccent: BRAND.black,
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.1)',
  dangerBorder: 'rgba(239,68,68,0.3)',
  success: '#33ff66',
  skill: '#c084fc',
  gold: BRAND.gold,
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  spinner: BRAND.gold,
};

const light: ThemeColors = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  surfaceMuted: 'rgba(5,5,5,0.05)',
  border: 'rgba(5,5,5,0.1)',
  borderStrong: 'rgba(5,5,5,0.2)',
  accent: BRAND.goldDeep,
  accentMuted: BRAND.gold,
  accentDeep: '#B27D00',
  accentTint: 'rgba(242,169,0,0.1)',
  text: BRAND.black,
  textMuted: '#3F3F46',
  textDim: BRAND.muted,
  textOnAccent: BRAND.black,
  danger: '#dc2626',
  dangerBg: 'rgba(220,38,38,0.08)',
  dangerBorder: 'rgba(220,38,38,0.2)',
  success: '#16a34a',
  skill: '#9333ea',
  gold: BRAND.goldDeep,
  silver: '#737373',
  bronze: '#a16207',
  spinner: BRAND.goldDeep,
};

// "Classic" — the original pumpshinsa.com look: deep indigo-navy surfaces with
// the signature PIU hot-pink accent. Opt-in only (Pump Gold dark/light remain
// the default brand); added by user request.
const classic: ThemeColors = {
  bg: '#0a0a1a',
  surface: '#12122a',
  card: '#141428',
  surfaceMuted: 'rgba(128,140,200,0.12)',
  border: 'rgba(128,140,200,0.18)',
  borderStrong: 'rgba(128,140,200,0.34)',
  accent: '#ff3366',
  accentMuted: '#ff6b8f',
  accentDeep: '#d81e4a',
  accentTint: 'rgba(255,51,102,0.14)',
  text: '#F7FAFF',
  textMuted: '#9aa3c0',
  textDim: '#6b7299',
  textOnAccent: '#FFFFFF',
  danger: '#ef4444',
  dangerBg: 'rgba(239,68,68,0.12)',
  dangerBorder: 'rgba(239,68,68,0.32)',
  success: '#33ff66',
  skill: '#c084fc',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  spinner: '#ff3366',
};

export const themes: Record<ThemeKey, ThemeColors> = { dark, light, classic };

export const DEFAULT_THEME_KEY: ThemeKey = 'dark';

/**
 * Legacy export kept for the Expo template's `Colors[colorScheme].tint` usage
 * in (tabs)/_layout.tsx — those will move to `useTheme()` going forward.
 */
export const Colors = {
  light: {
    text: light.text,
    background: light.bg,
    tint: light.accent,
    icon: light.textMuted,
    tabIconDefault: light.textMuted,
    tabIconSelected: light.accent,
  },
  dark: {
    text: dark.text,
    background: dark.bg,
    tint: dark.accent,
    icon: dark.textMuted,
    tabIconDefault: dark.textMuted,
    tabIconSelected: dark.accent,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
