import React from 'react';

// ---------------------------------------------------------------------------
//  Theme definitions
// ---------------------------------------------------------------------------
// Each theme returns an object of style overrides consumed by ConversationView
// and MessageBubble.  Keys:
//   fontFamily       – CSS font-family for the entire chat area
//   monospace        – if true, apply monospace to message text
//   viewportBg       – Tailwind / inline bg for the messages viewport
//   viewportStyle    – optional inline style for the viewport
//   headerBg         – header bar background
//   headerText       – header title color class
//   headerBorder     – header bottom border class
//   composerBg       – chat input area background
//   composerBorder   – composer border class
//   composerInputBg  – the actual text-input bg
//   composerInputText – input text color
//   ownBubbleBg      – own-message bubble background
//   ownBubbleBorder  – own-message bubble border
//   ownBubbleText    – own-message text color
//   otherBubbleBg    – other-message bubble background
//   otherBubbleBorder – other-message bubble border
//   otherBubbleText  – other-message text color
//   bubbleRadius     – border-radius for bubbles
//   senderNameClass  – class for sender name label
//   showAvatars      – whether to show small avatars next to messages
//   timestampClass   – class for timestamp text
//   shadow           – box-shadow for bubbles (empty string = none)
//   extraViewportClass – additional viewport classes
//   extraBubbleClass – extra class on every bubble
//   decorOverlay     – optional JSX overlay rendered inside the viewport
// ---------------------------------------------------------------------------

export const THEME_KEYS = ['', 'cli', 'aim', 'yahoo', 'msn', 'skype', 'winamp', 'icq', 'wechat', 'discord', 'qq', 'nxa', 'kakao', 'line'];

export const THEME_META = {
  '': { label: 'Default', description: 'Shinsa dark theme', preview: 'bg-piu-card border-piu-border/60' },
  cli: { label: 'CLI', description: 'Terminal interface', preview: 'bg-black border-green-500/50' },
  aim: { label: 'AIM', description: 'AOL Instant Messenger', preview: 'bg-[#e8e4d8] border-[#c1b68a]' },
  yahoo: { label: 'Yahoo!', description: 'Yahoo Messenger', preview: 'bg-[#1a0533] border-purple-500/50' },
  msn: { label: 'MSN', description: 'MSN Messenger', preview: 'bg-[#d6e9f8] border-[#0078d4]' },
  skype: { label: 'Skype', description: 'Skype messaging', preview: 'bg-[#e4f0f8] border-[#00aff0]' },
  winamp: { label: 'Winamp', description: 'It really whips…', preview: 'bg-[#29292e] border-[#00e000]/50' },
  icq: { label: 'ICQ', description: 'Uh oh!', preview: 'bg-[#eef5e6] border-[#6fb43e]' },
  wechat: { label: 'WeChat', description: 'Weixin messaging', preview: 'bg-[#ededed] border-[#07c160]' },
  discord: { label: 'Discord', description: 'Server vibes', preview: 'bg-[#313338] border-[#5865f2]' },
  qq: { label: 'QQ', description: 'Tencent QQ', preview: 'bg-[#edf2fa] border-[#12b7f5]' },
  nxa: { label: 'NXA', description: 'Pump It Up NX Absolute', preview: 'bg-[#0a0e14] border-[#88ccff]/50' },
  kakao: { label: 'KakaoTalk', description: '카카오톡', preview: 'bg-[#b2c7d9] border-[#fee500]' },
  line: { label: 'LINE', description: 'ライン messaging', preview: 'bg-[#7b96a8] border-[#06c755]' },
};

