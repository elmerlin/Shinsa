/**
 * Ports client/src/utils/tournamentPlacings.js to TypeScript for mobile.
 *
 * The desktop final-standings screen reads from `placement_snapshots`
 * (server-stored authoritative finishing order) and falls back to
 * algorithmic placings computed from the players + matches if the
 * snapshot is empty. We mirror that exactly so a finished tournament
 * shows the *real* podium order — round robin acts as seeding, the
 * gauntlet decides the winner.
 */

import type { Match, Player, TournamentPhase } from '@shared/api';

export interface Placing {
  rank: number;
  player_id: string;
  name: string;
  avatar: string;
  nationality: string;
  skill_title: string;
  pumbility: number;
  wins: number;
  losses: number;
  points: number;
  buchholz: number;
  seed_rank: number;
}

function toInt(value: unknown): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSnapshots(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getPlayerId(player: unknown): string {
  const p = player as { player_id?: string | number; id?: string | number };
  return String(p?.player_id || p?.id || '').trim();
}

function snapshotPlayer(player: Partial<Player>, rank: number): Placing {
  return {
    rank,
    player_id: getPlayerId(player),
    name: String((player as Player)?.name || 'Unknown').trim(),
    avatar: String(player?.avatar || '').trim(),
    nationality: String(player?.nationality || '').trim(),
    skill_title: String(player?.skill_title || '').trim(),
    pumbility: toInt(player?.pumbility),
    wins: toInt(player?.wins),
    losses: toInt(player?.losses),
    points: toNum(player?.points),
    buchholz: toNum((player as { buchholz?: unknown })?.buchholz),
    seed_rank: toInt(player?.seed_rank ?? (player as { seed?: number })?.seed),
  };
}

function isRoundRobinTieBreakerMatch(match: Match): boolean {
  if (!match || match.status !== 'COMPLETED') return false;
  if (!match.player1_id || !match.player2_id) return false;
  if (match.match_type === 'gauntlet' || match.match_type === 'hour_of_power') return false;
  if (match.bracket) return false;
  return true;
}

function compareRoundRobinRecord(a: Partial<Player>, b: Partial<Player>): number {
  const winDelta = toInt(b?.wins) - toInt(a?.wins);
  if (winDelta !== 0) return winDelta;
  const lossDelta = toInt(a?.losses) - toInt(b?.losses);
  if (lossDelta !== 0) return lossDelta;
  return 0;
}

function compareRoundRobinFallback(a: Partial<Player>, b: Partial<Player>): number {
  const pumbilityDelta = toInt(a?.pumbility) - toInt(b?.pumbility);
  if (pumbilityDelta !== 0) return pumbilityDelta;
  const seedDelta = toInt(a?.seed_rank ?? (a as { seed?: number })?.seed) - toInt(b?.seed_rank ?? (b as { seed?: number })?.seed);
  if (seedDelta !== 0) return seedDelta;
  return String(a?.name || '').localeCompare(String(b?.name || ''));
}

function buildHeadToHeadStats(tied: Partial<Player>[], matches: Match[] = []): Map<string, { wins: number; losses: number }> {
  const tiedIds = new Set(tied.map(getPlayerId).filter(Boolean));
  const stats = new Map<string, { wins: number; losses: number }>();
  tiedIds.forEach((id) => stats.set(id, { wins: 0, losses: 0 }));

  for (const m of matches) {
    if (!isRoundRobinTieBreakerMatch(m)) continue;
    const p1Id = String(m.player1_id || '');
    const p2Id = String(m.player2_id || '');
    if (!tiedIds.has(p1Id) || !tiedIds.has(p2Id)) continue;
    if (m.scores?.shared_win) {
      stats.get(p1Id)!.wins += 1;
      stats.get(p2Id)!.wins += 1;
      continue;
    }
    const winnerId = String(m.winner_id || '');
    if (!tiedIds.has(winnerId)) continue;
    const loserId = winnerId === p1Id ? p2Id : p1Id;
    stats.get(winnerId)!.wins += 1;
    stats.get(loserId)!.losses += 1;
  }
  return stats;
}

function sortTieGroup(group: Partial<Player>[], matches: Match[]): Partial<Player>[] {
  if (group.length <= 1) return group;
  const h2h = buildHeadToHeadStats(group, matches);
  return [...group].sort((a, b) => {
    const aS = h2h.get(getPlayerId(a)) || { wins: 0, losses: 0 };
    const bS = h2h.get(getPlayerId(b)) || { wins: 0, losses: 0 };
    const wd = bS.wins - aS.wins;
    if (wd !== 0) return wd;
    const ld = aS.losses - bS.losses;
    if (ld !== 0) return ld;
    return compareRoundRobinFallback(a, b);
  });
}

export function sortRoundRobinPlayers(players: Partial<Player>[] = [], matches: Match[] = []): Partial<Player>[] {
  const groups = new Map<string, Partial<Player>[]>();
  [...players]
    .filter((p) => getPlayerId(p))
    .forEach((p) => {
      const key = `${toInt(p?.wins)}:${toInt(p?.losses)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
  return [...groups.values()]
    .sort((a, b) => compareRoundRobinRecord(a[0], b[0]))
    .flatMap((g) => sortTieGroup(g, matches));
}

export function computeRoundRobinPlacings(players: Partial<Player>[] = [], matches: Match[] = []): Placing[] {
  return sortRoundRobinPlayers(players, matches).map((p, i) => snapshotPlayer(p, i + 1));
}

function rerankRoundRobinPlacings(entries: Placing[] = [], matches: Match[] = []): Placing[] {
  return sortRoundRobinPlayers(entries as unknown as Partial<Player>[], matches)
    .map((entry, i) => ({ ...(entry as unknown as Placing), rank: i + 1 }));
}

export function computeGauntletPlacings(players: Partial<Player>[] = [], matches: Match[] = []): Placing[] {
  const gauntletMatches = [...matches]
    .filter((m) => m?.match_type === 'gauntlet')
    .sort((a, b) => (toInt(a?.gauntlet_order)) - (toInt(b?.gauntlet_order)));

  if (gauntletMatches.length === 0) return [];
  if (gauntletMatches.some((m) => m?.status !== 'COMPLETED' || !m?.winner_id)) return [];

  const playerMap = new Map<string, Partial<Player>>();
  players.forEach((p) => {
    const id = getPlayerId(p);
    if (id) playerMap.set(id, p);
  });

  const allIds = [...new Set([
    ...players.map(getPlayerId).filter(Boolean),
    ...gauntletMatches.flatMap((m) => [m?.player1_id, m?.player2_id]).filter(Boolean) as string[],
  ])];
  const totalPlayers = allIds.length;

  const rankBy = new Map<string, number>();
  gauntletMatches.forEach((m, i) => {
    const order = toInt(m?.gauntlet_order) || i + 1;
    const loserId = m?.player1_id === m?.winner_id ? m?.player2_id : m?.player1_id;
    if (loserId) rankBy.set(String(loserId), Math.max(2, totalPlayers - order + 1));
  });
  const finalMatch = gauntletMatches[gauntletMatches.length - 1];
  if (finalMatch?.winner_id) rankBy.set(String(finalMatch.winner_id), 1);

  return [...rankBy.entries()]
    .map(([id, rank]) => {
      const p = playerMap.get(id);
      return p ? snapshotPlayer(p, rank) : null;
    })
    .filter((x): x is Placing => !!x)
    .sort((a, b) => a.rank - b.rank);
}

export interface TournamentPlacings {
  roundRobin: Placing[];
  gauntlet: Placing[];
  final: Placing[];
}

export function getTournamentPlacings({
  tournament,
  phases = [],
  players = [],
  matches = [],
}: {
  tournament: { placement_snapshots?: unknown } | null | undefined;
  phases?: TournamentPhase[];
  players?: Partial<Player>[];
  matches?: Match[];
}): TournamentPlacings {
  const tSnapshots = normalizeSnapshots(tournament?.placement_snapshots);
  const completed = phases.filter((p) => p?.status === 'COMPLETED');
  const latestRR = [...completed].reverse().find((p) => p?.format === 'round_robin');
  const latestGauntlet = [...completed].reverse().find((p) => p?.format === 'gauntlet');
  const latestCompleted = completed[completed.length - 1] || null;

  const rrPlacings = latestRR
    ? ((normalizeSnapshots(latestRR.placement_snapshots).placings as Placing[]) || [])
    : ((tSnapshots.round_robin as Placing[]) || []);
  const gauntletPlacings = latestGauntlet
    ? ((normalizeSnapshots(latestGauntlet.placement_snapshots).placings as Placing[]) || [])
    : ((tSnapshots.gauntlet as Placing[]) || []);
  const finalPlacings = latestCompleted
    ? ((normalizeSnapshots(latestCompleted.placement_snapshots).placings as Placing[]) || [])
    : ((tSnapshots.final as Placing[]) || []);

  const rrMatches = latestRR ? matches.filter((m) => (m as { phase_id?: string })?.phase_id === latestRR.id) : matches;
  const finalMatches = latestCompleted
    ? matches.filter((m) => (m as { phase_id?: string })?.phase_id === latestCompleted.id)
    : matches;

  const fallbackRR = computeRoundRobinPlacings(players, rrMatches);
  const fallbackG = computeGauntletPlacings(players, matches);

  const resolvedRR = rrPlacings.length > 0 ? rerankRoundRobinPlacings(rrPlacings, rrMatches) : fallbackRR;
  const resolvedG = gauntletPlacings.length > 0 ? gauntletPlacings : fallbackG;

  const finalIsRR = latestCompleted
    ? latestCompleted.format === 'round_robin' || latestCompleted.format === 'pools'
    : resolvedG.length === 0;
  const resolvedFinal = finalPlacings.length > 0
    ? (finalIsRR ? rerankRoundRobinPlacings(finalPlacings, finalMatches) : finalPlacings)
    : (resolvedG.length > 0 ? resolvedG : resolvedRR);

  return { roundRobin: resolvedRR, gauntlet: resolvedG, final: resolvedFinal };
}
