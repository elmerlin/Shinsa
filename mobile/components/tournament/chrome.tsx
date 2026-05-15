import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import {
  FORMAT_DESCRIPTIONS,
  FORMAT_ICONS,
  FORMAT_LABELS,
  formatTournamentDate,
  primaryFormatKey,
  tournamentStatusColor,
  tournamentStatusLabel,
} from '@/lib/tournament-format';
import type { ThemeColors } from '@/constants/theme';
import type { Tournament, TournamentPhase } from '@shared/api';

/**
 * Hero card for the tournament detail screen — mirrors TournamentHero from
 * client/src/components/tournament/TournamentChrome.jsx. Big avatar, name,
 * status pill, stat strip, optional flow slot for the phase timeline.
 */
export function TournamentHero({
  tournament,
  statusLabel,
  live,
  stats,
  flow,
}: {
  tournament: Tournament;
  statusLabel?: string;
  live?: boolean;
  stats?: string[];
  flow?: React.ReactNode;
}) {
  const s = useThemedStyles(makeStyles);
  const avatarUrl = typeof tournament?.avatar === 'string' && tournament.avatar
    ? fullImageUrl(tournament.avatar)
    : undefined;
  const initial = String(tournament?.name || '?').charAt(0).toUpperCase();
  const formatKey = primaryFormatKey(tournament);
  const statusColors = tournamentStatusColor(tournament?.phase);
  const dateStr = formatTournamentDate(tournament?.date);
  const location = typeof tournament?.location === 'string' ? tournament.location : '';

  return (
    <View style={s.heroCard}>
      <View style={s.heroTopRow}>
        <View style={s.heroAvatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.heroAvatar} contentFit="cover" />
          ) : (
            <View style={[s.heroAvatar, s.heroAvatarFallback]}>
              <Text style={s.heroAvatarLetter}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={s.heroTitleBlock}>
          <Text style={s.heroName} numberOfLines={2}>{tournament?.name || 'Untitled tournament'}</Text>
          <View style={s.heroMetaRow}>
            <Text style={s.heroMetaIcon}>{FORMAT_ICONS[formatKey] || '🏆'}</Text>
            <Text style={s.heroMetaText} numberOfLines={1}>
              {String(tournament?.format_summary || FORMAT_LABELS[formatKey] || 'Round Robin')}
            </Text>
            {dateStr ? (
              <>
                <Text style={s.heroMetaDot}>·</Text>
                <Text style={s.heroMetaText}>{dateStr}</Text>
              </>
            ) : null}
            {location ? (
              <>
                <Text style={s.heroMetaDot}>·</Text>
                <Text style={s.heroMetaText} numberOfLines={1}>{location}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={s.heroStatusCol}>
          <View style={[s.heroStatusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
            {live ? <View style={[s.heroLiveDot, { backgroundColor: statusColors.text }]} /> : null}
            <Text style={[s.heroStatusText, { color: statusColors.text }]}>
              {statusLabel || tournamentStatusLabel(tournament?.phase)}
            </Text>
          </View>
        </View>
      </View>

      {stats && stats.length > 0 ? (
        <View style={s.heroStatsRow}>
          {stats.filter(Boolean).map((line, i) => (
            <Text key={`stat-${i}`} style={s.heroStatLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {flow ? <View style={s.heroFlowSlot}>{flow}</View> : null}
    </View>
  );
}

/**
 * Visual progress bar through the tournament's phases. One pill per phase
 * tinted by status — mirrors TournamentPhaseTimeline on desktop.
 */
export function TournamentPhaseTimeline({ phases }: { phases: TournamentPhase[] }) {
  const s = useThemedStyles(makeStyles);
  if (!phases || phases.length === 0) return null;
  const completed = phases.filter((p) => p.status === 'COMPLETED').length;
  const pct = phases.length > 0 ? (completed / phases.length) * 100 : 0;

  return (
    <View style={s.timelineWrap}>
      <View style={s.timelineHeader}>
        <Text style={s.timelineLabel}>STAGES</Text>
        <Text style={s.timelineCount}>{completed}/{phases.length}</Text>
      </View>
      <View style={s.timelineBar}>
        <View style={[s.timelineBarFill, { width: `${pct}%` }]} />
      </View>
      <View style={s.timelinePills}>
        {phases.map((p, i) => {
          const isActive = p.status === 'ACTIVE';
          const isComplete = p.status === 'COMPLETED';
          const label = p.name || FORMAT_LABELS[p.format] || p.format;
          return (
            <View
              key={`${p.id}-${i}`}
              style={[
                s.timelinePill,
                isActive && s.timelinePillActive,
                isComplete && s.timelinePillComplete,
              ]}>
              <Text style={s.timelinePillIcon}>{FORMAT_ICONS[p.format] || ''}</Text>
              <Text
                style={[
                  s.timelinePillText,
                  isActive && s.timelinePillTextActive,
                  isComplete && s.timelinePillTextComplete,
                ]}
                numberOfLines={1}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export interface TournamentTab {
  key: string;
  label: string;
  icon?: string;
  badge?: string;
}

/**
 * Horizontal tab bar for the detail screen. Per-phase tabs + Players +
 * Final (when complete) + Discussion. Scrolls horizontally so long phase
 * names + many phases don't overflow the viewport.
 */
export function TournamentTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: TournamentTab[];
  activeTab: string;
  onChange: (key: string) => void;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.tabsRow}>
      {tabs.map((t) => {
        const active = t.key === activeTab;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [
              s.tab,
              active && s.tabActive,
              pressed && !active && { opacity: 0.7 },
            ]}>
            {t.icon ? <Text style={s.tabIcon}>{t.icon}</Text> : null}
            <Text style={[s.tabLabel, active && s.tabLabelActive]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.badge ? (
              <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>{t.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Per-phase rule card — describes the format + advancement rules so the
 *  viewer knows what they're looking at. Mirrors TournamentPhaseRuleCard. */
export function TournamentPhaseRuleCard({
  phase,
}: {
  phase: TournamentPhase;
}) {
  const s = useThemedStyles(makeStyles);
  const label = phase.name || FORMAT_LABELS[phase.format] || phase.format;
  const description = FORMAT_DESCRIPTIONS[phase.format] || '';
  const icon = FORMAT_ICONS[phase.format] || '🏆';
  return (
    <View style={s.ruleCard}>
      <View style={s.ruleIconWrap}>
        <Text style={s.ruleIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={s.ruleEyebrow}>STAGE · {phase.status}</Text>
        <Text style={s.ruleTitle}>{label}</Text>
        {description ? <Text style={s.ruleDescription}>{description}</Text> : null}
      </View>
    </View>
  );
}

/** Empty-state panel for views with no data yet. */
export function TournamentEmptyPanel({
  icon,
  title,
  description,
}: {
  icon?: string;
  title: string;
  description?: string;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.emptyPanel}>
      {icon ? <Text style={s.emptyIcon}>{icon}</Text> : null}
      <Text style={s.emptyTitle}>{title}</Text>
      {description ? <Text style={s.emptyDescription}>{description}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  // Hero
  heroCard: {
    backgroundColor: t.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 14,
  },
  heroTopRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12 },
  heroAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: 'hidden' as const,
  },
  heroAvatar: { width: 60, height: 60, borderRadius: 14 },
  heroAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroAvatarLetter: { fontSize: 28, fontWeight: '900' as const, color: t.accent },
  heroTitleBlock: { flex: 1, minWidth: 0, gap: 4 },
  heroName: { fontSize: 20, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  heroMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  heroMetaIcon: { fontSize: 12 },
  heroMetaText: {
    fontSize: 12,
    color: t.textDim,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  heroMetaDot: { fontSize: 12, color: t.textDim },
  heroStatusCol: { alignItems: 'flex-end' as const, gap: 6 },
  heroStatusPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroLiveDot: { width: 6, height: 6, borderRadius: 3 },
  heroStatusText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.6 },
  heroStatsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  heroStatLine: {
    fontSize: 12,
    color: t.text,
    fontWeight: '700' as const,
  },
  heroFlowSlot: { paddingTop: 4 },

  // Phase timeline
  timelineWrap: { gap: 8 },
  timelineHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  timelineLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  timelineCount: { fontSize: 11, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  timelineBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
  },
  timelineBarFill: { height: '100%' as const, backgroundColor: t.accent, borderRadius: 2 },
  timelinePills: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  timelinePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  timelinePillActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  timelinePillComplete: { borderColor: 'rgba(52, 211, 153, 0.45)', backgroundColor: 'rgba(52, 211, 153, 0.10)' },
  timelinePillIcon: { fontSize: 10 },
  timelinePillText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },
  timelinePillTextActive: { color: t.accent, fontWeight: '900' as const },
  timelinePillTextComplete: { color: '#34d399' },

  // Tabs
  tabsRow: { gap: 6, paddingHorizontal: 4, paddingVertical: 4 },
  tab: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: t.surfaceMuted,
  },
  tabActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  tabIcon: { fontSize: 12 },
  tabLabel: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.3 },
  tabLabelActive: { color: t.accent, fontWeight: '900' as const },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: t.bg,
    minWidth: 20,
    alignItems: 'center' as const,
  },
  tabBadgeActive: { backgroundColor: t.accent },
  tabBadgeText: { fontSize: 10, fontWeight: '900' as const, color: t.textMuted },
  tabBadgeTextActive: { color: t.textOnAccent },

  // Phase rule card
  ruleCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  ruleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ruleIcon: { fontSize: 20 },
  ruleEyebrow: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  ruleTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  ruleDescription: { fontSize: 11, color: t.textMuted, lineHeight: 15 },

  // Empty state
  emptyPanel: {
    alignItems: 'center' as const,
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  emptyIcon: { fontSize: 32, opacity: 0.5 },
  emptyTitle: { fontSize: 14, fontWeight: '800' as const, color: t.textMuted, textAlign: 'center' as const },
  emptyDescription: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, lineHeight: 16 },
});
