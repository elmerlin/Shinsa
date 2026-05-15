import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';
import type { Match, Player, TournamentPhase } from '@shared/api';
import { TournamentEmptyPanel } from './chrome';

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

interface PlayerLite {
  id: string;
  name: string;
  seed_rank?: number;
  wins?: number;
  losses?: number;
  points?: number;
  buchholz?: number;
  pumbility?: number;
  [key: string]: unknown;
}

function buildPlayerMap(players: Player[]): Record<string, PlayerLite> {
  const map: Record<string, PlayerLite> = {};
  for (const p of players) {
    map[p.id] = p as unknown as PlayerLite;
  }
  return map;
}

function matchScores(match: Match): { p1: number | string; p2: number | string } {
  const scores = (match as unknown as { scores?: Record<string, number> }).scores || {};
  const p1 = scores.player1_wins ?? scores.p1_total ?? '-';
  const p2 = scores.player2_wins ?? scores.p2_total ?? '-';
  return { p1, p2 };
}

function isCompleted(match: Match): boolean {
  return String(match.status || '').toUpperCase() === 'COMPLETED';
}

function isBye(match: Match): boolean {
  return !!match.is_bye || String(match.status || '').toUpperCase() === 'BYE';
}

/**
 * Reusable match row used by Round Robin / Pools / Gauntlet. Each row shows
 * both players, their scores, and highlights the winner.
 */
