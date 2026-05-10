import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveSessionCard } from '@/components/live-session-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { socialApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import { parseLiveSessionMarker } from '@/lib/liveSessionMarker';
import type { FeedItem } from '@shared/api';

function timeAgo(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
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

function PostCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const images = parseImages(item.images);
  const firstImage = images[0] ? fullImageUrl(images[0]) : undefined;
  const { content, summary } = parseLiveSessionMarker(item.content);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardHeader}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{(item.username || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <ThemedText style={styles.username}>{item.username || 'anonymous'}</ThemedText>
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
      {summary ? <LiveSessionCard summary={summary} /> : null}
      {content ? (
        <ThemedText style={styles.content} numberOfLines={6}>{content}</ThemedText>
      ) : null}
      {firstImage ? (
        <Image source={{ uri: firstImage }} style={styles.cardImage} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.cardFooter}>
        {typeof item.pump_count === 'number' && item.pump_count > 0 ? (
          <Text style={styles.metric}>↑ {item.pump_count}</Text>
        ) : null}
        {typeof item.comment_count === 'number' && item.comment_count > 0 ? (
          <Text style={styles.metric}>💬 {item.comment_count}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ActivityRow({ item }: { item: FeedItem }) {
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  let label = '';
  if (item.type === 'upscore') label = 'upscored';
  else if (item.type === 'clear') label = 'cleared a chart';
  else if (item.type === 'weekly_challenge') label = 'played a weekly challenge';

  return (
    <View style={styles.activityRow}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.activityAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.activityAvatar, styles.avatarFallback]}>
          <Text style={styles.activityAvatarLetter}>{(item.username || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.activityMain}>
        <Text style={styles.activityText}>
          <Text style={styles.activityUser}>{item.username || 'anonymous'}</Text>
          <Text style={styles.activityLabel}> {label}</Text>
        </Text>
        <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['social-feed'],
    queryFn: () => socialApi.feed(),
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <ThemedText type="title" style={styles.heading}>Feed</ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#ff3366" /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Failed to load feed'}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item, i) => `${item.type}:${item.id}:${i}`}
          renderItem={({ item }) => (
            item.type === 'post' ? (
              <PostCard
                item={item}
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(item.id) } })}
              />
            ) : (
              <ActivityRow item={item} />
            )
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={() => <Text style={styles.empty}>Your feed is empty. Follow people to see their activity here.</Text>}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ff3366" />
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  heading: { fontSize: 28, fontWeight: '700', letterSpacing: 4 },
  listContent: { padding: 16, paddingBottom: 80 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { textAlign: 'center', padding: 32, opacity: 0.5 },
  errorText: { color: '#fca5a5', textAlign: 'center' },

  card: { backgroundColor: '#141428', borderRadius: 12, padding: 14, gap: 10 },
  cardPressed: { backgroundColor: 'rgba(255,51,102,0.08)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1e293b' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 16, fontWeight: '700', color: '#94a3b8' },
  headerInfo: { flex: 1, gap: 1 },
  username: { fontSize: 14, fontWeight: '600' },
  time: { fontSize: 11, opacity: 0.5 },
  content: { fontSize: 14, lineHeight: 20 },
  cardImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: '#1e293b' },
  cardFooter: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  metric: { fontSize: 12, opacity: 0.7, fontWeight: '600' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'rgba(148,163,184,0.04)', borderRadius: 10 },
  activityAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e293b' },
  activityAvatarLetter: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  activityMain: { flex: 1, gap: 1 },
  activityText: { fontSize: 13 },
  activityUser: { fontWeight: '600' },
  activityLabel: { opacity: 0.6 },
  activityTime: { fontSize: 11, opacity: 0.5 },
});
