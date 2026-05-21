import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlateBadge } from '@/components/plate-badge';
import { SendToMessageSheet } from '@/components/messages/send-to-message-sheet';
import { ScoreCommentsSheet } from '@/components/score-comments-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { apiBaseUrl } from '@/lib/api';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { getPlateName } from '@/lib/plates';
import { toCanonicalSongTitle } from '@/lib/songAliases';
import type { ThemeColors } from '@/constants/theme';
import type { ChallengeCardEmbed, EmbedSendPayload, LinkShareEmbed } from '@shared/api';

export interface ScoreCardData {
  song_title?: string;
  artist?: string;
  mode?: string;
  level?: number | string;
  chart_id?: number | string;
  play_id?: number | string;
  jacket_url?: string;
  background_url?: string;
  /** Set for upscore entries — the score before this play. 0 means "new clear". */
  old_score?: number;
  old_grade?: string;
  /** Set for clear entries OR upscore (as new_score). */
  new_score?: number;
  new_grade?: string;
  score?: number;
  grade?: string;
  plate?: string;
  is_stage_break?: boolean | number;
  perfect?: number;
  great?: number;
  good?: number;
  bad?: number;
  miss?: number;
  max_combo?: number;
  over_top100_rank?: number;
  /** Player username — comes from the parent feed item. */
  username?: string;
  avatar?: string;
  played_at_utc?: string;
  date_played?: string;
  machine_name?: string;
  replay_embed_url?: string;
}

interface Props {
  visible: boolean;
  data: ScoreCardData | null;
  onClose: () => void;
  /** When provided, the REPLAY pill becomes pressable and opens this. */
  onReplay?: (url: string, title: string) => void;
}

const MODE_GRADIENTS: Record<string, readonly [string, string]> = {
  Single: ['#ff7a7a', '#d93d62'],
  Double: ['#4cf4aa', '#16b77f'],
  CoOp: ['#69c8ff', '#2b88de'],
  UCS: ['#cdb4ff', '#7c3aed'],
};

function formatNumber(value: number | string | undefined | null): string {
  const n = parseInt(String(value ?? 0), 10) || 0;
  return n.toLocaleString();
}

