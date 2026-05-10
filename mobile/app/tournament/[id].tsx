import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { tournamentsApi } from '@/lib/api';
import type { DiscussionMessage, Match, Player } from '@shared/api';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function MatchRow({ m, players }: { m: Match; players: Map<string, Player> }) {
  const p1 = m.player1_id ? players.get(m.player1_id) : undefined;
  const p2 = m.player2_id ? players.get(m.player2_id) : undefined;
  const isBye = !!m.is_bye;
  const winnerId = m.winner_id;

  return (
    <View style={styles.matchRow}>
      <View style={styles.matchHeader}>
        {typeof m.round_number === 'number' && m.round_number > 0 ? (
          <Text style={styles.matchRound}>R{m.round_number}</Text>
        ) : null}
        {m.status ? <Text style={styles.matchStatus}>{m.status}</Text> : null}
        {typeof m.difficulty_min === 'number' && typeof m.difficulty_max === 'number' ? (
          <Text style={styles.matchDifficulty}>
            Lv {m.difficulty_min === m.difficulty_max ? m.difficulty_min : `${m.difficulty_min}-${m.difficulty_max}`}
          </Text>
        ) : null}
      </View>
      <View style={styles.matchPlayers}>
        <Text style={[styles.matchPlayer, winnerId && winnerId === p1?.id && styles.matchWinner]}>
          {p1?.name ?? '—'}
        </Text>
        <Text style={styles.matchVs}>{isBye ? 'BYE' : 'vs'}</Text>
        <Text style={[styles.matchPlayer, styles.matchPlayerRight, winnerId && winnerId === p2?.id && styles.matchWinner]}>
          {p2?.name ?? (isBye ? '' : '—')}
        </Text>
      </View>
    </View>
  );
}

function PlayerRow({ p, rank }: { p: Player; rank: number }) {
  const wl = `${p.wins ?? 0}-${p.losses ?? 0}`;
  return (
    <View style={styles.playerRow}>
      <Text style={styles.playerRank}>{rank}</Text>
      <View style={styles.playerMain}>
        <ThemedText style={styles.playerName} numberOfLines={1}>{p.name}</ThemedText>
        {p.skill_title ? <Text style={styles.playerSkill}>{p.skill_title}</Text> : null}
      </View>
      <View style={styles.playerStats}>
        <Text style={styles.playerWL}>{wl}</Text>
        {typeof p.points === 'number' ? <Text style={styles.playerPts}>{p.points} pts</Text> : null}
      </View>
    </View>
  );
}

function DiscussionRow({ msg }: { msg: DiscussionMessage }) {
  return (
    <View style={styles.msgRow}>
      <View style={styles.msgHeader}>
        <ThemedText style={styles.msgUser}>{msg.username || 'anonymous'}</ThemedText>
        {msg.created_at ? <Text style={styles.msgTime}>{formatDate(msg.created_at)}</Text> : null}
      </View>
      {msg.body ? <Text style={styles.msgBody}>{msg.body}</Text> : null}
    </View>
  );
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? '';

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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t?.name || 'Tournament' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {tournamentQuery.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color="#ff3366" />
          </View>
        )}

        {tournamentQuery.isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {tournamentQuery.error instanceof Error ? tournamentQuery.error.message : 'Failed to load tournament'}
            </Text>
          </View>
        )}

        {t && (
          <>
            <View style={styles.headerCard}>
              <ThemedText type="title" style={styles.title} numberOfLines={2}>{t.name}</ThemedText>
              <View style={styles.metaRow}>
                {t.phase ? <Text style={styles.metaChip}>{t.phase}</Text> : null}
                {t.date ? <Text style={styles.metaChip}>{formatDate(t.date)}</Text> : null}
                {t.location ? <Text style={styles.metaChip}>{t.location}</Text> : null}
                {typeof t.current_round === 'number' && typeof t.total_rounds === 'number' && t.total_rounds > 0 ? (
                  <Text style={[styles.metaChip, styles.roundChip]}>R{t.current_round}/{t.total_rounds}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle">Standings</ThemedText>
                <Text style={styles.sectionCount}>{standings.length}</Text>
              </View>
              {playersQuery.isLoading ? (
                <ActivityIndicator color="#ff3366" style={{ padding: 24 }} />
              ) : standings.length === 0 ? (
                <Text style={styles.empty}>No players yet</Text>
              ) : (
                <View style={styles.list}>
                  {standings.map((p, i) => <PlayerRow key={p.id} p={p} rank={i + 1} />)}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle">Matches</ThemedText>
                <Text style={styles.sectionCount}>{matches.length}</Text>
              </View>
              {matchesQuery.isLoading ? (
                <ActivityIndicator color="#ff3366" style={{ padding: 24 }} />
              ) : matches.length === 0 ? (
                <Text style={styles.empty}>No matches yet</Text>
              ) : (
                <View style={styles.list}>
                  {matches.map((m) => <MatchRow key={m.id} m={m} players={playersById} />)}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle">Discussion</ThemedText>
                <Text style={styles.sectionCount}>{topLevelDiscussion.length}</Text>
              </View>
              {discussionQuery.isLoading ? (
                <ActivityIndicator color="#ff3366" style={{ padding: 24 }} />
              ) : topLevelDiscussion.length === 0 ? (
                <Text style={styles.empty}>No discussion yet</Text>
              ) : (
                <View style={styles.list}>
                  {topLevelDiscussion.map((m) => <DiscussionRow key={m.id} msg={m} />)}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 24, paddingBottom: 60 },
  center: { padding: 32, alignItems: 'center' },

  headerCard: { gap: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChip: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.15)',
    color: '#cbd5e1',
    fontWeight: '600',
  },
  roundChip: { backgroundColor: 'rgba(255,51,102,0.2)', color: '#ff6b8a' },

  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionCount: { fontSize: 12, opacity: 0.5 },
  list: { backgroundColor: '#141428', borderRadius: 12, overflow: 'hidden' },

  matchRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
    gap: 6,
  },
  matchHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  matchRound: { fontSize: 10, fontWeight: '700', color: '#ff6b8a' },
  matchStatus: { fontSize: 10, fontWeight: '600', color: '#94a3b8', letterSpacing: 0.5 },
  matchDifficulty: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginLeft: 'auto' },
  matchPlayers: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchPlayer: { flex: 1, fontSize: 14, color: '#cbd5e1' },
  matchPlayerRight: { textAlign: 'right' },
  matchWinner: { color: '#fff', fontWeight: '700' },
  matchVs: { fontSize: 11, opacity: 0.4, fontWeight: '600' },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
  },
  playerRank: { width: 24, fontSize: 13, fontWeight: '700', color: '#94a3b8', textAlign: 'center' },
  playerMain: { flex: 1, gap: 2, minWidth: 0 },
  playerName: { fontSize: 15, fontWeight: '600' },
  playerSkill: { fontSize: 11, opacity: 0.55 },
  playerStats: { alignItems: 'flex-end', gap: 2 },
  playerWL: { fontSize: 13, fontWeight: '700', color: '#cbd5e1' },
  playerPts: { fontSize: 11, color: '#ff6b8a', fontWeight: '600' },

  msgRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.15)',
    gap: 6,
  },
  msgHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  msgUser: { fontSize: 13, fontWeight: '600' },
  msgTime: { fontSize: 11, opacity: 0.4 },
  msgBody: { fontSize: 14, color: '#cbd5e1', lineHeight: 20 },

  empty: { padding: 16, textAlign: 'center', opacity: 0.5 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
});
