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

export const THEME_KEYS = ['', 'cli', 'aim', 'yahoo', 'msn', 'skype', 'winamp'];

export const THEME_META = {
  '': { label: 'Default', description: 'Shinsa dark theme', preview: 'bg-piu-card border-piu-border/60' },
  cli: { label: 'CLI', description: 'Terminal interface', preview: 'bg-black border-green-500/50' },
  aim: { label: 'AIM', description: 'AOL Instant Messenger', preview: 'bg-[#e8e4d8] border-[#c1b68a]' },
  yahoo: { label: 'Yahoo!', description: 'Yahoo Messenger', preview: 'bg-[#1a0533] border-purple-500/50' },
  msn: { label: 'MSN', description: 'MSN Messenger', preview: 'bg-[#d6e9f8] border-[#0078d4]' },
  skype: { label: 'Skype', description: 'Skype messaging', preview: 'bg-[#e4f0f8] border-[#00aff0]' },
  winamp: { label: 'Winamp', description: 'It really whips…', preview: 'bg-[#29292e] border-[#00e000]/50' },
};

const BASE = {
  fontFamily: '',
  monospace: false,
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
  bubbleRadius: '0.25rem',
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
});

// ── AIM ─────────────────────────────────────────────────────────────────────
const aim = buildTheme({
  fontFamily: "'Trebuchet MS', 'Arial', sans-serif",
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
});

// ── MSN Messenger ───────────────────────────────────────────────────────────
const msn = buildTheme({
  fontFamily: "'Segoe UI', 'Tahoma', 'Verdana', sans-serif",
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
});

// ── Skype ───────────────────────────────────────────────────────────────────
const skype = buildTheme({
  fontFamily: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif",
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
});

const THEMES = { '': BASE, cli, aim, yahoo, msn, skype, winamp };

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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