function formatPlayedAt(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  const hasTz = /(?:z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const normalized = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T');
  const candidate = hasTz || /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(candidate);
  if (Number.isNaN(d.getTime())) return cleaned.slice(0, 16);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const JUDGMENT_META: { key: string; field: keyof ScoreCardData; color: string }[] = [
  { key: 'PERFECT', field: 'perfect', color: '#7dd3fc' },
  { key: 'GREAT', field: 'great', color: '#6ee7b7' },
  { key: 'GOOD', field: 'good', color: '#fde047' },
  { key: 'BAD', field: 'bad', color: '#f0abfc' },
  { key: 'MISS', field: 'miss', color: '#fda4af' },
];

function JudgmentGrid({ data, s }: { data: ScoreCardData; s: Styles }) {
  const values = JUDGMENT_META.map(({ key, field, color }) => ({
    key,
    color,
    value: parseInt(String(data[field] ?? 0), 10) || 0,
  }));
  const hasAny = values.some((v) => v.value > 0);
  if (!hasAny) return null;

  return (
    <View style={s.judgments}>
      {values.map((v) => (
        <View key={v.key} style={s.judgmentCell}>
          <Text style={[s.judgmentLabel, { color: v.color }]}>{v.key}</Text>
          <Text style={s.judgmentValue}>{formatNumber(v.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function ScoreCardSheet({ visible, data, onClose, onReplay }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  // Score-card secondary sheets — each can be open independently of the
  // others. State lives at the card level so closing the score card closes
  // them too.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  // MUST stay above the `if (!data)` early return — a hook after a
  // conditional return changes the hook count between the closed
  // (data == null) and open renders, which throws React error #310
  // ("rendered more hooks than during the previous render") and white-
  // screens the whole app. See handleShare below for its usage.
  const [sharing, setSharing] = useState(false);

  if (!data) {
    return (
      <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose} />
      </Modal>
    );
  }

  const songTitle = toCanonicalSongTitle(String(data.song_title || '').trim()) || 'Score';
  const mode = String(data.mode || '').trim();
  const level = parseInt(String(data.level ?? ''), 10) || 0;
  const jacket = data.jacket_url;
  const jacketUrl = typeof jacket === 'string' ? fullImageUrl(jacket) : undefined;
  const avatarUrl = typeof data.avatar === 'string' ? fullImageUrl(data.avatar) : undefined;

  const displayScore = parseInt(String(data.new_score ?? data.score ?? 0), 10) || 0;
  const grade = getGradeDisplayLabel(data.new_grade ?? data.grade, displayScore);
  const gradeColor = TIER_COLORS[getGradeTier(data.new_grade ?? data.grade, displayScore)];

  const oldScore = parseInt(String(data.old_score ?? 0), 10) || 0;
  const oldGrade = getGradeDisplayLabel(data.old_grade, oldScore);
  const isUpscore = data.old_score !== undefined && oldScore > 0;
  const delta = isUpscore ? displayScore - oldScore : 0;

  const isStageBreak = !!data.is_stage_break;
  const plateName = getPlateName(data.plate);
  const overRank = parseInt(String(data.over_top100_rank ?? 0), 10) || 0;
  const playedAt = formatPlayedAt(data.played_at_utc || data.date_played);
  const machine = String(data.machine_name || '').trim();
  const chartId = parseInt(String(data.chart_id ?? 0), 10) || 0;

  const modeGradient = MODE_GRADIENTS[mode] || MODE_GRADIENTS.CoOp;
  const playId = data.play_id != null ? String(data.play_id) : '';

  const handleTitlePress = () => {
    if (!chartId) return;
    onClose();
    router.push({ pathname: '/song/[id]', params: { id: String(chartId) } });
  };

  // Build the link_share + challenge_card embeds the DM picker will ship.
  // Mirrors the web ScoreSnapshotModal payload shape so the recipient gets
  // the same rich card on either platform.
  const chartPath = chartId ? `/songs/chart/${chartId}` : '';
  const linkSharePayload: LinkShareEmbed | null = chartPath ? {
    version: 1,
    kind: isUpscore ? 'score_share' : 'score_share',
    path: chartPath,
    chartPath,
    title: songTitle,
    songTitle,
    mode,
    level,
    score: displayScore,
    grade,
    plate: data.plate,
    isStageBreak: !!data.is_stage_break,
    playerName: data.username,
    playerAvatar: data.avatar,
    jacketUrl: data.jacket_url,
    perfect: data.perfect,
    great: data.great,
    good: data.good,
    bad: data.bad,
    miss: data.miss,
    replayUrl: data.replay_embed_url,
    overTop100Rank: data.over_top100_rank,
    oldScore: isUpscore ? oldScore : undefined,
    oldGrade: isUpscore ? data.old_grade : undefined,
    scoreDelta: isUpscore ? delta : undefined,
    playedAt: data.played_at_utc || data.date_played,
  } : null;
  const challengeCardPayload: ChallengeCardEmbed | null = chartPath ? {
    version: 1,
    kind: 'beat_score',
    path: chartPath,
    chartPath,
    title: `Beat my score on ${songTitle}`,
    subtitle: `${grade} · ${displayScore.toLocaleString()}`,
    targetLabel: `Beat ${displayScore.toLocaleString()}`,
    detailLabel: grade,
    songTitle,
    mode,
    level,
    targetScore: displayScore,
    targetGrade: grade,
  } : null;
  const sharePayload: EmbedSendPayload = linkSharePayload ? { link_share: linkSharePayload } : {};
  const challengePayload: EmbedSendPayload = challengeCardPayload ? { challenge_card: challengeCardPayload } : {};

  // Single Share chip — combines what used to be "Share link" + "Share
  // image" into one icon that just does the right thing per platform:
  //
  //   1. Has a play_id and the platform can ship files → attach the
  //      rendered score-card JPEG (server-rendered, matches the OG
  //      unfurl pixel-for-pixel) WITH the public URL so the recipient
  //      gets both the visual AND a tappable link.
  //   2. No image support / no play_id → URL share via the OS sheet
  //      (Discord/iMessage/etc. then unfurl using the OG meta tags
  //      injected at sharePreviews.js).
  //   3. Web without Web Share API → opens the URL in a new tab as
  //      a last-resort copy-paste fallback.
  //
  // The Url points at new.pumpshinsa.com when we have a play_id so the
  // recipient lands on a route the share-preview middleware decorates;
  // otherwise it's the chart deep-link (chartPath).
  // (`sharing` state is declared up top with the other hooks — see note.)
  const handleShare = async () => {
    if (!chartPath && !playId) return;
    setSharing(true);
    const url = playId
      ? `https://new.pumpshinsa.com/play/${encodeURIComponent(String(playId))}`
      : `${apiBaseUrl}${chartPath}`;
    const caption = `${songTitle} · ${grade} · ${displayScore.toLocaleString()}`;
    const shareTitle = data.username ? `@${data.username} · ${songTitle}` : songTitle;
    const cacheBust = String(data.played_at_utc || data.date_played || playId || '');
    const imageUrl = playId
      ? `${apiBaseUrl}/og/play/${encodeURIComponent(String(playId))}.jpg?v=${encodeURIComponent(cacheBust)}`
      : '';
    try {
      // Web path — prefer Web Share API. Try image + URL first, then
      // image alone, then URL alone, then a plain new-tab fallback.
      if (Platform.OS === 'web') {
        const navAny = (globalThis as { navigator?: Navigator & { canShare?: (d: ShareData) => boolean } }).navigator;
        if (navAny?.share && navAny.canShare && imageUrl) {
          try {
            const resp = await fetch(imageUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              const file = new File([blob], `shinsa-score-${playId}.jpg`, { type: 'image/jpeg' });
              if (navAny.canShare({ files: [file], url, text: caption })) {
                await navAny.share({ files: [file], url, text: caption, title: shareTitle });
                return;
              }
              if (navAny.canShare({ files: [file] })) {
                await navAny.share({ files: [file], title: shareTitle, text: `${caption}\n${url}` });
                return;
              }
            }
          } catch { /* fall through to URL-only share */ }
        }
        if (navAny?.share) {
          await navAny.share({ url, title: shareTitle, text: caption });
          return;
        }
        await Linking.openURL(url);
        return;
      }

      // Native path — try the image + URL combo via expo-sharing.
      if (imageUrl) {
        const available = await Sharing.isAvailableAsync();
        if (available) {
          const dest = `${FileSystem.cacheDirectory || ''}shinsa-score-${playId}.jpg`;
          const { uri } = await FileSystem.downloadAsync(imageUrl, dest);
          // expo-sharing on Android can't carry a separate URL field, so
          // we put the link in the dialogTitle. Many apps surface it as
          // pre-filled body text. On iOS we use RN's Share with both
          // `url` (the file) and `message` (caption + link) — receiving
          // apps like Messages / Mail combine them into one attachment.
          if (Platform.OS === 'ios') {
            await Share.share({ url: uri, message: `${caption}\n${url}`, title: shareTitle });
          } else {
            await Sharing.shareAsync(uri, {
              mimeType: 'image/jpeg',
              dialogTitle: `${shareTitle} — ${url}`,
              UTI: 'public.jpeg',
            });
          }
          return;
        }
      }

      // Last resort — URL only.
      await Share.share({ message: `${caption}\n${url}`, url, title: shareTitle });
    } catch {
      // User dismissed or transport failed — no-op (no toast layer yet).
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
          showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            {jacketUrl ? (
              <Image source={{ uri: jacketUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, s.bgFallback]} />
            )}
            <View style={[StyleSheet.absoluteFill, s.overlay]} />

            <View style={s.cardInner}>
              <View style={s.titleRow}>
                <Pressable onPress={handleTitlePress} hitSlop={4} disabled={!chartId} style={s.titleBlock}>
                  <Text style={s.songTitle} numberOfLines={2}>{songTitle}</Text>
                  {(data.username || playedAt || machine) ? (
                    <View style={s.metaRow}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" />
                      ) : null}
                      {data.username ? <Text style={s.username}>{data.username}</Text> : null}
                      {playedAt ? <Text style={s.metaText}>{playedAt}</Text> : null}
                      {machine ? <Text style={s.metaTextDim}>· {machine}</Text> : null}
                    </View>
                  ) : null}
                  {overRank > 0 ? (
                    <View style={s.topRankRow}>
                      <Text style={s.topRankChip}>TOP #{overRank}</Text>
                    </View>
                  ) : null}
                </Pressable>

                <View style={s.rightCol}>
                  {data.replay_embed_url ? (
                    <Pressable
                      onPress={() => {
                        if (!onReplay || !data.replay_embed_url) return;
                        onClose();
                        onReplay(data.replay_embed_url, `${songTitle} · ${mode || ''}${level ? ` ${level}` : ''}`);
                      }}
                      hitSlop={6}
                      disabled={!onReplay}
                      style={({ pressed }) => [s.replayPill, pressed && { opacity: 0.7 }]}>
                      <IconSymbol name="play.rectangle.fill" size={10} color="#7dd3fc" />
                      <Text style={s.replayText}>REPLAY</Text>
                    </Pressable>
                  ) : null}
                  {level > 0 ? (
                    <LinearGradient
                      colors={modeGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={s.levelBadge}>
                      <Text style={s.levelText}>{level}</Text>
                    </LinearGradient>
                  ) : null}
                </View>
              </View>

              <View style={s.scoreRow}>
                <View style={s.scoreCol}>
                  <Text style={[s.scoreBig, isStageBreak && { color: '#fda4af' }]} numberOfLines={1}>
                    {isStageBreak ? 'STAGE BREAK' : formatNumber(displayScore)}
                  </Text>
                  {plateName ? (
                    <View style={s.plateRow}>
                      <PlateBadge plate={data.plate} size="sm" />
                      <Text style={s.plateName}>{plateName}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.gradeCol}>
                  {!isStageBreak ? (
                    <Text style={[s.gradeBig, { color: gradeColor }]}>{grade}</Text>
                  ) : null}
                  {isUpscore ? (
                    <View style={s.prevWrap}>
                      <Text style={s.prevLine} numberOfLines={1}>
                        Prev {formatNumber(oldScore)} <Text style={{ color: TIER_COLORS[getGradeTier(data.old_grade, oldScore)] }}>{oldGrade}</Text>
                      </Text>
                      {delta !== 0 ? (
                        <Text style={[s.delta, { color: delta > 0 ? '#34d399' : '#fda4af' }]}>
                          {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>

              <JudgmentGrid data={data} s={s} />

              {/* Action chips — match the web ScoreSnapshotModal action set:
                  Comment / Send to DM / Challenge / Share link / Close. */}
              <View style={s.actionRow}>
                {playId ? (
                  <ActionChip
                    icon="bubble.left.and.bubble.right.fill"
                    label="Comment"
                    onPress={() => setCommentsOpen(true)}
                  />
                ) : null}
                {chartPath ? (
                  <ActionChip
                    icon="paperplane.fill"
                    label="Send"
                    accent
                    onPress={() => setShareOpen(true)}
                  />
                ) : null}
                {chartPath ? (
                  <ActionChip
                    icon="trophy.fill"
                    label="Challenge"
                    amber
                    onPress={() => setChallengeOpen(true)}
                  />
                ) : null}
                {(chartPath || playId) ? (
                  <ActionChip
                    icon="square.and.arrow.up"
                    label={sharing ? 'Preparing…' : 'Share'}
                    onPress={handleShare}
                  />
                ) : null}
                <ActionChip
                  icon="xmark"
                  label="Close"
                  onPress={onClose}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Comments sheet */}
      {playId ? (
        <ScoreCommentsSheet
          playId={playId}
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          contextLine={`${songTitle} · ${grade} · ${displayScore.toLocaleString()}`}
        />
      ) : null}

      {/* Send-to-DM picker */}
      <SendToMessageSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        title={`Send "${songTitle}"`}
        description={`${grade} · ${displayScore.toLocaleString()}`}
        payload={sharePayload}
      />

      {/* Challenge picker (amber tone) */}
      <SendToMessageSheet
        visible={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        title={`Challenge: ${songTitle}`}
        description={`Target ${displayScore.toLocaleString()} ${grade}`}
        payload={challengePayload}
        tone="amber"
      />
    </Modal>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  accent,
  amber,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  accent?: boolean;
  amber?: boolean;
}) {
  const s = useThemedStyles(makeStyles);
  const { theme } = useTheme();
  const tint = amber ? '#fbbf24' : accent ? theme.accent : '#fff';
  const bg = amber
    ? 'rgba(251,191,36,0.18)'
    : accent
      ? theme.accentTint
      : 'rgba(255,255,255,0.08)';
  const border = amber
    ? 'rgba(251,191,36,0.45)'
    : accent
      ? theme.accent
      : 'rgba(255,255,255,0.18)';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        s.actionChip,
        { backgroundColor: bg, borderColor: border },
        pressed && { opacity: 0.75 },
      ]}>
      {/* IconSymbol's name prop is typed to a closed enum — relax to string */}
      <IconSymbol name={icon as never} size={13} color={tint} />
      <Text style={[s.actionChipText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (_t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scroll: { paddingHorizontal: 14, alignItems: 'center' as const, gap: 12 },
  card: {
    width: '100%' as const,
    maxWidth: 380,
    borderRadius: 22,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#0a0e18',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.45,
        shadowRadius: 36,
      },
      android: { elevation: 10 },
    }),
  },
  bgFallback: { backgroundColor: '#0f1a2d' },
  overlay: { backgroundColor: 'rgba(6,10,18,0.62)' },
  cardInner: { padding: 14, gap: 12 },

  titleRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  titleBlock: { flex: 1, minWidth: 0, gap: 6 },
  songTitle: { fontSize: 18, fontWeight: '900' as const, color: '#fff', lineHeight: 22, letterSpacing: 0.2 },
  metaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flexWrap: 'wrap' as const },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)' },
  username: { fontSize: 12, fontWeight: '800' as const, color: '#fff' },
  metaText: { fontSize: 11, color: 'rgba(255,255,255,0.78)' },
  metaTextDim: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  topRankRow: { flexDirection: 'row' as const },
  topRankChip: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#FFE06B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,196,0,0.55)',
    backgroundColor: 'rgba(255,196,0,0.18)',
    overflow: 'hidden' as const,
    letterSpacing: 0.6,
  },

  rightCol: { alignItems: 'flex-end' as const, gap: 6 },
  replayPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(125,211,252,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125,211,252,0.4)',
  },
  replayText: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 0.5, color: '#7dd3fc' },
  levelBadge: {
    minWidth: 44,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  levelText: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
    letterSpacing: 0.2,
  },

  scoreRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, gap: 10 },
  scoreCol: { flex: 1, minWidth: 0, gap: 6 },
  scoreBig: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: '#fff',
    fontVariant: ['tabular-nums' as const],
    letterSpacing: 0.5,
  },
  plateRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  plateName: { fontSize: 10, fontWeight: '800' as const, color: 'rgba(255,255,255,0.78)', letterSpacing: 1 },
  gradeCol: { alignItems: 'flex-end' as const, gap: 4 },
  gradeBig: { fontSize: 32, fontWeight: '900' as const, letterSpacing: 0.5 },
  prevWrap: { alignItems: 'flex-end' as const, gap: 2 },
  prevLine: { fontSize: 11, color: 'rgba(255,255,255,0.78)', fontVariant: ['tabular-nums' as const] },
  delta: { fontSize: 14, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },

  judgments: {
    flexDirection: 'row' as const,
    gap: 4,
    padding: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  judgmentCell: { flex: 1, alignItems: 'center' as const, gap: 2 },
  judgmentLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 0.6 },
  judgmentValue: { fontSize: 14, fontWeight: '700' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },

  // Action chip row at the bottom of the score card. Wraps so we can fit
  // 4-5 chips on a single mobile width without horizontal overflow.
  actionRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'flex-end' as const,
    marginTop: 8,
  },
  actionChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionChipText: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.4 },
});
