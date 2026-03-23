export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;
export const CANVAS_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT; // 9:16

export const DISPLAY_FONT = '"Rajdhani", sans-serif';
export const BODY_FONT = '"Inter", sans-serif';

export const GRADIENT_PRESETS = [
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'neon', label: 'Neon', css: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' },
  { id: 'dark', label: 'Dark', css: 'linear-gradient(160deg, #0a101b 0%, #1a2136 100%)' },
  { id: 'fire', label: 'Fire', css: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)' },
  { id: 'mint', label: 'Mint', css: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { id: 'arcade', label: 'Arcade', css: 'linear-gradient(160deg, #1a0533 0%, #4a0e8f 50%, #ff00ff 100%)' },
  { id: 'steel', label: 'Steel', css: 'linear-gradient(180deg, #2c3e50 0%, #4ca1af 100%)' },
];

export const THEME_PRESETS = [
  {
    id: 'midnight',
    label: 'Midnight',
    background: 'linear-gradient(160deg, #0a0e1a 0%, #141b2d 100%)',
    textColor: '#ffffff',
    accentColor: '#22d3ee',
    borderColor: 'rgba(34,211,238,0.2)',
    decorations: 'radial-gradient(ellipse at 20% 20%, rgba(34,211,238,0.12) 0%, transparent 50%)',
  },
  {
    id: 'neon-glow',
    label: 'Neon Glow',
    background: 'linear-gradient(160deg, #0d001a 0%, #1a0033 100%)',
    textColor: '#f0abfc',
    accentColor: '#e879f9',
    borderColor: 'rgba(232,121,249,0.3)',
    decorations: 'radial-gradient(ellipse at 50% 50%, rgba(232,121,249,0.15) 0%, transparent 60%)',
  },
  {
    id: 'warm',
    label: 'Warm',
    background: 'linear-gradient(160deg, #1a0f0a 0%, #2d1b14 100%)',
    textColor: '#fde68a',
    accentColor: '#f59e0b',
    borderColor: 'rgba(245,158,11,0.2)',
    decorations: 'radial-gradient(ellipse at 80% 30%, rgba(245,158,11,0.1) 0%, transparent 50%)',
  },
  {
    id: 'retro-arcade',
    label: 'Retro',
    background: 'linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%)',
    textColor: '#00ff88',
    accentColor: '#00ff88',
    borderColor: 'rgba(0,255,136,0.25)',
    decorations: 'repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(0,255,136,0.04) 59px, rgba(0,255,136,0.04) 60px)',
  },
  {
    id: 'clean',
    label: 'Clean',
    background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
    textColor: '#0f172a',
    accentColor: '#3b82f6',
    borderColor: 'rgba(59,130,246,0.2)',
    decorations: 'none',
  },
  {
    id: 'rose',
    label: 'Rose',
    background: 'linear-gradient(160deg, #1a0a14 0%, #2d141f 100%)',
    textColor: '#fda4af',
    accentColor: '#fb7185',
    borderColor: 'rgba(251,113,133,0.2)',
    decorations: 'radial-gradient(ellipse at 30% 70%, rgba(251,113,133,0.1) 0%, transparent 50%)',
  },
];

export const FONT_SIZES = [
  { id: 'sm', label: 'S', canvas: 54, css: '1.125rem' },
  { id: 'md', label: 'M', canvas: 72, css: '1.75rem' },
  { id: 'lg', label: 'L', canvas: 108, css: '2.75rem' },
];

export const TEXT_COLORS = [
  '#ffffff', '#000000', '#22d3ee', '#f43f5e', '#a855f7',
  '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#fde68a',
];

export const OVERLAY_TEXT_COLORS = [
  '#ffffff', '#000000', '#22d3ee', '#f43f5e', '#a855f7',
  '#f59e0b', '#10b981', '#ec4899',
];