const BASE = {
  fontFamily: '',
  monospace: false,
  isLight: false,
  viewportBg: '',
  viewportStyle: {},
  headerBg: 'bg-piu-card/92 backdrop-blur-md',
  headerText: 'text-white',
  headerBorder: 'border-piu-border/40',
  composerBg: 'bg-piu-card/94 backdrop-blur-md',
  composerBorder: 'border-piu-border/40',
  composerInputBg: '',
  composerInputText: '',
  ownBubbleBg: 'bg-cyan-500/10',
  ownBubbleBorder: 'border-cyan-400/20',
  ownBubbleText: '',
  otherBubbleBg: 'bg-piu-dark/55',
  otherBubbleBorder: 'border-piu-border/60',
  otherBubbleText: '',
  bubbleRadius: '1.25rem',
  senderNameClass: 'text-[10px] font-display font-bold uppercase tracking-[0.18em] text-gray-500',
  showAvatars: false,
  timestampClass: '',
  shadow: '0 8px 20px rgba(0,0,0,0.14)',
  extraViewportClass: '',
  extraBubbleClass: '',
  decorOverlay: null,
  // ── extended theme properties ──
  layoutMode: 'bubbles',
  msgEntranceClass: 'chat-entrance-fade-up',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-cyan-400',
  typingText: '{user} is typing...',
  themeReactions: null,
  themeStickerPacks: null,
  sendButtonClass: '',
  sendButtonLabel: null,
  composerExtraClass: '',
  bgAnimationClass: '',
  headerExtraClass: '',
  reactionPillClass: '',
  avatarShape: 'circle',
  avatarSize: 'sm',
  senderNameInline: false,
  timestampInline: false,
};

function buildTheme(overrides) {
  return { ...BASE, ...overrides };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const cli = buildTheme({
  fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  monospace: true,
  viewportBg: 'bg-black',
  viewportStyle: {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(0,255,65,0.03) 23px, rgba(0,255,65,0.03) 24px)',
  },
  headerBg: 'bg-black/95 backdrop-blur-none',
  headerText: 'text-green-400',
  headerBorder: 'border-green-500/25',
  composerBg: 'bg-black/95 backdrop-blur-none',
  composerBorder: 'border-green-500/25',
  composerInputBg: 'bg-black',
  composerInputText: 'text-green-400 placeholder:text-green-700',
  ownBubbleBg: 'bg-green-500/8',
  ownBubbleBorder: 'border-green-500/25',
  ownBubbleText: 'text-green-300',
  otherBubbleBg: 'bg-green-500/5',
  otherBubbleBorder: 'border-green-500/15',
  otherBubbleText: 'text-green-400',
  bubbleRadius: '0',
  senderNameClass: 'text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-green-600',
  showAvatars: false,
  shadow: 'none',
  extraBubbleClass: 'font-mono',
  decorOverlay: (
    <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]" style={{
      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,255,65,0.15) 1px, rgba(0,255,65,0.15) 2px)',
      backgroundSize: '100% 3px',
    }} />
  ),
  layoutMode: 'terminal',
  msgEntranceClass: 'chat-entrance-typewriter',
  typingIndicator: 'cursor',
  typingIndicatorClass: 'text-green-400 font-mono text-sm',
  typingText: '{user}@shinsa:~$ █',
  bgAnimationClass: 'chat-bg-crt-flicker',
  sendButtonLabel: 'EXEC',
  sendButtonClass: 'font-mono bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 rounded',
  senderNameInline: true,
  reactionPillClass: 'font-mono border-green-500/20 bg-green-500/8 text-green-400',
  themeStickerPacks: ['devit'],
  themeReactions: ['pump', 'fire', 'mind_blown'],
});

// ── AIM ─────────────────────────────────────────────────────────────────────
const aim = buildTheme({
  fontFamily: "'Trebuchet MS', 'Arial', sans-serif",
  isLight: true,
  viewportBg: 'bg-white',
  viewportStyle: {},
  headerBg: 'bg-[#ffde00]',
  headerText: 'text-[#333]',
  headerBorder: 'border-[#c8aa00]',
  composerBg: 'bg-[#e8e4d8]',
  composerBorder: 'border-[#c1b68a]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-gray-900 placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#fff8c4]',
  ownBubbleBorder: 'border-[#e6d46a]',
  ownBubbleText: 'text-[#333]',
  otherBubbleBg: 'bg-[#e8e4d8]',
  otherBubbleBorder: 'border-[#c1b68a]',
  otherBubbleText: 'text-[#333]',
  bubbleRadius: '0.75rem',
  senderNameClass: 'text-[11px] font-bold text-[#0057ae]',
  showAvatars: true,
  shadow: '0 1px 3px rgba(0,0,0,0.12)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-aim-pop',
  typingIndicator: 'text',
  typingText: '{user} is typing...',
  typingIndicatorClass: 'italic text-[#999] text-xs',
  sendButtonClass: 'bg-[#ffde00] text-[#333] hover:bg-[#ffe63b] font-bold rounded-md',
  avatarShape: 'square',
  avatarSize: 'md',
  headerExtraClass: 'border-b-2',
  themeReactions: ['heart', 'fire', 'clap'],
  themeStickerPacks: ['dojocat', 'heavybreathing_chicken'],
});

