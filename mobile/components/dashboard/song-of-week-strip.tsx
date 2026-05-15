import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChartJacket } from '@/components/chart-jacket';
import { SongOfWeekComposer } from '@/components/song-of-week-composer';
import { useAuth } from '@/contexts/auth-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';

export function SongOfWeekStrip() {
  const s = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['song-of-week', 'global'],
    queryFn: () => socialApi.songOfWeekFeed('global'),
    retry: false,
  });
  // Used to know whether to render "Pick yours" or "Edit your pick" on the
  // CTA card. Cheap separate query — server returns null when the user has
  // no pick this week, so the card can flip without scanning the global feed.
  const myPickQuery = useQuery({
    queryKey: ['song-of-week', 'me'],
    queryFn: () => socialApi.songOfWeekMe(),
    enabled: !!user,
    retry: false,
  });

  const items = data ?? [];
  if (items.length === 0 && !user) return null;

  const myPick = myPickQuery.data;

  return (
    <View style={s.container}>
      <Text style={s.eyebrow}>SONG OF THE WEEK</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Owner CTA card lives at the front of the rail so logged-in users
            always have a one-tap entry point to set or edit their weekly
            pick, even when their card is buried mid-feed. */}
        {user ? (
          <Pressable
            onPress={() => setComposerOpen(true)}
            style={({ pressed }) => [s.ctaCard, pressed && { opacity: 0.7 }]}>
            <View style={s.ctaIcon}>
              <Text style={s.ctaIconText}>{myPick ? '✎' : '+'}</Text>
            </View>
            <Text style={s.ctaTitle}>{myPick ? 'Edit your pick' : 'Pick yours'}</Text>
            <Text style={s.ctaHint} numberOfLines={2}>
              {myPick
                ? `${myPick.song_title_snapshot}`
                : 'Tell the dojo what you’re grinding this week'}
            </Text>
          </Pressable>
        ) : null}
        {items.map((it) => {
          const jacket = it.jacket_url_snapshot ? fullImageUrl(it.jacket_url_snapshot) : undefined;
          return (
            <Pressable
              key={String(it.id)}
              // expo-router typed-routes are regenerated on `expo start` /
              // `expo export`. Cast until the new screen file is picked up.
              onPress={() => router.push(`/song-of-the-week/${it.id}` as never)}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.75 }]}>
              <View style={s.jacketWrap}>
                <ChartJacket jacketUrl={jacket} mode={it.mode} level={it.level} size="wide" />
              </View>
              <Text style={s.title} numberOfLines={1}>{it.song_title_snapshot || 'Unknown'}</Text>
              <Text style={s.user} numberOfLines={1}>@{it.username}</Text>
              {it.caption ? <Text style={s.caption} numberOfLines={2}>&ldquo;{it.caption}&rdquo;</Text> : null}
              {typeof it.comment_count === 'number' && it.comment_count > 0 ? (
                <Text style={s.commentCount}>{it.comment_count} comment{it.comment_count === 1 ? '' : 's'}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <SongOfWeekComposer
        visible={composerOpen}
        existingPick={myPick ?? null}
        onClose={() => setComposerOpen(false)}
        onSaved={() => {
          setComposerOpen(false);
          // Refresh both queries so the new pick shows up in the rail and
          // the CTA flips to "Edit your pick" without a hard reload.
          refetch();
          myPickQuery.refetch();
        }}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 8 },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 0,
  },
  scroll: { gap: 10, paddingRight: 16 },
  card: {
    width: 152,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  jacketWrap: { alignSelf: 'center' as const, marginBottom: 2 },
  title: { fontSize: 12, fontWeight: '800' as const, color: t.text },
  user: { fontSize: 10, color: t.accent, fontWeight: '700' as const },
  caption: { fontSize: 10, color: t.textDim, fontStyle: 'italic' as const },
  commentCount: { fontSize: 9, color: t.textMuted, fontWeight: '700' as const },

  // Owner CTA card — visually distinct (dashed border + accent tint) so it
  // doesn't get mistaken for someone else's pick.
  ctaCard: {
    width: 132,
    backgroundColor: t.surfaceMuted,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: t.accent,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ctaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 2,
  },
  ctaIconText: { fontSize: 18, fontWeight: '900' as const, color: t.textOnAccent },
  ctaTitle: {
    fontSize: 11,
    fontWeight: '900' as const,
    color: t.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
  },
  ctaHint: { fontSize: 10, color: t.textDim, textAlign: 'center' as const, lineHeight: 13 },
});
