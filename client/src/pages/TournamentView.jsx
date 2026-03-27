import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getTournament, getPlayers, getMatches, getPhases,
  generateRoundRobin, generateGauntlet,
  activatePhase, completePhase, generatePhaseMatches,
} from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, FORMAT_DESCRIPTIONS, PHASE_STATUS_LABELS } from '../utils/tournamentConstants';
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

// Legacy phase tabs for old tournaments without the phase system
const LEGACY_PHASE_TABS = {
  SETUP: ['players'],
  ROUND_ROBIN: ['rounds', 'standings', 'players'],
  GAUNTLET: ['gauntlet', 'rounds', 'standings', 'players'],
  COMPLETED: ['final', 'rounds', 'gauntlet', 'standings', 'players'],
};

function PhaseRuleCard({ phase }) {
  const format = phase.format;
  const config = phase.config || {};
  return (
    <div className="card bg-piu-dark/50 border-piu-border/30 p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span>{FORMAT_ICONS[format] || ''}</span>
        <h3 className="font-display font-bold text-sm text-piu-accent">{phase.name || FORMAT_LABELS[format]} Rules</h3>
      </div>
      <p className="text-xs text-gray-400 mb-2">{FORMAT_DESCRIPTIONS[format]}</p>
      <ul className="text-[11px] text-gray-500 space-y-0.5">
        {config.cards_per_draw && <li>{config.cards_per_draw} cards drawn per match</li>}
        {config.vetoes_per_player !== undefined && <li>{config.vetoes_per_player} veto{config.vetoes_per_player !== 1 ? 's' : ''} per player</li>}
        {config.best_of && <li>Best of {config.best_of} songs</li>}
        {config.rounds && <li>{config.rounds} round{config.rounds > 1 ? 's' : ''}</li>}
        {config.pool_count && <li>{config.pool_count} pools</li>}
        {config.duration_minutes && <li>{config.duration_minutes} minute session</li>}
        {format === 'gauntlet' && <li>S{config.start_single_level || 19} to S{config.final_single_level || 24}</li>}
        {format === 'b15' && <li>Best 15 rating-point scores</li>}
      </ul>
    </div>
  );
}

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
      try {
        const ph = await getPhases(id);
        setPhases(ph || []);
      } catch { setPhases([]); }

      if (!activeTab) {
        const tabs = LEGACY_PHASE_TABS[t.phase] || ['players'];
        setActiveTab(tabs[0]);
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

    // Auto-select active phase tab
    if (!activeTab || activeTab === 'players') {
      if (activePhase) setActiveTab(`phase-${activePhase.id}`);
      else if (tournament.phase === 'SETUP') setActiveTab('players');
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

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">{tournament.name}</h1>
            <span className={`badge ${
              tournament.phase === 'SETUP' ? 'badge-pending' :
              tournament.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
            }`}>
              {activePhase ? (FORMAT_LABELS[activePhase.format] || activePhase.format) : tournament.phase}
            </span>
          </div>
          <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 flex-wrap items-center">
            {tournament.location && <span>{tournament.location}</span>}
            {tournament.date && <span>{tournament.date}</span>}
            <span>{players.length} players</span>
            <span>{completedPhases.length}/{phases.length} phases</span>
            {tournament.phase !== 'COMPLETED' && tournament.phase !== 'SETUP' && (
              <span className="text-[10px] text-gray-600 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-piu-green animate-pulse" />
                Live
              </span>
            )}
          </div>

          {/* Phase flow indicator */}
          <div className="flex items-center gap-1 mt-3 flex-wrap text-[10px]">
            {phases.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && <span className="text-gray-600">{'\u2192'}</span>}
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display font-bold ${
                  p.status === 'COMPLETED' ? 'border-piu-green/40 text-piu-green bg-piu-green/8' :
                  p.status === 'ACTIVE' ? 'border-piu-accent/40 text-piu-accent bg-piu-accent/8 animate-pulse-glow' :
                  'border-piu-border/40 text-gray-500'
                }`}>
                  {FORMAT_ICONS[p.format]} {p.name || FORMAT_LABELS[p.format]}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Phase Controls */}
        {tournament.phase === 'SETUP' && !activePhase && pendingPhases.length > 0 && (
          <div className="card mb-6 flex items-center justify-between">
            <div>
              <p className="font-display font-bold">Ready to begin?</p>
              <p className="text-sm text-gray-400">{players.length} players registered. First phase: {nextPending.name || FORMAT_LABELS[nextPending.format]}</p>
            </div>
            <button onClick={() => handleActivatePhase(nextPending)} className="btn-primary" disabled={players.length < 2}>
              Start {nextPending.name || FORMAT_LABELS[nextPending.format]}
            </button>
          </div>
        )}

        {activePhase && phaseAllDone && nextPending && (
          <div className="card mb-6 flex items-center justify-between border-piu-green/30">
            <div>
              <p className="font-display font-bold text-piu-green">{activePhase.name || FORMAT_LABELS[activePhase.format]} Complete!</p>
              <p className="text-sm text-gray-400">Next: {nextPending.name || FORMAT_LABELS[nextPending.format]}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleCompletePhase(activePhase)} className="btn-secondary text-sm">
                Finalize
              </button>
              <button onClick={async () => { await handleCompletePhase(activePhase); await handleActivatePhase(nextPending); }} className="btn-primary">
                Advance to {nextPending.name || FORMAT_LABELS[nextPending.format]}
              </button>
            </div>
          </div>
        )}

        {activePhase && phaseAllDone && !nextPending && tournament.phase !== 'COMPLETED' && (
          <div className="card mb-6 flex items-center justify-between border-piu-gold/30">
            <div>
              <p className="font-display font-bold text-piu-gold">Final Phase Complete!</p>
              <p className="text-sm text-gray-400">Complete the tournament to see final standings.</p>
            </div>
            <button onClick={() => handleCompletePhase(activePhase)} className="btn-primary">
              Complete Tournament
            </button>
          </div>
        )}

        {activePhase && phaseMatches.length === 0 && activeTab === `phase-${activePhase.id}` && (
          <div className="card mb-6 flex items-center justify-between border-piu-accent/30">
            <div>
              <p className="font-display font-bold text-piu-accent">Generate Matches</p>
              <p className="text-sm text-gray-400">Phase is active but no matches yet.</p>
            </div>
            <button onClick={() => handleGeneratePhaseMatches(activePhase)} className="btn-primary">
              Generate Matches
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 sm:mb-6 border-b border-piu-border overflow-x-auto">
          {phaseTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 sm:px-4 py-2 font-display font-semibold text-xs sm:text-sm uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-piu-accent text-piu-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon && <span className="mr-1">{tab.icon}</span>}
              {tab.label}
              {tab.status === 'COMPLETED' && <span className="ml-1 text-piu-green text-[9px]">{'\u2714'}</span>}
              {tab.status === 'ACTIVE' && <span className="ml-1 text-piu-accent text-[9px]">{'\u25CF'}</span>}
            </button>
          ))}
        </div>

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
            <PhaseRuleCard phase={currentTabPhase} />

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
              <div className="card text-center py-12">
                <span className="text-4xl mb-3 block">{FORMAT_ICONS[currentTabPhase.format]}</span>
                <h3 className="font-display font-bold text-lg text-white mb-1">{FORMAT_LABELS[currentTabPhase.format]}</h3>
                <p className="text-sm text-gray-400">{FORMAT_DESCRIPTIONS[currentTabPhase.format]}</p>
                <p className="text-xs text-gray-600 mt-3">Scores are tracked via live sync during the session.</p>
              </div>
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
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">{tournament.name}</h1>
          <span className={`badge ${
            tournament.phase === 'SETUP' ? 'badge-pending' :
            tournament.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
          }`}>
            {tournament.phase === 'ROUND_ROBIN' ? 'Round Robin' :
             tournament.phase === 'GAUNTLET' ? 'Gauntlet' : tournament.phase}
          </span>
        </div>
        <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 flex-wrap items-center">
          {tournament.location && <span>{tournament.location}</span>}
          {tournament.date && <span>{tournament.date}</span>}
          <span>{players.length} players</span>
          {currentRound > 0 && <span>Round {currentRound}/{totalRounds}</span>}
          {matchesPerRound > 0 && <span>{matchesPerRound} matches/round</span>}
          {tournament.phase !== 'COMPLETED' && tournament.phase !== 'SETUP' && (
            <span className="text-[10px] text-gray-600 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-piu-green animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Phase controls */}
      {tournament.phase === 'SETUP' && (
        <div className="card mb-6 flex items-center justify-between">
          <div>
            <p className="font-display font-bold">Ready to start Round Robin?</p>
            <p className="text-sm text-gray-400">{players.length} players = {matchesPerRound} matches per round</p>
          </div>
          <button onClick={handleStartRound} className="btn-primary" disabled={players.length < 2}>
            Start Round 1
          </button>
        </div>
      )}

      {tournament.phase === 'ROUND_ROBIN' && allCurrentDone && !allRoundsDone && (
        <div className="card mb-6 flex items-center justify-between border-piu-green/30">
          <div>
            <p className="font-display font-bold text-piu-green">Round {currentRound} Complete!</p>
            <p className="text-sm text-gray-400">All {currentRoundMatches.length} matches have been played</p>
          </div>
          <button onClick={handleNextRound} className="btn-primary">
            Start Round {currentRound + 1}
          </button>
        </div>
      )}

      {tournament.phase === 'ROUND_ROBIN' && allRoundsDone && allCurrentDone && config.gauntlet_enabled && (
        <div className="card mb-6 flex items-center justify-between border-piu-accent/30">
          <div>
            <p className="font-display font-bold text-piu-accent">Round Robin Complete!</p>
            <p className="text-sm text-gray-400">All {totalRounds} rounds finished. Ready to start the Gauntlet.</p>
          </div>
          <button onClick={handleStartGauntlet} className="btn-primary">
            Start Gauntlet
          </button>
        </div>
      )}

      {tournament.phase === 'ROUND_ROBIN' && allRoundsDone && allCurrentDone && !config.gauntlet_enabled && (
        <div className="card mb-6 flex items-center justify-between border-piu-gold/30">
          <div>
            <p className="font-display font-bold text-piu-gold">Tournament Complete!</p>
            <p className="text-sm text-gray-400">All {totalRounds} rounds finished. Check standings for final results.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 sm:mb-6 border-b border-piu-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 sm:px-4 py-2 font-display font-semibold text-xs sm:text-sm uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-piu-accent text-piu-accent'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'rounds' ? `Rounds (${currentRound})` : tab === 'final' ? 'Final' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

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
