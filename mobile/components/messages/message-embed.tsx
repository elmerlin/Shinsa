/**
 * Renders any non-text message embed: session share, challenge card,
 * link share, list share, note thread.
 *
 * Each embed kind has its own visual treatment but they all share the same
 * shell — bordered card with optional jacket/preview image + title +
 * subtitle + action chip. Tap the card to navigate to the right
 * destination (chart page, song list, live session, story viewer, …).
 *
 * Mirrors the web client's MessagesPage embed renderers but stripped to
 * the parts mobile actually needs.
 */
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import { getGradeTier, TIER_COLORS } from '@/lib/grades';
import type { ThemeColors } from '@/constants/theme';
import type {
  ChallengeCardEmbed,
  ConversationMessage,
  LinkShareEmbed,
  ListShareEmbed,
  NoteThreadEmbed,
  SessionShareEmbed,
} from '@shared/api';

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

/** Build a deep-link route from a server-supplied `path` (e.g. "/song/4504",
 *  "/live/session/abc123", "/list/12"). Returns null if the path doesn't
 *  match a route we have on mobile yet. */
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

  m = trimmed.match(/^\/skill\/([^/?#]+)/);
  if (m) return { pathname: '/skill/[slug]', params: { slug: m[1] } };

  return null;
}

interface BaseProps {
  /** Coloring switches when the embed is inside the viewer's own (gold)
   *  bubble so the text stays readable against the accent background. */
  own: boolean;
}

export function MessageEmbed({ message, own }: { message: ConversationMessage; own: boolean }) {
  if (message.share) return <SessionShareCard embed={message.share} own={own} />;
  if (message.challenge_card) return <ChallengeCard embed={message.challenge_card} own={own} />;
  if (message.list_share) return <ListShareCard embed={message.list_share} own={own} />;
  if (message.link_share) return <LinkShareCard embed={message.link_share} own={own} />;
  if (message.note_thread) return <NoteThreadCard embed={message.note_thread} own={own} />;
  return null;
}

// ---------------------------------------------------------------------------
// Session share — live session or hour-of-power recap
// ---------------------------------------------------------------------------
function SessionShareCard({ embed, own }: { embed: SessionShareEmbed } & BaseProps) {
  const router = useRouter();
  const s = useThemedStyles(makeCardStyles);
  const isHop = embed.shareType === 'hour_of_power';
  const total = embed.totalRatingPoints || 0;
  const avg = embed.averageRatingPoints || 0;
  const cleared = embed.countedClearCount || embed.clearCount || 0;

  return (
    <Pressable
      onPress={() => embed.sessionId && router.push({ pathname: '/live', params: { session: embed.sessionId } })}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, own && s.cardOwn]}>
      <View style={s.embedHeader}>
        <Text style={[s.embedKind, own && s.embedKindOwn, isHop && { color: '#fb7185' }]}>
          {isHop ? '⚡ Hour of Power' : '🔴 Live Session'}
        </Text>
        {embed.leaderboardEligible ? (
          <Text style={[s.embedTag, { color: '#34d399' }]}>Leaderboard</Text>
        ) : null}
      </View>
      {embed.sessionTitle ? (
        <Text style={[s.embedTitle, own && s.embedTextOwn]} numberOfLines={2}>{embed.sessionTitle}</Text>
      ) : null}
      <View style={s.statsRow}>
        <Stat label="Cleared" value={String(cleared)} own={own} />
        {total > 0 ? <Stat label="Total RP" value={formatNumber(total)} own={own} /> : null}
        {avg > 0 ? <Stat label="Avg RP" value={formatNumber(avg)} own={own} /> : null}
        {embed.sessionDurationLabel ? (
          <Stat label="Duration" value={embed.sessionDurationLabel} own={own} />
        ) : null}
      </View>
      {embed.sessionDateLabel ? (
        <Text style={[s.embedFooter, own && s.embedFooterOwn]}>{embed.sessionDateLabel}</Text>
      ) : null}
    </Pressable>
  );
}

