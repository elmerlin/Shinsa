import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
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
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Comment, FeedItemType } from '@shared/api';

export type CommentItemType = FeedItemType;

interface Props {
  visible: boolean;
  itemType?: CommentItemType;
  itemId?: string | number;
  onClose: () => void;
}

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}

function fetchCommentsFor(type: CommentItemType, id: string): Promise<Comment[]> {
  if (type === 'post') return socialApi.comments(id);
  if (type === 'upscore') return socialApi.upscoreComments(id);
  if (type === 'clear') return socialApi.clearComments(id);
  if (type === 'weekly_challenge') return socialApi.weeklyChallengePlayComments(id);
  throw new Error(`Unsupported comment type ${type}`);
}

function postCommentFor(type: CommentItemType, id: string, content: string): Promise<Comment> {
  if (type === 'post') return socialApi.addPostComment(id, content);
  if (type === 'upscore') return socialApi.addUpscoreComment(id, content);
  if (type === 'clear') return socialApi.addClearComment(id, content);
  if (type === 'weekly_challenge') return socialApi.addWeeklyChallengePlayComment(id, content);
  throw new Error(`Unsupported comment type ${type}`);
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function CommentRow({ c, s, onProfile }: { c: Comment; s: Styles; onProfile: (username: string) => void }) {
  const avatar = typeof c.avatar === 'string' ? fullImageUrl(c.avatar) : undefined;
  const username = String(c.username || '');
  const goProfile = () => username && onProfile(username);
  return (
    <View style={[s.row, c.parent_id ? s.reply : null]}>
      <Pressable onPress={goProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : (
          <DefaultAvatar size={28} />
        )}
      </Pressable>
      <View style={s.main}>
        <View style={s.header}>
          <Pressable onPress={goProfile} hitSlop={4} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={s.user}>{c.username || 'anonymous'}</Text>
          </Pressable>
          <Text style={s.time}>{timeAgo(c.created_at)}</Text>
        </View>
        {c.content ? <Text style={s.body}>{c.content}</Text> : null}
      </View>
    </View>
  );
}

export function CommentsSheet({ visible, itemType, itemId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const goProfile = (username: string) => {
    onClose();
    router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  const id = itemId == null ? '' : String(itemId);
  const queryKey = ['comments', itemType ?? '', id] as const;
  const enabled = visible && !!itemType && !!id;

  const commentsQuery = useQuery({
    queryKey,
    queryFn: () => fetchCommentsFor(itemType as CommentItemType, id),
    enabled,
    staleTime: 5_000,
  });

  const submitMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!itemType || !id) throw new Error('Missing target');
      return postCommentFor(itemType, id, content);
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const comments = commentsQuery.data ?? [];

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || submitMutation.isPending) return;
    submitMutation.mutate(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.handle} />
            <View style={s.titleRow}>
              <Text style={s.title}>Comments</Text>
              <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
              {commentsQuery.isLoading ? (
                <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
              ) : commentsQuery.isError ? (
                <Text style={s.error}>
                  {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Failed to load comments'}
                </Text>
              ) : comments.length === 0 ? (
                <Text style={s.empty}>No comments yet. Be the first.</Text>
              ) : (
                comments.map((c) => <CommentRow key={c.id} c={c} s={s} onProfile={goProfile} />)
              )}
            </ScrollView>

            <View style={s.composer}>
              <TextInput
                style={s.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={theme.textDim}
                multiline
                maxLength={1000}
                editable={!submitMutation.isPending}
              />
              <Pressable
                onPress={handleSubmit}
                disabled={!draft.trim() || submitMutation.isPending}
                style={({ pressed }) => [
                  s.submitBtn,
                  (!draft.trim() || submitMutation.isPending) && { opacity: 0.4 },
                  pressed && { opacity: 0.7 },
                ]}>
                {submitMutation.isPending ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <IconSymbol name="paperplane.fill" size={16} color="#000" />
                )}
              </Pressable>
            </View>
            {submitMutation.isError ? (
              <Text style={s.error}>
                {submitMutation.error instanceof Error ? submitMutation.error.message : 'Failed to post'}
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
    maxHeight: '85%' as const,
    minHeight: 320,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
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
  listContent: { paddingVertical: 8, gap: 4 },
  center: { paddingVertical: 32, alignItems: 'center' as const },

  row: { flexDirection: 'row' as const, gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  reply: { paddingLeft: 36, opacity: 0.9 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  main: { flex: 1, gap: 2 },
  header: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  user: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  time: { fontSize: 11, color: t.textDim },
  body: { fontSize: 14, lineHeight: 19, color: t.text },

  empty: { padding: 24, textAlign: 'center' as const, color: t.textDim },
  error: { paddingVertical: 8, paddingHorizontal: 4, color: t.danger, fontSize: 12 },

  composer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  input: {
    flex: 1,
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 120,
  },
  submitBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