// ── Yahoo Messenger ─────────────────────────────────────────────────────────
const yahoo = buildTheme({
  fontFamily: "'Arial', 'Helvetica', sans-serif",
  viewportBg: 'bg-[#1a0533]',
  viewportStyle: {
    backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(128,0,255,0.12) 0%, transparent 60%)',
  },
  headerBg: 'bg-gradient-to-r from-[#4a0e78] to-[#720e9e]',
  headerText: 'text-white',
  headerBorder: 'border-purple-500/30',
  composerBg: 'bg-[#2a1045]/95',
  composerBorder: 'border-purple-500/30',
  composerInputBg: 'bg-[#1a0533]',
  composerInputText: 'text-purple-100 placeholder:text-purple-400/50',
  ownBubbleBg: 'bg-purple-500/15',
  ownBubbleBorder: 'border-purple-400/30',
  ownBubbleText: 'text-purple-100',
  otherBubbleBg: 'bg-purple-900/30',
  otherBubbleBorder: 'border-purple-500/20',
  otherBubbleText: 'text-purple-200',
  bubbleRadius: '1rem',
  senderNameClass: 'text-[10px] font-bold uppercase tracking-wide text-purple-400',
  showAvatars: true,
  shadow: '0 4px 16px rgba(74,14,120,0.25)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-slide-right',
  typingIndicator: 'wave',
  typingIndicatorClass: 'text-purple-300',
  bgAnimationClass: 'chat-bg-yahoo-nebula',
  sendButtonClass: 'bg-purple-600 hover:bg-purple-500 text-white rounded-lg',
  themeStickerPacks: ['mope_flower', 'dojocat_pixiu'],
  themeReactions: ['heart', 'pump', 'fire'],
});

// ── MSN Messenger ───────────────────────────────────────────────────────────
const msn = buildTheme({
  fontFamily: "'Segoe UI', 'Tahoma', 'Verdana', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#d6e9f8]',
  viewportStyle: {
    backgroundImage: 'linear-gradient(180deg, #d6e9f8 0%, #eaf3fb 100%)',
  },
  headerBg: 'bg-gradient-to-r from-[#1b6ec2] to-[#3b9eff]',
  headerText: 'text-white',
  headerBorder: 'border-[#1460a8]',
  composerBg: 'bg-[#ecf2f8]',
  composerBorder: 'border-[#b4cde2]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-gray-900 placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#dcefff]',
  ownBubbleBorder: 'border-[#5caaef]/50',
  ownBubbleText: 'text-[#1a3e5c]',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#b4cde2]',
  otherBubbleText: 'text-[#1a3e5c]',
  bubbleRadius: '0.85rem',
  senderNameClass: 'text-[11px] font-bold text-[#1b6ec2]',
  showAvatars: true,
  shadow: '0 1px 4px rgba(27,110,194,0.1)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-msn-slide',
  typingIndicator: 'text',
  typingText: '{user} is writing a message...',
  typingIndicatorClass: 'text-[#1b6ec2] text-xs italic',
  bgAnimationClass: 'chat-bg-msn-gradient',
  sendButtonClass: 'bg-[#1b6ec2] hover:bg-[#2a7ed6] text-white rounded',
  avatarShape: 'rounded',
  headerExtraClass: 'chat-header-msn-shine',
  themeStickerPacks: ['buu', 'dojocat'],
  themeReactions: ['heart', 'clap', 'pump'],
});

