import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { FormatDiagram, getFormatColor } from '@/components/tournament/poster-diagrams';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import {
  FORMAT_DESCRIPTIONS,
  FORMAT_ICONS,
  FORMAT_LABELS,
  formatTournamentDate,
  parseConfig,
} from '@/lib/tournament-format';
import type { ThemeColors } from '@/constants/theme';
import type { Player, Tournament, TournamentPhase } from '@shared/api';

/** Derive a list of "rule" pills from a phase config — mirrors getPhaseRules
 *  in client/src/pages/TournamentPoster.jsx. Skips host-only knobs (best_of
 *  pads, etc) where the value is the same as the default. */
function getPhaseRules(phase: { format: string; config?: unknown }): string[] {
  const f = phase.format;
  const c = (parseConfig(phase.config) || {}) as Record<string, unknown>;
  const rules: string[] = [];
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (f !== 'gauntlet' && num(c.cards_per_draw)) rules.push(`${num(c.cards_per_draw)} cards drawn`);
  if (f !== 'gauntlet' && num(c.vetoes_per_player) != null) {
    const v = num(c.vetoes_per_player) as number;
    rules.push(`${v} veto${v !== 1 ? 'es' : ''}`);
  }
  if (f !== 'gauntlet' && num(c.best_of)) rules.push(`Best of ${num(c.best_of)}`);
  if (num(c.rounds)) {
    const r = num(c.rounds) as number;
    rules.push(`${r} round${r > 1 ? 's' : ''}`);
  }
  if (num(c.pool_count)) rules.push(`${num(c.pool_count)} pools`);
  if (num(c.duration_minutes)) rules.push(`${num(c.duration_minutes)} min session`);
  if (f === 'gauntlet') {
    const start = num(c.start_level ?? c.start_single_level) ?? 19;
    const explicitFinal = num(c.final_level);
    const legacyFinalUpper = num(c.final_single_level);
    const explicitFinalMax = num(c.final_level_max ?? c.final_single_level_max);
    const final = explicitFinal ?? (legacyFinalUpper != null ? Math.max(1, legacyFinalUpper - 1) : 24);
    const finalMax = Math.max(
      final,
      explicitFinalMax ?? (legacyFinalUpper != null ? legacyFinalUpper : Math.min(final + 1, 28)),
    );
    rules.push(`Lv ${start} → Lv ${final}${finalMax !== final ? `-${finalMax}` : ''}`);
    rules.push('Mixed singles/doubles');
    const bo = num(c.best_of) ?? 3;
    if (bo === 3) rules.push('5 cards, 1 veto each, Bo3');
    else rules.push(`Best of ${bo}`);
  }
  if (f === 'b15') rules.push('Best 15 rating-point scores');
  return rules;
}

function getAdvancementLabel(phase: { advancement?: unknown }): string | null {
  const adv = (parseConfig(phase.advancement) || {}) as Record<string, unknown>;
  if (!adv.type || adv.type === 'all') return null;
  if (adv.type === 'top_n') return `Top ${adv.count ?? '?'} advance`;
  if (adv.type === 'per_pool_top_n') return `Top ${adv.count ?? '?'} per pool advance`;
  if (adv.type === 'threshold') return `${adv.threshold ?? '?'}+ points advance`;
  return null;
}

/** When the tournament was created before the phases system, we synthesize
 *  display phases from the legacy `config.gauntlet_enabled` flag so the
 *  poster still renders a "RR → Gauntlet" narrative. Mirrors the desktop
 *  poster's `displayPhases` fallback. */
function buildDisplayPhases(tournament: Tournament, phases: TournamentPhase[]): {
  format: string;
  name: string;
  config: Record<string, unknown>;
  advancement: Record<string, unknown> | null;
}[] {
  if (phases.length > 0) {
    return phases.map((p) => ({
      format: p.format,
      name: p.name || FORMAT_LABELS[p.format] || p.format,
      config: (parseConfig(p.config) || {}) as Record<string, unknown>,
      advancement: parseConfig(p.advancement),
    }));
  }
  const config = (parseConfig(tournament.config) || {}) as Record<string, unknown>;
  if (config.gauntlet_enabled) {
    return [
      {
        format: 'round_robin',
        name: 'Round Robin',
        config: {
          rounds: tournament.total_rounds || 3,
          cards_per_draw: config.cards_per_draw,
          vetoes_per_player: config.vetoes_per_player,
          best_of: config.best_of,
        },
        advancement: { type: 'all' },
      },
      {
        format: 'gauntlet',
        name: 'Gauntlet',
        config: {
          start_level: config.start_single_level,
          final_level: config.final_single_level ? Math.max(1, Number(config.final_single_level) - 1) : 24,
          final_level_max: config.final_single_level || 25,
          best_of: config.gauntlet_best_of || 3,
        },
        advancement: null,
      },
    ];
  }
  return [
    {
      format: 'round_robin',
      name: 'Round Robin',
      config: {
        rounds: tournament.total_rounds || 3,
        cards_per_draw: config.cards_per_draw,
        vetoes_per_player: config.vetoes_per_player,
        best_of: config.best_of,
      },
      advancement: null,
    },
  ];
}

