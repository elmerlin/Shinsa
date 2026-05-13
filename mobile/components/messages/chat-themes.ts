/**
 * Mobile chat-theme palette. Mirrors the web `client/src/components/
 * ChatThemes.jsx` theme keys + meta but distills each theme down to the
 * handful of colors mobile actually uses (own/other bubble bg + text,
 * accent, viewport bg, header tint).
 *
 * The web theme system is built on Tailwind class names with all sorts
 * of texture overlays (CRT scanlines, MSN Plus animated nudge, etc).
 * Mobile uses a flat palette per theme and re-renders bubbles + the
 * conversation viewport accordingly. Good-enough fidelity at 1/40th
 * the surface area.
 */
import type { ThemeColors } from '@/constants/theme';

export type ChatThemeKey =
  | ''
  | 'cli' | 'aim' | 'yahoo' | 'msn' | 'skype'
  | 'winamp' | 'icq' | 'wechat' | 'discord' | 'qq'
  | 'nxa' | 'kakao' | 'line';

export const CHAT_THEME_KEYS: ChatThemeKey[] = [
  '', 'cli', 'aim', 'yahoo', 'msn', 'skype',
  'winamp', 'icq', 'wechat', 'discord', 'qq',
  'nxa', 'kakao', 'line',
];

export interface ChatThemePalette {
  label: string;
  description: string;
  /** Whether the theme reads as a light surface — use to tweak text color
   *  defaults that don't carry their own override. */
  isLight: boolean;
  /** Conversation viewport bg. */
  viewportBg: string;
  /** Composer + header surface. */
  surfaceBg: string;
  /** Hairline border used by composer + header. */
  surfaceBorder: string;
  /** Own-bubble (sender = viewer) background. */
  ownBubbleBg: string;
  /** Own-bubble text. */
  ownBubbleText: string;
  /** Other-bubble (sender = peer) background. */
  otherBubbleBg: string;
  /** Other-bubble text. */
  otherBubbleText: string;
  /** Optional border on bubbles — '' to skip. */
  bubbleBorder?: string;
  /** Color used for the dot/line variant on send button + accents. */
  accent: string;
  /** Whether the theme prefers a monospace bubble text font. */
  monospace?: boolean;
}

export interface ChatThemeMeta {
  label: string;
  description: string;
  /** Two-color preview swatch shown in the picker grid. */
  swatch: { bg: string; border: string };
}

/**
 * Build the per-theme palette. Falls through to BASE for the default key.
 * BASE adapts to whichever app theme (dark/light) the user has on so the
 * "Default" chat theme always blends in.
 */
