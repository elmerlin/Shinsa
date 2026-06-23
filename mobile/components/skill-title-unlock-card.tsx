import { StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

/** Minimal shape of a `title_unlock` clear row (see server
 *  buildTitleUnlockClearRows). Loosely typed so legacy posts that only carry
 *  the top-level fields still render. */
export interface SkillTitleClear {
  song_title?: string;
  level?: number;
  score?: number;
  title_name?: string;
  title_family?: string;
  title_level?: number;
  title_tier?: string;
  title_required_points?: number;
  title_earned_points?: number;
}

// Emblem palette per progression tier.
const TIERS: Record<string, { color: string; tint: string; border: string }> = {
  beginner: { color: '#94a3b8', tint: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.40)' },
  bronze: { color: '#f59e0b', tint: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.42)' },
  silver: { color: '#cbd5e1', tint: 'rgba(203,213,225,0.14)', border: 'rgba(203,213,225,0.42)' },
  gold: { color: '#facc15', tint: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.42)' },
  blue: { color: '#60a5fa', tint: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.42)' },
};

// Tier is driven by the skill FAMILY (the progression group), not the raw
// server tier: Intermediate → bronze, Advanced → silver, Expert → gold.
// Beginner stays neutral and Master takes the premium blue above gold.
function tierKeyForFamily(family: string): keyof typeof TIERS {
  switch (family.trim().toLowerCase()) {
    case 'intermediate': return 'bronze';
    case 'advanced': return 'silver';
    case 'expert': return 'gold';
    case 'master': return 'blue';
    default: return 'beginner';
  }
}

function cap(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word;
}

function familyFromName(name: string): string {
  const m = name.match(/\b(Beginner|Intermediate|Advanced|Expert|Master)\b/i);
  return m ? cap(m[1]) : '';
}

// Mirror of client/src/utils/skillTitles.js#formatSkillTitleLabel — produces
// "Expert Lv.1", "The Master", etc. from whatever fields the row carries.
function formatLabel(name: string, family: string, level: number): string {
  const fromName = name.match(/\b(Beginner|Intermediate|Advanced|Expert|Master)\s*(?:lv|lvl|level)?\.?\s*(\d+)\b/i);
  if (fromName) return `${cap(fromName[1])} Lv.${parseInt(fromName[2], 10)}`;
  if (/^master$/i.test(family) || /the\s+master/i.test(name)) {
    return level > 1 ? `Master Lv.${level}` : 'The Master';
  }
  if (family && level > 0) return `${family} Lv.${level}`;
  if (family) return family;
  return name || 'Skill Title';
}

/**
 * Compact "Skill Title unlocked" card for feed posts. Title-unlock activity
 * comes through as a clear row with `mode: 'Skill Title'` and no jacket, so the
 * generic ClearCard rendered a "?" thumbnail. This shows a tier-coloured
 * medallion + the skill title instead.
 */
export function SkillTitleUnlockCard({ clear }: { clear: SkillTitleClear }) {
  const s = useThemedStyles(makeStyles);
  const rawName = String(clear.title_name || clear.song_title || '').trim();
  const family = String(clear.title_family || '').trim() || familyFromName(rawName);
  const skillLevel = Number(clear.title_level) || 0;
  const tier = TIERS[tierKeyForFamily(family)];
  const label = formatLabel(rawName, family, skillLevel);

  const piuLevel = Number(clear.level) || 0;
  const earned = Number(clear.title_earned_points) || 0;
  const required = Number(clear.title_required_points) || Number(clear.score) || 0;
  const subParts = [
    family && skillLevel > 0 ? `${family} Lv.${skillLevel}` : family,
    piuLevel > 0 ? `Lv.${piuLevel} track` : '',
    required > 0 ? `${earned.toLocaleString()} / ${required.toLocaleString()} pts` : '',
  ].filter(Boolean);

  return (
    <View style={[s.card, { borderColor: tier.border }]}>
      <View style={[s.medallion, { borderColor: tier.color, backgroundColor: tier.tint }]}>
        <IconSymbol name="trophy.fill" size={24} color={tier.color} />
        {skillLevel > 0 ? (
          <View style={[s.lvlBadge, { backgroundColor: tier.color }]}>
            <Text style={s.lvlBadgeText}>{skillLevel}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.body}>
        <View style={[s.eyebrow, { borderColor: tier.border, backgroundColor: tier.tint }]}>
          <Text style={[s.eyebrowText, { color: tier.color }]}>SKILL TITLE</Text>
        </View>
        <Text style={s.title} numberOfLines={2}>{label}</Text>
        {subParts.length > 0 ? (
          <Text style={s.sub} numberOfLines={2}>{subParts.join(' · ')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: t.surfaceMuted,
  },
  medallion: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  lvlBadge: {
    position: 'absolute' as const,
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  lvlBadgeText: { fontSize: 11, fontWeight: '900' as const, color: '#0a0f1c', fontVariant: ['tabular-nums' as const] },
  body: { flex: 1, minWidth: 0, gap: 5 },
  eyebrow: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  eyebrowText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4 },
  title: { fontSize: 17, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  sub: { fontSize: 12, color: t.textMuted, lineHeight: 16 },
});