// ── Skype ───────────────────────────────────────────────────────────────────
const skype = buildTheme({
  fontFamily: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#e4f0f8]',
  viewportStyle: {},
  headerBg: 'bg-[#00aff0]',
  headerText: 'text-white',
  headerBorder: 'border-[#009ad9]',
  composerBg: 'bg-white',
  composerBorder: 'border-[#d4e3ed]',
  composerInputBg: 'bg-[#f5f8fa]',
  composerInputText: 'text-gray-900 placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#00aff0]',
  ownBubbleBorder: 'border-[#00aff0]',
  ownBubbleText: 'text-white',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#e0e8ed]',
  otherBubbleText: 'text-[#1b2a3b]',
  bubbleRadius: '1.15rem',
  senderNameClass: 'text-[11px] font-semibold text-[#00aff0]',
  showAvatars: true,
  shadow: '0 1px 3px rgba(0,0,0,0.06)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-fade-up',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-[#00aff0]',
  sendButtonClass: 'bg-[#00aff0] hover:bg-[#33bff3] text-white rounded-full',
  themeStickerPacks: ['dojocat_pixiu_traditional', 'buuu'],
  themeReactions: ['heart', 'clap', 'fire'],
});

// ── Winamp ──────────────────────────────────────────────────────────────────
const winamp = buildTheme({
  fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  monospace: true,
  viewportBg: 'bg-[#29292e]',
  viewportStyle: {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,224,0,0.02) 1px, rgba(0,224,0,0.02) 2px)',
    backgroundSize: '100% 3px',
  },
  headerBg: 'bg-gradient-to-r from-[#1e1e28] to-[#2a2a35]',
  headerText: 'text-[#00e000]',
  headerBorder: 'border-[#00e000]/20',
  composerBg: 'bg-[#1e1e28]',
  composerBorder: 'border-[#00e000]/20',
  composerInputBg: 'bg-[#0e0e12]',
  composerInputText: 'text-[#00e000] placeholder:text-[#00e000]/30',
  ownBubbleBg: 'bg-[#00e000]/10',
  ownBubbleBorder: 'border-[#00e000]/25',
  ownBubbleText: 'text-[#00e000]',
  otherBubbleBg: 'bg-[#1e1e28]',
  otherBubbleBorder: 'border-[#3a3a44]',
  otherBubbleText: 'text-[#b5b5c3]',
  bubbleRadius: '0.35rem',
  senderNameClass: 'text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#00e000]/60',
  showAvatars: false,
  shadow: 'none',
  extraBubbleClass: 'font-mono',
  decorOverlay: (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-10 bg-gradient-to-r from-[#00e000]/5 via-[#00e000]/10 to-[#00e000]/5" style={{
      maskImage: 'linear-gradient(to top, black, transparent)',
      WebkitMaskImage: 'linear-gradient(to top, black, transparent)',
    }} />
  ),
  msgEntranceClass: 'chat-entrance-winamp-slide',
  typingIndicator: 'cursor',
  typingIndicatorClass: 'text-[#00e000] font-mono text-sm',
  typingText: '█',
  bgAnimationClass: 'chat-bg-winamp-eq',
  sendButtonLabel: 'PLAY ▶',
  sendButtonClass: 'font-mono bg-[#00e000]/15 border border-[#00e000]/30 text-[#00e000] hover:bg-[#00e000]/25 rounded',
  themeStickerPacks: ['devit', 'vegetacat'],
  themeReactions: ['pump', 'fire', 'mind_blown'],
});

// ── ICQ ────────────────────────────────────────────────────────────────────
const icq = buildTheme({
  fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#eef5e6]',
  viewportStyle: {
    backgroundImage: 'linear-gradient(180deg, #eef5e6 0%, #f8fbf4 100%)',
  },
  headerBg: 'bg-gradient-to-r from-[#4dac2b] to-[#6fb43e]',
  headerText: 'text-white',
  headerBorder: 'border-[#3d8a22]',
  composerBg: 'bg-[#f0f4ea]',
  composerBorder: 'border-[#c4d6a8]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-gray-900 placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#d4edbc]',
  ownBubbleBorder: 'border-[#a8d48a]',
  ownBubbleText: 'text-[#2a4a18]',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#d2dcc6]',
  otherBubbleText: 'text-[#2a4a18]',
  bubbleRadius: '0.65rem',
  senderNameClass: 'text-[11px] font-bold text-[#4dac2b]',
  showAvatars: true,
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-icq-flower',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-[#4dac2b]',
  sendButtonClass: 'bg-[#4dac2b] hover:bg-[#5cc038] text-white rounded',
  themeStickerPacks: ['heavybreathing_chicken', 'dojocat'],
  themeReactions: ['heart', 'pump', 'clap'],
});

