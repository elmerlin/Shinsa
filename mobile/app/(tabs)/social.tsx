import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveSessionCard } from '@/components/live-session-card';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { ThemeColors } from '@/constants/theme';
import type { FeedItem } from '@shared/api';

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

function parseImages(raw: FeedItem['images']): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function PostCard({ item, onPress, s }: { item: FeedItem; onPress: () => void; s: Styles }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const images = parseImages(item.images);
  const firstImage = images[0] ? fullImageUrl(images[0]) : undefined;
  const { content, summary } = parseLiveSessionMarker(item.content);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
      <View style={s.cardHeader}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarLetter}>{(item.username || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.headerInfo}>
          <Text style={s.username}>{item.username || 'anonymous'}</Text>
          <Text style={s.time}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
      {summary ? <LiveSessionCard summary={summary} /> : null}
      {content ? (
        <Text style={s.content} numberOfLines={6}>{content}</Text>
      ) : null}
      {firstImage ? (
        <Image source={{ uri: firstImage }} style={s.cardImage} contentFit="cover" transition={150} />
      ) : null}
      <View style={s.cardFooter}>
        {typeof item.pump_count === 'number' && item.pump_count > 0 ? (
          <Text style={s.metric}>↑ {item.pump_count}</Text>
        ) : null}
        {typeof item.comment_count === 'number' && item.comment_count > 0 ? (
          <Text style={s.metric}>💬 {item.comment_count}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ActivityRow({ item, s }: { item: FeedItem; s: Styles }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  let label = '';
  if (item.type === 'upscore') label = 'upscored';
  else if (item.type === 'clear') label = 'cleared a chart';
  else if (item.type === 'weekly_challenge') label = 'played a weekly challenge';

  return (
    <View style={s.activityRow}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.activityAvatar} contentFit="cover" />
      ) : (
        <View style={[s.activityAvatar, s.avatarFallback]}>
          <Text style={s.activityAvatarLetter}>{(item.username || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.activityMain}>
        <Text style={s.activityText}>
          <Text style={s.activityUser}>{item.username || 'anonymous'}</Text>
          <Text style={s.activityLabel}> {label}</Text>
        </Text>
        <Text style={s.activityTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['social-feed'],
    queryFn: () => socialApi.feed(),
  });

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.heading}>Feed</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error instanceof Error ? error.message : 'Failed to load feed'}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item, i) => `${item.type}:${item.id}:${i}`}
          renderItem={({ item }) => (
            item.type === 'post' ? (
              <PostCard
                item={item}
                s={s}
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(item.id) } })}
              />
            ) : (
              <ActivityRow item={item} s={s} />
            )
          )}
          contentContainerStyle={s.listContent}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={() => <Text style={s.empty}>Your feed is empty. Follow people to see their activity here.</Text>}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.spinner} />}
        />
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  heading: { fontSize: 28, fontWeight: '800' as const, color: t.text, letterSpacing: 2 },
  listContent: { padding: 16, paddingBottom: 80 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  empty: { textAlign: 'center' as const, padding: 32, color: t.textDim },
  errorText: { color: t.danger, textAlign: 'center' as const },

  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
    gap: 10,
  },
  cardPressed: { backgroundColor: t.accentTint },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  avatarFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  avatarLetter: { fontSize: 16, fontWeight: '700' as const, color: t.textMuted },
  headerInfo: { flex: 1, gap: 1 },
  username: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  time: { fontSize: 11, color: t.textDim },
  content: { fontSize: 14, lineHeight: 20, color: t.text },
  cardImage: { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: t.surfaceMuted },
  cardFooter: { flexDirection: 'row' as const, gap: 16, paddingTop: 4 },
  metric: { fontSize: 12, color: t.textMuted, fontWeight: '700' as const },

  activityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 12,
    backgroundColor: t.surfaceMuted,
    borderRadius: 10,
  },
  activityAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  activityAvatarLetter: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  activityMain: { flex: 1, gap: 1 },
  activityText: { fontSize: 13, color: t.text },
  activityUser: { fontWeight: '700' as const, color: t.text },
  activityLabel: { color: t.textMuted },
  activityTime: { fontSize: 11, color: t.textDim },
});
