/**
 * Full-screen story viewer modal. Mirrors the web story viewer's mobile-relevant
 * features: auto advance, previous/next user navigation, pumps, comments,
 * share-to-message, owner stats, archive, and delete.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
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
import { SendToMessageSheet } from '@/components/messages/send-to-message-sheet';
import { HIGHLIGHTS_QUERY_KEY } from '@/components/messages/stories-strip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type {
  EmbedSendPayload,
  StoryComment,
  StoryEngagement,
  StoryItem,
  StoryStatsResponse,
  StoryUser,
} from '@shared/api';

const STORY_AUTO_ADVANCE_MS = 6000;

interface Props {
  /** user_id whose story stack to view, or null when closed. */
  userId: string | null;
  /** Ordered users with active stories, from the strip. */
  userIds?: string[];
  onChangeUser?: (userId: string) => void;
  onClose: () => void;
}

type CommentsState = {
  loading: boolean;
  items: StoryComment[];
  draft: string;
  sending: boolean;
  error: string;
};

const EMPTY_ENGAGEMENT: StoryEngagement = {
  view_count: 0,
  pump_count: 0,
  comment_count: 0,
  user_pumped: false,
  preview_comments: [],
};

export function StoryViewer({ userId, userIds = [], onChangeUser, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const progress = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [engagementById, setEngagementById] = useState<Record<string, StoryEngagement>>({});
  const [commentPreviewIndex, setCommentPreviewIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [commentsState, setCommentsState] = useState<CommentsState>({
    loading: false,
    items: [],
    draft: '',
    sending: false,
    error: '',
  });
  const [statsState, setStatsState] = useState<{ loading: boolean; data: StoryStatsResponse | null; error: string }>({
    loading: false,
    data: null,
    error: '',
  });

  const open = !!userId;
  const query = useQuery({
    queryKey: ['messages', 'story', userId || ''],
    queryFn: () => messagesApi.story(userId!),
    enabled: open,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const ownerUser = query.data?.user;
  const story: StoryItem | undefined = stories[index];
  const ownerUserId = String(ownerUser?.id || userId || '');
  const isOwner = Boolean(query.data?.is_owner || (authUser?.id && authUser.id === ownerUserId));
  const readonly = Boolean(query.data?.readonly);
  const activeEngagement = story?.id
    ? (engagementById[story.id] || story.engagement || EMPTY_ENGAGEMENT)
    : EMPTY_ENGAGEMENT;
  const previewComments = Array.isArray(activeEngagement.preview_comments) ? activeEngagement.preview_comments : [];
  const previewComment = previewComments.length
    ? previewComments[commentPreviewIndex % previewComments.length]
    : null;
  const currentUserIndex = userId ? userIds.indexOf(userId) : -1;
  const hasPreviousUser = currentUserIndex > 0;
  const hasNextUser = currentUserIndex >= 0 && currentUserIndex < userIds.length - 1;
  const isPaused = menuOpen || shareOpen || commentsOpen || statsOpen;

  const setStoryEngagement = useCallback((storyId: string, engagement?: StoryEngagement | null) => {
    if (!storyId || !engagement) return;
    setEngagementById((prev) => ({ ...prev, [storyId]: engagement }));
  }, []);

  const applyStoryList = useCallback((nextStories: StoryItem[]) => {
    const normalized = Array.isArray(nextStories) ? nextStories : [];
    setStories(normalized);
    setIndex((current) => Math.min(current, Math.max(0, normalized.length - 1)));
    if (normalized.length === 0) onClose();
  }, [onClose]);

  const goPrevious = useCallback(() => {
    if (index > 0) {
      setIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (hasPreviousUser && onChangeUser) {
      onChangeUser(userIds[currentUserIndex - 1]);
    }
  }, [currentUserIndex, hasPreviousUser, index, onChangeUser, userIds]);

  const goNext = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((current) => Math.min(stories.length - 1, current + 1));
      return;
    }
    if (hasNextUser && onChangeUser) {
      onChangeUser(userIds[currentUserIndex + 1]);
      return;
    }
    onClose();
  }, [currentUserIndex, hasNextUser, index, onChangeUser, onClose, stories.length, userIds]);

  const viewedMutation = useMutation({
    mutationFn: (vars: { ownerUserId: string; storyId: string }) =>
      messagesApi.markStoryViewed(vars.ownerUserId, vars.storyId),
    onSuccess: (payload, vars) => {
      setStoryEngagement(vars.storyId, payload.engagement);
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });

  const engagementQueryMutation = useMutation({
    mutationFn: (vars: { ownerUserId: string; storyId: string }) =>
      messagesApi.storyEngagement(vars.ownerUserId, vars.storyId),
    onSuccess: (payload, vars) => setStoryEngagement(vars.storyId, payload.engagement),
  });

  const togglePumpMutation = useMutation({
    mutationFn: () => {
      if (!story?.id || !ownerUserId) throw new Error('Story unavailable.');
      return messagesApi.toggleStoryPump(ownerUserId, story.id);
    },
    onSuccess: (payload) => {
      if (story?.id) setStoryEngagement(story.id, payload.engagement);
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => {
      if (!story?.id || !ownerUserId) throw new Error('Story unavailable.');
      return messagesApi.addStoryComment(ownerUserId, story.id, content);
    },
    onSuccess: (payload) => {
      setCommentsState((prev) => ({
        ...prev,
        sending: false,
        draft: '',
        items: payload.comments || prev.items,
      }));
      if (story?.id) setStoryEngagement(story.id, payload.engagement);
    },
    onError: (err) => {
      setCommentsState((prev) => ({
        ...prev,
        sending: false,
        error: err instanceof Error ? err.message : 'Failed to send comment.',
      }));
    },
  });

  const archiveStoryMutation = useMutation({
    mutationFn: () => {
      if (!story?.id || !ownerUserId) throw new Error('Story unavailable.');
      return messagesApi.archiveStory(ownerUserId, story.id);
    },
    onSuccess: async (payload) => {
      setMenuOpen(false);
      applyStoryList(payload.stories || []);
      await queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });

  const deleteStoryMutation = useMutation({
    mutationFn: () => {
      if (!story?.id || !ownerUserId) throw new Error('Story unavailable.');
      return messagesApi.deleteStory(ownerUserId, story.id);
    },
    onSuccess: async (payload) => {
      setMenuOpen(false);
      applyStoryList(payload.stories || []);
      await queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setStories([]);
    setEngagementById({});
    setMenuOpen(false);
    setShareOpen(false);
    setCommentsOpen(false);
    setStatsOpen(false);
  }, [open, userId]);

  useEffect(() => {
    const nextStories = query.data?.stories;
    if (!nextStories) return;
    setStories(nextStories);
    setEngagementById((prev) => {
      const next = { ...prev };
      for (const entry of nextStories) {
        if (entry.id && entry.engagement) next[entry.id] = entry.engagement;
      }
      return next;
    });
  }, [query.data?.stories]);

  useEffect(() => {
    if (stories.length > 0 && index >= stories.length) {
      setIndex(stories.length - 1);
    }
  }, [index, stories.length]);

  useEffect(() => {
    setMenuOpen(false);
    setCommentsState({ loading: false, items: [], draft: '', sending: false, error: '' });
    setStatsState({ loading: false, data: null, error: '' });
    setCommentPreviewIndex(0);
  }, [story?.id]);

  useEffect(() => {
    if (!open || !story?.id || !ownerUserId || readonly) return;
    viewedMutation.mutate({ ownerUserId, storyId: story.id });
    engagementQueryMutation.mutate({ ownerUserId, storyId: story.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, story?.id, ownerUserId, readonly]);

  useEffect(() => {
    if (!open || !story?.id || query.isLoading || query.isError || isPaused) return;
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: STORY_AUTO_ADVANCE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) goNext();
    });
    return () => progress.stopAnimation();
  }, [goNext, isPaused, open, progress, query.isError, query.isLoading, story?.id]);

  useEffect(() => {
    if (!open || previewComments.length < 2 || commentsOpen) return;
    const timer = setInterval(() => {
      setCommentPreviewIndex((current) => (current + 1) % previewComments.length);
    }, 3200);
    return () => clearInterval(timer);
  }, [commentsOpen, open, previewComments.length, story?.id]);

  const openComments = useCallback(async () => {
    if (!story?.id || !ownerUserId) return;
    setCommentsOpen(true);
    setCommentsState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      items: Array.isArray(activeEngagement.preview_comments) ? activeEngagement.preview_comments : prev.items,
    }));
    try {
      const payload = await messagesApi.storyComments(ownerUserId, story.id);
      setCommentsState((prev) => ({
        ...prev,
        loading: false,
        items: payload.comments || [],
      }));
    } catch (err) {
      setCommentsState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load comments.',
      }));
    }
  }, [activeEngagement.preview_comments, ownerUserId, story?.id]);

  const sendComment = () => {
    const content = commentsState.draft.trim();
    if (!content || commentsState.sending) return;
    setCommentsState((prev) => ({ ...prev, sending: true, error: '' }));
    addCommentMutation.mutate(content);
  };

  const openStats = async () => {
    if (!story?.id || !ownerUserId || !isOwner) return;
    setStatsOpen(true);
    setMenuOpen(false);
    setStatsState({ loading: true, data: null, error: '' });
    try {
      const payload = await messagesApi.storyStats(ownerUserId, story.id);
      setStatsState({ loading: false, data: payload, error: '' });
    } catch (err) {
      setStatsState({
        loading: false,
        data: null,
        error: err instanceof Error ? err.message : 'Failed to load story stats.',
      });
    }
  };

  const confirmDeleteStory = () => {
    if (Platform.OS === 'web') {
      deleteStoryMutation.mutate();
      return;
    }
    Alert.alert('Delete story?', 'This removes the story from your active circles.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteStoryMutation.mutate() },
    ]);
  };

  if (!open) return null;

  const ownerAvatar = ownerUser?.avatar ? fullImageUrl(ownerUser.avatar) : undefined;
  const sharePayload: EmbedSendPayload | null = story && ownerUser ? { link_share: buildStorySharePayload(story, ownerUser) } : null;

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.progressRow, { paddingTop: insets.top + 8 }]}>
          {(stories.length > 0 ? stories : [null]).map((entry, i) => (
            <View key={entry?.id || `empty-${i}`} style={s.progressTrack}>
              {i < index ? (
                <View style={[s.progressFill, { width: '100%' }]} />
              ) : i === index ? (
                <Animated.View
                  style={[
                    s.progressFill,
                    {
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>

        <View style={s.header}>
          {ownerAvatar ? (
            <Image source={{ uri: ownerAvatar }} style={s.headerAvatar} contentFit="cover" />
          ) : (
            <DefaultAvatar size={34} />
          )}
          <View style={s.headerCopy}>
            <Text style={s.headerName} numberOfLines={1}>{ownerUser?.username || 'Story'}</Text>
            <Text style={s.headerTime}>{relativeTime(story?.created_at)}</Text>
          </View>
          <View style={s.headerActions}>
            {isOwner && story ? (
              <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.75 }]}>
                <IconSymbol name="ellipsis" size={18} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.75 }]}>
              <IconSymbol name="xmark" size={18} color="#fff" />
            </Pressable>
          </View>
          {menuOpen ? (
            <View style={s.ownerMenu}>
              <OwnerMenuItem label="Story stats" icon="eye.fill" onPress={openStats} />
              <OwnerMenuItem
                label={archiveStoryMutation.isPending ? 'Archiving...' : 'Archive story'}
                icon="doc.on.doc"
                disabled={archiveStoryMutation.isPending}
                onPress={() => archiveStoryMutation.mutate()}
              />
              <OwnerMenuItem
                label={deleteStoryMutation.isPending ? 'Deleting...' : 'Delete story'}
                icon="trash"
                danger
                disabled={deleteStoryMutation.isPending}
                onPress={confirmDeleteStory}
              />
            </View>
          ) : null}
        </View>

        <View style={s.body}>
          {query.isLoading && !query.data ? (
            <ActivityIndicator color={theme.spinner} />
          ) : query.isError || stories.length === 0 ? (
            <Text style={s.errorText}>
              {query.error instanceof Error ? query.error.message : 'No stories to show.'}
            </Text>
          ) : story ? (
            <StoryCard story={story} onOpenLink={(target) => openStoryLink(target, router)} />
          ) : null}
        </View>

        <Pressable style={[s.tapZone, s.tapZoneLeft]} onPress={goPrevious} accessibilityLabel="Previous story" />
        <Pressable style={[s.tapZone, s.tapZoneRight]} onPress={goNext} accessibilityLabel="Next story" />

        {previewComment ? (
          <Pressable onPress={openComments} style={({ pressed }) => [s.commentPreview, pressed && { opacity: 0.82 }]}>
            <Text style={s.commentPreviewName} numberOfLines={1}>{previewComment.user?.username || 'Comment'}</Text>
            <Text style={s.commentPreviewText} numberOfLines={1}>{previewComment.content}</Text>
          </Pressable>
        ) : null}

        {!readonly && story ? (
          <View style={[s.actionBar, { bottom: insets.bottom + 10 }]}>
            <Pressable
              disabled={togglePumpMutation.isPending}
              onPress={() => togglePumpMutation.mutate()}
              style={({ pressed }) => [s.actionBtn, activeEngagement.user_pumped && s.actionBtnActive, pressed && { opacity: 0.8 }]}>
              <IconSymbol name="flame.fill" size={15} color={activeEngagement.user_pumped ? '#facc15' : '#fff'} />
              <Text style={s.actionText}>Pumps</Text>
              <Text style={s.actionCount}>{activeEngagement.pump_count || 0}</Text>
            </Pressable>
            <Pressable onPress={() => setShareOpen(true)} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }]}>
              <IconSymbol name="square.and.arrow.up" size={15} color="#fff" />
              <Text style={s.actionText}>Share</Text>
            </Pressable>
            <Pressable onPress={openComments} style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }]}>
              <IconSymbol name="message.fill" size={15} color="#fff" />
              <Text style={s.actionText}>Comment</Text>
              <Text style={s.actionCount}>{activeEngagement.comment_count || 0}</Text>
            </Pressable>
          </View>
        ) : null}

        <StoryCommentsSheet
          open={commentsOpen}
          state={commentsState}
          ownerUser={ownerUser}
          keyboardHeight={keyboardHeight}
          bottomInset={insets.bottom}
          onClose={() => setCommentsOpen(false)}
          onDraftChange={(draft) => setCommentsState((prev) => ({ ...prev, draft }))}
          onSend={sendComment}
        />

        <StoryStatsSheet
          open={statsOpen}
          state={statsState}
          ownerUser={ownerUser}
          bottomInset={insets.bottom}
          onClose={() => setStatsOpen(false)}
        />

        {sharePayload ? (
          <SendToMessageSheet
            visible={shareOpen}
            onClose={() => setShareOpen(false)}
            title="Share story"
            description="Send this story to a player or squad."
            payload={sharePayload}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function OwnerMenuItem({
  label,
  icon,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: 'eye.fill' | 'doc.on.doc' | 'trash';
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.ownerMenuItem, pressed && { opacity: 0.76 }, disabled && { opacity: 0.55 }]}>
      <IconSymbol name={icon} size={15} color={danger ? '#fca5a5' : '#fff'} />
      <Text style={[s.ownerMenuText, danger && s.ownerMenuTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function StoryCard({ story, onOpenLink }: { story: StoryItem; onOpenLink: (story: StoryItem) => void }) {
  const s = useThemedStyles(makeStyles);
  const type = storyType(story);
  const imageUrl = fullImageUrl(story.media_url || story.fallback_url || story.fallback_path);
  const snapshot = story.snapshot || null;
  const scores = Array.isArray(story.scores) ? story.scores.slice(0, 5) : [];

  if (snapshot || scores.length > 0 || type === 'score_roundup') {
    const primary = snapshot || scores[0] || {};
    const jacket = fullImageUrl(String(primary.jacket_url || primary.jacketUrl || ''));
    return (
      <View style={s.storyCard}>
        <Text style={s.storyEyebrow}>{scores.length > 1 ? 'Score roundup' : 'Score story'}</Text>
        <Text style={s.storyTitle} numberOfLines={2}>{story.title || String(primary.song_title || primary.songTitle || 'Score update')}</Text>
        {jacket ? <Image source={{ uri: jacket }} style={s.scoreJacket} contentFit="cover" /> : null}
        <View style={s.scoreRows}>
          {(scores.length ? scores : [primary]).map((entry, i) => (
            <View key={`${story.id}-${i}`} style={s.scoreRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.scoreSong} numberOfLines={1}>{String(entry.song_title || entry.songTitle || 'Song')}</Text>
                <Text style={s.scoreMeta}>{String(entry.mode || 'Mode')} {String(entry.level || '')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.scoreValue}>{formatNumber(entry.score)}</Text>
                <Text style={s.scoreGrade}>{String(entry.grade || '')}</Text>
              </View>
            </View>
          ))}
        </View>
        <StoryCaption story={story} onOpenLink={onOpenLink} />
      </View>
    );
  }

  if (imageUrl && type === 'image') {
    return (
      <View style={s.imageStoryCard}>
        <Image source={{ uri: imageUrl }} style={s.imageStory} contentFit="contain" transition={120} />
        <StoryCaption story={story} onOpenLink={onOpenLink} floating />
      </View>
    );
  }

  return (
    <View style={s.storyCard}>
      <Text style={s.storyEyebrow}>{labelForType(type)}</Text>
      <Text style={s.storyTitle} numberOfLines={3}>{story.title || 'Story'}</Text>
      {story.subtitle ? <Text style={s.storySubtitle}>{story.subtitle}</Text> : null}
      {imageUrl ? <Image source={{ uri: imageUrl }} style={s.genericImage} contentFit="cover" /> : null}
      <StoryCaption story={story} onOpenLink={onOpenLink} />
    </View>
  );
}

function StoryCaption({ story, onOpenLink, floating = false }: { story: StoryItem; onOpenLink: (story: StoryItem) => void; floating?: boolean }) {
  const s = useThemedStyles(makeStyles);
  const hasLink = !!(story.link?.path || story.link?.url);
  if (!story.caption && !hasLink) return null;
  return (
    <View style={floating ? s.floatingCaption : s.captionBlock}>
      {story.caption ? <Text style={s.captionText} numberOfLines={floating ? 3 : 6}>{story.caption}</Text> : null}
      {hasLink ? (
        <Pressable onPress={() => onOpenLink(story)} style={({ pressed }) => [s.linkBtn, pressed && { opacity: 0.82 }]}>
          <IconSymbol name="link" size={13} color="#fff" />
          <Text style={s.linkBtnText}>{story.link?.label || 'Open'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StoryCommentsSheet({
  open,
  state,
  ownerUser,
  keyboardHeight,
  bottomInset,
  onClose,
  onDraftChange,
  onSend,
}: {
  open: boolean;
  state: CommentsState;
  ownerUser?: StoryUser | null;
  keyboardHeight: number;
  bottomInset: number;
  onClose: () => void;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  if (!open) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: bottomInset + 12 + keyboardHeight }]}>
          <SheetHeader eyebrow="Comments" title={ownerUser?.username || 'Story'} onClose={onClose} />
          <ScrollView style={s.commentsList} contentContainerStyle={s.commentsContent} keyboardShouldPersistTaps="handled">
            {state.loading ? (
              <ActivityIndicator color="#67e8f9" />
            ) : state.items.length === 0 ? (
              <Text style={s.emptySheetText}>No comments yet.</Text>
            ) : (
              state.items.map((comment) => <CommentRow key={comment.id} comment={comment} />)
            )}
          </ScrollView>
          {state.error ? <Text style={s.sheetError}>{state.error}</Text> : null}
          <View style={s.commentComposer}>
            <TextInput
              value={state.draft}
              onChangeText={onDraftChange}
              placeholder={`Comment on ${ownerUser?.username || 'this story'}`}
              placeholderTextColor="rgba(255,255,255,0.45)"
              maxLength={280}
              multiline
              style={s.commentInput}
            />
            <Pressable
              disabled={!state.draft.trim() || state.sending}
              onPress={onSend}
              style={({ pressed }) => [s.sendCommentBtn, (!state.draft.trim() || state.sending) && s.disabledBtn, pressed && { opacity: 0.86 }]}>
              {state.sending ? <ActivityIndicator color="#05070d" /> : <IconSymbol name="paperplane.fill" size={16} color="#05070d" />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StoryStatsSheet({
  open,
  state,
  ownerUser,
  bottomInset,
  onClose,
}: {
  open: boolean;
  state: { loading: boolean; data: StoryStatsResponse | null; error: string };
  ownerUser?: StoryUser | null;
  bottomInset: number;
  onClose: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  if (!open) return null;
  const viewers = Array.isArray(state.data?.viewers) ? state.data.viewers : [];
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: bottomInset + 12 }]}>
          <SheetHeader eyebrow="Story stats" title={ownerUser?.username || 'Your story'} onClose={onClose} />
          {state.loading ? (
            <ActivityIndicator color="#67e8f9" />
          ) : state.error ? (
            <Text style={s.sheetError}>{state.error}</Text>
          ) : (
            <>
              <View style={s.statsGrid}>
                <StatBox label="Views" value={state.data?.view_count || 0} />
                <StatBox label="Pumps" value={state.data?.pump_count || 0} />
                <StatBox label="Comments" value={state.data?.comment_count || 0} />
              </View>
              <ScrollView style={s.commentsList} contentContainerStyle={s.commentsContent}>
                {viewers.length === 0 ? (
                  <Text style={s.emptySheetText}>No views from other players yet.</Text>
                ) : (
                  viewers.map((entry, i) => (
                    <View key={`${entry.user?.id || 'viewer'}-${i}`} style={s.viewerRow}>
                      <AvatarSmall user={entry.user} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.commentName} numberOfLines={1}>{entry.user?.username || 'Player'}</Text>
                        <Text style={s.commentTime}>{relativeTime(entry.viewed_at)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SheetHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.sheetHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.sheetEyebrow}>{eyebrow}</Text>
        <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.75 }]}>
        <IconSymbol name="xmark" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

function CommentRow({ comment }: { comment: StoryComment }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.commentRow}>
      <AvatarSmall user={comment.user} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.commentMeta}>
          <Text style={s.commentName} numberOfLines={1}>{comment.user?.username || 'Player'}</Text>
          <Text style={s.commentTime}>{relativeTime(comment.created_at)}</Text>
        </View>
        <Text style={s.commentText}>{comment.content}</Text>
      </View>
    </View>
  );
}

function AvatarSmall({ user }: { user?: StoryUser | null }) {
  const s = useThemedStyles(makeStyles);
  const avatar = user?.avatar ? fullImageUrl(user.avatar) : '';
  return avatar ? (
    <Image source={{ uri: avatar }} style={s.smallAvatar} contentFit="cover" />
  ) : (
    <View style={s.smallAvatarFallback}>
      <Text style={s.smallAvatarText}>{(user?.username || 'U').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.statBox}>
      <Text style={s.statValue}>{Math.round(Number(value) || 0).toLocaleString()}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function storyType(story?: StoryItem | null): string {
  return String(story?.type || story?.story_type || '').trim() || 'story';
}

function labelForType(type: string): string {
  switch (type) {
    case 'image': return 'Photo';
    case 'post': return 'Post';
    case 'live_session': return 'Live';
    case 'hour_of_power': return 'Hour of Power';
    case 'score_snapshot': return 'Score';
    case 'score_roundup': return 'Scores';
    default: return type.replace(/_/g, ' ');
  }
}

function formatNumber(value: unknown): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const raw = String(iso).trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZ = /(z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const t = new Date(withZ).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function openStoryLink(story: StoryItem, router: ReturnType<typeof useRouter>) {
  const path = String(story.link?.path || story.fallback_path || '').trim();
  const url = String(story.link?.url || story.fallback_url || '').trim();
  const route = resolveRoute(path);
  if (route) {
    router.push(route as never);
    return;
  }
  if (url) void Linking.openURL(url);
}

function resolveRoute(path: string | undefined): { pathname: string; params?: Record<string, string> } | null {
  if (!path) return null;
  const trimmed = path.startsWith('/') ? path : `/${path}`;
  let m = trimmed.match(/^\/song(?:s)?\/chart\/(\d+)/) || trimmed.match(/^\/song\/(\d+)/);
  if (m) return { pathname: '/song/[id]', params: { id: m[1] } };
  m = trimmed.match(/^\/list\/(\d+)/);
  if (m) return { pathname: '/list/[id]', params: { id: m[1] } };
  m = trimmed.match(/^\/tournament\/(\d+)/);
  if (m) return { pathname: '/tournament/[id]', params: { id: m[1] } };
  m = trimmed.match(/^\/profile\/([^/?#]+)/);
  if (m) return { pathname: '/profile/[id]', params: { id: m[1] } };
  m = trimmed.match(/^\/live\/([^/?#]+)/);
  if (m) return { pathname: '/live/[id]', params: { id: m[1] } };
  return null;
}

function buildStorySharePayload(story: StoryItem, ownerUser: StoryUser) {
  const scores = Array.isArray(story.scores) ? story.scores : [];
  const previewItems = scores.slice(0, 3).map((entry) => ({
    songTitle: String(entry.song_title || '').trim(),
    mode: String(entry.mode || '').trim(),
    level: parseInt(String(entry.level || 0), 10) || 0,
    score: parseInt(String(entry.score || 0), 10) || 0,
    grade: String(entry.grade || '').trim(),
    plate: String(entry.plate || '').trim(),
    jacketUrl: String(entry.jacket_url || '').trim(),
  }));
  const snapshot = story.snapshot || {};
  const storyPath = String(story.link?.path || '').trim();
  const storyUrl = String(story.link?.url || '').trim();
  const ownerAvatar = String(ownerUser.avatar || story.user?.avatar || '').trim();
  const ownerUsername = String(ownerUser.username || story.user?.username || '').trim();
  const totalItemCount = Math.max(parseInt(String(story.total_count || 0), 10) || 0, previewItems.length);

  return {
    kind: 'story',
    path: storyPath || '/messages',
    url: storyUrl,
    storyId: String(story.id || '').trim(),
    storyOwnerId: String(ownerUser.id || story.user?.id || '').trim(),
    storyOwnerUsername: ownerUsername,
    storyOwnerAvatar: ownerAvatar,
    storyType: storyType(story),
    storySourceKind: String(story.source?.kind || story.source_kind || '').trim(),
    storyCaption: String(story.caption || '').trim().slice(0, 420),
    storyCreatedAt: String(story.created_at || '').trim(),
    storyMediaUrl: String(story.media_url || '').trim(),
    storyFallbackPath: storyPath,
    storyFallbackUrl: storyUrl,
    title: String(story.title || `${ownerUsername || 'Player'} story`).trim().slice(0, 160),
    subtitle: String(story.subtitle || story.caption || '').trim().slice(0, 220),
    buttonLabel: 'Open story',
    songTitle: String(snapshot.song_title || snapshot.songTitle || scores[0]?.song_title || '').trim(),
    mode: String(snapshot.mode || scores[0]?.mode || '').trim(),
    level: parseInt(String(snapshot.level ?? scores[0]?.level ?? 0), 10) || 0,
    score: parseInt(String(snapshot.score ?? scores[0]?.score ?? 0), 10) || 0,
    grade: String(snapshot.grade || scores[0]?.grade || '').trim(),
    plate: String(snapshot.plate || scores[0]?.plate || '').trim(),
    jacketUrl: String(snapshot.jacket_url || snapshot.jacketUrl || scores[0]?.jacket_url || '').trim(),
    playerName: ownerUsername,
    playerAvatar: ownerAvatar,
    contextLabel: 'Story',
    previewItems,
    totalItemCount,
    extraItemCount: Math.max(0, totalItemCount - previewItems.length),
  };
}

const makeStyles = (_t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  progressRow: { flexDirection: 'row' as const, paddingHorizontal: 8, gap: 4, zIndex: 4 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)', overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, borderRadius: 2, backgroundColor: '#67e8f9' },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 12, paddingVertical: 10, zIndex: 5 },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 14, fontWeight: '900' as const, color: '#fff' },
  headerTime: { fontSize: 11, fontWeight: '700' as const, color: 'rgba(255,255,255,0.58)', marginTop: 1 },
  headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  ownerMenu: { position: 'absolute' as const, right: 52, top: 56, width: 190, borderRadius: 16, overflow: 'hidden' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#0d1320', zIndex: 8 },
  ownerMenuItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  ownerMenuText: { color: '#fff', fontSize: 13, fontWeight: '800' as const },
  ownerMenuTextDanger: { color: '#fca5a5' },
  body: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 14, paddingBottom: 84 },
  errorText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700' as const },
  tapZone: { position: 'absolute' as const, top: 92, bottom: 92, zIndex: 2 },
  tapZoneLeft: { left: 0, width: '30%' as const },
  tapZoneRight: { right: 0, width: '30%' as const },

  storyCard: { width: '100%' as const, maxWidth: 380, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(13,19,32,0.94)', padding: 18, gap: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  imageStoryCard: { width: '100%' as const, height: '100%' as const, alignItems: 'center' as const, justifyContent: 'center' as const, position: 'relative' as const },
  imageStory: { width: '100%' as const, height: '100%' as const },
  storyEyebrow: { color: '#67e8f9', fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  storyTitle: { color: '#fff', fontSize: 26, fontWeight: '900' as const, lineHeight: 30 },
  storySubtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 14, fontWeight: '700' as const, lineHeight: 20 },
  genericImage: { width: '100%' as const, height: 220, borderRadius: 18, backgroundColor: '#111827' },
  scoreJacket: { width: 96, height: 96, borderRadius: 20, backgroundColor: '#111827' },
  scoreRows: { gap: 8 },
  scoreRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(0,0,0,0.22)', padding: 12 },
  scoreSong: { color: '#fff', fontSize: 14, fontWeight: '900' as const },
  scoreMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' as const, marginTop: 2 },
  scoreValue: { color: '#fff', fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  scoreGrade: { color: '#facc15', fontSize: 12, fontWeight: '900' as const, marginTop: 2 },
  captionBlock: { gap: 10 },
  floatingCaption: { position: 'absolute' as const, left: 0, right: 0, bottom: 0, gap: 10, padding: 16, backgroundColor: 'rgba(0,0,0,0.48)' },
  captionText: { color: '#fff', fontSize: 14, fontWeight: '700' as const, lineHeight: 21 },
  linkBtn: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8 },
  linkBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' as const },
  commentPreview: { position: 'absolute' as const, left: 14, bottom: 72, maxWidth: '66%' as const, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 9, zIndex: 4 },
  commentPreviewName: { color: '#67e8f9', fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  commentPreviewText: { color: '#fff', fontSize: 13, fontWeight: '700' as const, marginTop: 2 },
  actionBar: { position: 'absolute' as const, left: 10, right: 10, zIndex: 5, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 8, paddingVertical: 7 },
  actionBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 5, minHeight: 34, borderRadius: 999, paddingHorizontal: 10 },
  actionBtnActive: { backgroundColor: 'rgba(103,232,249,0.16)' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '900' as const },
  actionCount: { color: '#a5f3fc', fontSize: 11, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: { maxHeight: '82%' as const, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#070b13', padding: 14, gap: 12 },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  sheetEyebrow: { color: '#67e8f9', fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' as const, marginTop: 2 },
  sheetError: { color: '#fca5a5', fontSize: 12, fontWeight: '700' as const },
  commentsList: { maxHeight: 330 },
  commentsContent: { gap: 9, paddingVertical: 4 },
  emptySheetText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700' as const, textAlign: 'center' as const, paddingVertical: 22 },
  commentRow: { flexDirection: 'row' as const, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.045)', padding: 11 },
  commentMeta: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const, gap: 8 },
  commentName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '900' as const },
  commentTime: { color: 'rgba(255,255,255,0.42)', fontSize: 10, fontWeight: '800' as const },
  commentText: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' as const, lineHeight: 18, marginTop: 2 },
  smallAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)' },
  smallAvatarFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.1)' },
  smallAvatarText: { color: '#fff', fontSize: 12, fontWeight: '900' as const },
  commentComposer: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 9 },
  commentInput: { flex: 1, minHeight: 44, maxHeight: 96, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', fontSize: 13, fontWeight: '700' as const },
  sendCommentBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#facc15' },
  disabledBtn: { opacity: 0.45 },
  statsGrid: { flexDirection: 'row' as const, gap: 8 },
  statBox: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.045)', padding: 12 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  statLabel: { color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: '900' as const, letterSpacing: 1, textTransform: 'uppercase' as const, marginTop: 3 },
  viewerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.045)', padding: 10 },
});
