/**
 * Theme tokens for Shinsa mobile.
 *
 * The `Piu` palette mirrors `client/tailwind.config.js` (the web product). When
 * styling new components, prefer importing from `Piu` over hardcoding hex values
 * so the design stays consistent with pumpshinsa.com.
 */

import { Platform } from 'react-native';

export const Piu = {
  bg: '#0a0a1a',
  card: '#141428',
  dark: '#0d0d20',
  border: '#2a2a4a',
  accent: '#ff3366',
  accentMuted: '#ff6b8a',
  gold: '#ffd700',
  silver: '#c0c0c0',
  bronze: '#cd7f32',
  blue: '#4488ff',
  green: '#33ff66',
  text: '#ECEDEE',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  danger: '#ef4444',
  dangerText: '#fca5a5',
  /** Pink accent at the given alpha. */
  accentRgba: (a: number) => `rgba(255,51,102,${a})`,
  /** Subtle gray surface (used for chips, dividers, faint backdrops). */
  surfaceRgba: (a: number) => `rgba(148,163,184,${a})`,
};

const tintColorLight = Piu.accent;
const tintColorDark = Piu.accent;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: Piu.text,
    background: Piu.bg,
    tint: tintColorDark,
    icon: Piu.textMuted,
    tabIconDefault: Piu.textMuted,
    tabIconSelected: tintColorDark,
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
