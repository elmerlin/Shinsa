import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { DiscussionMessage, Match, Player } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function MatchRow({
  m,
  players,
  s,
  active,
  onPress,
}: {
  m: Match;
  players: Map<string, Player>;
  s: Styles;
  active?: boolean;
  onPress?: () => void;
}) {
  const p1 = m.player1_id ? players.get(m.player1_id) : undefined;
  const p2 = m.player2_id ? players.get(m.player2_id) : undefined;
  const isBye = !!m.is_bye;
  const winnerId = m.winner_id;

  const content = (
    <>
      <View style={s.matchHeader}>
        {typeof m.round_number === 'number' && m.round_number > 0 ? (
          <Text style={s.matchRound}>R{m.round_number}</Text>
        ) : null}
        {m.status ? <Text style={s.matchStatus}>{m.status}</Text> : null}
        {typeof m.difficulty_min === 'number' && typeof m.difficulty_max === 'number' ? (
          <Text style={s.matchDifficulty}>
            Lv {m.difficulty_min === m.difficulty_max ? m.difficulty_min : `${m.difficulty_min}-${m.difficulty_max}`}
          </Text>
        ) : null}
      </View>
      <View style={s.matchPlayers}>
        <Text style={[s.matchPlayer, winnerId && winnerId === p1?.id && s.matchWinner]}>
          {p1?.name ?? '—'}
        </Text>
        <Text style={s.matchVs}>{isBye ? 'BYE' : 'vs'}</Text>
        <Text style={[s.matchPlayer, s.matchPlayerRight, winnerId && winnerId === p2?.id && s.matchWinner]}>
          {p2?.name ?? (isBye ? '' : '—')}
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onHoverIn={() => undefined}
        onHoverOut={() => undefined}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          s.matchRow,
          hovered && !active && s.matchRowHover,
          active && s.matchRowActive,
          pressed && { opacity: 0.85 },
        ]}>
        {content}
      </Pressable>
    );
  }
  return <View style={s.matchRow}>{content}</View>;
}

function PlayerRow({ p, rank, s }: { p: Player; rank: number; s: Styles }) {
  const wl = `${p.wins ?? 0}-${p.losses ?? 0}`;
  return (
    <View style={s.playerRow}>
      <Text style={s.playerRank}>{rank}</Text>
      <View style={s.playerMain}>
        <Text style={s.playerName} numberOfLines={1}>{p.name}</Text>
        {p.skill_title ? <Text style={s.playerSkill}>{p.skill_title}</Text> : null}
      </View>
      <View style={s.playerStats}>
        <Text style={s.playerWL}>{wl}</Text>
        {typeof p.points === 'number' ? <Text style={s.playerPts}>{p.points} pts</Text> : null}
      </View>
    </View>
  );
}

