import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type { Match, Player } from '@shared/api';
import { MatchDetailSheet } from './match-detail-sheet';

function fmt(n: unknown): string {
  if (n == null || n === '') return '–';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString();
}

function isSharedWin(m: Match): boolean {
  return !!m.scores?.shared_win;
}

function matchScoreLabel(m: Match): string | null {
  if (m.match_type === 'gauntlet') return null;
  const s = m.scores || {};
  if (typeof s.player1_wins === 'number' || typeof s.player2_wins === 'number') {
    return `${s.player1_wins ?? 0}–${s.player2_wins ?? 0}`;
  }
  return null;
}

function matchLabel(m: Match, totalGauntlet: number): string {
  const lvl = m.difficulty_min || m.difficulty_max
    ? `Lv.${m.difficulty_min ?? '?'}-${m.difficulty_max ?? '?'}`
    : '';
  if (m.match_type === 'gauntlet') {
    const isFinal = (m.gauntlet_order || 0) === totalGauntlet;
    const stage = isFinal ? 'Gauntlet Final' : `Gauntlet ${m.gauntlet_order ?? '?'}`;
    return [stage, lvl].filter(Boolean).join(' · ');
  }
  if (m.round_number) {
    return [`Round ${m.round_number}`, lvl].filter(Boolean).join(' · ');
  }
  return lvl || 'Match';
}

interface Props {
  visible: boolean;
  player: Player | null;
  players: Player[];
  matches: Match[];
  onClose: () => void;
}

/**
 * Player history sheet — every completed match this player took part in,
 * grouped by phase format. Each row is tappable to open the full
 * MatchDetailSheet with songs + per-song scores. Mirrors the desktop
 * PlayerPhaseHistoryModal but spans ALL phases instead of one (the user
 * wants RR + Gauntlet history in one place).
 */
