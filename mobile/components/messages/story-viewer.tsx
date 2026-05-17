/**
 * Full-screen story viewer modal. Renders a user's stack of stories as
 * tap-to-advance cards with progress dots at the top.
 *
 * Tap right half → next; tap left half → previous; tap close (×) to
 * dismiss; auto-mark-as-viewed each story after a short delay so a quick
 * skim still counts as "seen".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultAvatar } from '@/components/default-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { HIGHLIGHTS_QUERY_KEY } from '@/components/messages/stories-strip';
import type { ThemeColors } from '@/constants/theme';
import type { StoryItem } from '@shared/api';

const VIEW_DEBOUNCE_MS = 800;

interface Props {
  /** user_id whose story stack to view, or null when closed. */
  userId: string | null;
  onClose: () => void;
}

export function StoryViewer({ userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const lastViewedRef = useRef<string | null>(null);

  const open = !!userId;
  const query = useQuery({
    queryKey: ['messages', 'story', userId || ''],
    queryFn: () => messagesApi.story(userId!),
    enabled: open,
    staleTime: 30_000,
  });

  const stories: StoryItem[] = query.data?.stories ?? [];
  const ownerUser = query.data?.user;
  const story: StoryItem | undefined = stories[index];

  // Mark each story as viewed after a short delay so a quick skim still
  // registers, but a tap-through doesn't fire 5 simultaneous requests.
  const viewedMutation = useMutation({
    mutationFn: (vars: { ownerUserId: string; storyId: string }) =>
      messagesApi.markStoryViewed(vars.ownerUserId, vars.storyId),
    onSuccess: () => {
      // Invalidate highlights so the unseen ring on the strip clears.
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });

  // Reset position when the viewer opens with a new user.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open, userId]);

  // Mark-viewed debounce
  useEffect(() => {
    if (!open || !story?.id || !userId) return;
    if (story.is_viewed) return;
    if (lastViewedRef.current === story.id) return;
    const timer = setTimeout(() => {
      lastViewedRef.current = story.id;
      viewedMutation.mutate({ ownerUserId: userId, storyId: story.id });
    }, VIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, story?.id, userId]);

  if (!open) return null;

  const handlePrev = () => setIndex((i) => Math.max(0, i - 1));
  const handleNext = () => {
    if (index >= stories.length - 1) onClose();
    else setIndex((i) => i + 1);
  };

  const mediaUrl = fullImageUrl(story?.media_url || story?.fallback_url || story?.fallback_path);
  const ownerAvatar = ownerUser?.avatar ? fullImageUrl(ownerUser.avatar) : undefined;

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {/* Progress dots — one per story */}
        <View style={[s.progressRow, { paddingTop: insets.top + 8 }]}>
          {stories.map((_, i) => (
            <View key={i} style={[
              s.progressBar,
              i < index && s.progressBarPast,
              i === index && s.progressBarCurrent,
              i > index && s.progressBarFuture,
            ]} />
          ))}
        </View>

        {/* Header */}
        <View style={s.header}>
          {ownerAvatar ? (
            <Image source={{ uri: ownerAvatar }} style={s.headerAvatar} contentFit="cover" />
          ) : (
            <DefaultAvatar size={32} />
          )}
          <Text style={s.headerName} numberOfLines={1}>{ownerUser?.username || ''}</Text>
          {story?.story_type ? (
            <Text style={s.headerKind}>{labelForType(story.story_type)}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="xmark" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Body */}
        <View style={s.body}>
          {query.isLoading ? (
            <ActivityIndicator color={theme.spinner} />
          ) : query.isError || stories.length === 0 ? (
            <Text style={s.errorText}>
              {query.error instanceof Error ? query.error.message : 'No stories to show.'}
            </Text>
          ) : (
            <>
              {mediaUrl ? (
                <Image source={{ uri: mediaUrl }} style={s.media} contentFit="contain" transition={120} />
              ) : (
                <View style={s.fallbackBox}>
                  <Text style={s.fallbackKind}>{labelForType(story?.story_type || 'note')}</Text>
                  {story?.caption ? (
                    <Text style={s.fallbackCaption} numberOfLines={6}>{story.caption}</Text>
                  ) : null}
                </View>
              )}
              {story?.caption && mediaUrl ? (
                <View style={[s.captionBar, { paddingBottom: insets.bottom + 12 }]}>
                  <Text style={s.captionText} numberOfLines={3}>{story.caption}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Tap zones — left/right halves to advance through stories */}
        <Pressable style={[s.tapZone, s.tapZoneLeft]} onPress={handlePrev} accessibilityLabel="Previous story" />
        <Pressable style={[s.tapZone, s.tapZoneRight]} onPress={handleNext} accessibilityLabel="Next story" />
      </View>
    </Modal>
  );
}

function labelForType(type: string): string {
  switch (type) {
    case 'image': return 'Photo';
    case 'video': return 'Video';
    case 'replay': return 'Replay';
    case 'achievement': return 'Achievement';
    case 'note': return 'Note';
    case 'score_share': return 'Score';
    default: return type.replace(/_/g, ' ');
  }
}

const makeStyles = (_t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  progressRow: {
    flexDirection: 'row' as const,
    paddingHorizontal: 8,
    gap: 4,
    zIndex: 2,
  },
  progressBar: {
    flex: 1,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressBarPast: { backgroundColor: '#fff' },
  progressBarCurrent: { backgroundColor: '#fff' },
  progressBarFuture: { backgroundColor: 'rgba(255,255,255,0.3)' },

  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 2,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerName: { fontSize: 14, fontWeight: '900' as const, color: '#fff' },
  headerKind: { fontSize: 10, fontWeight: '800' as const, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  closeBtn: { padding: 6 },

  body: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12, position: 'relative' as const },
  media: { width: '100%' as const, height: '100%' as const },
  fallbackBox: { gap: 12, alignItems: 'center' as const, padding: 24 },
  fallbackKind: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '900' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  fallbackCaption: { color: '#fff', fontSize: 18, fontWeight: '700' as const, lineHeight: 26, textAlign: 'center' as const },

  captionBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captionText: { color: '#fff', fontSize: 14, fontWeight: '700' as const, lineHeight: 20 },

  errorText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  // Tap zones cover the bottom 70% of the screen so the close + header
  // remain tappable.
  tapZone: { position: 'absolute' as const, top: 0, bottom: 0, width: '40%' as const },
  tapZoneLeft: { left: 0 },
  tapZoneRight: { right: 0 },
});

