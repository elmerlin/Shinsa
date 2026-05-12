import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { GradeChip } from '@/components/grade-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { SessionShare, SessionShareRow } from '@/lib/sessionShareMarker';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  share: SessionShare;
}

function fmtNum(value: number | undefined | null): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function joinSchedule(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(' · ');
}

/**
 * Compact card for SHINSA_SHARE_V1 posts. Renders the cover stats (songs,
 * clears, average score / RP) plus up to four jackets from the shared run.
 * Mirrors the web's SessionShareCard but trimmed to fit a feed post on phone.
 */
export function SessionShareCard({ share }: Props) {
  const s = useThemedStyles(makeStyles);
  const isHop = share.shareType === 'hour_of_power';
  const eyebrow = isHop ? 'HOUR OF POWER' : 'SESSION SHARE';
  const title = String(share.sessionTitle || (isHop ? 'Hour of Power' : 'Session share')).trim();
  const schedule = joinSchedule([
    share.sessionDateLabel,
    share.sessionTimeRange,
    share.sessionDurationLabel,
  ]);
  const rows: SessionShareRow[] = Array.isArray(share.rows) ? share.rows.slice(0, 4) : [];
  const filterBits = [
    share.filterMode && share.filterMode !== 'Both' ? share.filterMode : '',
    share.minGradeLabel ? `≥ ${share.minGradeLabel}` : '',
    share.levelRangeLabel || '',
  ].filter(Boolean).join(' · ');
  const machine = String(share.sessionMachineName || '').trim();
  const avgRP = Number(share.averageRatingPoints) || 0;

  const handleStreamOpen = async () => {
    const url = String(share.streamUrl || '').trim();
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) Linking.openURL(url);
  };

  return (
    <View style={[s.card, isHop && s.cardHop]}>
      <View style={s.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.eyebrow, isHop && s.eyebrowHop]}>{eyebrow}</Text>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          {schedule ? <Text style={s.meta} numberOfLines={1}>{schedule}</Text> : null}
          {machine ? <Text style={s.metaDim} numberOfLines={1}>{machine}</Text> : null}
          {filterBits ? <Text style={s.metaDim} numberOfLines={1}>{filterBits}</Text> : null}
        </View>
        {share.streamUrl ? (
          <Pressable onPress={handleStreamOpen} hitSlop={6} style={({ pressed }) => [s.streamPill, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="play.rectangle.fill" size={11} color="#7dd3fc" />
            <Text style={s.streamPillText}>STREAM</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={s.statsGrid}>
        <Stat label="SONGS" value={fmtNum(share.songCount)} s={s} />
        <Stat
          label="CLEARS"
          value={`${fmtNum(share.clearCount)}/${fmtNum(share.songCount)}`}
          sub={typeof share.clearRate === 'number' ? `${share.clearRate}%` : undefined}
          s={s}
        />
        <Stat label="AVG SCORE" value={fmtNum(share.averageScore)} s={s} />
        <Stat
          label={isHop ? 'TOTAL RP' : 'AVG RP'}
          value={fmtNum(isHop ? share.totalRatingPoints : Math.round(avgRP))}
          s={s}
        />
      </View>

      {rows.length > 0 ? (
        <View style={s.songsRow}>
          {rows.map((row, i) => {
            const jacketUrl = row.jacket_url ? fullImageUrl(row.jacket_url) : undefined;
            return (
              <View key={i} style={s.songCell}>
                <ChartJacket
                  jacketUrl={jacketUrl}
                  mode={row.mode}
                  level={row.level}
                  size="xs"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.songTitle} numberOfLines={1}>{row.song_title || 'Unknown'}</Text>
                  <View style={s.songMetaRow}>
                    {row.score && row.score > 0 ? (
                      <Text style={s.songScore}>{fmtNum(row.score)}</Text>
                    ) : null}
                    {row.grade ? <GradeChip grade={row.grade} score={row.score ?? 0} size="xs" /> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, sub, s }: { label: string; value: string; sub?: string; s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>> }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    padding: 12,
    gap: 10,
  },
  cardHop: {
    borderColor: 'rgba(251, 191, 36, 0.45)',
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
  },

  headerRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  eyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.accent },
  eyebrowHop: { color: '#fbbf24' },
  title: { fontSize: 16, fontWeight: '900' as const, color: t.text, marginTop: 2, letterSpacing: 0.2 },
  meta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  metaDim: { fontSize: 11, color: t.textDim, marginTop: 1 },

  streamPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(125, 211, 252, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.4)',
  },
  streamPillText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 0.8, color: '#7dd3fc' },

  statsGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  statTile: {
    flexBasis: '47%' as const,
    flexGrow: 1,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  statValue: { fontSize: 16, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statSub: { fontSize: 10, color: t.textDim },

  songsRow: { gap: 6 },
  songCell: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  songTitle: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  songMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  songScore: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
});
