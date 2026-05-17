/**
 * Send-to-message bottom sheet — pick a player or squad and ship the
 * payload as a chat message. Reusable from anywhere we want a "Send to
 * DM" action: score card, feed posts/upscores/clears, song page, etc.
 *
 * Mirrors web SendToDirectMessageButton + UserPickerDialog. For a DM
 * recipient we route through `messagesApi.getOrCreateDirect(userId,
 * payload)` which idempotently returns/creates the conversation AND
 * posts the payload as the first message in the same call. For a squad
 * recipient we go through `messagesApi.sendMessage(conversationId,
 * payload)`.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { authApi, messagesApi, socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type {
  ConversationSummary,
  EmbedSendPayload,
  FollowEntry,
  User,
} from '@shared/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Title shown in the sheet header. */
  title?: string;
  /** Sub-line under the title. */
  description?: string;
  /** What we're sending. Server validates either content or one embed. */
  payload: EmbedSendPayload;
  /** Tone — 'cyan' for normal share, 'amber' for challenge. */
  tone?: 'cyan' | 'amber';
}

type Recipient =
  | { kind: 'user'; user: User | FollowEntry }
  | { kind: 'squad'; conversation: ConversationSummary };

export function SendToMessageSheet({
  visible,
  onClose,
  title = 'Send to player',
  description,
  payload,
  tone = 'cyan',
}: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sentTo, setSentTo] = useState<{ kind: 'user' | 'squad'; label: string } | null>(null);

  // Reset transient state on open/close.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setSentTo(null);
    }
  }, [visible]);

  // Debounce search to avoid spamming the typeahead.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Following list — surfaced when there's no search query.
  const followingQuery = useQuery({
    queryKey: ['picker-following', user?.id],
    queryFn: () => socialApi.following(user!.id),
    enabled: visible && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Squads the viewer is in — show alongside followed players.
  const conversationsQuery = useQuery({
    queryKey: ['messages-inbox', user?.id],
    queryFn: () => messagesApi.conversations(),
    enabled: visible && !!user?.id,
    staleTime: 60 * 1000,
  });

  // Username typeahead.
  const userSearchQuery = useQuery({
    queryKey: ['user-search', debouncedQuery],
    queryFn: () => authApi.searchUsers(debouncedQuery),
    enabled: visible && debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // When `payload` carries a challenge_card we tone the sheet amber to
  // match the action it came from. The mutation result also honors `tone`.
  const sendMutation = useMutation({
    mutationFn: async (recipient: Recipient) => {
      if (recipient.kind === 'user') {
        const u = recipient.user as User;
        const result = await messagesApi.getOrCreateDirect(u.id, payload);
        return { kind: 'user' as const, label: u.username || 'player', conversationId: result.conversation.id };
      }
      await messagesApi.sendMessage(recipient.conversation.id, payload);
      return { kind: 'squad' as const, label: recipient.conversation.title };
    },
    onSuccess: (result) => setSentTo({ kind: result.kind, label: result.label }),
  });

  // Build the rendered list — search results take precedence, otherwise
  // a small set of recent followees + active squads.
  const rows = useMemo<Recipient[]>(() => {
    const memberIds = new Set([user?.id].filter(Boolean) as string[]);
    const out: Recipient[] = [];
    const seen = new Set<string>();

    if (debouncedQuery.length >= 2) {
      for (const u of userSearchQuery.data ?? []) {
        if (!u?.id || memberIds.has(u.id) || seen.has(u.id)) continue;
        seen.add(u.id);
        out.push({ kind: 'user', user: u });
      }
    } else {
      // Active squads first (they're more deliberate destinations).
      for (const c of conversationsQuery.data?.conversations ?? []) {
        if (c.kind !== 'squad') continue;
        out.push({ kind: 'squad', conversation: c });
      }
      for (const f of followingQuery.data ?? []) {
        if (!f?.id || memberIds.has(f.id) || seen.has(f.id)) continue;
        seen.add(f.id);
        out.push({ kind: 'user', user: f as unknown as User });
      }
    }
    return out;
  }, [debouncedQuery, userSearchQuery.data, conversationsQuery.data, followingQuery.data, user?.id]);

  const accentColor = tone === 'amber' ? '#fbbf24' : theme.accent;
  const accentTint = tone === 'amber' ? 'rgba(251,191,36,0.15)' : theme.accentTint;
  const sendLabel = tone === 'amber' ? 'Challenge' : 'Send';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.handle} />

          <View style={s.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.eyebrow, { color: accentColor }]}>
                {tone === 'amber' ? 'Challenge a player' : 'Share to chat'}
              </Text>
              <Text style={s.title} numberOfLines={1}>{title}</Text>
              {description ? <Text style={s.description}>{description}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="xmark" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={s.searchRow}>
            <IconSymbol name="magnifyingglass" size={14} color={theme.textDim} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search players or squads"
              placeholderTextColor={theme.textDim}
              style={s.searchInput}
              autoCapitalize="none"
            />
          </View>

          {sentTo ? (
            // Success card — auto-dismisses after a beat.
            <View style={[s.successBox, { borderColor: accentColor, backgroundColor: accentTint }]}>
              <IconSymbol name="checkmark.circle.fill" size={18} color={accentColor} />
              <Text style={[s.successText, { color: accentColor }]}>
                Sent to {sentTo.kind === 'squad' ? '#' : '@'}{sentTo.label}
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [s.successDoneBtn, { backgroundColor: accentColor }, pressed && { opacity: 0.85 }]}>
                <Text style={s.successDoneText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 480 }}
              contentContainerStyle={{ gap: 4, paddingVertical: 4 }}
              keyboardShouldPersistTaps="handled">
              {(userSearchQuery.isFetching && debouncedQuery.length >= 2)
                || followingQuery.isLoading
                || conversationsQuery.isLoading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.spinner} />
                </View>
              ) : rows.length === 0 ? (
                <Text style={s.muted}>
                  {debouncedQuery.length >= 2
                    ? `No players matching "${debouncedQuery}".`
                    : 'Search by username to find anyone, or follow players to surface them here.'}
                </Text>
              ) : (
                rows.map((row, i) => (
                  <RecipientRow
                    key={row.kind === 'user' ? `u-${(row.user as User).id}` : `s-${row.conversation.id}-${i}`}
                    row={row}
                    pending={sendMutation.isPending}
                    sendLabel={sendLabel}
                    accentColor={accentColor}
                    onSend={() => sendMutation.mutate(row)}
                  />
                ))
              )}
              {sendMutation.isError ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>
                    {sendMutation.error instanceof Error ? sendMutation.error.message : 'Failed to send.'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function RecipientRow({
  row,
  pending,
  sendLabel,
  accentColor,
  onSend,
}: {
  row: Recipient;
  pending: boolean;
  sendLabel: string;
  accentColor: string;
  onSend: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  const isSquad = row.kind === 'squad';
  const name = isSquad ? row.conversation.title : (row.user as User).username || 'player';
  const subtitle = isSquad
    ? `${row.conversation.member_count} members`
    : (row.user as User & { skill_title?: string })?.skill_title || 'Direct message';
  const avatar = isSquad
    ? fullImageUrl(row.conversation.avatar)
    : fullImageUrl((row.user as User).avatar);

  return (
    <Pressable
      onPress={onSend}
      disabled={pending}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }, pending && { opacity: 0.6 }]}>
      <View style={s.rowAvatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.rowAvatarImg} contentFit="cover" />
        ) : (
          <DefaultAvatar size={36} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.rowName} numberOfLines={1}>
          {isSquad ? '# ' : '@'}{name}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={[s.sendPill, { backgroundColor: accentColor }]}>
        <Text style={s.sendPillText}>{sendLabel}</Text>
      </View>
    </Pressable>
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
    maxHeight: '85%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 6 },

  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
  eyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  title: { fontSize: 17, fontWeight: '900' as const, color: t.text, marginTop: 1 },
  description: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  closeBtn: { padding: 6 },

  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: t.text, fontSize: 13, padding: 0 },

  muted: { color: t.textDim, fontSize: 12, padding: 24, textAlign: 'center' as const },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  rowAvatar: { width: 36, height: 36 },
  rowAvatarImg: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  rowName: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  rowMeta: { fontSize: 11, color: t.textDim },

  sendPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  sendPillText: { color: '#000', fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.4 },

  errorBox: { padding: 10, borderRadius: 8, backgroundColor: t.dangerBg, borderWidth: 1, borderColor: t.dangerBorder, marginTop: 6 },
  errorText: { color: t.danger, fontSize: 12 },

  successBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 24,
  },
  successText: { flex: 1, fontSize: 14, fontWeight: '900' as const },
  successDoneBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  successDoneText: { color: '#000', fontSize: 12, fontWeight: '900' as const, letterSpacing: 0.4 },
});
