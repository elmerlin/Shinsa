import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { GradeChip } from '@/components/grade-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  /** When null/empty, the sheet renders nothing — gating happens at the parent. */
  mode: string | null;
  level: number | null;
  /** ID of the user whose profile we're viewing. Highlighted in blue in the list. */
  profileUserId?: string;
  /** ID of the viewer (signed-in user). Highlighted in accent in the list.
   *  If both match, the row gets the violet "both" highlight. */
  viewerUserId?: string;
  onClose: () => void;
}

function modeShort(mode: string): string {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  if (mode === 'CoOp') return 'C';
  return '?';
}

function modeAccent(mode: string): string {
  if (mode === 'Single') return '#ff7a7a';
  if (mode === 'Double') return '#4cf4aa';
  if (mode === 'CoOp') return '#7dd3fc';
  return '#94a3b8';
}

/** Tailwind-ish medal colors for the rank pill. Top 3 get gold/silver/bronze;
 *  everyone else stays neutral so the eye flows down the list. */
function rankColor(rank: number): string {
  if (rank === 1) return '#fde047';
  if (rank === 2) return '#e2e8f0';
  if (rank === 3) return '#fb923c';
  return '#94a3b8';
}

function fmtNum(n: number | undefined | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

/**
 * Drill-down for the profile's RANKINGS row. When the user taps `S25 · Top 12%`
 * we open this sheet, fetch `/songs/analytics/level-leaderboard?mode=...&level=...`,
 * and show the actual ranked players. Mirrors the web's `LeaderboardModal`.
 */
export function LevelLeaderboardSheet({
  visible,
  mode,
  level,
  profileUserId,
  viewerUserId,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const enabled = visible && !!mode && !!level && level > 0;
  const query = useQuery({
    queryKey: ['level-leaderboard', mode, level, profileUserId ?? null],
    queryFn: () => songsApi.levelLeaderboard({
      mode: mode as string,
      level: level as number,
      scope: 'global',
      user_id: profileUserId,
    }),
    enabled,
    staleTime: 30_000,
  });

  if (!visible || !mode || !level) return null;

  const accent = modeAccent(mode);
  const label = `${modeShort(mode)}${level}`;
  const leaderboard = query.data?.leaderboard ?? [];
  const total = query.data?.total_users ?? 0;

  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>LEADERBOARD</Text>
              <Text style={s.title}>
                <Text style={{ color: accent }}>{label}</Text> · Top players
              </Text>
              <Text style={s.subtitle}>Ranked by average best score across cleared charts.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          {query.isLoading ? (
            <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
          ) : query.isError ? (
            <Text style={s.errorText}>
              {query.error instanceof Error ? query.error.message : 'Failed to load leaderboard'}
            </Text>
          ) : leaderboard.length === 0 ? (
            <View style={s.center}>
              <Text style={s.emptyText}>No players have synced scores at this level yet.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={s.list}>
              {leaderboard.map((entry) => {
                const isProfile = profileUserId && entry.user_id === profileUserId;
                const isViewer = viewerUserId && entry.user_id === viewerUserId;
                const isBoth = isProfile && isViewer;
                const rowStyle = [
                  s.row,
                  isBoth ? s.rowBoth : isViewer ? s.rowViewer : isProfile ? s.rowProfile : null,
                ];
                const avatarUrl = entry.avatar ? fullImageUrl(entry.avatar) : '';
                return (
                  <Pressable
                    key={entry.user_id}
                    onPress={() => {
                      onClose();
                      router.push({ pathname: '/profile/[id]', params: { id: entry.user_id } });
                    }}
                    style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>
                    <Text style={[s.rank, { color: rankColor(entry.rank) }]}>{entry.rank}</Text>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
                    ) : (
                      <DefaultAvatar size={28} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.username} numberOfLines={1}>
                        {entry.username}
                        {isViewer ? <Text style={s.youTag}> (you)</Text> : null}
                        {isProfile && !isViewer ? <Text style={s.profileTag}> (profile)</Text> : null}
                      </Text>
                      {entry.chart_count > 0 ? (
                        <Text style={s.rowMeta}>{entry.chart_count} chart{entry.chart_count === 1 ? '' : 's'} cleared</Text>
                      ) : null}
                    </View>
                    <View style={s.scoreCol}>
                      <Text style={s.score}>{fmtNum(entry.avg_score)}</Text>
                      <GradeChip grade={entry.grade} score={entry.avg_score} size="xs" />
                    </View>
                  </Pressable>
                );
              })}
              <Text style={s.footer}>
                {total} player{total === 1 ? '' : 's'} ranked
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 10,
    maxHeight: '85%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },

  headerRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, paddingHorizontal: 4 },
  eyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  subtitle: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  closeBtn: { padding: 6 },

  center: { padding: 24, alignItems: 'center' as const },
  emptyText: { fontSize: 12, color: t.textDim },
  errorText: { padding: 16, color: t.danger, fontSize: 12, textAlign: 'center' as const },

  list: { paddingHorizontal: 2 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    marginBottom: 6,
  },
  rowProfile: { borderColor: 'rgba(125, 211, 252, 0.55)', backgroundColor: 'rgba(125, 211, 252, 0.08)' },
  rowViewer: { borderColor: 'rgba(168, 85, 247, 0.55)', backgroundColor: 'rgba(168, 85, 247, 0.10)' },
  rowBoth: { borderColor: 'rgba(192, 132, 252, 0.7)', backgroundColor: 'rgba(192, 132, 252, 0.14)' },
  rank: { width: 24, textAlign: 'center' as const, fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  username: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  youTag: { color: t.accent, fontWeight: '900' as const },
  profileTag: { color: '#7dd3fc', fontWeight: '900' as const },
  rowMeta: { fontSize: 10, color: t.textDim, marginTop: 1 },
  scoreCol: { alignItems: 'flex-end' as const, gap: 2, minWidth: 80 },
  score: { fontSize: 12, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  footer: { textAlign: 'center' as const, paddingVertical: 14, fontSize: 11, color: t.textDim },
});
