import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChartBadge } from '@/components/chart-badge';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { SharedListChart, SharedListMember } from '@shared/api';

const SHARED_LIST_QUERY_KEY = (id: number | string) => ['shared-list', String(id)] as const;
const SHARED_LISTS_QUERY_KEY = ['shared-lists'] as const;

/**
 * Shared list detail. Lists every chart in the squad list along with each
 * member's progress (completion check per chart, headline completed/total
 * count). Members can join or leave the list — non-members see the items
 * but with no per-row check until they join.
 */
export default function SharedListScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sharedListId = Number(id || 0);
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: SHARED_LIST_QUERY_KEY(sharedListId),
    queryFn: () => songsApi.sharedListDetail(sharedListId),
    enabled: !!sharedListId,
  });

  const joinMutation = useMutation({
    mutationFn: () => songsApi.joinSharedList(sharedListId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARED_LIST_QUERY_KEY(sharedListId) });
      queryClient.invalidateQueries({ queryKey: SHARED_LISTS_QUERY_KEY });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => songsApi.leaveSharedList(sharedListId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARED_LIST_QUERY_KEY(sharedListId) });
      queryClient.invalidateQueries({ queryKey: SHARED_LISTS_QUERY_KEY });
      router.back();
    },
  });

  const detail = detailQuery.data;

  // Default the "viewing as" focus to the current user once the data loads.
  const focused = useMemo<SharedListMember | null>(() => {
    if (!detail) return null;
    const id = focusedMemberId ?? user?.id ?? detail.members[0]?.userId ?? null;
    return detail.members.find((m) => m.userId === id) ?? null;
  }, [detail, focusedMemberId, user?.id]);

  const focusedItemMap = useMemo(() => {
    if (!focused) return new Map();
    return new Map(focused.items.map((it) => [it.itemId, it]));
  }, [focused]);

  if (detailQuery.isLoading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Shared list' }} />
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Shared list' }} />
        <View style={s.empty}>
          <Text style={s.emptyTitle}>List not found</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.backBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const ownerAvatar = typeof detail.owner.avatar === 'string' ? fullImageUrl(detail.owner.avatar) : undefined;

  const handleLeave = () => {
    Alert.alert(
      'Leave list?',
      `You'll stop tracking "${detail.name}". You can rejoin from the squad later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
      ],
    );
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: detail.name }} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.headerCard}>
          <View style={s.ownerRow}>
            {ownerAvatar ? (
              <Image source={{ uri: ownerAvatar }} style={s.ownerAvatar} contentFit="cover" />
            ) : (
              <DefaultAvatar size={40} />
            )}
            <View style={s.ownerInfo}>
              <Text style={s.ownerName}>@{detail.owner.username || 'anonymous'}</Text>
              <Text style={s.ownerSub}>{detail.members.length} member{detail.members.length === 1 ? '' : 's'} · {detail.items.length} chart{detail.items.length === 1 ? '' : 's'}</Text>
            </View>
            {detail.isMember ? (
              <Pressable
                onPress={handleLeave}
                disabled={leaveMutation.isPending}
                style={({ pressed }) => [s.leaveBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.leaveBtnText}>Leave</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                style={({ pressed }) => [s.joinBtn, pressed && { opacity: 0.7 }]}>
                {joinMutation.isPending ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={s.joinBtnText}>Join</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>MEMBERS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.membersRow}>
            {detail.members.map((m) => {
              const avatar = typeof m.avatar === 'string' ? fullImageUrl(m.avatar) : undefined;
              const pct = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
              const isFocused = focused?.userId === m.userId;
              return (
                <Pressable
                  key={m.userId}
                  onPress={() => setFocusedMemberId(m.userId)}
                  style={({ pressed }) => [
                    s.memberCard,
                    isFocused && s.memberCardFocused,
                    pressed && { opacity: 0.85 },
                  ]}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={s.memberAvatar} contentFit="cover" />
                  ) : (
                    <DefaultAvatar size={42} />
                  )}
                  <Text style={s.memberName} numberOfLines={1}>{m.username}</Text>
                  <Text style={s.memberPct}>
                    <Text style={[s.memberPctNum, { color: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.textMuted }]}>{pct}%</Text>
                    <Text style={s.memberPctSub}>  {m.completed}/{m.total}</Text>
                  </Text>
                  <View style={s.memberProgressTrack}>
                    <View style={[
                      s.memberProgressFill,
                      { width: `${pct}%`, backgroundColor: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.accent },
                    ]} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>
            CHARTS · viewing as <Text style={s.viewingAs}>@{focused?.username || '—'}</Text>
          </Text>
          <View style={s.itemsCol}>
            {detail.items.map((item) => (
              <SharedItemRow
                key={item.id}
                item={item}
                completed={!!focusedItemMap.get(item.id)?.isComplete}
                attempts={focusedItemMap.get(item.id)?.attempts || 0}
                onOpen={() => router.push({ pathname: '/song/[id]', params: { id: String(item.chartId) } })}
                s={s}
                theme={theme}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function SharedItemRow({
  item,
  completed,
  attempts,
  onOpen,
  s,
  theme,
}: {
  item: SharedListChart;
  completed: boolean;
  attempts: number;
  onOpen: () => void;
  s: Styles;
  theme: ThemeColors;
}) {
  const jacket = item.jacketUrl ? fullImageUrl(item.jacketUrl) : undefined;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.sharedItem, pressed && { opacity: 0.8 }]}>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.sharedItemJacket} contentFit="cover" cachePolicy="memory-disk" recyclingKey={jacket} />
      ) : (
        <View style={[s.sharedItemJacket, s.sharedItemJacketFallback]} />
      )}
      <View style={s.sharedItemText}>
        <Text style={s.sharedItemTitle} numberOfLines={1}>{item.songTitle}</Text>
        <View style={s.sharedItemMeta}>
          <ChartBadge mode={item.mode} level={item.level} size="sm" />
          <Text style={s.sharedItemTarget}>target <Text style={s.sharedItemTargetVal}>{item.target || 'PASS'}</Text></Text>
        </View>
      </View>
      <View style={s.sharedItemRight}>
        {completed ? (
          <IconSymbol name="checkmark.circle.fill" size={26} color="#34d399" />
        ) : attempts > 0 ? (
          <View style={s.attemptsPill}>
            <Text style={s.attemptsPillText}>{attempts}</Text>
            <Text style={s.attemptsPillSub}>tried</Text>
          </View>
        ) : (
          <IconSymbol name="minus.circle" size={22} color={theme.textDim} />
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, gap: 16, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },

  empty: { padding: 32, alignItems: 'center' as const, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  backBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: t.surfaceMuted },
  backBtnText: { color: t.text, fontWeight: '700' as const },

  headerCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
  },
  ownerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  ownerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceMuted },
  ownerInfo: { flex: 1, gap: 2 },
  ownerName: { fontSize: 15, fontWeight: '800' as const, color: t.text },
  ownerSub: { fontSize: 12, color: t.textMuted },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: t.accent,
    minWidth: 70,
    alignItems: 'center' as const,
  },
  joinBtnText: { color: t.bg, fontSize: 13, fontWeight: '800' as const },
  leaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  leaveBtnText: { color: t.textMuted, fontSize: 13, fontWeight: '700' as const },

  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim, paddingHorizontal: 4 },
  viewingAs: { color: t.accent, letterSpacing: 0 },

  membersRow: { gap: 8, paddingHorizontal: 2 },
  memberCard: {
    width: 110,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 10,
    alignItems: 'center' as const,
    gap: 6,
  },
  memberCardFocused: { borderColor: t.accent },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: t.surfaceMuted },
  memberName: { fontSize: 12, fontWeight: '700' as const, color: t.text, textAlign: 'center' as const },
  memberPct: { fontSize: 11, color: t.textMuted, textAlign: 'center' as const },
  memberPctNum: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  memberPctSub: { color: t.textDim, fontVariant: ['tabular-nums' as const] },
  memberProgressTrack: {
    width: '100%' as const,
    height: 4,
    backgroundColor: t.surfaceMuted,
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  memberProgressFill: { height: '100%' as const, borderRadius: 2 },

  itemsCol: { gap: 8 },
  sharedItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
  },
  sharedItemJacket: { width: 56, height: 36, borderRadius: 4, backgroundColor: t.surfaceMuted },
  sharedItemJacketFallback: { backgroundColor: t.surfaceMuted },
  sharedItemText: { flex: 1, gap: 4 },
  sharedItemTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  sharedItemMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  sharedItemTarget: { fontSize: 11, color: t.textDim },
  sharedItemTargetVal: { fontWeight: '900' as const, color: t.text, letterSpacing: 0.5 },
  sharedItemRight: { alignItems: 'center' as const, justifyContent: 'center' as const, minWidth: 40 },
  attemptsPill: { alignItems: 'center' as const },
  attemptsPillText: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  attemptsPillSub: { fontSize: 9, color: t.textDim, letterSpacing: 1, fontWeight: '700' as const },
});
