import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, liveApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { User } from '@shared/api';
import type { ThemeColors } from '@/constants/theme';

interface Participant {
  user_id: string;
  role: string;
  status: string;
  username?: string;
  avatar?: string;
  nationality?: string;
  skill_title?: string;
}

interface Props {
  visible: boolean;
  sessionId: string;
  participants: Participant[];
  /** Server host user id — filtered out of the search results. */
  hostUserId?: string;
  onClose: () => void;
}

/**
 * Host-only manager for live-session co-hosts. Mirrors the web's `CohostSearchResults`
 * + `CohostParticipantList` UX: typeahead search above an active-cohost list with
 * inline "Add" / "Remove" buttons.
 */
export function CohostManagerSheet({
  visible,
  sessionId,
  participants,
  hostUserId,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const trimmed = search.trim();
  const searchQuery = useQuery({
    queryKey: ['user-search', trimmed],
    queryFn: () => authApi.searchUsers(trimmed),
    enabled: visible && trimmed.length > 0,
    staleTime: 15_000,
  });

  // Cohosts (active only). Owner stays in their own card and never shows here.
  const activeCohosts = useMemo(
    () => participants.filter((p) => p.status === 'active' && p.role !== 'owner'),
    [participants],
  );

  // Exclude users who are already active participants (cohost or owner).
  const activeUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of participants) {
      if (p.status === 'active') set.add(p.user_id);
    }
    if (hostUserId) set.add(hostUserId);
    return set;
  }, [participants, hostUserId]);

  const filteredResults = useMemo(() => {
    const rows = (searchQuery.data ?? []).filter((u) => !activeUserIds.has(u.id));
    return rows.slice(0, 6);
  }, [searchQuery.data, activeUserIds]);

  const addMutation = useMutation({
    mutationFn: (userId: string) => liveApi.addCohost(sessionId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-session', sessionId] });
      setSearch('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => liveApi.removeCohost(sessionId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-session', sessionId] });
    },
  });

  const pendingUserId = addMutation.isPending
    ? (addMutation.variables as string | undefined)
    : removeMutation.isPending
    ? (removeMutation.variables as string | undefined)
    : undefined;

  const handleClose = () => {
    if (addMutation.isPending || removeMutation.isPending) return;
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Manage co-hosts</Text>
                <Text style={s.subtitle}>
                  Co-hosts share the room. Their plays appear in the feed and they can post chat as a host.
                </Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <View style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionLabel}>ACTIVE</Text>
                <Text style={s.sectionCount}>{activeCohosts.length}</Text>
              </View>
              {activeCohosts.length === 0 ? (
                <Text style={s.emptyText}>No co-hosts yet. Search for a player below.</Text>
              ) : (
                activeCohosts.map((p) => (
                  <View key={p.user_id} style={s.userRow}>
                    <UserBlock avatar={p.avatar} username={p.username} skillTitle={p.skill_title} s={s} />
                    <Pressable
                      onPress={() => removeMutation.mutate(p.user_id)}
                      disabled={pendingUserId === p.user_id}
                      style={({ pressed }) => [
                        s.removeBtn,
                        pressed && { opacity: 0.7 },
                        pendingUserId === p.user_id && { opacity: 0.4 },
                      ]}>
                      {pendingUserId === p.user_id ? (
                        <ActivityIndicator size="small" color={theme.text} />
                      ) : (
                        <Text style={s.removeText}>Remove</Text>
                      )}
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>ADD CO-HOST</Text>
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by username"
                placeholderTextColor={theme.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!addMutation.isPending && !removeMutation.isPending}
              />
              {searchQuery.isFetching && trimmed.length > 0 ? (
                <View style={s.searchHint}>
                  <ActivityIndicator size="small" color={theme.spinner} />
                  <Text style={s.searchHintText}>Searching…</Text>
                </View>
              ) : null}
              {!searchQuery.isFetching && trimmed.length > 0 && filteredResults.length === 0 ? (
                <Text style={s.searchHintText}>No matching players.</Text>
              ) : null}
              {filteredResults.map((u) => (
                <View key={u.id} style={s.userRow}>
                  <UserBlock avatar={u.avatar} username={u.username} skillTitle={u.skill_title} s={s} />
                  <Pressable
                    onPress={() => addMutation.mutate(u.id)}
                    disabled={pendingUserId === u.id}
                    style={({ pressed }) => [
                      s.addBtn,
                      pressed && { opacity: 0.7 },
                      pendingUserId === u.id && { opacity: 0.4 },
                    ]}>
                    {pendingUserId === u.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.addText}>Add</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>

            {addMutation.isError || removeMutation.isError ? (
              <Text style={s.errorText}>
                {(addMutation.error || removeMutation.error) instanceof Error
                  ? (addMutation.error || removeMutation.error)?.message
                  : 'Co-host action failed'}
              </Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function UserBlock({
  avatar,
  username,
  skillTitle,
  s,
}: {
  avatar?: string | null;
  username?: string;
  skillTitle?: string;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  const avatarUrl = typeof avatar === 'string' ? fullImageUrl(avatar) : undefined;
  return (
    <View style={s.userBlock}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={36} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.username} numberOfLines={1}>@{username || 'anonymous'}</Text>
        {skillTitle ? <Text style={s.skill} numberOfLines={1}>{skillTitle}</Text> : null}
      </View>
    </View>
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
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 14,
    maxHeight: '85%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },

  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, paddingHorizontal: 4 },
  title: { fontSize: 18, fontWeight: '900' as const, color: t.text },
  subtitle: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  closeBtn: { padding: 6 },

  section: { gap: 8 },
  sectionHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim, paddingHorizontal: 4 },
  sectionCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim, paddingHorizontal: 4 },
  emptyText: { fontSize: 12, color: t.textDim, paddingHorizontal: 4 },

  userRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  userBlock: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  username: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  skill: { fontSize: 11, color: t.textDim },

  addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: t.accent },
  addText: { fontSize: 12, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 0.5 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: t.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
  removeText: { fontSize: 12, fontWeight: '800' as const, color: t.text },

  searchInput: {
    backgroundColor: t.card,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  searchHint: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 4 },
  searchHintText: { fontSize: 11, color: t.textDim, paddingHorizontal: 4 },

  errorText: { color: t.danger, fontSize: 12, paddingHorizontal: 6 },
});
