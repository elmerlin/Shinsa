import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChartBadge } from '@/components/chart-badge';
import { GradeChip } from '@/components/grade-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { getGradeDisplayLabel } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { LIST_SORT_OPTIONS, loadSortPref, saveSortPref, sortListItems, type ListItemSortKey } from '@/lib/list-sort';
import type { ThemeColors } from '@/constants/theme';
import type { ListItemTarget, UserList, UserListItem } from '@shared/api';

const LISTS_QUERY_KEY = ['user-lists'] as const;

const TARGET_OPTIONS: ListItemTarget[] = ['PASS', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS', 'SSS+'];

type Dialog = { kind: 'rename' } | { kind: 'clone' } | null;

function timeAgo(ms: number | undefined | null): string {
  if (!ms) return '';
  const d = Date.now() - Number(ms);
  const s = Math.floor(d / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function progressTone(item: UserListItem) {
  // Server-computed `isComplete` factors in the target grade — a bare pass
  // doesn't complete an S/SS/SSS+ target. Fallback to the legacy heuristic
  // only when the field is missing, and only for PASS targets.
  let done: boolean;
  if (typeof item.isComplete === 'boolean') {
    done = item.isComplete;
  } else if (item.target === 'PASS') {
    done = item.passesSinceAdded > 0 || (item.hadPass && item.attempts === 0);
  } else {
    done = false;
  }
  return {
    done,
    color: done ? '#34d399' : item.attempts > 0 ? '#facc15' : '#64748b',
  };
}

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const listId = Number(id || 0);

  const [targetSheet, setTargetSheet] = useState<UserListItem | null>(null);
  const [sort, setSort] = useState<ListItemSortKey>('custom');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState('');
  const { isDesktop } = useBreakpoint();
  const { user } = useAuth();
  // Desktop only: tapping a chart pins it in the right rail instead of
  // routing to /song/[id]. Mobile keeps the drill-down.
  const [selectedItem, setSelectedItem] = useState<UserListItem | null>(null);

  // Hydrate sort pref from storage once.
  useEffect(() => {
    let alive = true;
    loadSortPref().then((v) => { if (alive) setSort(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Single endpoint returns all lists; pluck the one we want. Means item
  // mutations on this screen update the index card cache as a side-effect
  // for free (no second invalidation needed).
  const listsQuery = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => songsApi.lists(),
  });

  const list = useMemo<UserList | undefined>(
    () => listsQuery.data?.lists.find((l) => Number(l.id) === listId),
    [listsQuery.data, listId],
  );

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => songsApi.removeListItem(listId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const targetMutation = useMutation({
    mutationFn: ({ itemId, target }: { itemId: number; target: string }) =>
      songsApi.updateListItemTarget(listId, itemId, target),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => songsApi.reorderList(listId, itemIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => songsApi.renameList(listId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const cloneMutation = useMutation({
    mutationFn: (name: string) => songsApi.cloneList(listId, name),
    onSuccess: (cloned) => {
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
      // Jump straight into the freshly cloned list so the user can start editing it.
      router.replace({ pathname: '/list/[id]', params: { id: String(cloned.id) } });
    },
  });

  const handleRemove = (item: UserListItem) => {
    Alert.alert(
      'Remove from list?',
      `“${item.songTitle}” will be removed from this list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMutation.mutate(item.id),
        },
      ],
    );
  };

  const handleSelectTarget = (target: ListItemTarget) => {
    if (!targetSheet) return;
    targetMutation.mutate({ itemId: targetSheet.id, target });
    setTargetSheet(null);
  };

  const handleMove = (item: UserListItem, direction: -1 | 1) => {
    if (!list) return;
    // Reorder works against the current custom order — switch out of any
    // other sort first so the user sees the change they're about to make.
    const ordered = sortListItems(list.items, 'custom').map((i) => i.id);
    const idx = ordered.indexOf(item.id);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= ordered.length) return;
    const swapped = [...ordered];
    swapped[idx] = ordered[next];
    swapped[next] = ordered[idx];
    reorderMutation.mutate(swapped);
  };

  const openRename = () => {
    if (!list) return;
    setDraftName(list.name);
    setDialog({ kind: 'rename' });
  };

  const openClone = () => {
    if (!list) return;
    setDraftName(`${list.name} copy`);
    setDialog({ kind: 'clone' });
  };

  const closeDialog = () => {
    setDialog(null);
    setDraftName('');
  };

  const submitDialog = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    if (dialog?.kind === 'rename') {
      renameMutation.mutate(trimmed, { onSuccess: closeDialog });
    } else if (dialog?.kind === 'clone') {
      cloneMutation.mutate(trimmed, { onSuccess: closeDialog });
    }
  };

  const dialogPending = renameMutation.isPending || cloneMutation.isPending;

  if (listsQuery.isLoading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'List' }} />
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  if (!list) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'List' }} />
        <View style={s.empty}>
          <Text style={s.emptyTitle}>List not found</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backLink, pressed && { opacity: 0.7 }]}>
            <Text style={s.backLinkText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const total = list.items.length;
  const done = list.items.filter((i) => progressTone(i).done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const orderedItems = useMemo(() => sortListItems(list.items, sort), [list.items, sort]);
  const orderedIds = useMemo(() => sortListItems(list.items, 'custom').map((i) => i.id), [list.items]);
  const reorderEnabled = sort === 'custom';

  const onSortChange = (next: ListItemSortKey) => {
    setSort(next);
    saveSortPref(next);
  };

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () => (
            <View style={s.headerRightRow}>
              <Pressable
                onPress={openRename}
                hitSlop={8}
                style={({ pressed }) => [s.headerRightBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Rename list">
                <IconSymbol name="pencil" size={20} color={theme.text} />
              </Pressable>
              <Pressable
                onPress={openClone}
                hitSlop={8}
                style={({ pressed }) => [s.headerRightBtn, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Clone list">
                <IconSymbol name="doc.on.doc" size={20} color={theme.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={isDesktop ? s.deskRow : { flex: 1 }}>
      {isDesktop ? (
        <View style={s.deskDirectory}>
          <Text style={s.deskDirTitle}>Lists</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.deskDirContent}>
            {(listsQuery.data?.lists ?? []).map((l) => {
              const active = Number(l.id) === listId;
              const items = l.items?.length ?? 0;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => router.replace({ pathname: '/list/[id]', params: { id: String(l.id) } })}
                  onHoverIn={() => undefined}
                  onHoverOut={() => undefined}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    s.deskDirRow,
                    hovered && !active && { backgroundColor: theme.surfaceMuted },
                    active && s.deskDirRowActive,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={[s.deskDirRowName, active && s.deskDirRowNameActive]} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={s.deskDirRowCount}>{items}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView style={isDesktop ? { flex: 1 } : undefined} contentContainerStyle={s.scroll}>
        <View style={s.headerCard}>
          <Text style={s.listName} numberOfLines={2}>{list.name}</Text>
          <Text style={s.headerMeta}>
            <Text style={s.headerNum}>{total}</Text> chart{total === 1 ? '' : 's'}
            {total > 0 ? <> · <Text style={s.headerNum}>{done}</Text> done · <Text style={[s.headerPct, { color: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.textMuted }]}>{pct}%</Text></> : null}
          </Text>
          {total > 0 ? (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.accent }]} />
            </View>
          ) : null}

          <Pressable
            onPress={() => router.push({ pathname: '/list/[id]/add', params: { id: String(listId) } })}
            style={({ pressed }) => [s.addChartsBtn, pressed && { opacity: 0.85 }]}>
            <IconSymbol name="plus" size={16} color={theme.bg} />
            <Text style={s.addChartsBtnText}>Add charts</Text>
          </Pressable>
        </View>

        {list.items.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.sortRow}>
            {LIST_SORT_OPTIONS.map((opt) => {
              const active = sort === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onSortChange(opt.value)}
                  style={({ pressed }) => [
                    s.sortChip,
                    active && s.sortChipActive,
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Text style={[s.sortChipText, active && s.sortChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {list.items.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No charts yet</Text>
            <Text style={s.emptyBody}>Tap “Add charts” above to start curating, or open any song and use “Save to list”.</Text>
          </View>
        ) : (
          <View style={s.itemsCol}>
            {orderedItems.map((item) => {
              const pos = orderedIds.indexOf(item.id);
              const canMoveUp = reorderEnabled && pos > 0;
              const canMoveDown = reorderEnabled && pos >= 0 && pos < orderedIds.length - 1;
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  s={s}
                  theme={theme}
                  reorderEnabled={reorderEnabled}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onOpen={() => {
                    if (isDesktop) {
                      setSelectedItem(item);
                    } else {
                      router.push({ pathname: '/song/[id]', params: { id: String(item.chartId) } });
                    }
                  }}
                  onTarget={() => setTargetSheet(item)}
                  onRemove={() => handleRemove(item)}
                  onMoveUp={() => handleMove(item, -1)}
                  onMoveDown={() => handleMove(item, 1)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      {isDesktop ? (
        <ListChartRail
          item={selectedItem}
          s={s}
          theme={theme}
          onClose={() => setSelectedItem(null)}
          onOpenFull={() => selectedItem && router.push({
            pathname: '/song/[id]',
            params: { id: String(selectedItem.chartId) },
          })}
          onRemove={() => selectedItem && handleRemove(selectedItem)}
          onTarget={() => selectedItem && setTargetSheet(selectedItem)}
          userId={user?.id}
        />
      ) : null}
      </View>

      <Modal
        visible={!!targetSheet}
        animationType="none"
        transparent
        onRequestClose={() => setTargetSheet(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setTargetSheet(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Target grade</Text>
            <Text style={s.sheetHint} numberOfLines={1}>{targetSheet?.songTitle || ''}</Text>
            <View style={s.targetGrid}>
              {TARGET_OPTIONS.map((t) => {
                const active = targetSheet?.target === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => handleSelectTarget(t)}
                    style={({ pressed }) => [
                      s.targetChip,
                      active && s.targetChipActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[s.targetChipText, active && s.targetChipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!dialog} animationType="none" transparent onRequestClose={closeDialog}>
        <Pressable style={s.sheetBackdrop} onPress={closeDialog}>
          <KeyboardAvoidingView
            behavior="padding"
            style={s.dialogWrap}>
            <Pressable style={s.dialog} onPress={(e) => e.stopPropagation()}>
              <Text style={s.sheetTitle}>{dialog?.kind === 'clone' ? 'Clone list' : 'Rename list'}</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="List name"
                placeholderTextColor={theme.textDim}
                style={s.dialogInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitDialog}
                maxLength={60}
                editable={!dialogPending}
              />
              <View style={s.dialogActions}>
                <Pressable
                  onPress={closeDialog}
                  disabled={dialogPending}
                  style={({ pressed }) => [s.dialogBtn, pressed && { opacity: 0.7 }]}>
                  <Text style={s.dialogBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitDialog}
                  disabled={!draftName.trim() || dialogPending}
                  style={({ pressed }) => [
                    s.dialogBtn,
                    s.dialogBtnPrimary,
                    (!draftName.trim() || dialogPending) && { opacity: 0.4 },
                    pressed && { opacity: 0.85 },
                  ]}>
                  {dialogPending ? (
                    <ActivityIndicator color={theme.bg} size="small" />
                  ) : (
                    <Text style={[s.dialogBtnText, s.dialogBtnTextPrimary]}>
                      {dialog?.kind === 'clone' ? 'Clone' : 'Save'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

/**
 * Desktop right rail — selected list item's chart card. Fetches the same
 * chartDetail used by /song/[id] so the panel matches: jacket, your best,
 * friend leaderboard, and shortcuts to set target / remove / open full
 * chart. Pinned via local state in ListDetailScreen.
 */
function ListChartRail({
  item,
  s,
  theme,
  onClose,
  onOpenFull,
  onRemove,
  onTarget,
  userId,
}: {
  item: UserListItem | null;
  s: Styles;
  theme: ThemeColors;
  onClose: () => void;
  onOpenFull: () => void;
  onRemove: () => void;
  onTarget: () => void;
  userId?: string;
}) {
  // Esc clears the rail on web.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && item) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const detail = useQuery({
    queryKey: ['chart', item?.chartId ?? 0, userId ?? null],
    queryFn: () => item
      ? songsApi.chartDetail(item.chartId, userId
          ? { user_id: userId, follow_from_user_id: userId }
          : {})
      : Promise.resolve(null),
    enabled: !!item?.chartId,
    staleTime: 30_000,
  });

  if (!item) {
    return (
      <View style={s.deskChartRailEmpty}>
        <Text style={s.deskChartRailEmptyTitle}>Pick a chart</Text>
        <Text style={s.deskChartRailEmptyHint}>
          Tap a row to see your scores, friend leaderboard, and target.
        </Text>
      </View>
    );
  }

  const chart = detail.data?.chart;
  const userBest = detail.data?.user_summary?.best;
  const friends = detail.data?.friend_records ?? [];
  const jacket = (chart?.jacket_url || item.jacketUrl)
    ? fullImageUrl((chart?.jacket_url || item.jacketUrl) as string)
    : undefined;
  const grade = userBest ? getGradeDisplayLabel(userBest.grade, userBest.score) : '';

  return (
    <View style={s.deskChartRail}>
      <View style={s.deskChartRailHead}>
        <Text style={s.deskChartRailEyebrow}>CHART</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [s.deskChartRailClose, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Close chart panel">
          <IconSymbol name="xmark" size={14} color={theme.textMuted} />
        </Pressable>
      </View>

      {jacket ? (
        <Image source={{ uri: jacket }} style={s.deskChartRailJacket} contentFit="cover" />
      ) : (
        <View style={[s.deskChartRailJacket, { backgroundColor: theme.surfaceMuted }]} />
      )}
      <Text style={s.deskChartRailTitle} numberOfLines={2}>
        {chart?.title || item.songTitle || 'Chart'}
      </Text>
      <View style={s.deskChartRailMetaRow}>
        <ChartBadge mode={chart?.mode || item.mode} level={chart?.level ?? item.level} size="sm" />
        <Text style={s.deskChartRailMeta}>
          target: {item.target || 'PASS'}
        </Text>
      </View>

      <View style={s.deskChartRailSection}>
        <Text style={s.deskChartRailSectionLabel}>Your best</Text>
        {detail.isLoading ? (
          <ActivityIndicator size="small" color={theme.spinner} />
        ) : userBest ? (
          <View style={s.deskChartRailScoreRow}>
            <Text style={s.deskChartRailScoreNum}>{Number(userBest.score || 0).toLocaleString()}</Text>
            {grade ? <Text style={[s.deskChartRailScoreGrade, { color: theme.accent }]}>{grade}</Text> : null}
          </View>
        ) : (
          <Text style={s.deskChartRailEmpty2}>No clear yet.</Text>
        )}
      </View>

      {friends.length > 0 ? (
        <View style={s.deskChartRailSection}>
          <Text style={s.deskChartRailSectionLabel}>Friends</Text>
          <View style={{ gap: 4 }}>
            {friends.slice(0, 5).map((fr, i) => (
              <View key={fr.user.id} style={s.deskChartRailFriendRow}>
                <Text style={s.deskChartRailFriendRank}>{i + 1}</Text>
                <Text style={s.deskChartRailFriendName} numberOfLines={1}>{fr.user.username}</Text>
                <Text style={s.deskChartRailFriendScore}>{Number(fr.best?.score || 0).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.deskChartRailActions}>
        <Pressable
          onPress={onTarget}
          style={({ pressed }) => [s.deskChartRailSecondary, pressed && { opacity: 0.85 }]}>
          <Text style={s.deskChartRailSecondaryText}>Set target</Text>
        </Pressable>
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [s.deskChartRailDanger, pressed && { opacity: 0.85 }]}>
          <Text style={s.deskChartRailDangerText}>Remove from list</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onOpenFull}
        style={({ pressed }) => [s.deskChartRailPrimary, pressed && { opacity: 0.85 }]}>
        <Text style={s.deskChartRailPrimaryText}>Open full chart →</Text>
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  s,
  theme,
  reorderEnabled,
  canMoveUp,
  canMoveDown,
  onOpen,
  onTarget,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: UserListItem;
  s: Styles;
  theme: ThemeColors;
  reorderEnabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onTarget: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const jacket = item.jacketUrl ? fullImageUrl(item.jacketUrl) : undefined;
  const tone = progressTone(item);

  // IMPORTANT: same nested-Pressable fix as the list-cards screen — action
  // buttons (reorder, target, remove) are siblings of the navigation Pressable,
  // not children, so their taps can never fall through to "open the chart".
  return (
    <View style={s.itemRow}>
      {reorderEnabled ? (
        <View style={s.reorderCol}>
          <Pressable
            onPress={onMoveUp}
            disabled={!canMoveUp}
            hitSlop={8}
            style={({ pressed }) => [s.reorderBtn, !canMoveUp && { opacity: 0.2 }, pressed && canMoveUp && { opacity: 0.6 }]}
            accessibilityLabel="Move up">
            <IconSymbol name="arrow.up.circle.fill" size={22} color={theme.textMuted} />
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={!canMoveDown}
            hitSlop={8}
            style={({ pressed }) => [s.reorderBtn, !canMoveDown && { opacity: 0.2 }, pressed && canMoveDown && { opacity: 0.6 }]}
            accessibilityLabel="Move down">
            <IconSymbol name="arrow.down.circle.fill" size={22} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}
      <View style={s.itemMain}>
        {/* Navigation zone: only the jacket + title + chart badge open the
            chart. Target pill + attempt info are siblings below. */}
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [s.itemNavZone, pressed && { opacity: 0.7 }]}
          accessibilityLabel={`Open ${item.songTitle}`}>
          {jacket ? (
            <Image source={{ uri: jacket }} style={s.itemJacket} contentFit="cover" cachePolicy="memory-disk" recyclingKey={jacket} />
          ) : (
            <View style={[s.itemJacket, s.itemJacketFallback]} />
          )}
          <View style={s.itemText}>
            <Text style={s.itemTitle} numberOfLines={1}>{item.songTitle}</Text>
            <View style={s.itemMeta}>
              <ChartBadge mode={item.mode} level={item.level} size="sm" />
              {item.originalGrade ? (
                <View style={s.itemMetaRow}>
                  <Text style={s.itemMetaLabel}>was</Text>
                  <GradeChip grade={item.originalGrade} score={item.originalScore} size="sm" />
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        <View style={s.itemBottomRow}>
          <Pressable
            onPress={onTarget}
            hitSlop={8}
            style={({ pressed }) => [s.targetPill, pressed && { opacity: 0.7 }]}>
            <Text style={s.targetPillLabel}>TARGET</Text>
            <Text style={s.targetPillValue}>{item.target || 'PASS'}</Text>
          </Pressable>
          <View style={[s.attemptDot, { backgroundColor: tone.color }]} />
          <Text style={s.attemptText} numberOfLines={1}>
            {item.attempts > 0 ? `${item.passesSinceAdded}/${item.attempts}` : 'no attempts'}
            {' · added '}{timeAgo(item.addedAt)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={10}
        style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.6 }]}
        accessibilityLabel="Remove from list">
        <IconSymbol name="minus.circle" size={20} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, gap: 12, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },

  headerRightRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 4 },
  headerRightBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },

  headerCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 16,
    gap: 8,
  },
  addChartsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: t.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  addChartsBtnText: { color: t.bg, fontSize: 14, fontWeight: '800' as const },

  sortRow: { gap: 6, paddingHorizontal: 2, paddingBottom: 4 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  sortChipActive: { backgroundColor: t.card, borderColor: t.accent },
  sortChipText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  sortChipTextActive: { color: t.text },

  reorderCol: {
    width: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
    marginRight: -4,
  },
  reorderBtn: { padding: 1 },
  listName: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3 },
  headerMeta: { fontSize: 13, color: t.textMuted },
  headerNum: { color: t.text, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  headerPct: { fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
    marginTop: 4,
  },
  progressFill: { height: '100%' as const, borderRadius: 3 },

  empty: { padding: 32, alignItems: 'center' as const, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  emptyBody: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, lineHeight: 19 },
  backLink: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: t.surfaceMuted },
  backLinkText: { color: t.text, fontWeight: '700' as const },

  itemsCol: { gap: 8 },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
  },
  itemMain: { flex: 1, gap: 8 },
  // Inner row containing the jacket + text, wrapped by the navigation
  // Pressable. The bottom row (target pill + attempts) is a sibling below.
  itemNavZone: { flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const },
  itemJacket: { width: 60, height: 38, borderRadius: 4, backgroundColor: t.surfaceMuted },
  itemJacketFallback: { backgroundColor: t.surfaceMuted },
  itemText: { flex: 1, gap: 6 },
  itemTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  itemMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  itemMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  itemMetaLabel: { fontSize: 10, fontWeight: '700' as const, color: t.textDim, letterSpacing: 1 },
  itemBottomRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },

  targetPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  targetPillLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  targetPillValue: { fontSize: 12, fontWeight: '900' as const, color: t.text, letterSpacing: 0.5 },

  attemptDot: { width: 8, height: 8, borderRadius: 4 },
  attemptText: { fontSize: 11, color: t.textDim, flex: 1 },

  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 4,
  },

  // Target sheet + dialog
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' as const, padding: 24 },
  sheet: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 18,
    gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  sheetHint: { fontSize: 12, color: t.textMuted },
  targetGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  targetChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: t.surfaceMuted,
    minWidth: 64,
    alignItems: 'center' as const,
  },
  targetChipActive: { backgroundColor: t.accent },
  targetChipText: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  targetChipTextActive: { color: t.bg },

  dialogWrap: { width: '100%' as const },
  dialog: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 18,
    gap: 14,
  },
  dialogInput: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  dialogActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8 },
  dialogBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dialogBtnPrimary: { backgroundColor: t.accent },
  dialogBtnText: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  dialogBtnTextPrimary: { color: t.bg },

  // Desktop 3-col layout: directory left, list contents center, chart rail right.
  deskRow: { flex: 1, flexDirection: 'row' as const, alignItems: 'stretch' as const },
  deskDirectory: {
    width: 240,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
    backgroundColor: t.surface,
  },
  deskDirTitle: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  deskDirContent: { paddingHorizontal: 8, paddingBottom: 16, gap: 2 },
  deskDirRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  deskDirRowActive: { backgroundColor: t.accentTint },
  deskDirRowName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text, minWidth: 0 },
  deskDirRowNameActive: { color: t.accent, fontWeight: '800' as const },
  deskDirRowCount: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.textDim,
    fontVariant: ['tabular-nums' as const],
  },

  // Right chart rail.
  deskChartRail: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 16,
    gap: 12,
  },
  deskChartRailEmpty: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 32,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deskChartRailEmptyTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  deskChartRailEmptyHint: {
    fontSize: 12,
    color: t.textMuted,
    textAlign: 'center' as const,
    maxWidth: 280,
  },
  deskChartRailHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  deskChartRailEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  deskChartRailClose: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deskChartRailJacket: { width: '100%' as const, aspectRatio: 1, borderRadius: 10 },
  deskChartRailTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  deskChartRailMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  deskChartRailMeta: { fontSize: 11, color: t.textMuted, letterSpacing: 0.4 },
  deskChartRailSection: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  deskChartRailSectionLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  deskChartRailScoreRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  deskChartRailScoreNum: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  deskChartRailScoreGrade: { fontSize: 14, fontWeight: '800' as const, letterSpacing: 0.5 },
  deskChartRailEmpty2: { fontSize: 12, color: t.textMuted },
  deskChartRailFriendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 2,
  },
  deskChartRailFriendRank: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.textDim,
    minWidth: 14,
    fontVariant: ['tabular-nums' as const],
  },
  deskChartRailFriendName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  deskChartRailFriendScore: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  deskChartRailActions: { flexDirection: 'row' as const, gap: 6 },
  deskChartRailSecondary: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
  },
  deskChartRailSecondaryText: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  deskChartRailDanger: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.dangerBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.dangerBorder,
    alignItems: 'center' as const,
  },
  deskChartRailDangerText: { fontSize: 12, fontWeight: '700' as const, color: t.danger },
  deskChartRailPrimary: {
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  deskChartRailPrimaryText: {
    fontSize: 13,
    fontWeight: '900' as const,
    color: t.textOnAccent,
    letterSpacing: 0.4,
  },
});