// ── WeChat ─────────────────────────────────────────────────────────────────
const wechat = buildTheme({
  fontFamily: "'PingFang SC', 'Helvetica Neue', 'Arial', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#ededed]',
  viewportStyle: {},
  headerBg: 'bg-[#ededed]',
  headerText: 'text-[#191919]',
  headerBorder: 'border-[#d6d6d6]',
  composerBg: 'bg-[#f7f7f7]',
  composerBorder: 'border-[#e0e0e0]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-[#191919] placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#95ec69]',
  ownBubbleBorder: 'border-[#87d85a]',
  ownBubbleText: 'text-[#191919]',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#e0e0e0]',
  otherBubbleText: 'text-[#191919]',
  bubbleRadius: '0.5rem',
  senderNameClass: 'text-[10px] font-semibold text-[#808080]',
  showAvatars: true,
  shadow: 'none',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-wechat-pop',
  typingIndicator: 'text',
  typingText: '对方正在输入...',
  typingIndicatorClass: 'text-[#808080] text-xs',
  sendButtonClass: 'bg-[#07c160] hover:bg-[#06a852] text-white rounded-lg',
  avatarShape: 'rounded',
  themeStickerPacks: ['dojocat_pixiu', 'dojocat_pixiu_traditional'],
  themeReactions: ['heart', 'clap', 'pump'],
});

