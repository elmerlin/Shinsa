import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ReplayModal } from '@/components/replay-modal';
import { ScoreCardSheet, type ScoreCardData } from '@/components/score-card-sheet';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';

// Deep-link landing for shared scores: new.pumpshinsa.com/play/:id (the URL
// the Share button puts on the clipboard / in the OS share sheet). Fetches
// the play and opens the standard score card over a quiet backdrop.
export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const s = useThemedStyles(makeStyles);
  const [replay, setReplay] = useState<{ url: string; title: string } | null>(null);
  const [closed, setClosed] = useState(false);

  const query = useQuery({
    queryKey: ['play', id],
    queryFn: () => socialApi.getPlay(String(id)),
    enabled: !!id,
  });

  const play = query.data as Record<string, unknown> | undefined;
  const data: ScoreCardData | null = play
    ? {
        ...(play as ScoreCardData),
        play_id: Number(play.id) || undefined,
        jacket_url: (play.jacket_url as string) || (play.background_url as string) || undefined,
        is_stage_break: (Number(play.score) || 0) === 0,
      }
    : null;

  const goBack = () => {
    setClosed(true);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: data?.song_title ? String(data.song_title) : 'Score', headerBackButtonDisplayMode: 'minimal' }} />
      {query.isLoading ? (
        <ActivityIndicator color="#fff" />
      ) : query.isError || !data ? (
        <Text style={s.err}>Score not found — it may have been removed.</Text>
      ) : (
        <ScoreCardSheet
          visible={!closed}
          data={data}
          onClose={goBack}
          onReplay={(url, title) => setReplay({ url, title })}
        />
      )}
      <ReplayModal
        visible={!!replay}
        url={replay?.url}
        title={replay?.title}
        onClose={() => setReplay(null)}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: {
    flex: 1,
    backgroundColor: t.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
  },
  err: { fontSize: 14, color: t.textMuted, textAlign: 'center' as const },
});