function MatchRow({
  match,
  playerMap,
  showRound,
  s,
}: {
  match: Match;
  playerMap: Record<string, PlayerLite>;
  showRound?: boolean;
  s: Styles;
}) {
  const p1 = match.player1_id ? playerMap[match.player1_id] : undefined;
  const p2 = match.player2_id ? playerMap[match.player2_id] : undefined;
  const scores = matchScores(match);
  const completed = isCompleted(match);
  const bye = isBye(match);
  const winnerId = match.winner_id;

  const diffParts: string[] = [];
  if (typeof match.difficulty_min === 'number') {
    diffParts.push(
      match.difficulty_min === match.difficulty_max
        ? `Lv ${match.difficulty_min}`
        : `Lv ${match.difficulty_min}–${match.difficulty_max ?? ''}`,
    );
  }

  return (
    <View style={[s.matchRow, bye && s.matchRowBye]}>
      <View style={s.matchHead}>
        {showRound && match.round_number ? (
          <Text style={s.matchHeadText}>R{match.round_number}</Text>
        ) : null}
        {diffParts.length > 0 ? (
          <Text style={s.matchHeadText}>{diffParts.join(' ')}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {bye ? <Text style={[s.matchStatus, s.matchStatusBye]}>BYE</Text> : null}
        {!bye && !completed && match.status ? (
          <Text style={s.matchStatus}>{String(match.status)}</Text>
        ) : null}
      </View>
      <View style={[s.playerRow, completed && winnerId === match.player1_id && s.playerRowWinner]}>
        <Text style={s.seedText}>{p1?.seed_rank || ''}</Text>
        <Text
          style={[s.playerName, completed && winnerId === match.player1_id && s.playerNameWinner]}
          numberOfLines={1}>
          {p1?.name || (bye ? '—' : 'TBD')}
        </Text>
        {completed ? (
          <Text style={[s.scoreText, winnerId === match.player1_id && s.scoreTextWinner]}>{scores.p1}</Text>
        ) : null}
      </View>
      <View style={[s.playerRow, completed && winnerId === match.player2_id && s.playerRowWinner]}>
        <Text style={s.seedText}>{p2?.seed_rank || ''}</Text>
        <Text
          style={[s.playerName, completed && winnerId === match.player2_id && s.playerNameWinner]}
          numberOfLines={1}>
          {p2?.name || (bye ? '—' : 'TBD')}
        </Text>
        {completed ? (
          <Text style={[s.scoreText, winnerId === match.player2_id && s.scoreTextWinner]}>{scores.p2}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Round Robin ──────────────────────────────────────────────────────────

export function RoundRobinView({
  phase: _phase,
  matches,
  players,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
}) {
  const s = useThemedStyles(makeStyles);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const rounds = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) {
      const r = Number(m.round_number) || 0;
      if (r > 0) set.add(r);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [matches]);
  const [selectedRound, setSelectedRound] = useState<number>(rounds[rounds.length - 1] || 1);

  if (matches.length === 0) {
    return (
      <TournamentEmptyPanel
        icon="🔄"
        title="Round Robin"
        description="Matches will appear here once the round starts."
      />
    );
  }

  const roundMatches = matches
    .filter((m) => Number(m.round_number) === selectedRound)
    .sort((a, b) => Number(a.id > b.id ? 1 : -1));

  return (
    <View style={s.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.roundPicker}>
        {rounds.map((r) => {
          const active = r === selectedRound;
          return (
            <Pressable
              key={`round-${r}`}
              onPress={() => setSelectedRound(r)}
              style={({ pressed }) => [
                s.roundPickerChip,
                active && s.roundPickerChipActive,
                pressed && !active && { opacity: 0.7 },
              ]}>
              <Text style={[s.roundPickerText, active && s.roundPickerTextActive]}>R{r}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.matchesList}>
        {roundMatches.map((m) => (
          <MatchRow key={m.id} match={m} playerMap={playerMap} s={s} />
        ))}
      </View>
    </View>
  );
}

// ─── Pools ────────────────────────────────────────────────────────────────

const POOL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface PoolStanding extends PlayerLite {
  wins: number;
  losses: number;
  points: number;
}

function poolStandings(poolMatches: Match[], playerIds: string[], playerMap: Record<string, PlayerLite>): PoolStanding[] {
  const stats = new Map<string, PoolStanding>();
  for (const id of playerIds) {
    const base = playerMap[id];
    if (!base) continue;
    stats.set(id, { ...base, wins: 0, losses: 0, points: 0 });
  }
  for (const m of poolMatches) {
    if (!isCompleted(m) || !m.player1_id || !m.player2_id) continue;
    const winner = m.winner_id ? stats.get(m.winner_id) : undefined;
    const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    const loser = stats.get(loserId);
    if (winner) {
      winner.wins += 1;
      winner.points += 1;
    }
    if (loser) loser.losses += 1;
  }
  return Array.from(stats.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function PoolsView({
  matches,
  players,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
}) {
  const s = useThemedStyles(makeStyles);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);

  // Group matches + player ids by pool_id (server stores it on the match
  // and the phase player row).
  const pools = useMemo(() => {
    const groups: Record<number, { matches: Match[]; playerIds: Set<string> }> = {};
    for (const m of matches) {
      const pid = Number((m as unknown as { pool_id?: number }).pool_id ?? 0);
      if (!groups[pid]) groups[pid] = { matches: [], playerIds: new Set() };
      groups[pid].matches.push(m);
      if (m.player1_id) groups[pid].playerIds.add(m.player1_id);
      if (m.player2_id) groups[pid].playerIds.add(m.player2_id);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([id, g]) => ({
        poolId: Number(id),
        letter: POOL_LETTERS[Number(id) % POOL_LETTERS.length] || String(Number(id) + 1),
        matches: g.matches,
        playerIds: Array.from(g.playerIds),
      }));
  }, [matches]);

  if (pools.length === 0) {
    return (
      <TournamentEmptyPanel
        icon="🏊"
        title="Pools"
        description="Pools will appear once players are seeded."
      />
    );
  }

  return (
    <View style={s.section}>
      {pools.map((pool) => {
        const standings = poolStandings(pool.matches, pool.playerIds, playerMap);
        return (
          <View key={pool.poolId} style={s.poolCard}>
            <Text style={s.poolHeader}>POOL {pool.letter}</Text>
            <View style={s.poolStandings}>
              {standings.map((p, i) => (
                <View key={p.id} style={s.poolStandingRow}>
                  <Text style={s.poolRank}>{i + 1}</Text>
                  <Text style={s.poolName} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.poolWins}>{p.wins}W</Text>
                  <Text style={s.poolLosses}>{p.losses}L</Text>
                </View>
              ))}
            </View>
            <View style={s.poolMatchList}>
              {pool.matches.map((m) => (
                <MatchRow key={m.id} match={m} playerMap={playerMap} s={s} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Bracket (Single Elim) ────────────────────────────────────────────────

function getBracketRound(m: Match): number {
  return Number((m as unknown as { bracket_round?: number }).bracket_round) || Number(m.round_number) || 1;
}
function getBracketPosition(m: Match): number {
  return Number((m as unknown as { bracket_position?: number }).bracket_position) || 0;
}
function getBracket(m: Match): string {
  return String((m as unknown as { bracket?: string }).bracket || '');
}

function roundLabel(round: number, totalRounds: number): string {
  const remaining = totalRounds - round + 1;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${round}`;
}

export function BracketView({
  matches,
  players,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
}) {
  const s = useThemedStyles(makeStyles);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);

  const bracketMatches = useMemo(() => {
    return matches
      .filter((m) => {
        const b = getBracket(m).toLowerCase();
        return (b === 'winners' || b === '') && (m as unknown as { match_type?: string }).match_type !== 'gauntlet';
      })
      .sort((a, b) => {
        const dr = getBracketRound(a) - getBracketRound(b);
        if (dr !== 0) return dr;
        return getBracketPosition(a) - getBracketPosition(b);
      });
  }, [matches]);

  const rounds = useMemo(() => {
    const map: Record<number, Match[]> = {};
    for (const m of bracketMatches) {
      const r = getBracketRound(m);
      if (!map[r]) map[r] = [];
      map[r].push(m);
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([round, ms]) => ({ round: Number(round), matches: ms }));
  }, [bracketMatches]);

  if (bracketMatches.length === 0) {
    return (
      <TournamentEmptyPanel
        icon="🏆"
        title="No bracket matches generated yet"
        description="The bracket will appear once seeding finishes."
      />
    );
  }

  const totalRounds = rounds.length;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bracketScroll}>
      {rounds.map(({ round, matches: roundMatches }) => {
        const isFinal = round === totalRounds;
        return (
          <View key={`round-${round}`} style={s.bracketColumn}>
            <View style={[s.bracketRoundLabel, isFinal && s.bracketRoundLabelFinal]}>
              <Text style={[s.bracketRoundLabelText, isFinal && s.bracketRoundLabelTextFinal]}>
                {roundLabel(round, totalRounds)}
              </Text>
            </View>
            <View style={s.bracketColumnList}>
              {roundMatches.map((m) => (
                <BracketMatchCard key={m.id} match={m} playerMap={playerMap} isFinal={isFinal && roundMatches.length === 1} s={s} />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function BracketMatchCard({
  match,
  playerMap,
  isFinal,
  s,
}: {
  match: Match;
  playerMap: Record<string, PlayerLite>;
  isFinal?: boolean;
  s: Styles;
}) {
  const p1 = match.player1_id ? playerMap[match.player1_id] : undefined;
  const p2 = match.player2_id ? playerMap[match.player2_id] : undefined;
  const completed = isCompleted(match);
  const bye = isBye(match);
  const scores = matchScores(match);

  return (
    <View style={[s.bracketMatch, isFinal && s.bracketMatchFinal, bye && s.bracketMatchBye]}>
      <View style={[s.bracketSlot, completed && match.winner_id === match.player1_id && s.bracketSlotWinner]}>
        <Text style={s.bracketSeed}>{p1?.seed_rank || ''}</Text>
        <Text
          style={[s.bracketName, completed && match.winner_id === match.player1_id && s.bracketNameWinner]}
          numberOfLines={1}>
          {p1?.name || (bye ? 'BYE' : 'TBD')}
        </Text>
        {completed ? (
          <Text style={[s.bracketScore, match.winner_id === match.player1_id && s.bracketScoreWinner]}>{scores.p1}</Text>
        ) : null}
      </View>
      <View style={s.bracketDivider} />
      <View style={[s.bracketSlot, completed && match.winner_id === match.player2_id && s.bracketSlotWinner]}>
        <Text style={s.bracketSeed}>{p2?.seed_rank || ''}</Text>
        <Text
          style={[s.bracketName, completed && match.winner_id === match.player2_id && s.bracketNameWinner]}
          numberOfLines={1}>
          {p2?.name || (bye ? 'BYE' : 'TBD')}
        </Text>
        {completed ? (
          <Text style={[s.bracketScore, match.winner_id === match.player2_id && s.bracketScoreWinner]}>{scores.p2}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Bracket (Double Elim) ────────────────────────────────────────────────

export function DoubleElimBracketView({
  matches,
  players,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
}) {
  const s = useThemedStyles(makeStyles);
  const winners = matches.filter((m) => getBracket(m).toLowerCase() === 'winners');
  const losers = matches.filter((m) => getBracket(m).toLowerCase() === 'losers');
  const grand = matches.filter((m) => getBracket(m).toLowerCase() === 'grand_finals');
  if (winners.length + losers.length + grand.length === 0) {
    return (
      <TournamentEmptyPanel
        icon="🥊"
        title="Double elimination bracket"
        description="Brackets will appear once the phase starts."
      />
    );
  }
  return (
    <View style={s.section}>
      {winners.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={s.deBracketLabel}>WINNERS BRACKET</Text>
          <BracketView matches={winners} players={players} phase={undefined as unknown as TournamentPhase} />
        </View>
      ) : null}
      {losers.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={s.deBracketLabel}>LOSERS BRACKET</Text>
          <BracketView matches={losers} players={players} phase={undefined as unknown as TournamentPhase} />
        </View>
      ) : null}
      {grand.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={[s.deBracketLabel, { color: '#facc15' }]}>GRAND FINALS</Text>
          <BracketView matches={grand} players={players} phase={undefined as unknown as TournamentPhase} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Gauntlet ─────────────────────────────────────────────────────────────

export function GauntletView({
  matches,
  players,
}: {
  phase?: TournamentPhase;
  matches: Match[];
  players: Player[];
}) {
  const s = useThemedStyles(makeStyles);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const rungs = useMemo(() => {
    return matches
      .filter((m) => (m as unknown as { match_type?: string }).match_type === 'gauntlet' || true)
      .sort((a, b) => (Number(a.round_number) || 0) - (Number(b.round_number) || 0));
  }, [matches]);
  if (rungs.length === 0) {
    return (
      <TournamentEmptyPanel
        icon="⚔️"
        title="Gauntlet"
        description="Climb the ladder by beating the next rung up."
      />
    );
  }
  return (
    <View style={s.matchesList}>
      {rungs.map((m) => (
        <MatchRow key={m.id} match={m} playerMap={playerMap} showRound s={s} />
      ))}
    </View>
  );
}

// ─── Final Standings ──────────────────────────────────────────────────────

export function FinalStandingsView({
  tournament: _tournament,
  players,
}: {
  tournament: { id: string; placement_snapshots?: unknown };
  phases: TournamentPhase[];
  players: Player[];
  matches: Match[];
}) {
  const s = useThemedStyles(makeStyles);
  // Best-effort: rank by wins desc / losses asc / pumbility desc. The
  // server's placement_snapshots blob is the source of truth on desktop;
  // we read it when present, fall back to win-loss ordering otherwise.
  const ranked = useMemo(() => {
    const arr = [...players] as PlayerLite[];
    arr.sort((a, b) => {
      const aw = a.wins || 0;
      const bw = b.wins || 0;
      if (bw !== aw) return bw - aw;
      const al = a.losses || 0;
      const bl = b.losses || 0;
      if (al !== bl) return al - bl;
      return (b.pumbility || 0) - (a.pumbility || 0);
    });
    return arr;
  }, [players]);

  if (ranked.length === 0) {
    return <TournamentEmptyPanel icon="🏆" title="No final standings yet" />;
  }

  return (
    <View style={s.section}>
      <Text style={s.standingsTitle}>FINAL STANDINGS</Text>
      <View style={s.standingsCard}>
        {ranked.map((p, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
          return (
            <View key={p.id} style={[s.standingsRow, i < 3 && s.standingsRowPodium]}>
              <Text style={s.standingsRank}>{medal || `${i + 1}`}</Text>
              <Text style={s.standingsName} numberOfLines={1}>{p.name}</Text>
              <Text style={s.standingsWins}>{p.wins || 0}W</Text>
              <Text style={s.standingsLosses}>{p.losses || 0}L</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  section: { gap: 12 },
  matchesList: { gap: 8 },

  // Generic match row
  matchRow: {
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 4,
  },
  matchRowBye: { opacity: 0.45 },
  matchHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  matchHeadText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textDim },
  matchStatus: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1, color: t.textMuted },
  matchStatusBye: { color: t.textDim },

  playerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 6,
  },
  playerRowWinner: { backgroundColor: 'rgba(52, 211, 153, 0.10)' },
  seedText: { fontSize: 10, color: t.textDim, width: 18, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] },
  playerName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  playerNameWinner: { color: '#34d399', fontWeight: '900' as const },
  scoreText: { fontSize: 13, fontWeight: '800' as const, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  scoreTextWinner: { color: '#34d399' },

  // Round picker
  roundPicker: { gap: 6, paddingVertical: 4 },
  roundPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  roundPickerChipActive: { borderColor: t.accent, backgroundColor: t.accentTint },
  roundPickerText: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.5 },
  roundPickerTextActive: { color: t.accent },

  // Pools
  poolCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 10,
  },
  poolHeader: { fontSize: 10, fontWeight: '900' as const, color: t.accent, letterSpacing: 1.4 },
  poolStandings: { gap: 2 },
  poolStandingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
  },
  poolRank: { fontSize: 11, color: t.textMuted, width: 18, textAlign: 'center' as const, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  poolName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  poolWins: { fontSize: 11, color: '#34d399', fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  poolLosses: { fontSize: 11, color: t.danger, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  poolMatchList: {
    gap: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },

  // Bracket
  bracketScroll: { gap: 16, paddingHorizontal: 4, paddingVertical: 8 },
  bracketColumn: { width: 160, gap: 12, alignItems: 'stretch' as const },
  bracketRoundLabel: {
    alignSelf: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  bracketRoundLabelFinal: { borderColor: 'rgba(250, 204, 21, 0.45)', backgroundColor: 'rgba(250, 204, 21, 0.12)' },
  bracketRoundLabelText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textMuted, textTransform: 'uppercase' as const },
  bracketRoundLabelTextFinal: { color: '#facc15' },
  bracketColumnList: { gap: 12 },
  bracketMatch: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    overflow: 'hidden' as const,
  },
  bracketMatchFinal: { borderColor: 'rgba(250, 204, 21, 0.45)' },
  bracketMatchBye: { opacity: 0.4 },
  bracketDivider: { height: StyleSheet.hairlineWidth, backgroundColor: t.border },
  bracketSlot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  bracketSlotWinner: { backgroundColor: 'rgba(52, 211, 153, 0.10)' },
  bracketSeed: { fontSize: 9, color: t.textDim, width: 16, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] },
  bracketName: { flex: 1, fontSize: 12, fontWeight: '800' as const, color: t.text },
  bracketNameWinner: { color: '#34d399' },
  bracketScore: { fontSize: 11, color: t.textMuted, fontVariant: ['tabular-nums' as const], fontWeight: '800' as const },
  bracketScoreWinner: { color: '#34d399' },

  // Double elim wrapper
  deBracketBlock: { gap: 6 },
  deBracketLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textMuted },

  // Final standings
  standingsTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textMuted },
  standingsCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    padding: 6,
    gap: 2,
  },
  standingsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  standingsRowPodium: { backgroundColor: 'rgba(250, 204, 21, 0.06)' },
  standingsRank: { fontSize: 14, width: 28, textAlign: 'center' as const, fontWeight: '900' as const, color: t.text },
  standingsName: { flex: 1, fontSize: 13, fontWeight: '800' as const, color: t.text },
  standingsWins: { fontSize: 11, color: '#34d399', fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  standingsLosses: { fontSize: 11, color: t.danger, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
});
