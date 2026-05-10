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

function fmtNum(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function parseImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

interface UpscoreEntry {
  song_title?: string;
  mode?: string;
  level?: number;
  old_score?: number;
  new_score?: number;
  old_grade?: string;
  new_grade?: string;
  jacket_url?: string;
  background_url?: string;
}

interface WeeklyChallengePlay {
  song_title?: string;
  mode?: string;
  level?: number;
  score?: number;
  grade?: string;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function ActivityHeader({ username, action, time, avatar, s }: {
  username: string;
  action: string;
  time: string;
  avatar?: string;
  s: Styles;
}) {
  return (
    <View style={s.activityHeader}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.activityAvatar} contentFit="cover" />
      ) : (
        <View style={[s.activityAvatar, s.avatarFallback]}>
          <Text style={s.avatarLetter}>{username.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={s.activityHeaderText}>
        <Text style={s.activityUser}>{username}</Text>
        <Text style={s.activityVerb}> {action}</Text>
      </Text>
      <Text style={s.activityTime}>{time}</Text>
    </View>
  );
}

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
      {content ? <Text style={s.content} numberOfLines={6}>{content}</Text> : null}
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

function ClearRow({ item, s }: { item: FeedItem; s: Styles }) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const jacket = typeof item.background_url === 'string' ? fullImageUrl(item.background_url) : undefined;
  const songTitle = String((item as Record<string, unknown>).song_title ?? '').trim() || 'Unknown song';
  const mode = String((item as Record<string, unknown>).mode ?? '');
  const level = Number((item as Record<string, unknown>).level);
  const score = Number((item as Record<string, unknown>).score);
  const grade = String((item as Record<string, unknown>).grade ?? '');
  const plate = String((item as Record<string, unknown>).plate ?? '');

  return (
    <View style={s.activityCard}>
      <ActivityHeader
        username={username}
        action="cleared a chart"
        time={timeAgo(item.created_at)}
        avatar={avatar}
        s={s}
      />
      <View style={s.activityBody}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.activityJacket} contentFit="cover" transition={150} />
        ) : (
          <View style={[s.activityJacket, s.jacketFallback]} />
        )}
        <View style={s.activityBodyMain}>
          <Text style={s.songTitle} numberOfLines={2}>{songTitle}</Text>
          <View style={s.metaChipsRow}>
            {mode ? <Text style={s.modeChip}>{mode}</Text> : null}
            {Number.isFinite(level) && level > 0 ? <Text style={s.levelChip}>Lv {level}</Text> : null}
          </View>
        </View>
        <View style={s.activityScoreCol}>
          <Text style={s.scoreValue}>{fmtNum(score)}</Text>
          <View style={s.gradeRow}>
            {grade ? <Text style={s.gradeText}>{grade}</Text> : null}
            {plate ? <Text style={s.plateText}>{plate}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function UpscoreRow({ item, s }: { item: FeedItem; s: Styles }) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const entries = parseList<UpscoreEntry>((item as Record<string, unknown>).upscores_json);
  const first = entries[0];
  const more = Math.max(0, entries.length - 1);
  const pumbGain = Number((item as Record<string, unknown>).pumbility_gain);

  if (!first) {
    // No detail available — fall back to bare action row
    return (
      <View style={s.activityCard}>
        <ActivityHeader username={username} action="upscored" time={timeAgo(item.created_at)} avatar={avatar} s={s} />
      </View>
    );
  }

  const jacket = first.jacket_url || first.background_url;
  const jacketUrl = typeof jacket === 'string' ? fullImageUrl(jacket) : undefined;
  const delta = (first.new_score ?? 0) - (first.old_score ?? 0);

  return (
    <View style={s.activityCard}>
      <ActivityHeader
        username={username}
        action={more > 0 ? `upscored ${entries.length} charts` : 'upscored'}
        time={timeAgo(item.created_at)}
        avatar={avatar}
        s={s}
      />
      <View style={s.activityBody}>
        {jacketUrl ? (
          <Image source={{ uri: jacketUrl }} style={s.activityJacket} contentFit="cover" transition={150} />
        ) : (
          <View style={[s.activityJacket, s.jacketFallback]} />
        )}
        <View style={s.activityBodyMain}>
          <Text style={s.songTitle} numberOfLines={2}>{first.song_title || 'Unknown song'}</Text>
          <View style={s.metaChipsRow}>
            {first.mode ? <Text style={s.modeChip}>{first.mode}</Text> : null}
            {typeof first.level === 'number' && first.level > 0 ? (
              <Text style={s.levelChip}>Lv {first.level}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.activityScoreCol}>
          <Text style={s.scoreDelta}>+{fmtNum(delta)}</Text>
          <Text style={s.scoreFromTo}>{fmtNum(first.old_score)} → {fmtNum(first.new_score)}</Text>
        </View>
      </View>
      {(more > 0 || (Number.isFinite(pumbGain) && pumbGain > 0)) ? (
        <Text style={s.activityFooter}>
          {more > 0 ? `+ ${more} more` : ''}
          {more > 0 && Number.isFinite(pumbGain) && pumbGain > 0 ? ' · ' : ''}
          {Number.isFinite(pumbGain) && pumbGain > 0 ? `+${pumbGain} pumb` : ''}
        </Text>
      ) : null}
    </View>
  );
}

function WeeklyChallengeRow({ item, s }: { item: FeedItem; s: Styles }) {
  const username = String(item.username || 'anonymous');
  const avatar = typeof item.avatar === 'string' ? fullImageUrl(item.avatar) : undefined;
  const totalCharts = Number((item as Record<string, unknown>).total_charts_played);
  const totalPts = Number((item as Record<string, unknown>).total_rating_points);
  const plays = parseList<WeeklyChallengePlay>((item as Record<string, unknown>).plays_json);
  const charts = Number.isFinite(totalCharts) && totalCharts > 0 ? totalCharts : plays.length;
  const ptsLabel = Number.isFinite(totalPts) && totalPts > 0 ? ` · ${fmtNum(totalPts)} pts` : '';

  return (
    <View style={s.activityCard}>
      <ActivityHeader
        username={username}
        action="played a weekly challenge"
        time={timeAgo(item.created_at)}
        avatar={avatar}
        s={s}
      />
      {charts > 0 ? (
        <Text style={s.activityFooter}>
          {charts} chart{charts === 1 ? '' : 's'}{ptsLabel}
        </Text>
      ) : null}
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
          renderItem={({ item }) => {
            if (item.type === 'post') {
              return (
                <PostCard
                  item={item}
                  s={s}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(item.id) } })}
                />
              );
            }
            if (item.type === 'clear') return <ClearRow item={item} s={s} />;
            if (item.type === 'upscore') return <UpscoreRow item={item} s={s} />;
            if (item.type === 'weekly_challenge') return <WeeklyChallengeRow item={item} s={s} />;
            return null;
          }}
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
  avatarLetter: { fontSize: 14, fontWeight: '700' as const, color: t.textMuted },
  headerInfo: { flex: 1, gap: 1 },
  username: { fontSize: 14, fontWeight: '700' as const, color: t.text },
  time: { fontSize: 11, color: t.textDim },
  content: { fontSize: 14, lineHeight: 20, color: t.text },
  cardImage: { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: t.surfaceMuted },
  cardFooter: { flexDirection: 'row' as const, gap: 16, paddingTop: 4 },
  metric: { fontSize: 12, color: t.textMuted, fontWeight: '700' as const },

  // Activity card (clear/upscore/weekly_challenge)
  activityCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  activityHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  activityAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: t.surfaceMuted },
  activityHeaderText: { flex: 1, fontSize: 13, color: t.textMuted },
  activityUser: { fontWeight: '800' as const, color: t.text },
  activityVerb: { color: t.textMuted },
  activityTime: { fontSize: 11, color: t.textDim },

  activityBody: {
    flexDirection: 'row' as const,
    gap: 10,
    alignItems: 'center' as const,
  },
  activityJacket: { width: 44, height: 44, borderRadius: 6, backgroundColor: t.surfaceMuted },
  jacketFallback: {},
  activityBodyMain: { flex: 1, minWidth: 0, gap: 4 },
  songTitle: { fontSize: 14, fontWeight: '700' as const, color: t.text, lineHeight: 18 },
  metaChipsRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  modeChip: {
    fontSize: 10,
    fontWeight: '800' as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    overflow: 'hidden' as const,
  },
  levelChip: {
    fontSize: 10,
    fontWeight: '800' as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: t.accentTint,
    color: t.accent,
    overflow: 'hidden' as const,
  },

  activityScoreCol: { alignItems: 'flex-end' as const, gap: 2, minWidth: 96 },
  scoreValue: { fontSize: 14, fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  scoreDelta: { fontSize: 14, fontWeight: '800' as const, color: t.success, fontVariant: ['tabular-nums' as const] },
  scoreFromTo: { fontSize: 10, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  gradeRow: { flexDirection: 'row' as const, gap: 4 },
  gradeText: { fontSize: 11, fontWeight: '800' as const, color: t.accent },
  plateText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },

  activityFooter: { fontSize: 11, color: t.textMuted, marginTop: -2 },
});
