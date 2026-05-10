import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== 'number' || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ChartDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chartId = Number(id);

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
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: chart?.title || 'Chart' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color="#3b82f6" />
          </View>
        )}

        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : 'Failed to load chart'}
            </Text>
          </View>
        )}

        {chart && (
          <>
            <View style={styles.header}>
              {jacket ? (
                <Image source={{ uri: jacket }} style={styles.jacket} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.jacket, styles.jacketFallback]} />
              )}
              <View style={styles.headerInfo}>
                <ThemedText type="title" style={styles.title} numberOfLines={2}>{chart.title}</ThemedText>
                <Text style={styles.artist} numberOfLines={1}>{chart.artist}</Text>
                <View style={styles.metaRow}>
                  {chart.mode ? <Text style={styles.metaChip}>{chart.mode}</Text> : null}
                  {typeof chart.level === 'number' && chart.level > 0 ? (
                    <Text style={[styles.metaChip, styles.levelChip]}>Lv {chart.level}</Text>
                  ) : null}
                  {chart.bpm ? <Text style={styles.metaChip}>{chart.bpm} BPM</Text> : null}
                  {duration ? <Text style={styles.metaChip}>{duration}</Text> : null}
                </View>
              </View>
            </View>

            {userSummary && (
              <View style={styles.section}>
                <ThemedText type="subtitle">Your record</ThemedText>
                <View style={styles.scoreCard}>
                  <View style={styles.scoreField}>
                    <Text style={styles.scoreLabel}>Best score</Text>
                    <ThemedText style={styles.scoreValue}>{userSummary.best_score?.toLocaleString() ?? '—'}</ThemedText>
                  </View>
                  <View style={styles.scoreField}>
                    <Text style={styles.scoreLabel}>Grade</Text>
                    <ThemedText style={styles.scoreValue}>{userSummary.best_grade || '—'}</ThemedText>
                  </View>
                  <View style={styles.scoreField}>
                    <Text style={styles.scoreLabel}>Status</Text>
                    <ThemedText style={styles.scoreValue}>
                      {userSummary.is_pass ? 'Pass' : userSummary.is_stage_break ? 'Stage break' : '—'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}

            {chart.skills && chart.skills.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="subtitle">Skills</ThemedText>
                  <Text style={styles.sectionCount}>{chart.skills.length}</Text>
                </View>
                <View style={styles.skillsRow}>
                  {chart.skills.map((s) => (
                    <View key={s.slug} style={styles.skillChip}>
                      <Text style={styles.skillChipText}>{s.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 24, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' },
  header: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  jacket: { width: 120, height: 120, borderRadius: 12, backgroundColor: '#1e293b' },
  jacketFallback: {},
  headerInfo: { flex: 1, gap: 6, paddingTop: 4, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  artist: { fontSize: 14, opacity: 0.7 },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaChip: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.15)',
    color: '#cbd5e1',
    fontWeight: '600',
  },
  levelChip: { backgroundColor: 'rgba(59,130,246,0.2)', color: '#60a5fa' },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionCount: { fontSize: 12, opacity: 0.5 },
  scoreCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(148,163,184,0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  scoreField: { flex: 1, gap: 4 },
  scoreLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.5 },
  scoreValue: { fontSize: 18, fontWeight: '700' },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
  },
  skillChipText: { fontSize: 12, color: '#c084fc', fontWeight: '600' },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
});
