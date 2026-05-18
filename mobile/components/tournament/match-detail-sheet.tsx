import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Match, PlayedSong, Player } from '@shared/api';

function fmt(n: unknown): string {
  if (n == null || n === '') return '–';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString();
}

function songTitle(s: PlayedSong, i: number): string {
  return String(s.title || s.song?.title || `Song ${i + 1}`);
}
function songMode(s: PlayedSong): string {
  return String(s.mode || s.song?.mode || 'Single');
}
function songLevel(s: PlayedSong): string {
  const v = s.level ?? s.song?.level;
  return v != null ? String(v) : '';
}
function songJacket(s: PlayedSong): string | undefined {
  const url = s.jacket_url || s.song_jacket_url || s.song?.jacket_url || s.song?.song_jacket_url || '';
  return url ? fullImageUrl(url) : undefined;
}

function songWinnerSide(song: PlayedSong, match: Match): 'p1' | 'p2' | 'tie' | null {
  const explicit = song.song_winner_id;
  if (explicit === 'p1' || explicit === 'p2' || explicit === 'tie') return explicit;
  if (explicit && match.player1_id && String(explicit) === String(match.player1_id)) return 'p1';
  if (explicit && match.player2_id && String(explicit) === String(match.player2_id)) return 'p2';
  const p1 = Number(song.p1_score);
  const p2 = Number(song.p2_score);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  if (p1 === p2) return 'tie';
  return p1 > p2 ? 'p1' : 'p2';
}

function scoreTotals(match: Match): { p1: number; p2: number; hasScores: boolean } {
  const scores = match.scores || {};
  const songs = match.played_songs || [];
  // Prefer server-reported totals when present.
  const p1T = Number(scores.p1_total);
  const p2T = Number(scores.p2_total);
  if (Number.isFinite(p1T) && Number.isFinite(p2T) && (p1T || p2T)) {
    return { p1: p1T, p2: p2T, hasScores: true };
  }
  // Fall back to summing per-song scores.
  let p1 = 0;
  let p2 = 0;
  let hasScores = false;
  for (const s of songs) {
    const a = Number(s.p1_score);
    const b = Number(s.p2_score);
    if (Number.isFinite(a)) { p1 += a; hasScores = true; }
    if (Number.isFinite(b)) { p2 += b; hasScores = true; }
  }
  return { p1, p2, hasScores };
}

function isSharedWin(match: Match): boolean {
  return !!match.scores?.shared_win;
}

function matchHeadline(match: Match, totalGauntlet: number): string {
  const lvl = match.difficulty_min || match.difficulty_max
    ? `Lv.${match.difficulty_min ?? '?'}-${match.difficulty_max ?? '?'}`
    : '';
  if (match.match_type === 'gauntlet') {
    const isFinal = (match.gauntlet_order || 0) === totalGauntlet;
    const stage = isFinal ? 'Gauntlet Final' : `Gauntlet Step ${match.gauntlet_order ?? '?'}`;
    return [stage, lvl].filter(Boolean).join(' · ');
  }
  if (match.round_number) {
    return [`Round ${match.round_number}`, lvl].filter(Boolean).join(' · ');
  }
  return lvl || 'Match';
}

interface Props {
  visible: boolean;
  match: Match | null;
  players: Player[];
  /** When provided, used to label gauntlet matches with "Final" vs "Step N". */
  totalGauntletMatches?: number;
  onClose: () => void;
}

/**
 * Match detail sheet — songs played, per-song scores, total, winner.
 * Mirrors the per-match block from the desktop PlayerPhaseHistoryModal
 * (kept consistent so taps from anywhere in the tournament UX show the
 * same content). Modal slides up from the bottom on mobile and centers
 * on desktop-width.
 */
