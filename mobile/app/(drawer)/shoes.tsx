import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { piugameApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { getCountryFlag } from '@/lib/profileMeta';
import type { PiugameShoeStatsModel, PiugameShoeUser } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

function fmtNum(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export default function ShoesScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [focusShoeId, setFocusShoeId] = useState<number | null>(null);
  const { isDesktop } = useBreakpoint();

  const statsQuery = useQuery({
    queryKey: ['shoes-stats', 60],
    queryFn: () => piugameApi.shoesStats({ limit: 60 }),
  });

  const summary = statsQuery.data?.summary;
  const models = statsQuery.data?.results ?? [];

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
        refreshControl={
          <RefreshControl refreshing={statsQuery.isRefetching} onRefresh={() => statsQuery.refetch()} tintColor={theme.spinner} />
        }>
        {statsQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : statsQuery.isError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {statsQuery.error instanceof Error ? statsQuery.error.message : 'Failed to load shoes'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.tagline}>
              See which pairs the Shinsa community is bouncing on right now. Tap any model to peek at the players wearing it.
            </Text>

            {summary ? (
              <View style={s.summaryCard}>
                <SummaryStat label="MODELS" value={fmtNum(summary.total_models)} s={s} />
                <View style={s.summaryDivider} />
                <SummaryStat label="PLAYERS" value={fmtNum(summary.players_with_shoes)} s={s} />
                <View style={s.summaryDivider} />
                <SummaryStat label="ENTRIES" value={fmtNum(summary.total_shoe_entries)} s={s} />
              </View>
            ) : null}

            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>TOP MODELS</Text>
              <Text style={s.sectionCount}>{models.length}</Text>
            </View>

            <View style={s.grid}>
              {models.map((m, i) => (
                <ShoeTile
                  key={m.id}
                  shoe={m}
                  rank={i + 1}
                  onPress={() => setFocusShoeId(m.id)}
                  s={s}
                  extraStyle={isDesktop ? s.shoeTileDesktop : undefined}
                />
              ))}
            </View>

            {models.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>No shoes registered yet — be the first to add a pair from Account.</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ShoeUsersSheet shoeId={focusShoeId} onClose={() => setFocusShoeId(null)} />
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function SummaryStat({ label, value, s }: { label: string; value: string; s: Styles }) {
  return (
    <View style={s.summaryCell}>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

function ShoeTile({
  shoe,
  rank,
  onPress,
  s,
  extraStyle,
}: {
  shoe: PiugameShoeStatsModel;
  rank: number;
  onPress: () => void;
  s: Styles;
  extraStyle?: object;
}) {
  const img = shoe.image_data;
  const rankColor =
    rank === 1 ? '#fbbf24'
    : rank === 2 ? '#e5e7eb'
    : rank === 3 ? '#fb923c'
    : 'rgba(255,255,255,0.35)';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.shoeTile, extraStyle, pressed && { opacity: 0.85 }]}>
      <View style={s.shoeImgWrap}>
        {img ? (
          <Image source={{ uri: img }} style={s.shoeImg} contentFit="contain" />
        ) : (
          <View style={[s.shoeImg, s.shoeImgFallback]}>
            <Text style={s.shoeFallbackEmoji}>👟</Text>
          </View>
        )}
        <View style={[s.shoeRankBadge, { borderColor: rankColor }]}>
          <Text style={[s.shoeRankText, { color: rankColor }]}>#{rank}</Text>
        </View>
      </View>
      <View style={s.shoeInfo}>
        <Text style={s.shoeMake} numberOfLines={1}>{shoe.make || '—'}</Text>
        <Text style={s.shoeModel} numberOfLines={1}>{shoe.model || ''}</Text>
        <View style={s.shoeMetaRow}>
          <Text style={s.shoeMetaItem}>
            <Text style={s.shoeMetaNum}>{shoe.player_count}</Text> player{shoe.player_count === 1 ? '' : 's'}
          </Text>
          {shoe.colorway_count > 0 ? (
            <Text style={s.shoeMetaItem}>
              · <Text style={s.shoeMetaNum}>{shoe.colorway_count}</Text> color{shoe.colorway_count === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ShoeUsersSheet({
  shoeId,
  onClose,
}: {
  shoeId: number | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const visible = shoeId != null;

  const query = useQuery({
    queryKey: ['shoe-users', shoeId],
    queryFn: () => piugameApi.shoeUsers(shoeId as number),
    enabled: visible,
  });

  const data = query.data;
  const shoe = data?.shoe;
  const users = data?.users ?? [];
  // Bubble current wearers to the top — they're the most useful answer to
  // "who's actually playing in these right now?"
  const sortedUsers = [...users].sort((a, b) => {
    if (a.is_current_pair !== b.is_current_pair) return a.is_current_pair ? -1 : 1;
    if (a.has_active_pair !== b.has_active_pair) return a.has_active_pair ? -1 : 1;
    return b.matching_shoe_count - a.matching_shoe_count;
  });

  const goProfile = (username: string) => {
    onClose();
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Pressable style={s.sheetBackdropFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            {shoe?.image_data ? (
              <Image source={{ uri: shoe.image_data }} style={s.sheetShoeImg} contentFit="contain" />
            ) : (
              <View style={[s.sheetShoeImg, s.shoeImgFallback]}>
                <Text style={s.shoeFallbackEmoji}>👟</Text>
              </View>
            )}
            <View style={s.sheetHeaderText}>
              <Text style={s.sheetTitle} numberOfLines={1}>{shoe?.make || '—'}</Text>
              <Text style={s.sheetSubtitle} numberOfLines={1}>{shoe?.model || ''}</Text>
              {shoe ? (
                <Text style={s.sheetMeta}>
                  <Text style={s.sheetMetaNum}>{shoe.player_count}</Text> player{shoe.player_count === 1 ? '' : 's'} · <Text style={s.sheetMetaNum}>{shoe.colorway_count}</Text> color{shoe.colorway_count === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.sheetCloseBtn, pressed && { opacity: 0.6 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          {query.isLoading ? (
            <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
          ) : query.isError ? (
            <Text style={s.errorText}>
              {query.error instanceof Error ? query.error.message : 'Failed to load users'}
            </Text>
          ) : (
            <ScrollView style={s.usersList} contentContainerStyle={s.usersListContent}>
              {sortedUsers.length === 0 ? (
                <Text style={s.emptyText}>No players registered yet.</Text>
              ) : (
                sortedUsers.map((u) => (
                  <UserRow key={u.id} user={u} onProfile={() => goProfile(u.username)} s={s} />
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function UserRow({
  user,
  onProfile,
  s,
}: {
  user: PiugameShoeUser;
  onProfile: () => void;
  s: Styles;
}) {
  const avatar = typeof user.avatar === 'string' ? fullImageUrl(user.avatar) : undefined;
  const flag = getCountryFlag(user.nationality);
  const colorwaysText = (user.colorways || []).filter((c) => !!c).join(' · ');
  return (
    <Pressable onPress={onProfile} style={({ pressed }) => [s.userRow, pressed && { opacity: 0.85 }]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.userAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={36} />
      )}
      <View style={s.userInfo}>
        <View style={s.userNameLine}>
          {flag ? <Text style={s.userFlag}>{flag}</Text> : null}
          <Text style={s.userName} numberOfLines={1}>@{user.username || 'anonymous'}</Text>
          {user.is_current_pair ? (
            <View style={s.wearingPill}>
              <View style={s.wearingPulse} />
              <Text style={s.wearingPillText}>WEARING</Text>
            </View>
          ) : user.has_active_pair ? (
            <View style={s.activePill}>
              <Text style={s.activePillText}>OWNS</Text>
            </View>
          ) : null}
        </View>
        <View style={s.userMetaRow}>
          {user.skill_title ? (
            <Text style={s.userMetaText} numberOfLines={1}>{user.skill_title}</Text>
          ) : null}
          {user.matching_shoe_count > 1 ? (
            <Text style={s.userMetaText}>
              <Text style={s.userMetaNum}>{user.matching_shoe_count}</Text> pairs
            </Text>
          ) : null}
        </View>
        {colorwaysText ? (
          <Text style={s.userColorways} numberOfLines={1}>{colorwaysText}</Text>
        ) : null}
      </View>
      <IconSymbol name="chevron.right" size={14} color="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },

  scroll: { paddingHorizontal: 12, gap: 14 },
  center: { padding: 32, alignItems: 'center' as const },
  errorBox: { padding: 16, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 14, padding: 16, textAlign: 'center' as const },

  tagline: { fontSize: 12, color: t.textMuted, paddingHorizontal: 6, lineHeight: 17 },

  // Summary card
  summaryCard: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  summaryCell: { flex: 1, alignItems: 'center' as const, gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  summaryLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 6 },

  // Section header
  sectionHeaderRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  sectionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },

  // Grid
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  shoeTile: {
    flexBasis: '48.5%' as const,
    flexGrow: 1,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    overflow: 'hidden' as const,
  },
  // Desktop: 4-col grid.
  shoeTileDesktop: { flexBasis: '23.5%' as const, flexGrow: 0 },
  shoeImgWrap: { position: 'relative' as const, aspectRatio: 16 / 10, backgroundColor: 'rgba(255,255,255,0.03)', padding: 12 },
  shoeImg: { width: '100%' as const, height: '100%' as const, backgroundColor: 'transparent' },
  shoeImgFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  shoeFallbackEmoji: { fontSize: 32 },
  shoeRankBadge: {
    position: 'absolute' as const,
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  shoeRankText: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.5, fontVariant: ['tabular-nums' as const] },

  shoeInfo: { padding: 10, gap: 4 },
  shoeMake: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  shoeModel: { fontSize: 14, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  shoeMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 2 },
  shoeMetaItem: { fontSize: 11, color: t.textMuted },
  shoeMetaNum: { color: t.text, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },

  empty: { padding: 32, alignItems: 'center' as const },
  emptyText: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, padding: 12 },

  // Bottom sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  sheetBackdropFill: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '85%' as const,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetShoeImg: { width: 64, height: 48, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  sheetHeaderText: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: 11, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  sheetSubtitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, letterSpacing: 0.2 },
  sheetMeta: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  sheetMetaNum: { color: t.text, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  sheetCloseBtn: { padding: 6 },

  usersList: { maxHeight: 560 },
  usersListContent: { gap: 6, paddingVertical: 10, paddingBottom: 16 },
  userRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  userInfo: { flex: 1, gap: 3 },
  userNameLine: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  userFlag: { fontSize: 13 },
  userName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  userMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  userMetaText: { fontSize: 11, color: t.textMuted },
  userMetaNum: { color: t.text, fontWeight: '800' as const },
  userColorways: { fontSize: 10, color: '#7dd3fc', fontStyle: 'italic' as const },

  wearingPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
  },
  wearingPulse: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#34d399' },
  wearingPillText: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1.2, color: '#34d399' },
  activePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(125, 211, 252, 0.15)',
  },
  activePillText: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1.2, color: '#7dd3fc' },
});
