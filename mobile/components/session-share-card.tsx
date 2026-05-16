import { Image } from 'expo-image';
import { useState } from 'react';
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

const COLLAPSED_ROW_COUNT = 5;

function fmtNum(value: number | undefined | null): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function joinSchedule(parts: Array<string | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(' · ');
}

/**
 * Compact card for SHINSA_SHARE_V1 posts. Renders the cover stats (songs,
 * clears, average score / RP) plus all the jackets from the shared run
 * (collapsed to the top 5 by default with an expand toggle). Per-row
 * YouTube replay embeds open via the browser/system handler — mirrors the
 * desktop pumpshinsa.com card so feed-embedded shares aren't truncated.
 */
export function SessionShareCard({ share }: Props) {
  const s = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const isHop = share.shareType === 'hour_of_power';
  const eyebrow = isHop ? 'HOUR OF POWER' : 'SESSION SHARE';
  const title = String(share.sessionTitle || (isHop ? 'Hour of Power' : 'Session share')).trim();
  const schedule = joinSchedule([
    share.sessionDateLabel,
    share.sessionTimeRange,
    share.sessionDurationLabel,
  ]);
  const allRows: SessionShareRow[] = Array.isArray(share.rows) ? share.rows : [];
  const hasMore = allRows.length > COLLAPSED_ROW_COUNT;
  const rows: SessionShareRow[] = expanded || !hasMore
    ? allRows
    : allRows.slice(0, COLLAPSED_ROW_COUNT);
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

  const handleReplayOpen = async (url: string) => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return;
    const supported = await Linking.canOpenURL(trimmed);
    if (supported) Linking.openURL(trimmed);
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
            const replayUrl = String(row.replay_embed_url || '').trim();
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
                {replayUrl ? (
                  <Pressable
                    onPress={() => handleReplayOpen(replayUrl)}
                    hitSlop={8}
                    style={({ pressed }) => [s.replayBtn, pressed && { opacity: 0.7 }]}
                    accessibilityLabel="Open replay clip">
                    <IconSymbol name="play.rectangle.fill" size={12} color="#7dd3fc" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {hasMore ? (
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          style={({ pressed }) => [s.expandBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={expanded ? 'Show top 5 songs' : `Show all ${allRows.length} songs`}>
          <Text style={s.expandBtnText}>
            {expanded ? `Show top ${COLLAPSED_ROW_COUNT}` : `Show all ${allRows.length}`}
          </Text>
        </Pressable>
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

  // Replay clip launcher — small sky-tinted square aligned with web's
  // per-row YouTube badge. Opens the row's replay_embed_url externally.
  replayBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(125, 211, 252, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 211, 252, 0.4)',
  },

  // "Show all N / Show top 5" toggle. Appears under the song list when
  // the share carries more rows than fit in the collapsed view.
  expandBtn: {
    alignSelf: 'center' as const,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  expandBtnText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
});