export function getChatThemePalette(key: ChatThemeKey, base: ThemeColors): ChatThemePalette {
  const BASE: ChatThemePalette = {
    label: 'Default',
    description: 'Shinsa default',
    isLight: false,
    viewportBg: base.bg,
    surfaceBg: base.surface,
    surfaceBorder: base.border,
    ownBubbleBg: base.accent,
    ownBubbleText: base.bg,
    otherBubbleBg: base.card,
    otherBubbleText: base.text,
    bubbleBorder: base.border,
    accent: base.accent,
  };

  switch (key) {
    case 'cli':
      return {
        label: 'CLI',
        description: 'Terminal interface',
        isLight: false,
        viewportBg: '#000000',
        surfaceBg: 'rgba(0,0,0,0.95)',
        surfaceBorder: 'rgba(0,255,65,0.25)',
        ownBubbleBg: 'rgba(0,255,65,0.10)',
        ownBubbleText: '#86efac',
        otherBubbleBg: 'rgba(0,255,65,0.05)',
        otherBubbleText: '#4ade80',
        bubbleBorder: 'rgba(0,255,65,0.25)',
        accent: '#22c55e',
        monospace: true,
      };
    case 'aim':
      return {
        label: 'AIM',
        description: 'AOL Instant Messenger',
        isLight: true,
        viewportBg: '#e8e4d8',
        surfaceBg: '#fffdf5',
        surfaceBorder: '#c1b68a',
        ownBubbleBg: '#fffac8',
        ownBubbleText: '#1f1a0b',
        otherBubbleBg: '#fffaf0',
        otherBubbleText: '#1f1a0b',
        bubbleBorder: '#c1b68a',
        accent: '#a08840',
      };
    case 'yahoo':
      return {
        label: 'Yahoo!',
        description: 'Yahoo Messenger',
        isLight: false,
        viewportBg: '#1a0533',
        surfaceBg: 'rgba(40,12,80,0.95)',
        surfaceBorder: 'rgba(168,85,247,0.45)',
        ownBubbleBg: 'rgba(192,132,252,0.18)',
        ownBubbleText: '#f5d0fe',
        otherBubbleBg: 'rgba(255,255,255,0.06)',
        otherBubbleText: '#e9d5ff',
        bubbleBorder: 'rgba(192,132,252,0.4)',
        accent: '#a855f7',
      };
    case 'msn':
      return {
        label: 'MSN',
        description: 'MSN Messenger',
        isLight: true,
        viewportBg: '#d6e9f8',
        surfaceBg: '#ffffff',
        surfaceBorder: '#0078d4',
        ownBubbleBg: '#0078d4',
        ownBubbleText: '#ffffff',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#0a3a64',
        bubbleBorder: '#a0c8e8',
        accent: '#0078d4',
      };
    case 'skype':
      return {
        label: 'Skype',
        description: 'Skype messaging',
        isLight: true,
        viewportBg: '#e4f0f8',
        surfaceBg: '#ffffff',
        surfaceBorder: '#a0d0e8',
        ownBubbleBg: '#00aff0',
        ownBubbleText: '#ffffff',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#0a2a3a',
        bubbleBorder: '#cce8f6',
        accent: '#00aff0',
      };
    case 'winamp':
      return {
        label: 'Winamp',
        description: 'It really whips…',
        isLight: false,
        viewportBg: '#29292e',
        surfaceBg: '#1f1f24',
        surfaceBorder: 'rgba(0,224,0,0.45)',
        ownBubbleBg: 'rgba(0,224,0,0.16)',
        ownBubbleText: '#bbf7d0',
        otherBubbleBg: 'rgba(255,255,255,0.06)',
        otherBubbleText: '#d4d4d8',
        bubbleBorder: 'rgba(0,224,0,0.35)',
        accent: '#00e000',
      };
    case 'icq':
      return {
        label: 'ICQ',
        description: 'Uh oh!',
        isLight: true,
        viewportBg: '#eef5e6',
        surfaceBg: '#ffffff',
        surfaceBorder: '#6fb43e',
        ownBubbleBg: '#6fb43e',
        ownBubbleText: '#ffffff',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#1a3300',
        bubbleBorder: '#cce0b8',
        accent: '#6fb43e',
      };
    case 'wechat':
      return {
        label: 'WeChat',
        description: 'Weixin messaging',
        isLight: true,
        viewportBg: '#ededed',
        surfaceBg: '#ffffff',
        surfaceBorder: '#d8d8d8',
        ownBubbleBg: '#a8e072',
        ownBubbleText: '#0a1a06',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#1a1a1a',
        bubbleBorder: '#d8d8d8',
        accent: '#07c160',
      };
    case 'discord':
      return {
        label: 'Discord',
        description: 'Server vibes',
        isLight: false,
        viewportBg: '#313338',
        surfaceBg: '#2b2d31',
        surfaceBorder: 'rgba(88,101,242,0.4)',
        ownBubbleBg: 'rgba(88,101,242,0.18)',
        ownBubbleText: '#e1e6ff',
        otherBubbleBg: '#383a40',
        otherBubbleText: '#dbdee1',
        bubbleBorder: 'rgba(255,255,255,0.06)',
        accent: '#5865f2',
      };
    case 'qq':
      return {
        label: 'QQ',
        description: 'Tencent QQ',
        isLight: true,
        viewportBg: '#edf2fa',
        surfaceBg: '#ffffff',
        surfaceBorder: '#a0c8f0',
        ownBubbleBg: '#12b7f5',
        ownBubbleText: '#ffffff',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#0a2a4a',
        bubbleBorder: '#c8e0f8',
        accent: '#12b7f5',
      };
    case 'nxa':
      return {
        label: 'NXA',
        description: 'Pump It Up NX Absolute',
        isLight: false,
        viewportBg: '#0a0e14',
        surfaceBg: '#0e1320',
        surfaceBorder: 'rgba(136,204,255,0.45)',
        ownBubbleBg: 'rgba(136,204,255,0.18)',
        ownBubbleText: '#cfe6ff',
        otherBubbleBg: 'rgba(255,255,255,0.06)',
        otherBubbleText: '#cbd5e1',
        bubbleBorder: 'rgba(136,204,255,0.35)',
        accent: '#88ccff',
      };
    case 'kakao':
      return {
        label: 'KakaoTalk',
        description: '카카오톡',
        isLight: true,
        viewportBg: '#b2c7d9',
        surfaceBg: '#ffffff',
        surfaceBorder: '#94adc4',
        ownBubbleBg: '#fee500',
        ownBubbleText: '#1a1a1a',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#1a1a1a',
        bubbleBorder: '#d8e0e8',
        accent: '#fee500',
      };
    case 'line':
      return {
        label: 'LINE',
        description: 'ライン messaging',
        isLight: false,
        viewportBg: '#7b96a8',
        surfaceBg: '#5e7585',
        surfaceBorder: 'rgba(6,199,85,0.55)',
        ownBubbleBg: '#06c755',
        ownBubbleText: '#ffffff',
        otherBubbleBg: '#ffffff',
        otherBubbleText: '#0a2a18',
        bubbleBorder: 'rgba(0,0,0,0.08)',
        accent: '#06c755',
      };
    case '':
    default:
      return BASE;
  }
}

