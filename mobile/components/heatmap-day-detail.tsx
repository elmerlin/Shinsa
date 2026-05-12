import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { getGradeTier, TIER_COLORS, type GradeTier } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { resolveChartJacketUrl } from '@/lib/jacketMap';
import { toCanonicalSongTitle } from '@/lib/songAliases';
import type { ThemeColors } from '@/constants/theme';
import type { PiugameRecentPlay } from '@shared/api';

interface Props {
  dayKey: string;
  plays: PiugameRecentPlay[];
  jacketMap: Record<string, string> | undefined;
  onPlayPress: (play: PiugameRecentPlay) => void;
  onScrollLockChange?: (locked: boolean) => void;
}

const GRADE_TIERS: GradeTier[] = ['sss', 'ss', 's', 'aaa', 'aa', 'a', 'b', 'c', 'd', 'f'];

function formatDayTitle(key: string): string {
  // key is YYYY-MM-DD UTC. Render as "Wednesday, May 8, 2024".
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return key;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(input?: string): string {
  if (!input) return '';
  const cleaned = String(input).trim();
  const hasTz = /(?:z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const normalized = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T');
  const candidate = hasTz ? normalized : `${normalized}Z`;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export function HeatmapDayDetail({ dayKey, plays, jacketMap, onPlayPress }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  // Distribution: per-level cluster of grade tier counts. Each level becomes
  // one stacked bar; segments from top→bottom are SSS+ → F so the strongest
  // grades show on top.
  const distribution = useMemo(() => {
    const byLevel = new Map<number, Record<GradeTier, number> & { total: number; breaks: number }>();
    for (const p of plays) {
      const level = Number(p.level) || 0;
      if (!level) continue;
      const score = Number(p.score) || 0;
      const tier = getGradeTier(p.grade, score);
      let entry = byLevel.get(level);
      if (!entry) {
        entry = { sss: 0, ss: 0, s: 0, aaa: 0, aa: 0, a: 0, b: 0, c: 0, d: 0, f: 0, total: 0, breaks: 0 };
        byLevel.set(level, entry);
      }
      if (p.is_stage_break) entry.breaks += 1;
      entry[tier] += 1;
      entry.total += 1;
    }
    const sorted = Array.from(byLevel.entries()).sort((a, b) => a[0] - b[0]);
    const max = sorted.reduce((m, [, e]) => Math.max(m, e.total), 0);
    return { sorted, max };
  }, [plays]);

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.dayTitle}>{formatDayTitle(dayKey)}</Text>
          <Text style={s.daySub}>
            {plays.length} {plays.length === 1 ? 'play' : 'plays'}
            {distribution.sorted.length > 0
              ? ` · Lv ${distribution.sorted[0][0]}–${distribution.sorted[distribution.sorted.length - 1][0]}`
              : ''}
          </Text>
        </View>
      </View>

      {distribution.sorted.length > 0 ? (
        <View style={s.chartWrap}>
          <Text style={s.eyebrow}>BY LEVEL</Text>
          <View style={s.chartRow}>
            {distribution.sorted.map(([level, e]) => {
              const heightPct = distribution.max > 0 ? e.total / distribution.max : 0;
              return (
                <View key={level} style={s.barCol}>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { height: `${Math.round(heightPct * 100)}%` }]}>
                      {GRADE_TIERS.map((tier) => {
                        const count = e[tier];
                        if (count <= 0) return null;
                        const segPct = (count / e.total) * 100;
                        return (
                          <View key={tier} style={{ height: `${segPct}%`, backgroundColor: TIER_COLORS[tier] }} />
                        );
                      })}
                    </View>
                  </View>
                  <Text style={s.barLabel}>{level}</Text>
                </View>
              );
            })}
          </View>
          <View style={s.legendRow}>
            {(['sss', 'ss', 's', 'aaa', 'aa', 'a'] as GradeTier[]).map((tier) => (
              <View key={tier} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: TIER_COLORS[tier] }]} />
                <Text style={s.legendText}>{tier.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={s.eyebrow}>PLAYS</Text>
      <ScrollView
        style={s.playsScroll}
        contentContainerStyle={s.playsContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        {plays.length === 0 ? (
          <Text style={s.empty}>No plays on this day</Text>
        ) : (
          plays.map((p, i) => {
            const resolved = resolveChartJacketUrl({
              title: p.song_title,
              mode: p.mode,
              level: p.level,
              jacketLookup: jacketMap,
              backgroundUrl: p.background_url,
              jacketUrl: p.jacket_url,
            });
            const jacketUrl = resolved ? fullImageUrl(resolved) : undefined;
            const title = toCanonicalSongTitle(p.song_title || '') || p.song_title || 'Unknown';
            const score = Number(p.score) || 0;
            return (
              <Pressable
                key={`${p.id}-${i}`}
                onPress={() => onPlayPress(p)}
                style={({ pressed }) => [s.playRow, pressed && { opacity: 0.7 }]}>
                <ChartJacket jacketUrl={jacketUrl} mode={p.mode} level={p.level} size="sm" />
                <View style={s.playMain}>
                  <Text style={s.playTitle} numberOfLines={1}>{title}</Text>
                  <Text style={s.playMeta}>
                    {p.mode} {p.level} · {formatTime(p.played_at_utc || p.date_played)}
                  </Text>
                </View>
                <View style={s.playScores}>
                  <Text style={[s.playScore, !!p.is_stage_break && s.playScoreBreak]}>
                    {p.is_stage_break ? 'BREAK' : fmtNum(score)}
                  </Text>
                  <GradeChip grade={p.grade} score={score} size="xs" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 12,
    marginTop: 8,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  dayTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  daySub: { fontSize: 11, color: t.textMuted, paddingTop: 2 },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  closeBtnText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },

  eyebrow: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },

  chartWrap: { gap: 6 },
  chartRow: { flexDirection: 'row' as const, alignItems: 'stretch' as const, gap: 4, height: 76 },
  barCol: { flex: 1, alignItems: 'center' as const, gap: 3, height: '100%' as const },
  barTrack: { flex: 1, width: '100%' as const, justifyContent: 'flex-end' as const, backgroundColor: t.bg, borderRadius: 3, overflow: 'hidden' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  barFill: { width: '100%' as const, overflow: 'hidden' as const, justifyContent: 'flex-end' as const, minHeight: 2 },
  barLabel: { fontSize: 9, color: t.textMuted, fontVariant: ['tabular-nums' as const], fontWeight: '700' as const },
  legendRow: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const, paddingTop: 2 },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 9, color: t.textDim, letterSpacing: 0.5 },

  playsScroll: { maxHeight: 280 },
  playsContent: { gap: 4 },
  empty: { fontSize: 11, color: t.textDim, textAlign: 'center' as const, padding: 16 },
  playRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  playMain: { flex: 1, gap: 2, minWidth: 0 },
  playTitle: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  playMeta: { fontSize: 10, color: t.textMuted },
  playScores: { alignItems: 'flex-end' as const, gap: 2 },
  playScore: { fontSize: 12, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  playScoreBreak: { color: t.danger, fontSize: 10 },
});
