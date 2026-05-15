import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { fullImageUrl } from '@/lib/images';
import { getTournamentPlacings, type Placing } from '@/lib/tournament-placings';
import type { ThemeColors } from '@/constants/theme';
import type { Match, Player, Tournament, TournamentPhase } from '@shared/api';
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
 * both players, their scores, and highlights the winner. Tappable when an
 * `onPress` is provided — opens MatchDetailSheet upstream.
 */
function MatchRow({
  match,
  playerMap,
  showRound,
  onPress,
  s,
}: {
  match: Match;
  playerMap: Record<string, PlayerLite>;
  showRound?: boolean;
  onPress?: (match: Match) => void;
  s: Styles;
}) {
  const p1 = match.player1_id ? playerMap[match.player1_id] : undefined;
  const p2 = match.player2_id ? playerMap[match.player2_id] : undefined;
  const scores = matchScores(match);
  const completed = isCompleted(match);
  const bye = isBye(match);
  const winnerId = match.winner_id;
  const songCount = match.played_songs?.length || 0;

  const diffParts: string[] = [];
  if (typeof match.difficulty_min === 'number') {
    diffParts.push(
      match.difficulty_min === match.difficulty_max
        ? `Lv ${match.difficulty_min}`
        : `Lv ${match.difficulty_min}–${match.difficulty_max ?? ''}`,
    );
  }

  const isTappable = !bye && completed && !!onPress;

  return (
    <Pressable
      onPress={() => isTappable && onPress?.(match)}
      disabled={!isTappable}
      style={({ pressed }) => [s.matchRow, bye && s.matchRowBye, pressed && isTappable && { opacity: 0.85 }]}>
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
        {completed && songCount > 0 ? (
          <Text style={s.matchSongs}>{songCount} song{songCount === 1 ? '' : 's'} ›</Text>
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
    </Pressable>
  );
}

// ─── Round Robin ──────────────────────────────────────────────────────────

export function RoundRobinView({
  phase: _phase,
  matches,
  players,
  onMatchPress,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
  onMatchPress?: (match: Match) => void;
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
          <MatchRow key={m.id} match={m} playerMap={playerMap} onPress={onMatchPress} s={s} />
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
  onMatchPress,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
  onMatchPress?: (match: Match) => void;
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
                <MatchRow key={m.id} match={m} playerMap={playerMap} onPress={onMatchPress} s={s} />
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
  onMatchPress,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
  onMatchPress?: (match: Match) => void;
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
                <BracketMatchCard
                  key={m.id}
                  match={m}
                  playerMap={playerMap}
                  isFinal={isFinal && roundMatches.length === 1}
                  onPress={onMatchPress}
                  s={s}
                />
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
  onPress,
  s,
}: {
  match: Match;
  playerMap: Record<string, PlayerLite>;
  isFinal?: boolean;
  onPress?: (match: Match) => void;
  s: Styles;
}) {
  const p1 = match.player1_id ? playerMap[match.player1_id] : undefined;
  const p2 = match.player2_id ? playerMap[match.player2_id] : undefined;
  const completed = isCompleted(match);
  const bye = isBye(match);
  const scores = matchScores(match);
  const isTappable = !bye && completed && !!onPress;

  return (
    <Pressable
      onPress={() => isTappable && onPress?.(match)}
      disabled={!isTappable}
      style={({ pressed }) => [s.bracketMatch, isFinal && s.bracketMatchFinal, bye && s.bracketMatchBye, pressed && isTappable && { opacity: 0.85 }]}>
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
    </Pressable>
  );
}

// ─── Bracket (Double Elim) ────────────────────────────────────────────────

export function DoubleElimBracketView({
  matches,
  players,
  onMatchPress,
}: {
  phase: TournamentPhase;
  matches: Match[];
  players: Player[];
  onMatchPress?: (match: Match) => void;
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
  const placeholderPhase = undefined as unknown as TournamentPhase;
  return (
    <View style={s.section}>
      {winners.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={s.deBracketLabel}>WINNERS BRACKET</Text>
          <BracketView matches={winners} players={players} phase={placeholderPhase} onMatchPress={onMatchPress} />
        </View>
      ) : null}
      {losers.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={s.deBracketLabel}>LOSERS BRACKET</Text>
          <BracketView matches={losers} players={players} phase={placeholderPhase} onMatchPress={onMatchPress} />
        </View>
      ) : null}
      {grand.length > 0 ? (
        <View style={s.deBracketBlock}>
          <Text style={[s.deBracketLabel, { color: '#facc15' }]}>GRAND FINALS</Text>
          <BracketView matches={grand} players={players} phase={placeholderPhase} onMatchPress={onMatchPress} />
        </View>
      ) : null}
    </View>
  );
}

// ─── Gauntlet ─────────────────────────────────────────────────────────────

export function GauntletView({
  matches,
  players,
  onMatchPress,
}: {
  phase?: TournamentPhase;
  matches: Match[];
  players: Player[];
  onMatchPress?: (match: Match) => void;
}) {
  const s = useThemedStyles(makeStyles);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const rungs = useMemo(() => {
    return [...matches]
      .filter((m) => m.match_type === 'gauntlet')
      .sort((a, b) => (Number(a.gauntlet_order) || 0) - (Number(b.gauntlet_order) || 0));
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
      {rungs.map((m, i) => {
        const isFinal = i === rungs.length - 1;
        return (
          <View key={m.id} style={isFinal ? s.gauntletFinalWrap : undefined}>
            {isFinal ? <Text style={s.gauntletFinalLabel}>🏆 FINAL</Text> : null}
            <MatchRow match={m} playerMap={playerMap} showRound onPress={onMatchPress} s={s} />
          </View>
        );
      })}
    </View>
  );
}

// ─── Final Standings ──────────────────────────────────────────────────────

/**
 * Final standings using the same placings algorithm as desktop. RR is
 * shown as seeding, the gauntlet decides the actual final order. Both
 * panels are rendered so the viewer can see how RR feeds the gauntlet.
 * Each row is tappable — the orchestrator opens PlayerHistorySheet.
 */
export function FinalStandingsView({
  tournament,
  phases,
  players,
  matches,
  onPlayerPress,
}: {
  tournament: Tournament;
  phases: TournamentPhase[];
  players: Player[];
  matches: Match[];
  onPlayerPress?: (player: Player) => void;
}) {
  const s = useThemedStyles(makeStyles);
  const placings = useMemo(
    () => getTournamentPlacings({ tournament, phases, players, matches }),
    [tournament, phases, players, matches],
  );
  const playerMap = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  if (placings.final.length === 0 && placings.roundRobin.length === 0 && placings.gauntlet.length === 0) {
    return <TournamentEmptyPanel icon="🏆" title="No final standings yet" />;
  }

  const podiumEntries = placings.final.slice(0, 3);
  const handlePlayerPress = (placing: Placing) => {
    if (!onPlayerPress) return;
    const player = playerMap[placing.player_id];
    if (player) onPlayerPress(player);
  };

  return (
    <View style={s.section}>
      {podiumEntries.length > 0 ? (
        <View style={s.podiumRow}>
          {[1, 0, 2].map((slotIndex) => {
            const entry = podiumEntries[slotIndex];
            if (!entry) return <View key={`p-${slotIndex}`} style={{ flex: 1 }} />;
            const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉';
            const isChampion = entry.rank === 1;
            const avatar = entry.avatar ? fullImageUrl(entry.avatar) : undefined;
            return (
              <Pressable
                key={entry.player_id}
                onPress={() => handlePlayerPress(entry)}
                disabled={!onPlayerPress}
                style={({ pressed }) => [
                  s.podiumCard,
                  isChampion && s.podiumCardChampion,
                  pressed && onPlayerPress && { opacity: 0.85 },
                ]}>
                <Text style={s.podiumMedal}>{medal}</Text>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={[s.podiumAvatar, isChampion && s.podiumAvatarChampion]} contentFit="cover" />
                ) : (
                  <View style={[s.podiumAvatar, isChampion && s.podiumAvatarChampion, s.podiumAvatarFallback]}>
                    <Text style={s.podiumAvatarLetter}>{(entry.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={s.podiumName} numberOfLines={1}>{entry.name}</Text>
                {entry.skill_title ? (
                  <Text style={s.podiumSkill} numberOfLines={1}>{entry.skill_title}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {placings.gauntlet.length > 0 ? (
        <StandingsPanel
          title="GAUNTLET — FINAL ORDER"
          rightLabel="RESULT"
          placings={placings.gauntlet}
          variant="gauntlet"
          onPlayerPress={onPlayerPress ? handlePlayerPress : undefined}
          s={s}
        />
      ) : null}

      {placings.roundRobin.length > 0 ? (
        <StandingsPanel
          title="ROUND ROBIN — SEEDING"
          rightLabel="RECORD"
          placings={placings.roundRobin}
          variant="roundRobin"
          onPlayerPress={onPlayerPress ? handlePlayerPress : undefined}
          s={s}
        />
      ) : null}

      {placings.final.length > 0 && placings.gauntlet.length === 0 && placings.roundRobin.length === 0 ? (
        <StandingsPanel
          title="FINAL STANDINGS"
          rightLabel="RECORD"
          placings={placings.final}
          variant="roundRobin"
          onPlayerPress={onPlayerPress ? handlePlayerPress : undefined}
          s={s}
        />
      ) : null}
    </View>
  );
}

function StandingsPanel({
  title,
  rightLabel,
  placings,
  variant,
  onPlayerPress,
  s,
}: {
  title: string;
  rightLabel: string;
  placings: Placing[];
  variant: 'roundRobin' | 'gauntlet';
  onPlayerPress?: (placing: Placing) => void;
  s: Styles;
}) {
  return (
    <View style={s.standingsBlock}>
      <Text style={s.standingsBlockTitle}>{title}</Text>
      <View style={s.standingsCard}>
        <View style={s.standingsHeaderRow}>
          <Text style={[s.standingsHeaderCell, { width: 32 }]}>#</Text>
          <Text style={[s.standingsHeaderCell, { flex: 1 }]}>PLAYER</Text>
          <Text style={[s.standingsHeaderCell, { textAlign: 'right' as const, minWidth: 64 }]}>
            {rightLabel}
          </Text>
        </View>
        {placings.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : null;
          const avatar = p.avatar ? fullImageUrl(p.avatar) : undefined;
          const right = variant === 'roundRobin'
            ? `${p.wins}W · ${p.losses}L`
            : p.rank === 1 ? 'Champion' : p.rank === 2 ? 'Runner-up' : p.rank === 3 ? 'Third place' : `Placed ${p.rank}`;
          return (
            <Pressable
              key={p.player_id}
              onPress={() => onPlayerPress?.(p)}
              disabled={!onPlayerPress}
              style={({ pressed }) => [
                s.standingsRow,
                p.rank <= 3 && s.standingsRowPodium,
                pressed && onPlayerPress && { opacity: 0.85 },
              ]}>
              <Text style={[s.standingsRank, { width: 32 }]}>{medal || p.rank}</Text>
              <View style={[s.standingsPlayerCell]}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={s.standingsAvatar} contentFit="cover" />
                ) : (
                  <View style={[s.standingsAvatar, s.standingsAvatarFallback]}>
                    <Text style={s.standingsAvatarLetter}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={s.standingsName} numberOfLines={1}>{p.name}</Text>
              </View>
              <Text style={[s.standingsRight, { minWidth: 64 }]} numberOfLines={1}>{right}</Text>
            </Pressable>
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

  // Match row "songs ›" hint that the match is tappable
  matchSongs: { fontSize: 9, fontWeight: '900' as const, color: t.accent, letterSpacing: 0.6 },

  // Gauntlet final emphasis
  gauntletFinalWrap: {
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.45)',
    backgroundColor: 'rgba(250, 204, 21, 0.06)',
    gap: 4,
  },
  gauntletFinalLabel: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: '#facc15',
    letterSpacing: 1.4,
    paddingHorizontal: 6,
    paddingTop: 4,
  },

  // Final standings podium row (gold/silver/bronze cards across the top)
  podiumRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
  },
  podiumCard: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    alignItems: 'center' as const,
    gap: 4,
  },
  podiumCardChampion: {
    borderColor: 'rgba(250, 204, 21, 0.55)',
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    paddingTop: 16,
    paddingBottom: 14,
  },
  podiumMedal: { fontSize: 26 },
  podiumAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.surfaceMuted,
  },
  podiumAvatarChampion: { width: 52, height: 52, borderRadius: 26 },
  podiumAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumAvatarLetter: { fontSize: 16, fontWeight: '900' as const, color: t.accent },
  podiumName: { fontSize: 12, fontWeight: '900' as const, color: t.text, textAlign: 'center' as const },
  podiumSkill: { fontSize: 10, color: t.textDim, textAlign: 'center' as const },

  // Standings panel (gauntlet final / round-robin seeding)
  standingsBlock: { gap: 8 },
  standingsBlockTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textMuted },
  standingsCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
    overflow: 'hidden' as const,
  },
  standingsHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  standingsHeaderCell: { fontSize: 9, letterSpacing: 1.4, color: t.textDim, fontWeight: '900' as const },
  standingsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  standingsRowPodium: { backgroundColor: 'rgba(250, 204, 21, 0.05)' },
  standingsRank: { fontSize: 14, textAlign: 'center' as const, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  standingsPlayerCell: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minWidth: 0 },
  standingsAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.surfaceMuted },
  standingsAvatarFallback: {
    backgroundColor: t.accentTint,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  standingsAvatarLetter: { fontSize: 11, fontWeight: '900' as const, color: t.accent },
  standingsName: { flex: 1, fontSize: 13, fontWeight: '800' as const, color: t.text },
  standingsRight: { fontSize: 11, fontWeight: '800' as const, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
});