function Stat({ label, value, own }: { label: string; value: string; own: boolean }) {
  const s = useThemedStyles(makeCardStyles);
  return (
    <View style={s.stat}>
      <Text style={[s.statLabel, own && s.statLabelOwn]}>{label}</Text>
      <Text style={[s.statValue, own && s.embedTextOwn]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Challenge card — invite to play a chart for a target
// ---------------------------------------------------------------------------
function ChallengeCard({ embed, own }: { embed: ChallengeCardEmbed } & BaseProps) {
  const router = useRouter();
  const s = useThemedStyles(makeCardStyles);
  const target = embed.targetLabel || (embed.targetScore ? `${formatNumber(embed.targetScore)}+` : '');
  const isSingle = String(embed.mode || '').toLowerCase().startsWith('s');

  const onPress = () => {
    const route = resolveRoute(embed.chartPath || embed.path);
    if (route) router.push(route as never);
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, own && s.cardOwn]}>
      <View style={s.embedHeader}>
        <Text style={[s.embedKind, own && s.embedKindOwn]}>🎯 Challenge</Text>
        {embed.statusLabel ? (
          <Text style={[s.embedTag, { color: '#fbbf24' }]} numberOfLines={1}>{embed.statusLabel}</Text>
        ) : null}
      </View>
      <View style={s.challengeRow}>
        {embed.level ? (
          <View style={[s.modePill, isSingle ? s.modePillSingle : s.modePillDouble]}>
            <Text style={s.modePillText}>{isSingle ? 'S' : 'D'}{embed.level}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.embedTitle, own && s.embedTextOwn]} numberOfLines={1}>
            {embed.title || embed.songTitle || 'Chart challenge'}
          </Text>
          {target ? (
            <Text style={[s.embedSubtitle, own && s.embedFooterOwn]}>Target · {target}</Text>
          ) : embed.subtitle ? (
            <Text style={[s.embedSubtitle, own && s.embedFooterOwn]} numberOfLines={2}>{embed.subtitle}</Text>
          ) : null}
        </View>
      </View>
      {embed.buttonLabel ? (
        <View style={[s.ctaChip, own && s.ctaChipOwn]}>
          <Text style={[s.ctaChipText, own && { color: '#fff' }]}>{embed.buttonLabel}</Text>
          <IconSymbol name="chevron.right" size={12} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Link share — adaptive card based on `kind`
// ---------------------------------------------------------------------------
function LinkShareCard({ embed, own }: { embed: LinkShareEmbed } & BaseProps) {
  const router = useRouter();
  const s = useThemedStyles(makeCardStyles);
  const jacket = fullImageUrl(embed.jacketUrl || embed.previewImage || embed.storyMediaUrl);
  const isSingle = String(embed.mode || '').toLowerCase().startsWith('s');
  const grade = String(embed.grade || '').trim();
  const score = embed.score || 0;
  const tier = getGradeTier(grade, score);
  const gradeColor = TIER_COLORS[tier];

  // Different kinds get different eyebrow labels; everything else is the
  // same card shape.
  const kindLabel = (() => {
    const k = String(embed.kind || '').toLowerCase();
    if (k === 'score_share') return embed.scoreDelta && embed.scoreDelta > 0 ? '🚀 Upscore' : '🏆 Score';
    if (k === 'replay') return '🎬 Replay';
    if (k === 'chart_compare') return '🆚 Compare';
    if (k === 'chart_challenge') return '🎯 Challenge';
    if (k === 'live_session') return '🔴 Live';
    if (k === 'achievement_badge') return '🏅 Achievement';
    if (k === 'pet_share') return '🐾 Pet';
    if (k === 'story_share') return '✨ Story';
    return '🔗 Link';
  })();

  const onPress = () => {
    const route = resolveRoute(embed.chartPath || embed.path);
    if (route) router.push(route as never);
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, own && s.cardOwn]}>
      <View style={s.embedHeader}>
        <Text style={[s.embedKind, own && s.embedKindOwn]}>{kindLabel}</Text>
        {embed.statusLabel ? (
          <Text style={[s.embedTag, own && s.embedKindOwn]} numberOfLines={1}>{embed.statusLabel}</Text>
        ) : null}
      </View>

      <View style={s.linkRow}>
        {jacket ? (
          <Image source={{ uri: jacket }} style={s.linkJacket} contentFit="cover" />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {embed.title || embed.songTitle ? (
            <Text style={[s.embedTitle, own && s.embedTextOwn]} numberOfLines={1}>
              {embed.title || embed.songTitle}
            </Text>
          ) : null}
          {embed.level ? (
            <View style={s.linkLevelRow}>
              <View style={[s.modePillSm, isSingle ? s.modePillSingle : s.modePillDouble]}>
                <Text style={s.modePillTextSm}>{isSingle ? 'S' : 'D'}{embed.level}</Text>
              </View>
              {grade && score > 0 ? (
                <Text style={[s.linkScore, { color: gradeColor }]}>
                  {grade} · {formatNumber(score)}
                </Text>
              ) : score > 0 ? (
                <Text style={[s.embedSubtitle, own && s.embedFooterOwn]}>{formatNumber(score)}</Text>
              ) : null}
            </View>
          ) : embed.subtitle ? (
            <Text style={[s.embedSubtitle, own && s.embedFooterOwn]} numberOfLines={2}>{embed.subtitle}</Text>
          ) : null}
          {embed.playerName && (embed.kind === 'score_share' || embed.kind === 'replay') ? (
            <Text style={[s.embedFooter, own && s.embedFooterOwn]} numberOfLines={1}>
              @{embed.playerName}{embed.playedAt ? ` · ${embed.playedAt}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// List share — pointer to a shared squad song list
// ---------------------------------------------------------------------------
function ListShareCard({ embed, own }: { embed: ListShareEmbed } & BaseProps) {
  const router = useRouter();
  const s = useThemedStyles(makeCardStyles);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/shared-list/[id]', params: { id: String(embed.sharedListId) } })}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, own && s.cardOwn]}>
      <View style={s.embedHeader}>
        <Text style={[s.embedKind, own && s.embedKindOwn]}>📋 Shared list</Text>
        <Text style={[s.embedTag, own && s.embedKindOwn]}>
          {embed.itemCount ?? 0} chart{embed.itemCount === 1 ? '' : 's'}
        </Text>
      </View>
      <Text style={[s.embedTitle, own && s.embedTextOwn]} numberOfLines={2}>{embed.listName}</Text>
      {embed.ownerUsername ? (
        <Text style={[s.embedFooter, own && s.embedFooterOwn]}>by @{embed.ownerUsername}</Text>
      ) : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Note thread — short pinned note inside the chat
// ---------------------------------------------------------------------------
function NoteThreadCard({ embed, own }: { embed: NoteThreadEmbed } & BaseProps) {
  const s = useThemedStyles(makeCardStyles);
  return (
    <View style={[s.card, own && s.cardOwn]}>
      <View style={s.embedHeader}>
        <Text style={[s.embedKind, own && s.embedKindOwn]}>📝 Note</Text>
        {embed.noteKind ? <Text style={[s.embedTag, own && s.embedKindOwn]}>{embed.noteKind}</Text> : null}
      </View>
      {embed.noteText ? (
        <Text style={[s.noteText, own && s.embedTextOwn]} numberOfLines={6}>{embed.noteText}</Text>
      ) : null}
      {embed.ownerUsername ? (
        <Text style={[s.embedFooter, own && s.embedFooterOwn]}>by @{embed.ownerUsername}</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — shared across all embed kinds
// ---------------------------------------------------------------------------
const makeCardStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    minWidth: 220,
    maxWidth: 280,
  },
  cardOwn: { backgroundColor: 'rgba(0,0,0,0.18)', borderColor: 'rgba(0,0,0,0.28)' },

  embedHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 6 },
  embedKind: { fontSize: 10, fontWeight: '900' as const, color: t.textMuted, letterSpacing: 0.3 },
  embedKindOwn: { color: t.bg, opacity: 0.85 },
  embedTag: { fontSize: 9, fontWeight: '800' as const, color: t.textDim, letterSpacing: 0.3 },

  embedTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text, lineHeight: 17 },
  embedSubtitle: { fontSize: 11, color: t.textMuted },
  embedFooter: { fontSize: 10, color: t.textDim, fontWeight: '700' as const },
  embedFooterOwn: { color: t.bg, opacity: 0.7 },
  embedTextOwn: { color: t.bg },

  statsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, marginTop: 4 },
  stat: { gap: 1 },
  statLabel: { fontSize: 9, color: t.textDim, fontWeight: '800' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  statLabelOwn: { color: t.bg, opacity: 0.6 },
  statValue: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  // Challenge / link rows
  challengeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  modePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center' as const, minWidth: 36 },
  modePillSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignItems: 'center' as const, minWidth: 28 },
  modePillSingle: { backgroundColor: 'rgba(217,61,98,0.85)' },
  modePillDouble: { backgroundColor: 'rgba(22,183,127,0.85)' },
  modePillText: { color: '#fff', fontSize: 11, fontWeight: '900' as const },
  modePillTextSm: { color: '#fff', fontSize: 9, fontWeight: '900' as const },

  linkRow: { flexDirection: 'row' as const, gap: 10, alignItems: 'center' as const },
  linkJacket: { width: 48, height: 48, borderRadius: 8, backgroundColor: t.surface },
  linkLevelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  linkScore: { fontSize: 11, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  ctaChip: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  ctaChipOwn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  ctaChipText: { fontSize: 11, fontWeight: '900' as const, color: t.bg, letterSpacing: 0.3 },

  noteText: { fontSize: 13, color: t.text, lineHeight: 19 },
});
