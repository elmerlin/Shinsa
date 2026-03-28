import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getTournament, getPlayers, getMatches, getPhases,
  generateRoundRobin, generateGauntlet,
  activatePhase, completePhase, generatePhaseMatches,
} from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS } from '../utils/tournamentConstants';
import { useToast } from '../contexts/ToastContext';
import PlayerRegistration from '../components/PlayerRegistration';
import SwissRound from '../components/SwissRound';
import Standings from '../components/Standings';
import Gauntlet from '../components/Gauntlet';
import FinalStandings from '../components/FinalStandings';
import PoolsView from '../components/tournament/PoolsView';
import BracketView from '../components/tournament/BracketView';
import DoubleElimBracketView from '../components/tournament/DoubleElimBracketView';
import PhaseTransition from '../components/tournament/PhaseTransition';
import TournamentSkeleton from '../components/tournament/TournamentSkeleton';
import {
  TournamentCallout,
  TournamentEmptyPanel,
  TournamentHero,
  TournamentPhaseRuleCard,
  TournamentPhaseTimeline,
  TournamentTabs,
} from '../components/tournament/TournamentChrome';

// Legacy phase tabs for old tournaments without the phase system
const LEGACY_PHASE_TABS = {
  SETUP: ['players'],
  ROUND_ROBIN: ['rounds', 'standings', 'players'],
  GAUNTLET: ['gauntlet', 'rounds', 'standings', 'players'],
  COMPLETED: ['final', 'rounds', 'gauntlet', 'standings', 'players'],
};

