import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import {
  TournamentEmptyPanel,
  TournamentHero,
  TournamentPhaseRuleCard,
  TournamentPhaseTimeline,
  TournamentTabs,
  type TournamentTab,
} from '@/components/tournament/chrome';
import { TournamentDiscussion } from '@/components/tournament/discussion';
import {
  BracketView,
  DoubleElimBracketView,
  FinalStandingsView,
  GauntletView,
  PoolsView,
  RoundRobinView,
} from '@/components/tournament/format-views';
import { MatchDetailSheet } from '@/components/tournament/match-detail-sheet';
import { PlayerHistorySheet } from '@/components/tournament/player-history-sheet';
import { TournamentRoster } from '@/components/tournament/roster';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { tournamentsApi } from '@/lib/api';
import { FORMAT_ICONS, FORMAT_LABELS } from '@/lib/tournament-format';
import type { ThemeColors } from '@/constants/theme';
import type { Match, Player, TournamentPhase } from '@shared/api';

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = String(id || '');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [activeTab, setActiveTab] = useState<string>('');
  // Sheets — opened by taps on matches and players from anywhere on the
  // detail screen (format views, final standings, roster).
  const [matchTarget, setMatchTarget] = useState<Match | null>(null);
  const [playerTarget, setPlayerTarget] = useState<Player | null>(null);

  const tournamentQuery = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
    enabled: !!tournamentId,
  });
  const playersQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'players'],
    queryFn: () => tournamentsApi.players(tournamentId),
    enabled: !!tournamentId,
  });
  const matchesQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'matches'],
    queryFn: () => tournamentsApi.matches(tournamentId),
    enabled: !!tournamentId,
  });
  const phasesQuery = useQuery({
    queryKey: ['tournament', tournamentId, 'phases'],
    queryFn: () => tournamentsApi.phases(tournamentId),
    enabled: !!tournamentId,
    // Tolerate "no phases" for legacy tournaments — handled in tabs.
    retry: false,
  });

  const tournament = tournamentQuery.data;
  const players: Player[] = playersQuery.data ?? [];
  const matches: Match[] = matchesQuery.data ?? [];
  const phases: TournamentPhase[] = phasesQuery.data ?? [];

  const allPhasesComplete = phases.length > 0 && phases.every((p) => p.status === 'COMPLETED');
  const activePhase = phases.find((p) => p.status === 'ACTIVE');
  const completedPhasesCount = phases.filter((p) => p.status === 'COMPLETED').length;

  // Build the tabs: one per phase, then Players, optional Final, then Discussion.
  const tabs: TournamentTab[] = useMemo(() => {
    const out: TournamentTab[] = [];
    for (const p of phases) {
      out.push({
        key: `phase-${p.id}`,
        label: p.name || FORMAT_LABELS[p.format] || p.format,
        icon: FORMAT_ICONS[p.format] || '',
      });
    }
    out.push({
      key: 'players',
      label: 'Players',
      badge: players.length > 0 ? String(players.length) : undefined,
    });
    if (allPhasesComplete) out.push({ key: 'final', label: 'Final', icon: '🏆' });
    out.push({ key: 'discussion', label: 'Discussion', icon: '💬' });
    return out;
  }, [phases, players.length, allPhasesComplete]);

  // Pick a sensible default tab whenever the tabs list changes (mostly when
  // phases finish loading). Prefer the active phase, then the final tab,
  // then the first phase, then players.
  useEffect(() => {
    if (tabs.length === 0) return;
    if (activeTab && tabs.some((t) => t.key === activeTab)) return;
    if (activePhase) {
      setActiveTab(`phase-${activePhase.id}`);
      return;
    }
    if (allPhasesComplete) {
      setActiveTab('final');
      return;
    }
    if (phases.length > 0) {
      setActiveTab(`phase-${phases[0].id}`);
      return;
    }
    setActiveTab('players');
  }, [tabs, activeTab, activePhase, allPhasesComplete, phases]);

  if (!tournamentId) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}><Text style={s.bodyText}>Missing tournament id.</Text></View>
      </View>
    );
  }

  if (tournamentQuery.isLoading) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  if (tournamentQuery.isError || !tournament) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
        <View style={s.center}>
          <Text style={s.bodyText}>
            {tournamentQuery.error instanceof Error ? tournamentQuery.error.message : 'Tournament not found.'}
          </Text>
        </View>
      </View>
    );
  }

  const live = tournament.phase !== 'COMPLETED' && tournament.phase !== 'SETUP';

  // Stat strip surfaces the most useful at-a-glance numbers — same lines
  // the desktop hero uses.
  const stats: string[] = [];
  stats.push(`${players.length} player${players.length === 1 ? '' : 's'}`);
  if (phases.length > 0) {
    stats.push(`${completedPhasesCount}/${phases.length} stages complete`);
    if (activePhase) stats.push(`${activePhase.name || FORMAT_LABELS[activePhase.format]} live`);
  } else if (typeof tournament.current_round === 'number' && tournament.current_round > 0) {
    stats.push(`Round ${tournament.current_round}/${tournament.total_rounds || '?'}`);
  }

  // The phase whose tab is currently selected, if any.
  const currentPhase = phases.find((p) => `phase-${p.id}` === activeTab);
  const phaseMatches = currentPhase
    ? matches.filter((m) => (m as unknown as { phase_id?: string }).phase_id === currentPhase.id)
    : [];

  // Tournament-wide count of gauntlet matches — used to label the last
  // rung as "Final" in MatchDetailSheet / PlayerHistorySheet.
  const totalGauntletMatches = useMemo(
    () => matches.filter((m) => m.match_type === 'gauntlet').length,
    [matches],
  );

  return (
    <View style={s.container}>
      <Stack.Screen options={{ title: tournament.name || 'Tournament' }} />
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}><TopBar /></View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}>
        <TournamentHero
          tournament={tournament}
          live={live}
          stats={stats}
          flow={phases.length > 0 ? <TournamentPhaseTimeline phases={phases} /> : undefined}
        />

        {tabs.length > 0 ? (
          <TournamentTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        ) : null}

        {/* Tab content */}
        {activeTab === 'players' && (
          <TournamentRoster
            players={players}
            onPlayerPress={(p) => setPlayerTarget(p)}
          />
        )}

        {activeTab === 'final' && allPhasesComplete && (
          <FinalStandingsView
            tournament={tournament}
            phases={phases}
            players={players}
            matches={matches}
            onPlayerPress={(p) => setPlayerTarget(p)}
          />
        )}

        {activeTab === 'discussion' && (
          <TournamentDiscussion tournamentId={tournamentId} />
        )}

        {currentPhase ? (
          <View style={{ gap: 12 }}>
            <TournamentPhaseRuleCard phase={currentPhase} />
            {currentPhase.format === 'round_robin' && (
              <RoundRobinView phase={currentPhase} matches={phaseMatches} players={players} onMatchPress={setMatchTarget} />
            )}
            {currentPhase.format === 'pools' && (
              <PoolsView phase={currentPhase} matches={phaseMatches} players={players} onMatchPress={setMatchTarget} />
            )}
            {currentPhase.format === 'single_elim' && (
              <BracketView phase={currentPhase} matches={phaseMatches} players={players} onMatchPress={setMatchTarget} />
            )}
            {currentPhase.format === 'double_elim' && (
              <DoubleElimBracketView phase={currentPhase} matches={phaseMatches} players={players} onMatchPress={setMatchTarget} />
            )}
            {currentPhase.format === 'gauntlet' && (
              <GauntletView phase={currentPhase} matches={phaseMatches} players={players} onMatchPress={setMatchTarget} />
            )}
            {(currentPhase.format === 'hour_of_power' || currentPhase.format === 'b15') && (
              <TournamentEmptyPanel
                icon={FORMAT_ICONS[currentPhase.format]}
                title={FORMAT_LABELS[currentPhase.format]}
                description="Scores are tracked through live sync during the session."
              />
            )}
          </View>
        ) : null}

        {/* Legacy tournaments (no phases): fall back to a flat matches +
            standings view so old data still renders something sensible. */}
        {phases.length === 0 && activeTab !== 'players' && activeTab !== 'final' && activeTab !== 'discussion' ? (
          <View style={{ gap: 12 }}>
            <TournamentRoster players={players} onPlayerPress={(p) => setPlayerTarget(p)} />
            {matches.length > 0 ? (
              <RoundRobinView
                phase={{ id: 'legacy', tournament_id: tournamentId, phase_order: 1, format: 'round_robin', status: 'ACTIVE' }}
                matches={matches}
                players={players}
                onMatchPress={setMatchTarget}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <MatchDetailSheet
        visible={!!matchTarget}
        match={matchTarget}
        players={players}
        totalGauntletMatches={totalGauntletMatches}
        onClose={() => setMatchTarget(null)}
      />
      <PlayerHistorySheet
        visible={!!playerTarget}
        player={playerTarget}
        players={players}
        matches={matches}
        onClose={() => setPlayerTarget(null)}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scroll: { padding: 14, gap: 14 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  bodyText: { color: t.textMuted, fontSize: 13 },
});