export default function TournamentPosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = String(id || '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const tournamentQuery = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
    enabled: !!tournamentId,
  });
  const playersQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'players'],
    queryFn: () => tournamentsApi.players(tournamentId),
    enabled: !!tournamentId,
  });
  const phasesQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'phases'],
    queryFn: () => tournamentsApi.phases(tournamentId),
    enabled: !!tournamentId,
    retry: false,
  });

  const tournament = tournamentQuery.data;
  const players: Player[] = playersQuery.data ?? [];
  const phases: TournamentPhase[] = phasesQuery.data ?? [];

  const displayPhases = useMemo(() => {
    if (!tournament) return [];
    return buildDisplayPhases(tournament, phases);
  }, [tournament, phases]);

  // ── Loading / error states ──
  if (!tournamentId) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}><Text style={s.bodyText}>Missing tournament id.</Text></View>
      </View>
    );
  }
  if (tournamentQuery.isLoading) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }
  if (tournamentQuery.isError || !tournament) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}>
          <Text style={s.bodyText}>Tournament not found.</Text>
        </View>
      </View>
    );
  }

  const title = String(tournament.name || 'Tournament');
  const avatarUrl = typeof tournament.avatar === 'string' && tournament.avatar
    ? fullImageUrl(tournament.avatar)
    : undefined;
  const dateStr = formatTournamentDate(tournament.date);
  const location = typeof tournament.location === 'string' ? tournament.location : '';
  const posterBg = typeof tournament.poster_bg === 'string' && tournament.poster_bg
    ? fullImageUrl(tournament.poster_bg)
    : undefined;

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: `${title} · Poster` }} />
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}>
        {/* ═══ HERO ═══ */}
        <View style={s.heroWrap}>
          {posterBg ? (
            <Image source={{ uri: posterBg }} style={s.heroBg} contentFit="cover" />
          ) : null}
          {/* Always render a dark scrim — keeps text readable whether or not
              a custom poster background is set. */}
          <View style={s.heroScrim} />
          <View style={s.heroBody}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.heroAvatar} contentFit="cover" />
            ) : (
              <View style={[s.heroAvatar, s.heroAvatarFallback]}>
                <Text style={s.heroAvatarLetter}>{title.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={s.heroPills}>
              {dateStr ? <Text style={s.heroPill}>{dateStr}</Text> : null}
              {location ? <Text style={s.heroPill}>{location}</Text> : null}
              <Text style={[s.heroPill, s.heroPillAccent]}>
                {players.length} player{players.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={s.heroTitle} numberOfLines={3}>{title}</Text>
            <Text style={s.heroSubtitle}>
              {displayPhases.length} phase{displayPhases.length === 1 ? '' : 's'} · {players.length} players
            </Text>

            {/* Phase flow — icon pills with arrows between them */}
            {displayPhases.length > 0 ? (
              <View style={s.heroFlow}>
                {displayPhases.map((p, i) => {
                  const c = getFormatColor(p.format);
                  return (
                    <View key={`pf-${i}`} style={s.heroFlowRow}>
                      {i > 0 ? <Text style={s.heroFlowArrow}>→</Text> : null}
                      <View style={[s.heroFlowChip, { borderColor: c.accent, backgroundColor: c.tint }]}>
                        <Text style={s.heroFlowChipIcon}>{FORMAT_ICONS[p.format] || ''}</Text>
                        <Text style={[s.heroFlowChipText, { color: c.accent }]} numberOfLines={1}>
                          {p.name || FORMAT_LABELS[p.format] || p.format}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Avatar ring — up to 12 player avatars, overlapping */}
            {players.length > 0 ? (
              <View style={s.heroRingRow}>
                {players.slice(0, 12).map((p, i) => {
                  const av = typeof p.avatar === 'string' && p.avatar ? fullImageUrl(p.avatar) : undefined;
                  const initial = String(p.name || '?').charAt(0).toUpperCase();
                  return (
                    <View key={p.id} style={[s.heroRingAvatar, i > 0 && { marginLeft: -10 }]}>
                      {av ? (
                        <Image source={{ uri: av }} style={s.heroRingImg} contentFit="cover" />
                      ) : (
                        <View style={[s.heroRingImg, s.heroRingFallback]}>
                          <Text style={s.heroRingLetter}>{initial}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
                {players.length > 12 ? (
                  <View style={[s.heroRingAvatar, s.heroRingExtra, { marginLeft: -10 }]}>
                    <Text style={s.heroRingExtraText}>+{players.length - 12}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* ═══ PHASE SECTIONS ═══ */}
        <View style={s.phasesWrap}>
          {displayPhases.map((phase, i) => {
            const c = getFormatColor(phase.format);
            const rules = getPhaseRules(phase);
            const advLabel = getAdvancementLabel(phase);
            return (
              <View key={`phase-${i}`} style={[s.phaseCard, { borderColor: c.accent, backgroundColor: c.tint }]}>
                <View style={s.phaseHead}>
                  <View style={[s.phaseIconWrap, { borderColor: c.accent, backgroundColor: theme.bg }]}>
                    <Text style={s.phaseIcon}>{FORMAT_ICONS[phase.format] || '🏆'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.phaseEyebrow, { color: c.accent }]}>
                      PHASE {i + 1} OF {displayPhases.length}
                    </Text>
                    <Text style={[s.phaseTitle, { color: c.accent }]}>
                      {phase.name || FORMAT_LABELS[phase.format]}
                    </Text>
                  </View>
                </View>

                <Text style={s.phaseDescription}>
                  {FORMAT_DESCRIPTIONS[phase.format] || ''}
                </Text>

                {/* Diagram */}
                <View style={s.phaseDiagram}>
                  <FormatDiagram format={phase.format} players={players} config={phase.config} />
                </View>

                {/* Rules pills */}
                {rules.length > 0 ? (
                  <View style={s.phaseRules}>
                    {rules.map((r, j) => (
                      <View key={`r-${i}-${j}`} style={s.phaseRulePill}>
                        <Text style={s.phaseRulePillText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Advancement */}
                {advLabel ? (
                  <View style={s.phaseAdv}>
                    <Text style={s.phaseAdvText}>→ {advLabel}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ═══ ROSTER ═══ */}
        {players.length > 0 ? (
          <View style={s.rosterBlock}>
            <Text style={s.rosterEyebrow}>{title.toUpperCase()}</Text>
            <Text style={s.rosterTitle}>Roster</Text>
            <Text style={s.rosterMeta}>
              {players.length} competitor{players.length === 1 ? '' : 's'} · Tap a player for their profile
            </Text>
            <View style={s.rosterGrid}>
              {players.map((p) => {
                const av = typeof p.avatar === 'string' && p.avatar ? fullImageUrl(p.avatar) : undefined;
                const initial = String(p.name || '?').charAt(0).toUpperCase();
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      if (p.user_id) {
                        router.push({ pathname: '/profile/[id]', params: { id: String(p.user_id) } });
                      }
                    }}
                    style={({ pressed }) => [s.rosterCell, pressed && { opacity: 0.85 }]}>
                    {av ? (
                      <Image source={{ uri: av }} style={s.rosterAvatar} contentFit="cover" />
                    ) : (
                      <View style={[s.rosterAvatar, s.rosterAvatarFallback]}>
                        <Text style={s.rosterAvatarLetter}>{initial}</Text>
                      </View>
                    )}
                    <Text style={s.rosterName} numberOfLines={1}>{p.name}</Text>
                    {p.skill_title ? (
                      <Text style={s.rosterSkill} numberOfLines={1}>{p.skill_title}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ═══ FOOTER ═══ */}
        <View style={s.footer}>
          <Text style={s.footerTitle}>{title}</Text>
          <Text style={s.footerCredit}>
            Powered by <Text style={s.footerCreditAccent}>Pump Shinsa</Text>
          </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: tournamentId } })}
            style={({ pressed }) => [s.footerBtn, pressed && { opacity: 0.85 }]}>
            <Text style={s.footerBtnText}>View live tournament</Text>
          </Pressable>
          {Platform.OS === 'web' ? (
            <Pressable
              onPress={() => {
                if (typeof navigator !== 'undefined' && navigator.share) {
                  navigator.share({
                    title,
                    url: `${window.location.origin}/tournament/${tournamentId}/poster`,
                  }).catch(() => undefined);
                } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}/poster`)
                    .catch(() => undefined);
                }
              }}
              style={({ pressed }) => [s.footerShareBtn, pressed && { opacity: 0.85 }]}>
              <Text style={s.footerShareText}>Share poster</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scroll: { gap: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  bodyText: { color: t.textMuted, fontSize: 13 },

  // Hero
  heroWrap: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  heroBg: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 26, 0.65)',
  },
  heroBody: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center' as const,
    gap: 12,
  },
  heroAvatar: { width: 96, height: 96, borderRadius: 22, backgroundColor: t.surfaceMuted },
  heroAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroAvatarLetter: { fontSize: 38, fontWeight: '900' as const, color: t.accent },
  heroPills: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'center' as const,
  },
  heroPill: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    fontWeight: '700' as const,
  },
  heroPillAccent: {
    color: t.accent,
    borderColor: t.accent,
    backgroundColor: t.accentTint,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900' as const,
    color: '#fff',
    textAlign: 'center' as const,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center' as const },

  heroFlow: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 4, justifyContent: 'center' as const, marginTop: 4 },
  heroFlowRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  heroFlowArrow: { fontSize: 11, color: 'rgba(255,255,255,0.4)', paddingHorizontal: 2 },
  heroFlowChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroFlowChipIcon: { fontSize: 11 },
  heroFlowChipText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.5 },

  heroRingRow: { flexDirection: 'row' as const, marginTop: 6 },
  heroRingAvatar: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden' as const, borderWidth: 2, borderColor: '#0a0a1a' },
  heroRingImg: { width: '100%' as const, height: '100%' as const, borderRadius: 15 },
  heroRingFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroRingLetter: { fontSize: 11, fontWeight: '900' as const, color: t.accent },
  heroRingExtra: { backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center' as const, justifyContent: 'center' as const },
  heroRingExtraText: { fontSize: 10, fontWeight: '900' as const, color: 'rgba(255,255,255,0.6)' },

  // Phases
  phasesWrap: { paddingHorizontal: 14, gap: 20, paddingTop: 4 },
  phaseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  phaseHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  phaseIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  phaseIcon: { fontSize: 22 },
  phaseEyebrow: { fontSize: 9, letterSpacing: 1.6, fontWeight: '900' as const },
  phaseTitle: { fontSize: 18, fontWeight: '900' as const, marginTop: 2 },
  phaseDescription: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
  phaseDiagram: { alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: 4 },
  phaseRules: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 5 },
  phaseRulePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  phaseRulePillText: { fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: '700' as const },
  phaseAdv: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    backgroundColor: 'rgba(52, 211, 153, 0.10)',
  },
  phaseAdvText: { fontSize: 10, color: '#34d399', fontWeight: '900' as const, letterSpacing: 1 },

  // Roster
  rosterBlock: {
    paddingHorizontal: 14,
    paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    gap: 4,
  },
  rosterEyebrow: { fontSize: 9, letterSpacing: 3, color: t.textDim, fontWeight: '900' as const, textAlign: 'center' as const },
  rosterTitle: { fontSize: 22, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  rosterMeta: { fontSize: 11, color: t.textDim, textAlign: 'center' as const, paddingBottom: 12 },
  rosterGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, justifyContent: 'flex-start' as const },
  rosterCell: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center' as const,
    gap: 6,
    minWidth: 96,
  },
  rosterAvatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: t.surfaceMuted },
  rosterAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rosterAvatarLetter: { fontSize: 18, fontWeight: '900' as const, color: t.accent },
  rosterName: { fontSize: 12, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  rosterSkill: { fontSize: 10, color: t.textDim, textAlign: 'center' as const },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center' as const,
    gap: 8,
  },
  footerTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, letterSpacing: 0.4 },
  footerCredit: { fontSize: 10, color: t.textDim, letterSpacing: 1.4, fontWeight: '900' as const },
  footerCreditAccent: { color: t.accent },
  footerBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  footerBtnText: { color: t.textOnAccent, fontSize: 12, fontWeight: '900' as const, letterSpacing: 0.6 },
  footerShareBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  footerShareText: { color: t.textMuted, fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5 },
});