/** Lightweight meta for the picker grid (no theme color resolution). */
export const CHAT_THEME_META: Record<ChatThemeKey, ChatThemeMeta> = {
  '': { label: 'Default', description: 'Shinsa default', swatch: { bg: '#1B1B1E', border: '#FFC400' } },
  cli: { label: 'CLI', description: 'Terminal interface', swatch: { bg: '#000000', border: '#22c55e' } },
  aim: { label: 'AIM', description: 'AOL Instant Messenger', swatch: { bg: '#e8e4d8', border: '#c1b68a' } },
  yahoo: { label: 'Yahoo!', description: 'Yahoo Messenger', swatch: { bg: '#1a0533', border: '#a855f7' } },
  msn: { label: 'MSN', description: 'MSN Messenger', swatch: { bg: '#d6e9f8', border: '#0078d4' } },
  skype: { label: 'Skype', description: 'Skype messaging', swatch: { bg: '#e4f0f8', border: '#00aff0' } },
  winamp: { label: 'Winamp', description: 'It really whips…', swatch: { bg: '#29292e', border: '#00e000' } },
  icq: { label: 'ICQ', description: 'Uh oh!', swatch: { bg: '#eef5e6', border: '#6fb43e' } },
  wechat: { label: 'WeChat', description: 'Weixin messaging', swatch: { bg: '#ededed', border: '#07c160' } },
  discord: { label: 'Discord', description: 'Server vibes', swatch: { bg: '#313338', border: '#5865f2' } },
  qq: { label: 'QQ', description: 'Tencent QQ', swatch: { bg: '#edf2fa', border: '#12b7f5' } },
  nxa: { label: 'NXA', description: 'Pump It Up NX Absolute', swatch: { bg: '#0a0e14', border: '#88ccff' } },
  kakao: { label: 'KakaoTalk', description: '카카오톡', swatch: { bg: '#b2c7d9', border: '#fee500' } },
  line: { label: 'LINE', description: 'ライン messaging', swatch: { bg: '#7b96a8', border: '#06c755' } },
};