function DiscussionRow({ msg, s }: { msg: DiscussionMessage; s: Styles }) {
  return (
    <View style={s.msgRow}>
      <View style={s.msgHeader}>
        <Text style={s.msgUser}>{msg.username || 'anonymous'}</Text>
        {msg.created_at ? <Text style={s.msgTime}>{formatDate(msg.created_at)}</Text> : null}
      </View>
      {msg.body ? <Text style={s.msgBody}>{msg.body}</Text> : null}
    </View>
  );
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? '';
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { isDesktop } = useBreakpoint();
  // Desktop only: tapping a match pins it in the right rail.
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const tournamentQuery = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
    enabled: !!tournamentId,
  });
  const matchesQuery = useQuery({
    queryKey: ['tournament-matches', tournamentId],
    queryFn: () => tournamentsApi.matches(tournamentId),
    enabled: !!tournamentId,
  });
  const playersQuery = useQuery({
    queryKey: ['tournament-players', tournamentId],
    queryFn: () => tournamentsApi.players(tournamentId),
    enabled: !!tournamentId,
  });
  const discussionQuery = useQuery({
    queryKey: ['tournament-discussion', tournamentId],
    queryFn: () => tournamentsApi.discussion(tournamentId),
    enabled: !!tournamentId,
  });

  const t = tournamentQuery.data;
  const matches = matchesQuery.data ?? [];
  const players = playersQuery.data ?? [];
  const discussion = discussionQuery.data?.threads ?? [];

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const standings = useMemo(() => {
    return [...players].sort((a, b) => {
      const pa = a.points ?? 0;
      const pb = b.points ?? 0;
      if (pb !== pa) return pb - pa;
      const ba = a.buchholz ?? 0;
      const bb = b.buchholz ?? 0;
      return bb - ba;
    });
  }, [players]);

  const topLevelDiscussion = useMemo(
    () => discussion.filter((m) => !m.parent_id),
    [discussion]
  );

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  );

  // Esc clears the pinned match. Web only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMatchId) setSelectedMatchId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMatchId]);

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: t?.name || 'Tournament' }} />
      <View style={isDesktop ? s.deskRow : { flex: 1 }}>
      <ScrollView style={isDesktop ? { flex: 1 } : undefined} contentContainerStyle={s.scroll}>
        {tournamentQuery.isLoading && (
          <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
        )}

        {tournamentQuery.isError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              {tournamentQuery.error instanceof Error ? tournamentQuery.error.message : 'Failed to load tournament'}
            </Text>
          </View>
        )}

        {t && (
          <>
            <View style={s.headerCard}>
              <Text style={s.title} numberOfLines={2}>{t.name}</Text>
              <View style={s.metaRow}>
                {t.phase ? <Text style={s.metaChip}>{t.phase}</Text> : null}
                {t.date ? <Text style={s.metaChip}>{formatDate(t.date)}</Text> : null}
                {t.location ? <Text style={s.metaChip}>{t.location}</Text> : null}
                {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
                  <Text style={[s.metaChip, s.roundChip]}>R{t.current_round}/{t.total_rounds}</Text>
                ) : null}
              </View>
            </View>

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Standings</Text>
                <Text style={s.sectionCount}>{standings.length}</Text>
              </View>
              {playersQuery.isLoading ? (
                <ActivityIndicator color={theme.spinner} style={{ padding: 24 }} />
              ) : standings.length === 0 ? (
                <Text style={s.empty}>No players yet</Text>
              ) : (
                <View style={s.list}>
                  {standings.map((p, i) => <PlayerRow key={p.id} p={p} rank={i + 1} s={s} />)}
                </View>
              )}
            </View>

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Matches</Text>
                <Text style={s.sectionCount}>{matches.length}</Text>
              </View>
              {matchesQuery.isLoading ? (
                <ActivityIndicator color={theme.spinner} style={{ padding: 24 }} />
              ) : matches.length === 0 ? (
                <Text style={s.empty}>No matches yet</Text>
              ) : (
                <View style={s.list}>
                  {matches.map((m) => (
                    <MatchRow
                      key={m.id}
                      m={m}
                      players={playersById}
                      s={s}
                      active={isDesktop && m.id === selectedMatchId}
                      onPress={isDesktop ? () => setSelectedMatchId(m.id) : undefined}
                    />
                  ))}
                </View>
              )}
            </View>

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Discussion</Text>
                <Text style={s.sectionCount}>{topLevelDiscussion.length}</Text>
              </View>
              {discussionQuery.isLoading ? (
                <ActivityIndicator color={theme.spinner} style={{ padding: 24 }} />
              ) : topLevelDiscussion.length === 0 ? (
                <Text style={s.empty}>No discussion yet</Text>
              ) : (
                <View style={s.list}>
                  {topLevelDiscussion.map((m) => <DiscussionRow key={m.id} msg={m} s={s} />)}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {isDesktop ? (
        <View style={s.deskRail}>
          {selectedMatch ? (
            <ScrollView contentContainerStyle={s.deskRailContent}>
              <View style={s.deskRailHead}>
                <Text style={s.deskRailEyebrow}>MATCH</Text>
                <Pressable
                  onPress={() => setSelectedMatchId(null)}
                  hitSlop={8}
                  style={({ pressed }) => [s.deskRailClose, pressed && { opacity: 0.6 }]}
                  accessibilityLabel="Close match panel">
                  <IconSymbol name="xmark" size={14} color={theme.textMuted} />
                </Pressable>
              </View>
              {(() => {
                const p1 = selectedMatch.player1_id ? playersById.get(selectedMatch.player1_id) : undefined;
                const p2 = selectedMatch.player2_id ? playersById.get(selectedMatch.player2_id) : undefined;
                const winnerId = selectedMatch.winner_id;
                return (
                  <>
                    <View style={s.deskMatchHead}>
                      <Text style={s.deskMatchPlayer} numberOfLines={1}>{p1?.name ?? '—'}</Text>
                      <Text style={s.deskMatchVs}>{selectedMatch.is_bye ? 'BYE' : 'vs'}</Text>
                      <Text style={s.deskMatchPlayer} numberOfLines={1}>
                        {p2?.name ?? (selectedMatch.is_bye ? '' : '—')}
                      </Text>
                    </View>
                    {winnerId ? (
                      <Text style={s.deskMatchWinner}>
                        Winner: {winnerId === p1?.id ? p1?.name : p2?.name}
                      </Text>
                    ) : null}
                    <View style={s.deskMatchMetaRow}>
                      {typeof selectedMatch.round_number === 'number' && selectedMatch.round_number > 0 ? (
                        <Text style={s.deskMatchMetaChip}>Round {selectedMatch.round_number}</Text>
                      ) : null}
                      {selectedMatch.status ? <Text style={s.deskMatchMetaChip}>{selectedMatch.status}</Text> : null}
                      {typeof selectedMatch.difficulty_min === 'number' && typeof selectedMatch.difficulty_max === 'number' ? (
                        <Text style={s.deskMatchMetaChip}>
                          Lv {selectedMatch.difficulty_min === selectedMatch.difficulty_max
                            ? selectedMatch.difficulty_min
                            : `${selectedMatch.difficulty_min}-${selectedMatch.difficulty_max}`}
                        </Text>
                      ) : null}
                    </View>
                    {/* Plays + shoutouts would land here. Server doesn't ship
                        them in `matches` today — see follow-up to wire
                        tournamentsApi.matchPlays(id) when the endpoint exists. */}
                  </>
                );
              })()}
            </ScrollView>
          ) : (
            <View style={s.deskRailEmpty}>
              <Text style={s.deskRailEmptyTitle}>Pick a match</Text>
              <Text style={s.deskRailEmptyHint}>
                Tap any match in the bracket to see the players, scores, and shoutouts.
              </Text>
            </View>
          )}
        </View>
      ) : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 20, gap: 24, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' as const },
  headerCard: { gap: 8 },
  title: { fontSize: 24, fontWeight: '800' as const, lineHeight: 30, color: t.text },
  metaRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  metaChip: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    color: t.textMuted,
    fontWeight: '700' as const,
  },
  roundChip: { backgroundColor: t.accentTint, color: t.accent },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, color: t.text },
  sectionHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  sectionCount: { fontSize: 12, color: t.textDim },
  list: { backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border, overflow: 'hidden' as const },

  matchRow: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, gap: 6 },
  matchHeader: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const },
  matchRound: { fontSize: 10, fontWeight: '800' as const, color: t.accent },
  matchStatus: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 0.5 },
  matchDifficulty: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted, marginLeft: 'auto' as const },
  matchPlayers: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  matchPlayer: { flex: 1, fontSize: 14, color: t.textMuted },
  matchPlayerRight: { textAlign: 'right' as const },
  matchWinner: { color: t.text, fontWeight: '800' as const },
  matchVs: { fontSize: 11, color: t.textDim, fontWeight: '700' as const },

  playerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
  playerRank: { width: 24, fontSize: 13, fontWeight: '800' as const, color: t.textMuted, textAlign: 'center' as const },
  playerMain: { flex: 1, gap: 2, minWidth: 0 },
  playerName: { fontSize: 15, fontWeight: '700' as const, color: t.text },
  playerSkill: { fontSize: 11, color: t.textMuted },
  playerStats: { alignItems: 'flex-end' as const, gap: 2 },
  playerWL: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  playerPts: { fontSize: 11, color: t.accent, fontWeight: '700' as const },

  msgRow: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, gap: 6 },
  msgHeader: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  msgUser: { fontSize: 13, fontWeight: '700' as const, color: t.text },
  msgTime: { fontSize: 11, color: t.textDim },
  msgBody: { fontSize: 14, color: t.text, lineHeight: 20 },

  empty: { padding: 16, textAlign: 'center' as const, color: t.textDim },
  errorBox: { backgroundColor: t.dangerBg, borderColor: t.dangerBorder, borderWidth: 1, padding: 12, borderRadius: 8 },
  errorText: { color: t.danger, fontSize: 14 },

  // Desktop: bracket-style center column + right rail for selected match.
  deskRow: { flex: 1, flexDirection: 'row' as const, alignItems: 'stretch' as const },
  matchRowHover: { backgroundColor: t.surfaceMuted },
  matchRowActive: { backgroundColor: t.accentTint },
  deskRail: {
    width: 340,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  deskRailContent: { padding: 16, gap: 10, paddingBottom: 40 },
  deskRailHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  deskRailEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  deskRailClose: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deskMatchHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingTop: 4,
  },
  deskMatchPlayer: { flex: 1, fontSize: 15, fontWeight: '800' as const, color: t.text },
  deskMatchVs: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1 },
  deskMatchWinner: { fontSize: 12, fontWeight: '700' as const, color: t.accent },
  deskMatchMetaRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, paddingTop: 8 },
  deskMatchMetaChip: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
  },
  deskRailEmpty: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, gap: 6 },
  deskRailEmptyTitle: { fontSize: 14, fontWeight: '800' as const, color: t.text },
  deskRailEmptyHint: { fontSize: 12, color: t.textMuted, textAlign: 'center' as const, maxWidth: 280 },
});
