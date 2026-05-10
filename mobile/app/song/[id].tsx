import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== 'number' || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ChartDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chartId = Number(id);
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['chart', chartId],
    queryFn: () => songsApi.chartDetail(chartId),
    enabled: Number.isFinite(chartId),
  });

  const chart = data?.chart;
  const userSummary = data?.user_summary;
  const jacket = fullImageUrl(chart?.jacket_url);
  const duration = formatDuration(chart?.duration_seconds);

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: chart?.title || 'Chart' }} />
      <ScrollView contentContainerStyle={s.scroll}>
        {isLoading && (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        )}

        {isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {error instanceof Error ? error.message : 'Failed to load chart'}
            </Text>
          </View>
        )}

        {chart && (
          <>
            <View style={s.header}>
              {jacket ? (
                <Image source={{ uri: jacket }} style={s.jacket} contentFit="cover" transition={200} />
              ) : (
                <View style={[s.jacket, s.jacketFallback]} />
              )}
              <View style={s.headerInfo}>
                <Text style={s.title} numberOfLines={2}>{chart.title}</Text>
                <Text style={s.artist} numberOfLines={1}>{chart.artist}</Text>
                <View style={s.metaRow}>
                  {chart.mode ? <Text style={s.metaChip}>{chart.mode}</Text> : null}
                  {typeof chart.level === 'number' && chart.level > 0 ? (
                    <Text style={[s.metaChip, s.levelChip]}>Lv {chart.level}</Text>
                  ) : null}
                  {chart.bpm ? <Text style={s.metaChip}>{chart.bpm} BPM</Text> : null}
                  {duration ? <Text style={s.metaChip}>{duration}</Text> : null}
                </View>
              </View>
            </View>

            {userSummary && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Your record</Text>
                <View style={s.scoreCard}>
                  <View style={s.scoreField}>
                    <Text style={s.scoreLabel}>Best score</Text>
                    <Text style={s.scoreValue}>{userSummary.best_score?.toLocaleString() ?? '—'}</Text>
                  </View>
                  <View style={s.scoreField}>
                    <Text style={s.scoreLabel}>Grade</Text>
                    <Text style={s.scoreValue}>{userSummary.best_grade || '—'}</Text>
                  </View>
                  <View style={s.scoreField}>
                    <Text style={s.scoreLabel}>Status</Text>
                    <Text style={s.scoreValue}>
                      {userSummary.is_pass ? 'Pass' : userSummary.is_stage_break ? 'Stage break' : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {chart.skills && chart.skills.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Skills</Text>
                  <Text style={s.sectionCount}>{chart.skills.length}</Text>
                </View>
                <View style={s.skillsRow}>
                  {chart.skills.map((sk) => (
                    <View key={sk.slug} style={s.skillChip}>
                      <Text style={s.skillChipText}>{sk.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 20, gap: 24, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' as const },
  header: { flexDirection: 'row' as const, gap: 16, alignItems: 'flex-start' as const },
  jacket: { width: 120, height: 120, borderRadius: 12, backgroundColor: t.card },
  jacketFallback: {},
  headerInfo: { flex: 1, gap: 6, paddingTop: 4, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '800' as const, lineHeight: 28, color: t.text },
  artist: { fontSize: 14, color: t.textMuted },
  metaRow: { flexDirection: 'row' as const, gap: 6, marginTop: 6, flexWrap: 'wrap' as const },
  metaChip: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    fontWeight: '700' as const,
  },
  levelChip: { backgroundColor: t.accentTint, color: t.accent },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  sectionCount: { fontSize: 12, color: t.textDim },
  scoreCard: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    gap: 12,
  },
  scoreField: { flex: 1, gap: 4 },
  scoreLabel: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 1, color: t.textDim },
  scoreValue: { fontSize: 18, fontWeight: '800' as const, color: t.text },
  skillsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: t.surfaceMuted,
    borderWidth: 1,
    borderColor: t.border,
  },
  skillChipText: { fontSize: 12, color: t.skill, fontWeight: '700' as const },
  errorBox: {
    backgroundColor: t.dangerBg,
    borderColor: t.dangerBorder,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: t.danger, fontSize: 14 },
});
