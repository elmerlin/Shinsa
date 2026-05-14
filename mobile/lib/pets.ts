/**
 * Pet helpers shared across the pet hub, sub-screens, and the public
 * pet view in profile/[id].tsx. Mirrors the small "what character is
 * this" / "what colour is this stat" / "what does this mood look like"
 * logic that the web app's PetPage + FloatingPetCompanion both reach
 * for, but consolidated here so mobile screens don't repeat themselves.
 */

import type { PetCharacterId } from '@shared/api';

export const PET_CHARACTER_EMOJI: Record<PetCharacterId | string, string> = {
  dojocat: '🐱',
  buu: '🟪',
  devit: '😈',
  pixiu: '🐲',
};

export const PET_CHARACTER_NAME: Record<PetCharacterId | string, string> = {
  dojocat: 'Dojo Cat',
  buu: 'Buu',
  devit: 'Devit',
  pixiu: 'Pixiu',
};

export const PET_CHARACTER_TAGLINE: Record<PetCharacterId | string, string> = {
  dojocat: 'Disciplined training partner. Quietly affectionate when trust is earned.',
  buu: 'Smug rhythm goblin. Lives for compliments and fancy snacks.',
  devit: 'Chaotic step gremlin. Turns every session into mischief.',
  pixiu: 'Ceremonial luck guardian. Warm, protective, and elegantly dramatic.',
};

/** Soft gradient pair we use behind a character on the hub hero card. */
export const PET_CHARACTER_GRADIENT: Record<PetCharacterId | string, [string, string]> = {
  dojocat: ['#1E40AF', '#0B1A37'],
  buu: ['#7E22CE', '#1F0B2C'],
  devit: ['#B91C1C', '#1F0808'],
  pixiu: ['#0F766E', '#062520'],
};

export function petCharacterEmoji(character: string | undefined | null): string {
  return PET_CHARACTER_EMOJI[String(character || '').toLowerCase()] || '🐾';
}

export function petCharacterName(character: string | undefined | null): string {
  return PET_CHARACTER_NAME[String(character || '').toLowerCase()] || 'Pet';
}

export function petCharacterTagline(character: string | undefined | null): string {
  return PET_CHARACTER_TAGLINE[String(character || '').toLowerCase()] || '';
}

export function petCharacterGradient(character: string | undefined | null): [string, string] {
  return PET_CHARACTER_GRADIENT[String(character || '').toLowerCase()] || ['#1F2937', '#0B0F1A'];
}

/** Per-vital UI metadata: short label, color (used for the bar fill +
 *  the value text), full label tooltip-style, and emoji. */
export interface VitalSpec {
  key: 'hunger' | 'happiness' | 'energy' | 'trust' | 'momentum';
  label: string;
  long: string;
  color: string;
  emoji: string;
}

export const VITALS: VitalSpec[] = [
  { key: 'hunger',    label: 'Hunger',    long: 'Drops over time. Feed to top up.',           color: '#FB923C', emoji: '🍖' },
  { key: 'happiness', label: 'Happiness', long: 'Boosted by play, treats, and attention.',     color: '#FDE047', emoji: '😊' },
  { key: 'energy',    label: 'Energy',    long: 'Rest to recover. Activities cost energy.',    color: '#34D399', emoji: '⚡' },
  { key: 'trust',     label: 'Trust',     long: 'Builds slowly through consistent care.',      color: '#7DD3FC', emoji: '💞' },
  { key: 'momentum',  label: 'Momentum',  long: 'Built by clears + decays. Spent on tricks.',  color: '#A78BFA', emoji: '🚀' },
];

export function moodEmoji(mood: string | undefined): string {
  const m = String(mood || '').toLowerCase();
  if (/desperate|critical|starv/i.test(m)) return '🥺';
  if (/sad|gloom|low/.test(m)) return '😔';
  if (/hungry/.test(m)) return '🍴';
  if (/tired|sleep/.test(m)) return '😴';
  if (/grumpy/.test(m)) return '😤';
  if (/happy|cheer|bright/.test(m)) return '😊';
  if (/content|calm|chill/.test(m)) return '😌';
  if (/excited|hyped|fired/.test(m)) return '🤩';
  if (/love|bond/.test(m)) return '💕';
  return '🙂';
}

/** Format a stat value so 0 → 0, 73 → 73, ≥100 → 100. Just clamp to
 *  [0, 100] and round to int — simpler than the server's sub-stat mood
 *  tier math, and the bars render cleanly in either system. */
export function clampStat(value: number | undefined | null): number {
  const n = Math.round(Number(value) || 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** Soft "OK / Watch / Critical" tier for a stat — drives the bar's
 *  amber/red glow when a vital is dipping. */
export function statTier(value: number): 'critical' | 'low' | 'ok' {
  if (value <= 20) return 'critical';
  if (value <= 40) return 'low';
  return 'ok';
}

/** All cosmetics share the same "spend N combo + own this id" shape on
 *  the server. Format the cost as a chip-friendly string. */
export function costChip(cost: number | undefined | null, currency = '🎵'): string {
  const n = Number(cost) || 0;
  return `${currency} ${n.toLocaleString()}`;
}
