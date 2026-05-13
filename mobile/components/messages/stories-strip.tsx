/**
 * Horizontal stories strip rendered at the top of the messages inbox.
 * Each circle is one user (or "you") with an active story; tapping
 * opens the story viewer modal.
 *
 * Mirrors the liketu chat stories strip pattern. Loops through:
 *  - Self bucket first (always shown if `me` exists)
 *  - Then other circles ordered server-side
 */
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { DefaultAvatar } from '@/components/default-avatar';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { messagesApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { StoryHighlightCircle } from '@shared/api';

const HIGHLIGHTS_QUERY_KEY = ['messages', 'highlights'] as const;

interface Props {
  /** Called when a circle is tapped — receives the user_id whose story
   *  stack should open. */
  onPickStory: (userId: string) => void;
}

export function StoriesStrip({ onPickStory }: Props) {
  const s = useThemedStyles(makeStyles);
  const query = useQuery({
    queryKey: HIGHLIGHTS_QUERY_KEY,
    queryFn: () => messagesApi.highlights(),
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={s.circleSkeleton} />
        ))}
      </ScrollView>
    );
  }

  // Compose the visible list — self bucket first, then circles with active
  // stories. Dedupe by user_id because the server's `circles` array often
  // includes the viewer's own bucket too (as `is_self: true`); without
  // dedupe we'd render the user's avatar twice.
  const list: StoryHighlightCircle[] = [];
  const seen = new Set<string>();
  if (query.data?.me?.user?.id) {
    list.push({ ...query.data.me, is_self: true });
    seen.add(query.data.me.user.id);
  }
  for (const c of query.data?.circles ?? []) {
    if (!c?.user?.id || seen.has(c.user.id)) continue;
    if (!c.has_story && !c.is_self) continue;
    seen.add(c.user.id);
    list.push(c);
  }

  if (list.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
      {list.map((circle) => (
        <StoryCircle
          key={circle.user.id}
          circle={circle}
          onPress={() => onPickStory(circle.user.id)}
        />
      ))}
    </ScrollView>
  );
}

function StoryCircle({ circle, onPress }: { circle: StoryHighlightCircle; onPress: () => void }) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const avatar = circle.user.avatar ? fullImageUrl(circle.user.avatar) : undefined;
  // Visual ring states:
  //  - has_story && has_unseen → gold ring
  //  - has_story && seen → muted ring
  //  - is_self && no story → dashed ring (compose new)
  const ringStyle = circle.has_story
    ? (circle.has_unseen ? s.ringUnseen : s.ringSeen)
    : circle.is_self
      ? s.ringDashed
      : s.ringNone;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.circleWrap, pressed && { opacity: 0.7 }]}>
      <View style={[s.ring, ringStyle]}>
        <View style={s.avatarInner}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={s.avatarImg} contentFit="cover" />
          ) : (
            <DefaultAvatar size={52} />
          )}
        </View>
        {circle.is_self && !circle.has_story ? (
          <View style={[s.composeBadge, { backgroundColor: theme.accent }]}>
            <Text style={s.composeBadgePlus}>+</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.label} numberOfLines={1}>
        {circle.is_self ? 'Your story' : circle.user.username}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  // Horizontal ScrollView contentContainerStyle — alignItems:'center' is
  // critical so the circles don't stretch the strip vertically (RN Web
  // gotcha we hit on the leaderboards tab strip earlier).
  strip: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center' as const,
  },
  circleSkeleton: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.surfaceMuted },

  circleWrap: { width: 68, alignItems: 'center' as const, gap: 4 },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  ringUnseen: { borderWidth: 2, borderColor: t.accent },
  ringSeen: { borderWidth: 2, borderColor: t.border },
  ringDashed: { borderWidth: 1.5, borderColor: t.accent, borderStyle: 'dashed' as const },
  ringNone: { borderWidth: 0 },
  avatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden' as const,
    backgroundColor: t.surfaceMuted,
  },
  avatarImg: { width: '100%' as const, height: '100%' as const },

  composeBadge: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: t.bg,
  },
  composeBadgePlus: { color: t.bg, fontSize: 12, fontWeight: '900' as const, lineHeight: 14 },

  label: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted, maxWidth: 64 },
});

export { HIGHLIGHTS_QUERY_KEY };
