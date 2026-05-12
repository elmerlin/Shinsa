import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { HamburgerButton } from '@/components/hamburger-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { SharedListSummary, UserList, UserListItem } from '@shared/api';

const LISTS_QUERY_KEY = ['user-lists'] as const;
const SHARED_LISTS_QUERY_KEY = ['shared-lists'] as const;

type Mode =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'rename'; list: UserList }
  | { kind: 'clone'; list: UserList };

function isItemComplete(item: UserListItem): boolean {
  // Server-computed flag is authoritative — it factors in the target grade
  // and the user's current best score, not just whether any pass exists.
  // Fallback heuristic only kicks in if the server didn't send the field
  // (old API response, network glitch), and it's deliberately conservative:
  // a bare pass only counts for a PASS target.
  if (typeof item.isComplete === 'boolean') return item.isComplete;
  if (item.target === 'PASS') {
    return item.passesSinceAdded > 0 || (item.hadPass && item.attempts === 0);
  }
  return false;
}

function listProgress(list: UserList): { done: number; total: number; pct: number } {
  const total = list.items.length;
  const done = list.items.filter(isItemComplete).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

type SortKey = 'name' | 'progress' | 'recent' | 'most';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'progress', label: 'Progress' },
  { value: 'most', label: 'Most charts' },
  { value: 'name', label: 'A → Z' },
];

