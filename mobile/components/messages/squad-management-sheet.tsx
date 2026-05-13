/**
 * Squad management bottom sheet — opened from the conversation header
 * when the active chat is a squad. Tabbed into Members + Settings:
 *
 *   Members tab
 *     - Member list with avatar + username + role chip
 *     - Promote/Demote action (creator only, on non-creator members)
 *     - Remove action (managers only, on non-creator members)
 *     - Add member: search-and-pick row using authApi typeahead
 *     - "Leave squad" destructive action with Alert confirm
 *
 *   Settings tab
 *     - Identity edit (creator only): squad name input + Save
 *     - Notifications: toggle "All messages" + "Mentions only"
 *
 * Mirrors web client SquadSettingsModal.jsx pattern. Voice/avatar
 * picker, theme picker, shared-lists, and resources tabs are deferred.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { getConversationQueryKey, getMessagesInboxQueryKey } from '@/lib/messagesQueries';
import type { ThemeColors } from '@/constants/theme';
import type { SquadDetailResponse, SquadMember, User } from '@shared/api';

interface Props {
  conversationId: string;
  visible: boolean;
  onClose: () => void;
  /** Viewer user_id — used to label "you" and to scope the leave flow. */
  viewerId: string;
  /** Called after a successful "leave squad" so the screen can navigate
   *  back out of the (now-inaccessible) thread. */
  onLeft?: () => void;
}

const SQUAD_QUERY_KEY = (conversationId: string) =>
  ['messages', 'squad', conversationId] as const;

type Tab = 'members' | 'settings';