export function MatchDetailSheet({ visible, match, players, totalGauntletMatches = 0, onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { theme: _theme } = useTheme();

  if (!match) {
    return (
      <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={s.bodyMuted}>No match selected.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const p1 = players.find((p) => p.id === match.player1_id);
  const p2 = players.find((p) => p.id === match.player2_id);
  const shared = isSharedWin(match);
  const winnerId = shared ? null : match.winner_id;
  const totals = scoreTotals(match);
  const songs = match.played_songs || [];
  const headline = matchHeadline(match, totalGauntletMatches);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => undefined}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.headerEyebrow}>MATCH DETAIL</Text>
              <Text style={s.headerTitle} numberOfLines={2}>{headline}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.closeBtnText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body}>
            <View style={s.versusCard}>
              <PlayerSide player={p1} active={shared || winnerId === match.player1_id} score={totals.hasScores ? totals.p1 : null} s={s} align="left" />
              <View style={s.versusCenter}>
                {shared ? (
                  <Text style={[s.versusBadge, s.versusBadgeShared]}>SHARED</Text>
                ) : winnerId ? (
                  <Text style={[s.versusBadge, s.versusBadgeWin]}>WIN</Text>
                ) : (
                  <Text style={s.versusBadge}>VS</Text>
                )}
                {totals.hasScores ? (
                  <Text style={s.versusDelta}>
                    {totals.p1 === totals.p2 ? 'Tie' : `+${fmt(Math.abs(totals.p1 - totals.p2))}`}
                  </Text>
                ) : null}
              </View>
              <PlayerSide player={p2} active={shared || winnerId === match.player2_id} score={totals.hasScores ? totals.p2 : null} s={s} align="right" />
            </View>

            {songs.length === 0 ? (
              <Text style={s.emptyText}>No song details were saved for this match.</Text>
            ) : (
              <View style={s.songsList}>
                {songs.map((song, i) => {
                  const side = songWinnerSide(song, match);
                  const jacket = songJacket(song);
                  return (
                    <View key={`${match.id}-${i}`} style={s.songRow}>
                      <View style={s.songJacketWrap}>
                        {jacket ? (
                          <Image source={{ uri: jacket }} style={s.songJacket} contentFit="cover" />
                        ) : (
                          <View style={[s.songJacket, s.songJacketFallback]} />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <Text style={s.songTitle} numberOfLines={1}>{songTitle(song, i)}</Text>
                        <Text style={s.songMeta} numberOfLines={1}>
                          {songMode(song)}{songLevel(song) ? ` Lv.${songLevel(song)}` : ''}
                          {song.song?.artist || song.artist ? ` · ${song.song?.artist || song.artist}` : ''}
                        </Text>
                        <View style={s.songScoreRow}>
                          <View style={[s.songScoreBox, side === 'p1' && s.songScoreBoxActive]}>
                            <Text style={[s.songScoreLabel, side === 'p1' && s.songScoreLabelActive]} numberOfLines={1}>{p1?.name || 'P1'}</Text>
                            <Text style={[s.songScoreValue, side === 'p1' && s.songScoreValueActive]}>{fmt(song.p1_score)}</Text>
                          </View>
                          <View style={[s.songScoreBox, side === 'p2' && s.songScoreBoxActive]}>
                            <Text style={[s.songScoreLabel, side === 'p2' && s.songScoreLabelActive]} numberOfLines={1}>{p2?.name || 'P2'}</Text>
                            <Text style={[s.songScoreValue, side === 'p2' && s.songScoreValueActive]}>{fmt(song.p2_score)}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlayerSide({
  player,
  score,
  active,
  s,
  align,
}: {
  player: Player | undefined;
  score: number | null;
  active: boolean;
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
  align: 'left' | 'right';
}) {
  const initial = String(player?.name || '?').charAt(0).toUpperCase();
  const avatar = typeof player?.avatar === 'string' && player.avatar ? fullImageUrl(player.avatar) : undefined;
  return (
    <View style={[s.playerSide, align === 'right' && { alignItems: 'flex-end' as const }]}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.playerAvatar} contentFit="cover" />
      ) : (
        <View style={[s.playerAvatar, s.playerAvatarFallback]}>
          <Text style={s.playerAvatarLetter}>{initial}</Text>
        </View>
      )}
      <Text style={[s.playerName, active && s.playerNameWinner]} numberOfLines={1}>
        {player?.name || 'TBD'}
      </Text>
      {score != null ? (
        <Text style={[s.playerScore, active && s.playerScoreWinner]}>{fmt(score)}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: 720,
    maxHeight: '92%' as const,
    backgroundColor: t.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden' as const,
  },
  handle: {
    alignSelf: 'center' as const,
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.border,
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  headerEyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.accent },
  headerTitle: { fontSize: 16, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  closeBtnText: { fontSize: 20, color: t.textMuted, fontWeight: '800' as const, marginTop: -3 },
  body: { padding: 14, gap: 14 },
  bodyMuted: { color: t.textMuted, fontSize: 13, padding: 24, textAlign: 'center' as const },

  // Versus card
  versusCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  versusCenter: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
    paddingHorizontal: 8,
  },
  versusBadge: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
    color: t.textDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: t.bg,
  },
  versusBadgeWin: { color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.10)' },
  versusBadgeShared: { color: t.accent, backgroundColor: t.accentTint },
  versusDelta: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },

  playerSide: { flex: 1, alignItems: 'flex-start' as const, gap: 4, minWidth: 0 },
  playerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceMuted },
  playerAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  playerAvatarLetter: { fontSize: 14, fontWeight: '900' as const, color: t.accent },
  playerName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  playerNameWinner: { color: '#34d399' },
  playerScore: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  playerScoreWinner: { color: '#34d399' },

  // Songs
  emptyText: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, paddingVertical: 24 },
  songsList: { gap: 8 },
  songRow: {
    flexDirection: 'row' as const,
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.bg,
  },
  songJacketWrap: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden' as const },
  songJacket: { width: 56, height: 56, borderRadius: 8 },
  songJacketFallback: { backgroundColor: t.surfaceMuted },
  songTitle: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  songMeta: { fontSize: 11, color: t.textMuted },
  songScoreRow: { flexDirection: 'row' as const, gap: 6, marginTop: 2 },
  songScoreBox: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  songScoreBoxActive: {
    borderColor: 'rgba(52, 211, 153, 0.45)',
    backgroundColor: 'rgba(52, 211, 153, 0.10)',
  },
  songScoreLabel: { fontSize: 9, color: t.textDim, fontWeight: '900' as const, letterSpacing: 0.4 },
  songScoreLabelActive: { color: '#34d399' },
  songScoreValue: { fontSize: 13, color: t.text, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  songScoreValueActive: { color: '#34d399' },
});