function applySort(lists: UserList[], sort: SortKey): UserList[] {
  const copy = [...lists];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'progress': {
      // Highest completion % first; ties broken by chart count desc.
      return copy.sort((a, b) => {
        const ap = listProgress(a), bp = listProgress(b);
        if (bp.pct !== ap.pct) return bp.pct - ap.pct;
        return bp.total - ap.total;
      });
    }
    case 'most':
      return copy.sort((a, b) => b.items.length - a.items.length);
    case 'recent':
    default:
      // Newest createdAt first. Falls back to id if dates are missing.
      return copy.sort((a, b) => {
        const at = Date.parse(a.createdAt || '') || a.id;
        const bt = Date.parse(b.createdAt || '') || b.id;
        return bt - at;
      });
  }
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [draftName, setDraftName] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const listsQuery = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => songsApi.lists(),
  });

  const sharedQuery = useQuery({
    queryKey: SHARED_LISTS_QUERY_KEY,
    queryFn: () => songsApi.sharedLists(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => songsApi.createList(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ listId, name }: { listId: number; name: string }) => songsApi.renameList(listId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const cloneMutation = useMutation({
    mutationFn: ({ listId, name }: { listId: number; name?: string }) => songsApi.cloneList(listId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (listId: number) => songsApi.deleteList(listId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY }),
  });

  const sortedLists = applySort(listsQuery.data?.lists ?? [], sort);
  const sharedLists = sharedQuery.data?.sharedLists ?? [];

  const submitDialog = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    if (mode.kind === 'create') {
      createMutation.mutate(trimmed, {
        onSuccess: () => {
          setMode({ kind: 'idle' });
          setDraftName('');
        },
      });
    } else if (mode.kind === 'rename') {
      renameMutation.mutate({ listId: mode.list.id, name: trimmed }, {
        onSuccess: () => {
          setMode({ kind: 'idle' });
          setDraftName('');
        },
      });
    } else if (mode.kind === 'clone') {
      cloneMutation.mutate({ listId: mode.list.id, name: trimmed }, {
        onSuccess: () => {
          setMode({ kind: 'idle' });
          setDraftName('');
        },
      });
    }
  };

  const closeDialog = () => {
    setMode({ kind: 'idle' });
    setDraftName('');
  };

  const openCreate = () => {
    setDraftName('');
    setMode({ kind: 'create' });
  };

  const openRename = (list: UserList) => {
    setDraftName(list.name);
    setMode({ kind: 'rename', list });
  };

  const openClone = (list: UserList) => {
    setDraftName(`${list.name} copy`);
    setMode({ kind: 'clone', list });
  };

  const confirmDelete = (list: UserList) => {
    Alert.alert(
      'Delete list?',
      `“${list.name}” will be permanently removed along with its ${list.items.length} chart${list.items.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(list.id),
        },
      ],
    );
  };

  const dialogPending = createMutation.isPending || renameMutation.isPending || cloneMutation.isPending;
  const dialogTitle = mode.kind === 'rename'
    ? 'Rename list'
    : mode.kind === 'clone'
      ? 'Clone list'
      : 'New list';
  const dialogPlaceholder = mode.kind === 'clone'
    ? 'New list name'
    : 'e.g. SSS+ Push, Doubles Grind';
  const dialogPrimaryLabel = mode.kind === 'rename'
    ? 'Save'
    : mode.kind === 'clone'
      ? 'Clone'
      : 'Create';

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <HamburgerButton />
        <Text style={s.heading}>Lists</Text>
        <View style={s.topBarSpacer} />
        <Pressable
          onPress={openCreate}
          hitSlop={6}
          style={({ pressed }) => [s.headerCreate, pressed && { opacity: 0.7 }]}
          accessibilityLabel="New list">
          <IconSymbol name="plus" size={20} color={theme.bg} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={listsQuery.isRefetching}
            onRefresh={() => listsQuery.refetch()}
            tintColor={theme.spinner}
          />
        }>
        {listsQuery.isLoading ? (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        ) : listsQuery.isError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {listsQuery.error instanceof Error ? listsQuery.error.message : 'Failed to load lists'}
            </Text>
          </View>
        ) : sortedLists.length === 0 && sharedLists.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No lists yet</Text>
            <Text style={s.emptyBody}>Curate charts you want to push to a target grade. Open a song and tap “Save to list” to start.</Text>
            <Pressable
              onPress={openCreate}
              style={({ pressed }) => [s.emptyCta, pressed && { opacity: 0.8 }]}>
              <IconSymbol name="plus" size={16} color={theme.bg} />
              <Text style={s.emptyCtaText}>Create your first list</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {sortedLists.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.sortRow}>
                {SORT_OPTIONS.map((opt) => {
                  const active = sort === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSort(opt.value)}
                      style={({ pressed }) => [
                        s.sortChip,
                        active && s.sortChipActive,
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={[s.sortChipText, active && s.sortChipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={s.listGroup}>
              {sortedLists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  s={s}
                  theme={theme}
                  onOpen={() => router.push({ pathname: '/list/[id]', params: { id: String(list.id) } })}
                  onRename={() => openRename(list)}
                  onClone={() => openClone(list)}
                  onDelete={() => confirmDelete(list)}
                />
              ))}
            </View>

            {sharedLists.length > 0 ? (
              <View style={s.sharedSection}>
                <View style={s.sharedHeader}>
                  <Text style={s.sharedHeading}>SHARED WITH YOU</Text>
                  <Text style={s.sharedCount}>{sharedLists.length}</Text>
                </View>
                <View style={s.listGroup}>
                  {sharedLists.map((sl) => (
                    <SharedListCard
                      key={sl.id}
                      summary={sl}
                      s={s}
                      theme={theme}
                      onOpen={() => router.push({ pathname: '/shared-list/[id]', params: { id: String(sl.id) } })}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={mode.kind !== 'idle'} animationType="fade" transparent onRequestClose={closeDialog}>
        <Pressable style={s.dialogBackdrop} onPress={closeDialog}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={s.dialogWrap}>
            <Pressable style={s.dialog} onPress={(e) => e.stopPropagation()}>
              <Text style={s.dialogTitle}>{dialogTitle}</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder={dialogPlaceholder}
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
                      {dialogPrimaryLabel}
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

function ListCard({
  list,
  s,
  theme,
  onOpen,
  onRename,
  onClone,
  onDelete,
}: {
  list: UserList;
  s: Styles;
  theme: ThemeColors;
  onOpen: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const { done, total, pct } = listProgress(list);
  // IMPORTANT: action buttons are siblings of the nav Pressable, not children.
  // Nested Pressables on Android can let the parent claim the gesture before
  // the child fires `onPress`, which is why "I cannot delete them" — the tap
  // landed inside the navigation hit area and opened the list instead.
  return (
    <View style={s.card}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.cardNavZone, pressed && { opacity: 0.85 }]}
        accessibilityLabel={`Open list ${list.name}`}>
        <Text style={s.cardName} numberOfLines={1}>{list.name}</Text>

        <View style={s.cardMeta}>
          <Text style={s.cardMetaText}>
            <Text style={s.cardMetaNum}>{total}</Text> chart{total === 1 ? '' : 's'}
            {total > 0 ? (
              <>
                {' · '}
                <Text style={s.cardMetaNum}>{done}</Text> done
                {' · '}
                <Text style={[s.cardMetaPct, { color: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.textMuted }]}>{pct}%</Text>
              </>
            ) : null}
          </Text>
        </View>

        {total > 0 ? (
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: pct === 100 ? '#34d399' : pct >= 50 ? '#facc15' : theme.accent }]} />
          </View>
        ) : null}
      </Pressable>

      {/* Action row lives OUTSIDE the navigation Pressable so taps here can't
          be intercepted. */}
      <View style={s.cardActions}>
        <Pressable
          onPress={onRename}
          hitSlop={10}
          style={({ pressed }) => [s.cardIconBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel={`Rename list ${list.name}`}>
          <IconSymbol name="square.and.pencil" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable
          onPress={onClone}
          hitSlop={10}
          style={({ pressed }) => [s.cardIconBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel={`Clone list ${list.name}`}>
          <IconSymbol name="doc.on.doc" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => [s.cardIconBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel={`Delete list ${list.name}`}>
          <IconSymbol name="trash" size={18} color={theme.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function SharedListCard({
  summary,
  s,
  theme,
  onOpen,
}: {
  summary: SharedListSummary;
  s: Styles;
  theme: ThemeColors;
  onOpen: () => void;
}) {
  const avatar = typeof summary.owner.avatar === 'string' ? fullImageUrl(summary.owner.avatar) : undefined;
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.sharedCard, pressed && { opacity: 0.85 }]}>
      <View style={s.sharedAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.sharedAvatarImg} contentFit="cover" />
        ) : (
          <DefaultAvatar size={36} />
        )}
      </View>
      <View style={s.sharedBody}>
        <Text style={s.sharedName} numberOfLines={1}>{summary.name}</Text>
        <View style={s.sharedMetaRow}>
          <Text style={s.sharedMetaOwner}>@{summary.owner.username || 'anonymous'}</Text>
          <Text style={s.sharedMetaDot}>·</Text>
          <View style={s.sharedMetaItem}>
            <IconSymbol name="person.2.fill" size={11} color={theme.textDim} />
            <Text style={s.sharedMetaText}>{summary.memberCount}</Text>
          </View>
          <Text style={s.sharedMetaDot}>·</Text>
          <Text style={s.sharedMetaText}>{summary.itemCount} chart{summary.itemCount === 1 ? '' : 's'}</Text>
        </View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={theme.textDim} />
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
  topBarSpacer: { flex: 1 },
  headerCreate: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  scroll: { paddingHorizontal: 12, gap: 12 },
  center: { padding: 32, alignItems: 'center' as const },

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
  errorBox: { padding: 16, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder },
  errorText: { color: t.danger, fontSize: 14 },

  empty: { padding: 32, alignItems: 'center' as const, gap: 12, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800' as const, color: t.text },
  emptyBody: { fontSize: 13, color: t.textMuted, textAlign: 'center' as const, lineHeight: 19 },
  emptyCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: t.accent,
    marginTop: 8,
  },
  emptyCtaText: { color: t.bg, fontSize: 14, fontWeight: '800' as const },

  listGroup: { gap: 10 },

  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
  },
  // The tappable region that opens the list — only the body, not the action
  // strip. Action buttons sit as siblings so they reliably handle their own
  // taps (the previous nested-Pressable layout had reports of taps falling
  // through to the parent on some devices).
  cardNavZone: { flex: 1, gap: 8, paddingVertical: 4 },
  cardName: { fontSize: 17, fontWeight: '800' as const, color: t.text, letterSpacing: 0.2 },
  cardActions: { flexDirection: 'column' as const, gap: 2, alignItems: 'center' as const },
  cardIconBtn: {
    width: 36,
    height: 32,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardMeta: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  cardMetaText: { fontSize: 13, color: t.textMuted },
  cardMetaNum: { color: t.text, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  cardMetaPct: { fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },

  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: t.surfaceMuted,
    overflow: 'hidden' as const,
    marginTop: 4,
  },
  progressFill: { height: '100%' as const, borderRadius: 2 },

  sharedSection: { gap: 8, marginTop: 16 },
  sharedHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
  },
  sharedHeading: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  sharedCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim },
  sharedCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
  },
  sharedAvatar: { width: 40, height: 40 },
  sharedAvatarImg: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceMuted },
  sharedBody: { flex: 1, gap: 4 },
  sharedName: { fontSize: 15, fontWeight: '800' as const, color: t.text },
  sharedMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  sharedMetaOwner: { fontSize: 12, fontWeight: '700' as const, color: t.accent },
  sharedMetaDot: { fontSize: 12, color: t.textDim },
  sharedMetaItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
  sharedMetaText: { fontSize: 12, color: t.textMuted },

  // Dialog (create/rename)
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' as const, padding: 24 },
  dialogWrap: { width: '100%' as const },
  dialog: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 18,
    gap: 14,
  },
  dialogTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
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
});
