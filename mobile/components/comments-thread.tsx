import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import {
  fetchCommentsFor,
  flattenComments,
  postCommentFor,
  timeAgo,
  type CommentItemType,
} from '@/components/comments-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Comment } from '@shared/api';

/**
 * Inline comments thread — the full conversation (top-level + replies) plus a
 * composer, rendered directly below a post on its detail page instead of in a
 * modal. Uses the shared fetch/post/flatten helpers from comments-sheet so the
 * feed modal and the inline thread stay in lockstep. Renders rows as plain
 * Views (no inner ScrollView) so it composes inside the page's ScrollView.
 */

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
        <View style={s.headerRow}>
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

export function CommentsThread({ itemType, itemId }: { itemType?: CommentItemType; itemId?: string | number }) {
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const id = itemId == null ? '' : String(itemId);
  const queryKey = ['comments', itemType ?? '', id] as const;
  const enabled = !!itemType && !!id;

  const commentsQuery = useQuery({
    queryKey,
    queryFn: () => fetchCommentsFor(itemType as CommentItemType, id),
    enabled,
    staleTime: 5_000,
  });
  const submitMutation = useMutation({
    mutationFn: (content: string) => postCommentFor(itemType as CommentItemType, id, content),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const flat = flattenComments(commentsQuery.data ?? []);

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed || submitMutation.isPending) return;
    submitMutation.mutate(trimmed);
  };
  const goProfile = (username: string) => {
    if (username) router.push({ pathname: '/profile/[id]', params: { id: `@${username}` } });
  };

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>{flat.length > 0 ? `Comments · ${flat.length}` : 'Comments'}</Text>

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
        <Text style={s.error}>{submitMutation.error instanceof Error ? submitMutation.error.message : 'Failed to post'}</Text>
      ) : null}

      {commentsQuery.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : commentsQuery.isError ? (
        <Text style={s.error}>
          {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Failed to load comments'}
        </Text>
      ) : flat.length === 0 ? (
        <Text style={s.empty}>No comments yet. Be the first.</Text>
      ) : (
        flat.map((c) => <CommentRow key={c.id} c={c} s={s} onProfile={goProfile} />)
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: {
    marginTop: 12,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 8,
  },
  heading: { fontSize: 13, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  composer: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
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
  row: { flexDirection: 'row' as const, gap: 10, paddingVertical: 8 },
  reply: { paddingLeft: 36, opacity: 0.95 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  main: { flex: 1, gap: 2 },
  headerRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  user: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  time: { fontSize: 11, color: t.textDim },
  body: { fontSize: 14, lineHeight: 19, color: t.text },
  center: { paddingVertical: 24, alignItems: 'center' as const },
  empty: { paddingVertical: 16, textAlign: 'center' as const, color: t.textDim },
  error: { paddingVertical: 6, color: t.danger, fontSize: 12 },
});
