import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { AddListItemPayload, UserList } from '@shared/api';

const LISTS_QUERY_KEY = ['user-lists'] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Chart payload to add — shape matches the server's POST /lists/:id/items body. */
  item: AddListItemPayload | null;
}

/**
 * Bottom-sheet picker for "Save chart to list". Lists the user's existing
 * lists with a checkmark for any list this chart is already in (per
 * chartId), plus a quick "Create new list" affordance at the bottom that
 * creates the list and immediately adds the chart in one tap.
 */
export function SaveToListSheet({ visible, onClose, item }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [creatingName, setCreatingName] = useState('');
  const [showCreateField, setShowCreateField] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<number>>(new Set());

  const listsQuery = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => songsApi.lists(),
    enabled: visible,
  });

  const lists = listsQuery.data?.lists ?? [];

  const addMutation = useMutation({
    mutationFn: ({ listId, payload }: { listId: number; payload: AddListItemPayload }) =>
      songsApi.addListItem(listId, payload),
    onSuccess: (_data, vars) => {
      setRecentlySaved((prev) => new Set(prev).add(vars.listId));
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const list = await songsApi.createList(name);
      if (item) await songsApi.addListItem(list.id, item);
      return list;
    },
    onSuccess: (list) => {
      setRecentlySaved((prev) => new Set(prev).add(list.id));
      setShowCreateField(false);
      setCreatingName('');
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    },
  });

  const handlePickList = (list: UserList) => {
    if (!item) return;
    // No-op if chart is already in the list (server returns 409 otherwise).
    const already = list.items.some((i) => i.chartId === item.chartId);
    if (already) return;
    addMutation.mutate({ listId: list.id, payload: item });
  };

  const handleCreate = () => {
    const name = creatingName.trim();
    if (!name || createMutation.isPending) return;
    createMutation.mutate(name);
  };

  const handleClose = () => {
    setShowCreateField(false);
    setCreatingName('');
    setRecentlySaved(new Set());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={handleClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <Text style={s.title}>Save to list</Text>
              <Pressable onPress={handleClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
              {listsQuery.isLoading ? (
                <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
              ) : lists.length === 0 && !showCreateField ? (
                <Text style={s.emptyText}>No lists yet — create one to start saving charts.</Text>
              ) : (
                lists.map((list) => {
                  const containsChart = !!item && list.items.some((i) => i.chartId === item.chartId);
                  const justSaved = recentlySaved.has(list.id);
                  const checked = containsChart || justSaved;
                  return (
                    <Pressable
                      key={list.id}
                      onPress={() => handlePickList(list)}
                      disabled={checked}
                      style={({ pressed }) => [s.listRow, pressed && !checked && { opacity: 0.7 }]}>
                      <View style={s.listRowText}>
                        <Text style={s.listName} numberOfLines={1}>{list.name}</Text>
                        <Text style={s.listMeta}>{list.items.length} chart{list.items.length === 1 ? '' : 's'}</Text>
                      </View>
                      {checked ? (
                        <IconSymbol name="checkmark.circle.fill" size={22} color={theme.accent} />
                      ) : (
                        <IconSymbol name="plus.circle.fill" size={22} color={theme.textMuted} />
                      )}
                    </Pressable>
                  );
                })
              )}

              {showCreateField ? (
                <View style={s.createBox}>
                  <TextInput
                    style={s.createInput}
                    value={creatingName}
                    onChangeText={setCreatingName}
                    placeholder="List name"
                    placeholderTextColor={theme.textDim}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    maxLength={60}
                    editable={!createMutation.isPending}
                  />
                  <View style={s.createActions}>
                    <Pressable
                      onPress={() => { setShowCreateField(false); setCreatingName(''); }}
                      disabled={createMutation.isPending}
                      style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.7 }]}>
                      <Text style={s.createBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreate}
                      disabled={!creatingName.trim() || createMutation.isPending}
                      style={({ pressed }) => [
                        s.createBtn,
                        s.createBtnPrimary,
                        (!creatingName.trim() || createMutation.isPending) && { opacity: 0.4 },
                        pressed && { opacity: 0.85 },
                      ]}>
                      {createMutation.isPending ? (
                        <ActivityIndicator color={theme.bg} size="small" />
                      ) : (
                        <Text style={[s.createBtnText, s.createBtnTextPrimary]}>Create + save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowCreateField(true)}
                  style={({ pressed }) => [s.newListRow, pressed && { opacity: 0.7 }]}>
                  <IconSymbol name="plus" size={18} color={theme.accent} />
                  <Text style={s.newListText}>New list</Text>
                </Pressable>
              )}
            </ScrollView>

            {addMutation.isError ? (
              <Text style={s.errorText}>
                {addMutation.error instanceof Error ? addMutation.error.message : 'Failed to save'}
              </Text>
            ) : null}
            {createMutation.isError ? (
              <Text style={s.errorText}>
                {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create list'}
              </Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' as const },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  sheetWrap: { width: '100%' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '80%' as const,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 4,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 4,
  },
  title: { fontSize: 16, fontWeight: '800' as const, color: t.text, letterSpacing: 0.5 },
  closeBtn: { padding: 6 },

  list: { maxHeight: 480 },
  listContent: { paddingVertical: 8, gap: 6 },
  center: { paddingVertical: 32, alignItems: 'center' as const },
  emptyText: { padding: 16, color: t.textMuted, fontSize: 13, textAlign: 'center' as const },

  listRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  listRowText: { flex: 1, gap: 2 },
  listName: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  listMeta: { fontSize: 11, color: t.textDim },

  newListRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderStyle: 'dashed' as const,
    marginTop: 4,
  },
  newListText: { fontSize: 14, fontWeight: '700' as const, color: t.accent },

  createBox: {
    backgroundColor: t.card,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  createInput: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  createActions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8 },
  createBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  createBtnPrimary: { backgroundColor: t.accent },
  createBtnText: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  createBtnTextPrimary: { color: t.bg },

  errorText: { color: t.danger, fontSize: 12, paddingHorizontal: 4, paddingVertical: 6 },
});