// ── Discord ────────────────────────────────────────────────────────────────
const discord = buildTheme({
  fontFamily: "'gg sans', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
  viewportBg: 'bg-[#313338]',
  viewportStyle: {},
  headerBg: 'bg-[#2b2d31]',
  headerText: 'text-white',
  headerBorder: 'border-[#1e1f22]',
  composerBg: 'bg-[#313338]',
  composerBorder: 'border-[#1e1f22]',
  composerInputBg: 'bg-[#383a40]',
  composerInputText: 'text-[#dbdee1] placeholder:text-[#6d6f78]',
  ownBubbleBg: 'bg-transparent',
  ownBubbleBorder: 'border-transparent',
  ownBubbleText: 'text-[#dbdee1]',
  otherBubbleBg: 'bg-transparent',
  otherBubbleBorder: 'border-transparent',
  otherBubbleText: 'text-[#dbdee1]',
  bubbleRadius: '0.15rem',
  senderNameClass: 'text-[13px] font-semibold text-[#f2f3f5]',
  showAvatars: true,
  shadow: 'none',
  extraViewportClass: '',
  extraBubbleClass: '',
  layoutMode: 'feed',
  msgEntranceClass: 'chat-entrance-discord-fade',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-[#6d6f78]',
  typingText: '{user} is typing...',
  senderNameInline: true,
  timestampInline: true,
  avatarSize: 'md',
  reactionPillClass: 'bg-[#2b2d31] border-[#1e1f22] hover:bg-[#383a40] text-[#dbdee1] rounded-md',
  sendButtonClass: 'bg-[#5865f2] hover:bg-[#4752c4] text-white rounded',
  headerExtraClass: 'shadow-[0_1px_0_rgba(0,0,0,0.3)]',
  themeStickerPacks: ['dojocat', 'devit', 'vegetacat'],
  themeReactions: ['pump', 'fire', 'heart', 'mind_blown'],
});

// ── QQ ─────────────────────────────────────────────────────────────────────
const qq = buildTheme({
  fontFamily: "'Microsoft YaHei', 'PingFang SC', 'Arial', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#edf2fa]',
  viewportStyle: {
    backgroundImage: 'linear-gradient(180deg, #edf2fa 0%, #f5f8fd 100%)',
  },
  headerBg: 'bg-gradient-to-r from-[#12b7f5] to-[#4fc3f7]',
  headerText: 'text-white',
  headerBorder: 'border-[#0ea2db]',
  composerBg: 'bg-white',
  composerBorder: 'border-[#d8e3f0]',
  composerInputBg: 'bg-[#f5f8fd]',
  composerInputText: 'text-[#1a2a3a] placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#12b7f5]',
  ownBubbleBorder: 'border-[#12b7f5]',
  ownBubbleText: 'text-white',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#e0e8f0]',
  otherBubbleText: 'text-[#1a2a3a]',
  bubbleRadius: '1rem',
  senderNameClass: 'text-[10px] font-semibold text-[#12b7f5]',
  showAvatars: true,
  shadow: '0 1px 4px rgba(18,183,245,0.1)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-qq-bounce',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-[#12b7f5]',
  sendButtonClass: 'bg-[#12b7f5] hover:bg-[#35c5f8] text-white rounded-lg',
  themeStickerPacks: ['dojocat_pixiu', 'buu'],
  themeReactions: ['heart', 'pump', 'clap'],
});

// ── NXA (Pump It Up NX Absolute) ───────────────────────────────────────────
const nxa = buildTheme({
  fontFamily: "'Exo 2', 'Rajdhani', 'Share Tech', 'Arial', sans-serif",
  viewportBg: 'bg-[#0a0e14]',
  viewportStyle: {
    backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(136,204,255,0.06) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(255,204,0,0.03) 0%, transparent 40%)',
  },
  headerBg: 'bg-gradient-to-r from-[#0c1018] via-[#0f1a2a] to-[#0c1018]',
  headerText: 'text-[#88ccff]',
  headerBorder: 'border-[#88ccff]/20',
  composerBg: 'bg-[#0c1018]',
  composerBorder: 'border-[#88ccff]/15',
  composerInputBg: 'bg-[#080c12]',
  composerInputText: 'text-[#c8dfef] placeholder:text-[#88ccff]/25',
  ownBubbleBg: 'bg-[#88ccff]/8',
  ownBubbleBorder: 'border-[#88ccff]/20',
  ownBubbleText: 'text-[#d0e8ff]',
  otherBubbleBg: 'bg-[#ffcc00]/5',
  otherBubbleBorder: 'border-[#ffcc00]/15',
  otherBubbleText: 'text-[#e8dcc0]',
  bubbleRadius: '0.35rem',
  senderNameClass: 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffcc00]/80',
  showAvatars: true,
  timestampClass: '',
  shadow: '0 0 12px rgba(136,204,255,0.06)',
  extraViewportClass: '',
  extraBubbleClass: '',
  decorOverlay: (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 opacity-30" style={{
        backgroundImage: 'linear-gradient(to bottom, rgba(136,204,255,0.08), transparent)',
      }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-16 opacity-20" style={{
        backgroundImage: 'linear-gradient(to top, rgba(255,204,0,0.06), transparent)',
      }} />
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.015]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(136,204,255,0.2) 2px, rgba(136,204,255,0.2) 3px)',
        backgroundSize: '100% 4px',
      }} />
    </>
  ),
  msgEntranceClass: 'chat-entrance-nxa-glow',
  typingIndicator: 'wave',
  typingIndicatorClass: 'text-[#88ccff]',
  bgAnimationClass: 'chat-bg-nxa-particles',
  sendButtonLabel: 'SEND ▸',
  sendButtonClass: 'bg-[#88ccff]/15 border border-[#88ccff]/30 text-[#88ccff] hover:bg-[#88ccff]/25 font-bold uppercase tracking-wider text-xs rounded',
  themeStickerPacks: ['dojocat', 'dojocat_pixiu', 'buu'],
  themeReactions: ['pump', 'fire', 'mind_blown', 'heart'],
});