export function SquadManagementSheet({ conversationId, visible, onClose, viewerId, onLeft }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('members');

  const squadQuery = useQuery({
    queryKey: SQUAD_QUERY_KEY(conversationId),
    queryFn: () => messagesApi.squad(conversationId),
    enabled: visible && !!conversationId,
    staleTime: 5_000,
  });

  // Reset to Members tab each time the sheet opens.
  useEffect(() => {
    if (visible) setTab('members');
  }, [visible]);

  const squad: SquadDetailResponse | undefined = squadQuery.data;
  const members = squad?.members ?? [];
  const viewerMembership = squad?.viewer_membership;
  const viewerRole = viewerMembership?.role ?? 'member';
  const canManageMembers = !!viewerMembership?.permissions?.can_manage_members;
  const canManageRoles = !!viewerMembership?.permissions?.can_manage_roles;
  const canEditIdentity = !!viewerMembership?.permissions?.can_edit_identity;

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: SQUAD_QUERY_KEY(conversationId) });
    void queryClient.invalidateQueries({ queryKey: getConversationQueryKey(conversationId) });
    void queryClient.invalidateQueries({ queryKey: getMessagesInboxQueryKey(viewerId) });
  };

  // --- Member mutations ---------------------------------------------------
  const addMutation = useMutation({
    mutationFn: (userId: string) => messagesApi.addSquadMember(conversationId, userId),
    onSuccess: () => invalidateAll(),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => messagesApi.removeSquadMember(conversationId, userId),
    onSuccess: (_data, userId) => {
      invalidateAll();
      // If the viewer just left, route back out of the thread.
      if (userId === viewerId) {
        onClose();
        onLeft?.();
      }
    },
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: string }) =>
      messagesApi.setSquadMemberRole(conversationId, vars.userId, vars.role),
    onSuccess: () => invalidateAll(),
  });

  // --- Settings mutations -------------------------------------------------
  const notifMutation = useMutation({
    mutationFn: (payload: { notifications_enabled?: boolean; notify_mentions?: boolean }) =>
      messagesApi.setSquadNotifications(conversationId, payload),
    // Optimistic flip so the Switch animates smoothly even if the request
    // is slow. Server returns the refreshed squad response on success.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: SQUAD_QUERY_KEY(conversationId) });
      const prev = queryClient.getQueryData<SquadDetailResponse>(SQUAD_QUERY_KEY(conversationId));
      if (prev?.viewer_membership) {
        queryClient.setQueryData<SquadDetailResponse>(SQUAD_QUERY_KEY(conversationId), {
          ...prev,
          viewer_membership: {
            ...prev.viewer_membership,
            notifications_enabled: payload.notifications_enabled ?? prev.viewer_membership.notifications_enabled,
            notify_mentions: payload.notify_mentions ?? prev.viewer_membership.notify_mentions,
          },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(SQUAD_QUERY_KEY(conversationId), ctx.prev);
    },
    onSuccess: () => invalidateAll(),
  });

  const renameMutation = useMutation({
    mutationFn: (title: string) => messagesApi.updateSquad(conversationId, { title }),
    onSuccess: () => invalidateAll(),
  });

  // --- Add-member typeahead ----------------------------------------------
  const [addQuery, setAddQuery] = useState('');
  const [debouncedAddQuery, setDebouncedAddQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAddQuery(addQuery.trim()), 220);
    return () => clearTimeout(t);
  }, [addQuery]);
  const userSearchQuery = useQuery({
    queryKey: ['user-search', debouncedAddQuery],
    queryFn: () => authApi.searchUsers(debouncedAddQuery),
    enabled: visible && debouncedAddQuery.length >= 2 && canManageMembers,
    staleTime: 10_000,
  });

  const handleLeave = () => {
    Alert.alert(
      'Leave squad?',
      'You won\'t see new messages or be able to post here. Other members can re-add you later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => removeMutation.mutate(viewerId),
        },
      ],
    );
  };

  const handleRemoveMember = (member: SquadMember) => {
    Alert.alert(
      `Remove @${member.user.username}?`,
      'They lose access to the conversation. You can re-add them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMutation.mutate(member.user_id),
        },
      ],
    );
  };

  // Search-results candidates that aren't already members.
  const memberIds = new Set(members.map((m) => m.user_id));
  const addCandidates: User[] = (userSearchQuery.data || []).filter(
    (u: User) => u.id && !memberIds.has(u.id) && u.id !== viewerId,
  );

  const squadTitle = squad?.conversation?.title || '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />

          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>{squadTitle || 'Squad'}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          {/* Tab bar */}
          <View style={s.tabBar}>
            {(['members', 'settings'] as Tab[]).map((value) => {
              const active = tab === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setTab(value)}
                  style={({ pressed }) => [s.tabBtn, active && s.tabBtnActive, pressed && !active && { opacity: 0.7 }]}>
                  <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                    {value === 'members' ? `Members · ${members.length}` : 'Settings'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {squadQuery.isLoading ? (
            <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
          ) : squadQuery.isError ? (
            <Text style={s.errorText}>
              {squadQuery.error instanceof Error ? squadQuery.error.message : 'Failed to load squad'}
            </Text>
          ) : tab === 'members' ? (
            <ScrollView
              style={{ maxHeight: 540 }}
              contentContainerStyle={{ gap: 4 }}
              keyboardShouldPersistTaps="handled">
              {members.map((m) => (
                <SquadMemberRow
                  key={m.user_id}
                  member={m}
                  isYou={m.user_id === viewerId}
                  canManage={canManageMembers}
                  canManageRoles={canManageRoles}
                  viewerRole={viewerRole}
                  pending={removeMutation.isPending || roleMutation.isPending}
                  onChangeRole={(role) => roleMutation.mutate({ userId: m.user_id, role })}
                  onRemove={() => handleRemoveMember(m)}
                />
              ))}

              {canManageMembers ? (
                <View style={s.addSection}>
                  <Text style={s.sectionLabel}>Add member</Text>
                  <View style={s.searchRow}>
                    <IconSymbol name="magnifyingglass" size={14} color={theme.textDim} />
                    <TextInput
                      value={addQuery}
                      onChangeText={setAddQuery}
                      placeholder="Search by username"
                      placeholderTextColor={theme.textDim}
                      style={s.searchInput}
                      autoCapitalize="none"
                    />
                  </View>
                  {debouncedAddQuery.length >= 2 ? (
                    userSearchQuery.isFetching ? (
                      <ActivityIndicator color={theme.spinner} />
                    ) : addCandidates.length === 0 ? (
                      <Text style={s.muted}>No new players match.</Text>
                    ) : (
                      addCandidates.map((u) => (
                        <Pressable
                          key={u.id}
                          onPress={() => addMutation.mutate(u.id)}
                          disabled={addMutation.isPending}
                          style={({ pressed }) => [s.addRow, pressed && { opacity: 0.7 }]}>
                          {u.avatar ? (
                            <Image source={{ uri: fullImageUrl(u.avatar) }} style={s.addAvatar} contentFit="cover" />
                          ) : (
                            <DefaultAvatar size={32} />
                          )}
                          <Text style={s.addName} numberOfLines={1}>{u.username}</Text>
                          <View style={s.addPill}>
                            <Text style={s.addPillText}>+ Add</Text>
                          </View>
                        </Pressable>
                      ))
                    )
                  ) : null}
                </View>
              ) : null}

              <View style={{ height: 12 }} />

              <Pressable
                onPress={handleLeave}
                disabled={removeMutation.isPending}
                style={({ pressed }) => [s.leaveBtn, pressed && { opacity: 0.7 }, removeMutation.isPending && { opacity: 0.4 }]}>
                <IconSymbol name="trash" size={14} color={theme.danger} />
                <Text style={s.leaveText}>Leave squad</Text>
              </Pressable>
            </ScrollView>
          ) : (
            // Settings tab: identity edit + notifications
            <ScrollView
              style={{ maxHeight: 540 }}
              contentContainerStyle={{ gap: 12 }}
              keyboardShouldPersistTaps="handled">
              {canEditIdentity ? (
                <SquadIdentityEditor
                  initialTitle={squadTitle}
                  saving={renameMutation.isPending}
                  onSave={(title) => renameMutation.mutate(title)}
                />
              ) : null}

              <View style={s.settingsCard}>
                <Text style={s.sectionLabel}>Notifications</Text>
                <View style={s.settingsRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.settingsLabel}>All messages</Text>
                    <Text style={s.settingsHint}>Notify me when anyone posts.</Text>
                  </View>
                  <Switch
                    value={!!viewerMembership?.notifications_enabled}
                    onValueChange={(value) => notifMutation.mutate({ notifications_enabled: value })}
                    trackColor={{ false: theme.border, true: theme.accent }}
                    thumbColor={theme.bg}
                  />
                </View>
                <View style={s.settingsRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.settingsLabel}>Mentions</Text>
                    <Text style={s.settingsHint}>Always notify when @-mentioned.</Text>
                  </View>
                  <Switch
                    value={!!viewerMembership?.notify_mentions}
                    onValueChange={(value) => notifMutation.mutate({ notify_mentions: value })}
                    trackColor={{ false: theme.border, true: theme.accent }}
                    thumbColor={theme.bg}
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SquadIdentityEditor({
  initialTitle,
  saving,
  onSave,
}: {
  initialTitle: string;
  saving: boolean;
  onSave: (title: string) => void;
}) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const [draft, setDraft] = useState(initialTitle);
  // Keep the draft in sync if the server-side title changes underneath us.
  useEffect(() => { setDraft(initialTitle); }, [initialTitle]);
  const dirty = draft.trim().length > 0 && draft.trim() !== initialTitle.trim();

  return (
    <View style={s.settingsCard}>
      <Text style={s.sectionLabel}>Squad name</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Squad name"
        placeholderTextColor={theme.textDim}
        style={s.identityInput}
        maxLength={60}
      />
      <Pressable
        onPress={() => onSave(draft.trim())}
        disabled={!dirty || saving}
        style={({ pressed }) => [
          s.saveBtn,
          (!dirty || saving) && { opacity: 0.4 },
          pressed && dirty && { opacity: 0.85 },
        ]}>
        {saving ? (
          <ActivityIndicator size="small" color={theme.bg} />
        ) : (
          <Text style={s.saveBtnText}>Save</Text>
        )}
      </Pressable>
    </View>
  );
}

function SquadMemberRow({
  member,
  isYou,
  canManage,
  canManageRoles,
  viewerRole,
  pending,
  onChangeRole,
  onRemove,
}: {
  member: SquadMember;
  isYou: boolean;
  canManage: boolean;
  canManageRoles: boolean;
  viewerRole: string;
  pending: boolean;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const username = member.user?.username || 'Unknown';
  const avatar = member.user?.avatar ? fullImageUrl(member.user.avatar) : undefined;

  // Action permissions:
  //  - Cannot act on yourself or on a creator
  //  - Cannot promote/demote unless you ARE the creator
  const canActOnThis = !isYou && canManage && member.role !== 'creator';
  const showRolePicker = !isYou && canManageRoles && viewerRole === 'creator' && member.role !== 'creator';

  const roleColor =
    member.role === 'creator' ? theme.accent
    : member.role === 'moderator' ? '#7dd3fc'
    : theme.textMuted;

  return (
    <View style={s.memberRow}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.memberAvatar} contentFit="cover" />
      ) : (
        <DefaultAvatar size={36} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.memberName} numberOfLines={1}>
          @{username}{isYou ? ' (you)' : ''}
        </Text>
        <Text style={[s.memberRole, { color: roleColor }]} numberOfLines={1}>
          {member.role}
        </Text>
      </View>
      {showRolePicker ? (
        <Pressable
          onPress={() => onChangeRole(member.role === 'moderator' ? 'member' : 'moderator')}
          disabled={pending}
          style={({ pressed }) => [s.actionPill, pressed && { opacity: 0.7 }, pending && { opacity: 0.5 }]}>
          <Text style={s.actionPillText}>
            {member.role === 'moderator' ? 'Demote' : 'Promote'}
          </Text>
        </Pressable>
      ) : null}
      {canActOnThis ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          disabled={pending}
          style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }, pending && { opacity: 0.5 }]}>
          <IconSymbol name="trash" size={14} color={theme.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    maxHeight: '90%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 6 },

  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '900' as const, color: t.text, letterSpacing: 0.3, flex: 1, paddingRight: 8 },
  closeBtn: { padding: 6 },

  // Tab bar
  tabBar: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 999,
    padding: 3,
    gap: 2,
    marginBottom: 8,
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' as const, borderRadius: 999 },
  tabBtnActive: { backgroundColor: t.bg },
  tabLabel: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  tabLabelActive: { color: t.accent },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
    paddingHorizontal: 4,
  },

  center: { padding: 32, alignItems: 'center' as const },
  errorText: { color: t.danger, fontSize: 13, padding: 12 },
  muted: { color: t.textDim, fontSize: 12, padding: 8, textAlign: 'center' as const },

  // Member row
  memberRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  memberName: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  memberRole: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.6, marginTop: 1, textTransform: 'uppercase' as const },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  actionPillText: { fontSize: 10, fontWeight: '800' as const, color: t.textMuted },
  removeBtn: { padding: 6 },

  // Add section
  addSection: { marginTop: 8, gap: 6 },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: t.text, fontSize: 13, padding: 0 },
  addRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  addAvatar: { width: 32, height: 32, borderRadius: 16 },
  addName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  addPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.accent },
  addPillText: { color: t.bg, fontSize: 11, fontWeight: '900' as const },

  // Leave button
  leaveBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.dangerBg,
    borderWidth: 1,
    borderColor: t.dangerBorder,
    marginTop: 8,
  },
  leaveText: { color: t.danger, fontSize: 13, fontWeight: '800' as const },

  // Settings tab
  settingsCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  settingsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 6,
  },
  settingsLabel: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  settingsHint: { fontSize: 11, color: t.textMuted },

  identityInput: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: {
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
  },
  saveBtnText: { color: t.bg, fontSize: 13, fontWeight: '900' as const, letterSpacing: 0.4 },
});