export default function TournamentView() {
  const { id } = useParams();
  const { addToast } = useToast();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [phases, setPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(null);
  const [showTransition, setShowTransition] = useState(null);

  const isPhaseMode = phases.length > 0;

  const loadData = useCallback(async () => {
    try {
      const [t, p, m] = await Promise.all([
        getTournament(id),
        getPlayers(id),
        getMatches(id),
      ]);
      setTournament(t);
      setPlayers(p);
      setMatches(m);

      // Load phases
      let loadedPhases = [];
      try {
        const ph = await getPhases(id);
        loadedPhases = Array.isArray(ph) ? ph : [];
        setPhases(loadedPhases);
      } catch {
        loadedPhases = [];
        setPhases([]);
      }

      if (!activeTab) {
        if (loadedPhases.length > 0) {
          const activePhase = loadedPhases.find((phase) => phase.status === 'ACTIVE');
          const allPhasesComplete = loadedPhases.every((phase) => phase.status === 'COMPLETED');
          if (activePhase) setActiveTab(`phase-${activePhase.id}`);
          else if (allPhasesComplete) setActiveTab('final');
          else if (t.phase === 'SETUP') setActiveTab('players');
          else setActiveTab(`phase-${loadedPhases[0].id}`);
        } else {
          const tabs = LEGACY_PHASE_TABS[t.phase] || ['players'];
          setActiveTab(tabs[0]);
        }
      }
      if (t.current_round > 0 && !selectedRound) {
        setSelectedRound(t.current_round);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, activeTab, selectedRound]);

  useEffect(() => { loadData(); }, [id]);

  // Auto-refresh every 15 seconds when tournament is active
  useEffect(() => {
    if (!tournament || tournament.phase === 'COMPLETED' || tournament.phase === 'SETUP') return;
    const interval = setInterval(() => {
      loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, [tournament?.phase, loadData]);

  useEffect(() => {
    if (!tournament || !isPhaseMode) return;

    const allPhasesComplete = phases.length > 0 && phases.every((phase) => phase.status === 'COMPLETED');
    const validTabs = phases.map((phase) => `phase-${phase.id}`);
    validTabs.push('players');
    if (allPhasesComplete) validTabs.push('final');

    const activePhase = phases.find((phase) => phase.status === 'ACTIVE');
    if (activePhase && (!activeTab || activeTab === 'players')) {
      setActiveTab(`phase-${activePhase.id}`);
      return;
    }
    if (activeTab && validTabs.includes(activeTab)) return;
    if (activePhase) {
      setActiveTab(`phase-${activePhase.id}`);
      return;
    }
    if (allPhasesComplete) {
      setActiveTab('final');
      return;
    }
    if (tournament.phase === 'SETUP') {
      setActiveTab('players');
      return;
    }
    setActiveTab(validTabs[0] || 'players');
  }, [activeTab, isPhaseMode, phases, tournament]);

  // Legacy handlers
  const handleStartRound = async () => {
    if (players.length < 2) return addToast('Need at least 2 players', 'error');
    try {
      await generateRoundRobin(id);
      await loadData();
      setActiveTab('rounds');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleNextRound = async () => {
    try {
      await generateRoundRobin(id);
      await loadData();
      setSelectedRound((tournament?.current_round || 0) + 1);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleStartGauntlet = async () => {
    try {
      await generateGauntlet(id);
      await loadData();
      setActiveTab('gauntlet');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Phase-mode handlers
  const handleActivatePhase = async (phase) => {
    try {
      setShowTransition({ name: phase.name, format: phase.format });
      await activatePhase(phase.id);
      await loadData();
      setActiveTab(`phase-${phase.id}`);
    } catch (err) {
      addToast(err.message, 'error');
      setShowTransition(null);
    }
  };

  const handleGeneratePhaseMatches = async (phase) => {
    try {
      await generatePhaseMatches(phase.id);
      await loadData();
      addToast('Matches generated', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleCompletePhase = async (phase) => {
    try {
      await completePhase(phase.id);
      await loadData();
      addToast(`${phase.name || FORMAT_LABELS[phase.format]} complete!`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) return <TournamentSkeleton />;
  if (!tournament) return <div className="text-center py-20 text-red-400">Tournament not found</div>;

  const config = tournament.config || {};

  // ── Phase-mode rendering ──
  if (isPhaseMode) {
    const activePhase = phases.find(p => p.status === 'ACTIVE');
    const completedPhases = phases.filter(p => p.status === 'COMPLETED');
    const pendingPhases = phases.filter(p => p.status === 'PENDING');
    const nextPending = pendingPhases[0];
    const allPhasesComplete = phases.every(p => p.status === 'COMPLETED');

    // Build tabs: one per phase + players + final
    const phaseTabs = phases.map(p => ({
      key: `phase-${p.id}`,
      label: p.name || FORMAT_LABELS[p.format] || p.format,
      icon: FORMAT_ICONS[p.format] || '',
      phase: p,
      status: p.status,
    }));
    phaseTabs.push({ key: 'players', label: 'Players', icon: '', phase: null, status: null });
    if (allPhasesComplete) {
      phaseTabs.push({ key: 'final', label: 'Final', icon: '\u{1F3C6}', phase: null, status: null });
    }

    const currentTabPhase = phaseTabs.find(t => t.key === activeTab)?.phase;
    const phaseMatches = currentTabPhase
      ? matches.filter(m => m.phase_id === currentTabPhase.id)
      : [];

    const phaseAllDone = phaseMatches.length > 0 && phaseMatches.every(m => m.status === 'COMPLETED' || m.status === 'BYE');

    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {showTransition && (
          <PhaseTransition
            phaseName={showTransition.name}
            phaseFormat={showTransition.format}
            onComplete={() => setShowTransition(null)}
          />
        )}

        <div className="mb-4 sm:mb-6">
          <TournamentHero
            tournament={tournament}
            statusLabel={activePhase ? (FORMAT_LABELS[activePhase.format] || activePhase.format) : tournament.phase}
            live={tournament.phase !== 'COMPLETED' && tournament.phase !== 'SETUP'}
            stats={[
              `${players.length} players`,
              `${completedPhases.length}/${phases.length} done`,
              activePhase ? `${activePhase.name || FORMAT_LABELS[activePhase.format]} live` : 'Waiting to start',
            ]}
            flow={<TournamentPhaseTimeline phases={phases} />}
          />
        </div>

        {/* Phase Controls */}
        {tournament.phase === 'SETUP' && !activePhase && pendingPhases.length > 0 && (
          <TournamentCallout
            className="mb-6"
            eyebrow="Setup"
            title={`Start ${nextPending.name || FORMAT_LABELS[nextPending.format]}?`}
            description={`${players.length} players ready.`}
            primaryAction={(
              <button onClick={() => handleActivatePhase(nextPending)} className="btn-primary" disabled={players.length < 2}>
                Start {nextPending.name || FORMAT_LABELS[nextPending.format]}
              </button>
            )}
          />
        )}

        {activePhase && phaseAllDone && nextPending && (
          <TournamentCallout
            className="mb-6"
            tone="success"
            eyebrow="Phase Complete"
            title={`${activePhase.name || FORMAT_LABELS[activePhase.format]} complete`}
            description={`Next: ${nextPending.name || FORMAT_LABELS[nextPending.format]}.`}
            secondaryAction={(
              <button onClick={() => handleCompletePhase(activePhase)} className="btn-secondary text-sm">
                Finalize
              </button>
            )}
            primaryAction={(
              <button onClick={async () => { await handleCompletePhase(activePhase); await handleActivatePhase(nextPending); }} className="btn-primary">
                Advance to {nextPending.name || FORMAT_LABELS[nextPending.format]}
              </button>
            )}
          />
        )}

        {activePhase && phaseAllDone && !nextPending && tournament.phase !== 'COMPLETED' && (
          <TournamentCallout
            className="mb-6"
            tone="gold"
            eyebrow="Final Step"
            title="Final phase complete"
            description="Lock standings and finish the tournament."
            primaryAction={(
              <button onClick={() => handleCompletePhase(activePhase)} className="btn-primary">
                Complete Tournament
              </button>
            )}
          />
        )}

        {activePhase && phaseMatches.length === 0 && activeTab === `phase-${activePhase.id}` && (
          <TournamentCallout
            className="mb-6"
            eyebrow="Match Queue"
            title="Generate matches"
            description="This phase is live but has no matches yet."
            primaryAction={(
              <button onClick={() => handleGeneratePhaseMatches(activePhase)} className="btn-primary">
                Generate Matches
              </button>
            )}
          />
        )}

        <TournamentTabs tabs={phaseTabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4 sm:mb-6" />

        {/* Tab Content */}
        {activeTab === 'players' && (
          <PlayerRegistration
            tournamentId={id}
            players={players}
            isSetup={tournament.phase === 'SETUP'}
            onUpdate={loadData}
          />
        )}

        {activeTab === 'final' && (
          <FinalStandings
            players={players}
            matches={matches}
            config={config}
          />
        )}

        {currentTabPhase && (
          <div>
            <TournamentPhaseRuleCard phase={currentTabPhase} className="mb-4" />

            {currentTabPhase.format === 'round_robin' && (
              <SwissRound
                round={selectedRound || 1}
                matches={phaseMatches.filter(m => m.round_number === (selectedRound || 1))}
                players={players}
                config={currentTabPhase.config || {}}
                onUpdate={loadData}
                tournamentId={id}
              />
            )}

            {currentTabPhase.format === 'pools' && (
              <PoolsView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={loadData}
              />
            )}

            {currentTabPhase.format === 'single_elim' && (
              <BracketView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={loadData}
              />
            )}

            {currentTabPhase.format === 'double_elim' && (
              <DoubleElimBracketView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={loadData}
              />
            )}

            {currentTabPhase.format === 'gauntlet' && (
              <Gauntlet
                matches={phaseMatches.length > 0 ? phaseMatches : matches}
                players={players}
                onUpdate={loadData}
              />
            )}

            {(currentTabPhase.format === 'hour_of_power' || currentTabPhase.format === 'b15') && (
              <TournamentEmptyPanel
                icon={FORMAT_ICONS[currentTabPhase.format]}
                title={FORMAT_LABELS[currentTabPhase.format]}
                description="Scores are tracked through live sync during the session."
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Legacy rendering (old tournaments without phases) ──
  const hasGauntlet = config.gauntlet_enabled;
  const gauntletMatches = matches.filter(m => m.match_type === 'gauntlet');
  const hasGauntletMatches = gauntletMatches.length > 0;
  let tabs = LEGACY_PHASE_TABS[tournament.phase] || ['players'];
  if (!hasGauntletMatches) tabs = tabs.filter(t => t !== 'gauntlet');
  if (tournament.phase !== 'COMPLETED') tabs = tabs.filter(t => t !== 'final');

  const currentRound = tournament.current_round;
  const totalRounds = tournament.total_rounds || 3;
  const allRoundsDone = currentRound >= totalRounds;
  const currentRoundMatches = matches.filter(m => m.round_number === currentRound);
  const allCurrentDone = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.status === 'COMPLETED');
  const displayRound = selectedRound || currentRound;
  const displayMatches = matches.filter(m => m.round_number === displayRound);
  const playerCount = players.length;
  const matchesPerRound = playerCount > 1 ? (playerCount * (playerCount - 1)) / 2 : 0;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="mb-4 sm:mb-6">
        <TournamentHero
          tournament={tournament}
          statusLabel={
            tournament.phase === 'ROUND_ROBIN' ? 'Round Robin'
              : tournament.phase === 'GAUNTLET' ? 'Gauntlet'
                : tournament.phase
          }
          live={tournament.phase !== 'COMPLETED' && tournament.phase !== 'SETUP'}
          stats={[
            `${players.length} players`,
            currentRound > 0 ? `Round ${currentRound}/${totalRounds}` : 'Setup mode',
            matchesPerRound > 0 ? `${matchesPerRound} matches per round` : 'Add players to begin',
          ]}
        />
      </div>

      {/* Phase controls */}
      {tournament.phase === 'SETUP' && (
        <TournamentCallout
          className="mb-6"
          eyebrow="Setup"
          title="Start round robin?"
          description={`${players.length} players, ${matchesPerRound} matches per round.`}
          primaryAction={(
            <button onClick={handleStartRound} className="btn-primary" disabled={players.length < 2}>
              Start Round 1
            </button>
          )}
        />
      )}

      {tournament.phase === 'ROUND_ROBIN' && allCurrentDone && !allRoundsDone && (
        <TournamentCallout
          className="mb-6"
          tone="success"
          eyebrow="Round Complete"
          title={`Round ${currentRound} complete`}
          description={`${currentRoundMatches.length} matches finished.`}
          primaryAction={(
            <button onClick={handleNextRound} className="btn-primary">
              Start Round {currentRound + 1}
            </button>
          )}
        />
      )}

      {tournament.phase === 'ROUND_ROBIN' && allRoundsDone && allCurrentDone && config.gauntlet_enabled && (
        <TournamentCallout
          className="mb-6"
          eyebrow="Next Format"
          title="Round robin complete"
          description="The tournament is ready for gauntlet."
          primaryAction={(
            <button onClick={handleStartGauntlet} className="btn-primary">
              Start Gauntlet
            </button>
          )}
        />
      )}

      {tournament.phase === 'ROUND_ROBIN' && allRoundsDone && allCurrentDone && !config.gauntlet_enabled && (
        <TournamentCallout
          className="mb-6"
          tone="gold"
          eyebrow="Tournament Complete"
          title="All rounds are finished"
          description="Check standings for the final result."
        />
      )}

      <TournamentTabs
        className="mb-4 sm:mb-6"
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={tabs.map((tab) => ({
          key: tab,
          label: tab === 'rounds' ? `Rounds (${currentRound})` : tab === 'final' ? 'Final' : tab.charAt(0).toUpperCase() + tab.slice(1),
        }))}
      />

      {/* Tab Content */}
      {activeTab === 'players' && (
        <PlayerRegistration
          tournamentId={id}
          players={players}
          isSetup={tournament.phase === 'SETUP'}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'rounds' && (
        <div className="space-y-6">
          {currentRound > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Array.from({ length: currentRound }, (_, i) => i + 1).map(r => {
                const rMatches = matches.filter(m => m.round_number === r);
                const rDone = rMatches.every(m => m.status === 'COMPLETED');
                const rLevel = (config.round_levels || []).find(l => l.round === r);
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`px-4 py-2 rounded-lg font-display font-bold text-sm transition-all whitespace-nowrap shrink-0 ${
                      displayRound === r
                        ? 'bg-piu-accent text-white'
                        : rDone
                          ? 'bg-piu-green/10 text-piu-green border border-piu-green/30 hover:bg-piu-green/20'
                          : 'bg-piu-card text-gray-400 border border-piu-border hover:border-piu-accent/50'
                    }`}
                  >
                    R{r} {rLevel ? `(Lv.${rLevel.min}-${rLevel.max})` : ''}
                  </button>
                );
              })}
            </div>
          )}

          <SwissRound
            round={displayRound}
            matches={displayMatches}
            players={players}
            config={config}
            onUpdate={loadData}
            tournamentId={id}
          />
        </div>
      )}

      {activeTab === 'gauntlet' && (
        <Gauntlet matches={matches} players={players} onUpdate={loadData} />
      )}

      {activeTab === 'final' && (
        <FinalStandings players={players} matches={matches} config={config} />
      )}

      {activeTab === 'standings' && (
        <Standings
          players={players}
          matches={matches}
          showFinal={tournament.phase === 'COMPLETED' || (allRoundsDone && allCurrentDone)}
        />
      )}
    </div>
  );
}