// ── KakaoTalk ─────────────────────────────────────────────────────────────
const kakao = buildTheme({
  fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
  isLight: true,
  viewportBg: 'bg-[#b2c7d9]',
  viewportStyle: {},
  headerBg: 'bg-[#3e4a56]',
  headerText: 'text-white',
  headerBorder: 'border-[#343e48]',
  composerBg: 'bg-[#eff1f2]',
  composerBorder: 'border-[#d5d8db]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-[#1e1e1e] placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#fee500]',
  ownBubbleBorder: 'border-[#ebd400]',
  ownBubbleText: 'text-[#1e1e1e]',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#e5e5e5]',
  otherBubbleText: 'text-[#1e1e1e]',
  bubbleRadius: '1rem',
  senderNameClass: 'text-[11px] font-semibold text-[#333]',
  showAvatars: true,
  shadow: '0 1px 2px rgba(0,0,0,0.06)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-kakao-pop',
  typingIndicator: null,
  sendButtonClass: 'bg-[#fee500] hover:bg-[#fff024] text-[#1e1e1e] rounded-full font-bold',
  themeStickerPacks: ['dojocat_pixiu_traditional', 'mope_flower'],
  themeReactions: ['heart', 'pump', 'clap'],
});

// ── LINE ──────────────────────────────────────────────────────────────────
const line = buildTheme({
  fontFamily: "'Noto Sans KR', 'Helvetica Neue', 'Arial', sans-serif",
  viewportBg: 'bg-[#7b96a8]',
  viewportStyle: {
    backgroundImage: 'linear-gradient(180deg, #7b96a8 0%, #8fa5b5 100%)',
  },
  headerBg: 'bg-[#4a5d6b]',
  headerText: 'text-white',
  headerBorder: 'border-[#3f505c]',
  composerBg: 'bg-[#f7f8f9]',
  composerBorder: 'border-[#dfe3e6]',
  composerInputBg: 'bg-white',
  composerInputText: 'text-[#1e1e1e] placeholder:text-gray-400',
  ownBubbleBg: 'bg-[#06c755]',
  ownBubbleBorder: 'border-[#05b34c]',
  ownBubbleText: 'text-white',
  otherBubbleBg: 'bg-white',
  otherBubbleBorder: 'border-[#e5e8ea]',
  otherBubbleText: 'text-[#1e1e1e]',
  bubbleRadius: '1.1rem',
  senderNameClass: 'text-[10px] font-semibold text-[#f0f0f0]',
  showAvatars: true,
  shadow: '0 1px 3px rgba(0,0,0,0.1)',
  extraBubbleClass: '',
  msgEntranceClass: 'chat-entrance-line-slide',
  typingIndicator: 'dots',
  typingIndicatorClass: 'text-[#06c755]',
  sendButtonClass: 'bg-[#06c755] hover:bg-[#05b34c] text-white rounded-full',
  themeStickerPacks: ['mope_flower', 'dojocat_pixiu_traditional'],
  themeReactions: ['heart', 'pump', 'clap'],
});

const THEMES = { '': BASE, cli, aim, yahoo, msn, skype, winamp, icq, wechat, discord, qq, nxa, kakao, line };

export function getTheme(key) {
  return THEMES[String(key || '').trim().toLowerCase()] || BASE;
}

// ---------------------------------------------------------------------------
//  ThemePicker component
// ---------------------------------------------------------------------------

export default function ThemePicker({ value, onChange, disabled }) {
  const current = String(value || '').trim().toLowerCase();

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">Choose a chat theme that everyone in the conversation will see.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {THEME_KEYS.map((key) => {
          const meta = THEME_META[key];
          const isActive = current === key;
          return (
            <button
              key={key || '__default'}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all ${
                isActive
                  ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                  : 'border-piu-border/60 bg-piu-dark/55 hover:border-cyan-300/25'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <div className={`h-5 w-full rounded-md border ${meta.preview}`} />
              <div>
                <p className={`text-xs font-display font-black ${isActive ? 'text-cyan-100' : 'text-gray-200'}`}>
                  {meta.label}
                </p>
                <p className="text-[10px] text-gray-500">{meta.description}</p>
              </div>
              {isActive ? (
                <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="h-2.5 w-2.5 text-black">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