export function PlayerHistorySheet({ visible, player, players, matches, onClose }: Props) {
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [matchTarget, setMatchTarget] = useState<Match | null>(null);

  const totalGauntlet = useMemo(
    () => matches.filter((m) => m.match_type === 'gauntlet').length,
    [matches],
  );

  const playerMatches = useMemo(() => {
    if (!player) return [];
    return matches
      .filter((m) => m.status === 'COMPLETED' && (m.player1_id === player.id || m.player2_id === player.id))
      .sort((a, b) => {
        // Gauntlet rows after non-gauntlet, ordered by gauntlet_order then round_number.
        const ag = a.match_type === 'gauntlet' ? 1 : 0;
        const bg = b.match_type === 'gauntlet' ? 1 : 0;
        if (ag !== bg) return ag - bg;
        if (ag === 1) return (a.gauntlet_order || 0) - (b.gauntlet_order || 0);
        return (a.round_number || 0) - (b.round_number || 0);
      });
  }, [matches, player]);

  const record = useMemo(() => {
    if (!player) return { wins: 0, losses: 0, shared: 0, songs: 0 };
    let wins = 0, losses = 0, shared = 0, songs = 0;
    for (const m of playerMatches) {
      if (isSharedWin(m)) shared += 1;
      else if (m.winner_id === player.id) wins += 1;
      else losses += 1;
      songs += (m.played_songs?.length || 0);
    }
    return { wins, losses, shared, songs };
  }, [playerMatches, player]);

  if (!player) return null;

  const avatar = typeof player.avatar === 'string' && player.avatar ? fullImageUrl(player.avatar) : undefined;
  const initial = String(player.name || '?').charAt(0).toUpperCase();

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => undefined}>
          <View style={s.handle} />
          <View style={s.header}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={s.headerAvatar} contentFit="cover" />
            ) : (
              <View style={[s.headerAvatar, s.headerAvatarFallback]}>
                <Text style={s.headerAvatarLetter}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.headerEyebrow}>MATCH HISTORY</Text>
              <Text style={s.headerName} numberOfLines={1}>{player.name}</Text>
              {player.skill_title ? (
                <Text style={s.headerMeta} numberOfLines={1}>{player.skill_title}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.closeBtnText}>×</Text>
            </Pressable>
          </View>

          <View style={s.metricsRow}>
            <Metric label="WINS" value={record.wins} tone="win" s={s} />
            <Metric label="LOSSES" value={record.losses} tone="loss" s={s} />
            <Metric label="SHARED" value={record.shared} tone="accent" s={s} />
            <Metric label="SONGS" value={record.songs} s={s} />
          </View>

          <ScrollView contentContainerStyle={s.body}>
            {playerMatches.length === 0 ? (
              <Text style={s.empty}>No completed matches yet.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {playerMatches.map((m) => {
                  const opponent = m.player1_id === player.id
                    ? players.find((p) => p.id === m.player2_id)
                    : players.find((p) => p.id === m.player1_id);
                  const shared = isSharedWin(m);
                  const isWin = shared || m.winner_id === player.id;
                  const scoreLabel = matchScoreLabel(m);
                  const songCount = m.played_songs?.length || 0;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMatchTarget(m)}
                      style={({ pressed }) => [
                        s.matchCard,
                        isWin ? s.matchCardWin : s.matchCardLoss,
                        pressed && { opacity: 0.85 },
                      ]}>
                      <View style={s.matchTopRow}>
                        <Text style={[
                          s.outcomeBadge,
                          shared ? s.outcomeBadgeShared : isWin ? s.outcomeBadgeWin : s.outcomeBadgeLoss,
                        ]}>
                          {shared ? 'SHARED' : isWin ? 'WIN' : 'LOSS'}
                        </Text>
                        <Text style={s.matchLabel} numberOfLines={1}>
                          {matchLabel(m, totalGauntlet)}
                        </Text>
                        {scoreLabel ? <Text style={s.matchScore}>{scoreLabel}</Text> : null}
                      </View>
                      <View style={s.matchBottomRow}>
                        <Text style={s.vsText}>
                          vs <Text style={s.opponentName}>{opponent?.name || 'Unknown'}</Text>
                        </Text>
                        <Text style={s.songCount}>
                          {songCount} song{songCount === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      <MatchDetailSheet
        visible={!!matchTarget}
        match={matchTarget}
        players={players}
        totalGauntletMatches={totalGauntlet}
        onClose={() => setMatchTarget(null)}
      />
    </Modal>
  );
}

function Metric({
  label,
  value,
  tone,
  s,
}: {
  label: string;
  value: number;
  tone?: 'win' | 'loss' | 'accent';
  s: ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;
}) {
  return (
    <View style={[
      s.metricBox,
      tone === 'win' && s.metricBoxWin,
      tone === 'loss' && s.metricBoxLoss,
      tone === 'accent' && s.metricBoxAccent,
    ]}>
      <Text style={[
        s.metricValue,
        tone === 'win' && s.metricValueWin,
        tone === 'loss' && s.metricValueLoss,
        tone === 'accent' && s.metricValueAccent,
      ]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    gap: 12,
  },
  headerAvatar: { width: 52, height: 52, borderRadius: 16 },
  headerAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerAvatarLetter: { fontSize: 20, fontWeight: '900' as const, color: t.accent },
  headerEyebrow: { fontSize: 10, letterSpacing: 1.6, color: t.accent, fontWeight: '900' as const },
  headerName: { fontSize: 20, fontWeight: '900' as const, color: t.text, marginTop: 2 },
  headerMeta: { fontSize: 11, color: t.textMuted },
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

  metricsRow: {
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  metricBox: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
    alignItems: 'flex-start' as const,
  },
  metricBoxWin: { borderColor: 'rgba(52, 211, 153, 0.30)', backgroundColor: 'rgba(52, 211, 153, 0.08)' },
  metricBoxLoss: { borderColor: 'rgba(244, 63, 94, 0.30)', backgroundColor: 'rgba(244, 63, 94, 0.08)' },
  metricBoxAccent: { borderColor: t.accent, backgroundColor: t.accentTint },
  metricValue: { fontSize: 18, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  metricValueWin: { color: '#34d399' },
  metricValueLoss: { color: t.danger },
  metricValueAccent: { color: t.accent },
  metricLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim, marginTop: 2 },

  body: { padding: 14 },
  empty: { fontSize: 12, color: t.textDim, textAlign: 'center' as const, paddingVertical: 24 },

  matchCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: t.bg,
    padding: 10,
    gap: 6,
  },
  matchCardWin: { borderColor: 'rgba(52, 211, 153, 0.25)' },
  matchCardLoss: { borderColor: 'rgba(244, 63, 94, 0.20)' },

  matchTopRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  outcomeBadge: {
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outcomeBadgeWin: { color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.10)' },
  outcomeBadgeLoss: { color: t.danger, backgroundColor: 'rgba(244, 63, 94, 0.10)' },
  outcomeBadgeShared: { color: t.accent, backgroundColor: t.accentTint },
  matchLabel: { flex: 1, fontSize: 11, color: t.textMuted, fontWeight: '700' as const, letterSpacing: 0.4 },
  matchScore: { fontSize: 11, fontWeight: '900' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },

  matchBottomRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 6 },
  vsText: { fontSize: 13, color: t.textDim },
  opponentName: { fontSize: 13, fontWeight: '900' as const, color: t.text },
  songCount: { fontSize: 10, color: t.textDim, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
});
