/**
 * Single new-clear detail route.
 *
 * Destination for "Recent activity" rows of type `new_clear`. Mirrors
 * the /upscore/[id] route — same structure, swapped card. Renders the
 * feed's `ClearCard` directly so pumps/comments/jacket/score/share all
 * behave identically to the feed surface.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentsThread } from '@/components/comments-thread';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { SendToMessageSheet } from '@/components/messages/send-to-message-sheet';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import type { FeedItem } from '@shared/api';
import {
  ClearCard,
  makeStyles,
  usePumpFeedItem,
  buildFeedShareTitle,
  buildFeedShareSubtitle,
  buildFeedSharePayload,
  buildPublicShareTitle,
  buildPublicShareUrl,
} from '@/app/(drawer)/(tabs)/feed';

export default function ClearDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const onPump = usePumpFeedItem();

  const clearQuery = useQuery({
    queryKey: ['clear', id],
    queryFn: () => socialApi.clearById(String(id)),
    enabled: !!id,
  });

  const [scoreTarget, setScoreTarget] = useState<ScoreCardData | null>(null);
  const [replayTarget, setReplayTarget] = useState<{ url: string; title: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<FeedItem | null>(null);

  // Comments render inline below the card; the comment button scrolls to them.
  const scrollRef = useRef<ScrollView>(null);
  const commentsY = useRef(0);
  const onComments = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(commentsY.current - 12, 0), animated: true });
  }, []);
  const onShare = useCallback((it: FeedItem) => setShareTarget(it), []);
  const onOsShare = useCallback((it: FeedItem) => {
    const url = buildPublicShareUrl(it);
    const title = buildPublicShareTitle(it);
    const subtitle = buildFeedShareSubtitle(it);
    const message = subtitle ? `${title} · ${subtitle}\n${url}` : `${title}\n${url}`;
    void Share.share({ message, url, title });
  }, []);
  const onScore = useCallback((d: ScoreCardData) => setScoreTarget(d), []);
  const onReplay = useCallback((url: string, title: string) => setReplayTarget({ url, title }), []);
  const onJacket = useCallback(
    (chartId: number, _songTitle: string, _mode: string, _level: number) => {
      if (chartId) router.push({ pathname: '/song/[id]', params: { id: String(chartId) } });
    },
    [router],
  );

  const item = clearQuery.data;

  return (
    <View style={s.container}>
      {clearQuery.isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : clearQuery.isError || !item ? (
        <View style={s.center}>
          <Text style={s.errorText}>
            {clearQuery.error instanceof Error ? clearQuery.error.message : 'Clear not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
          <ClearCard
            item={item}
            s={s}
            onPump={onPump}
            onComments={onComments}
            onShare={onShare}
            onOsShare={onOsShare}
            onJacket={onJacket}
            onScore={onScore}
          />
          <View onLayout={(e) => { commentsY.current = e.nativeEvent.layout.y; }}>
            <CommentsThread itemType={item.type} itemId={item.id} />
          </View>
        </ScrollView>
      )}

      <ScoreCardSheet
        visible={!!scoreTarget}
        data={scoreTarget}
        onClose={() => setScoreTarget(null)}
        onReplay={onReplay}
      />
      <ReplayModal
        visible={!!replayTarget}
        url={replayTarget?.url}
        title={replayTarget?.title}
        onClose={() => setReplayTarget(null)}
      />
      <SendToMessageSheet
        visible={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title={buildFeedShareTitle(shareTarget)}
        description={buildFeedShareSubtitle(shareTarget)}
        payload={buildFeedSharePayload(shareTarget)}
      />
    </View>
  );
}
