import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, getPhases } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS } from '../utils/tournamentConstants';
import SwissRound from '../components/SwissRound';
import Standings from '../components/Standings';
import Gauntlet from '../components/Gauntlet';
import FinalStandings from '../components/FinalStandings';
import PoolsView from '../components/tournament/PoolsView';
import BracketView from '../components/tournament/BracketView';
import DoubleElimBracketView from '../components/tournament/DoubleElimBracketView';
import TournamentSkeleton from '../components/tournament/TournamentSkeleton';
import {
  TournamentEmptyPanel,
  TournamentHero,
  TournamentPhaseRuleCard,
  TournamentPhaseTimeline,
  TournamentTabs,
} from '../components/tournament/TournamentChrome';

const LEGACY_PHASE_TABS = {
  SETUP: [],
  ROUND_ROBIN: ['rounds', 'standings'],
  GAUNTLET: ['gauntlet', 'rounds', 'standings'],
  COMPLETED: ['final', 'rounds', 'gauntlet', 'standings'],
};

const REFRESH_INTERVAL = 15000;

export default function TournamentWatch() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [phases, setPhases] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(null);
  const [copied, setCopied] = useState(false);
  const activeTabRef = useRef(activeTab);
  const selectedRoundRef = useRef(selectedRound);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedRoundRef.current = selectedRound; }, [selectedRound]);

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

      let loadedPhases = [];
      try {
        const ph = await getPhases(id);
        loadedPhases = Array.isArray(ph) ? ph : [];
        setPhases(loadedPhases);
      } catch {
        loadedPhases = [];
        setPhases([]);
      }

      if (!activeTabRef.current) {
        if (loadedPhases.length > 0) {
          const activePhase = loadedPhases.find((phase) => phase.status === 'ACTIVE');
          const allPhasesComplete = loadedPhases.every((phase) => phase.status === 'COMPLETED');
          if (activePhase) setActiveTab(`phase-${activePhase.id}`);
          else if (allPhasesComplete) setActiveTab('final');
          else setActiveTab(`phase-${loadedPhases[0].id}`);
        } else {
          const tabs = LEGACY_PHASE_TABS[t.phase] || [];
          setActiveTab(tabs[0] || '');
        }
      }
      if (t.current_round > 0 && !selectedRoundRef.current) {
        setSelectedRound(t.current_round);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [id]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!tournament || !isPhaseMode) return;

    const allPhasesComplete = phases.length > 0 && phases.every((phase) => phase.status === 'COMPLETED');
    const validTabs = phases.map((phase) => `phase-${phase.id}`);
    validTabs.push('standings');
    if (allPhasesComplete) validTabs.push('final');

    if (activeTab && validTabs.includes(activeTab)) return;

    const activePhase = phases.find((phase) => phase.status === 'ACTIVE');
    if (activePhase) {
      setActiveTab(`phase-${activePhase.id}`);
      return;
    }
    if (allPhasesComplete) {
      setActiveTab('final');
      return;
    }
    setActiveTab(validTabs[0] || 'standings');
  }, [activeTab, isPhaseMode, phases, tournament]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <TournamentSkeleton />;
  if (!tournament) return <div className="text-center py-20 text-red-400">Tournament not found</div>;

  const config = tournament.config || {};
  const isActive = tournament.phase !== 'SETUP' && tournament.phase !== 'COMPLETED';

  // Noop for read-only
  const noop = () => {};

  // ── Phase-mode rendering ──
  if (isPhaseMode) {
    const activePhase = phases.find(p => p.status === 'ACTIVE');
    const completedPhases = phases.filter(p => p.status === 'COMPLETED');
    const allPhasesComplete = phases.every(p => p.status === 'COMPLETED');

    const phaseTabs = phases.map(p => ({
      key: `phase-${p.id}`,
      label: p.name || FORMAT_LABELS[p.format] || p.format,
      icon: FORMAT_ICONS[p.format] || '',
      phase: p,
      status: p.status,
    }));
    phaseTabs.push({ key: 'standings', label: 'Standings', icon: '', phase: null, status: null });
    if (allPhasesComplete) {
      phaseTabs.push({ key: 'final', label: 'Final', icon: '\u{1F3C6}', phase: null, status: null });
    }

    const currentTabPhase = phaseTabs.find(t => t.key === activeTab)?.phase;
    const phaseMatches = currentTabPhase
      ? matches.filter(m => m.phase_id === currentTabPhase.id)
      : [];

    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-4 sm:mb-6">
          <TournamentHero
            tournament={tournament}
            statusLabel={activePhase ? (FORMAT_LABELS[activePhase.format] || activePhase.format) : tournament.phase}
            live={isActive}
            stats={[
              `${players.length} players`,
              `${completedPhases.length}/${phases.length} done`,
              isActive ? 'Live refresh' : 'Viewer mode',
            ]}
            action={(
              <button
                onClick={handleShare}
                className="rounded-full border border-piu-accent/20 bg-piu-accent/10 px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.16em] text-rose-100 transition-colors hover:border-piu-accent/30 hover:text-white"
              >
                {copied ? 'Copied!' : 'Share'}
              </button>
            )}
            flow={<TournamentPhaseTimeline phases={phases} />}
          />
        </div>

        <TournamentTabs tabs={phaseTabs} activeTab={activeTab} onChange={setActiveTab} className="mb-4 sm:mb-6" />

        {/* Tab Content */}
        {activeTab === 'standings' && (
          <Standings
            players={players}
            matches={matches}
            showFinal={allPhasesComplete}
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
                onUpdate={noop}
                tournamentId={id}
              />
            )}

            {currentTabPhase.format === 'pools' && (
              <PoolsView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={noop}
              />
            )}

            {currentTabPhase.format === 'single_elim' && (
              <BracketView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={noop}
              />
            )}

            {currentTabPhase.format === 'double_elim' && (
              <DoubleElimBracketView
                matches={phaseMatches}
                players={players}
                phaseConfig={currentTabPhase.config || {}}
                onUpdate={noop}
              />
            )}

            {currentTabPhase.format === 'gauntlet' && (
              <Gauntlet
                matches={phaseMatches.length > 0 ? phaseMatches : matches}
                players={players}
                onUpdate={noop}
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
  let tabs = LEGACY_PHASE_TABS[tournament.phase] || [];
  if (!hasGauntletMatches) tabs = tabs.filter(t => t !== 'gauntlet');
  if (tournament.phase !== 'COMPLETED') tabs = tabs.filter(t => t !== 'final');

  const currentRound = tournament.current_round;
  const totalRounds = tournament.total_rounds || 3;
  const allRoundsDone = currentRound >= totalRounds;
  const currentRoundMatches = matches.filter(m => m.round_number === currentRound);
  const allCurrentDone = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.status === 'COMPLETED');
  const displayRound = selectedRound || currentRound;
  const displayMatches = matches.filter(m => m.round_number === displayRound);

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
          live={isActive}
          stats={[
            `${players.length} players`,
            currentRound > 0 ? `Round ${currentRound}/${totalRounds}` : 'Setup mode',
            tournament.phase === 'COMPLETED' ? 'Finished' : 'Spectator view',
          ]}
          action={(
            <button
              onClick={handleShare}
              className="rounded-full border border-piu-accent/20 bg-piu-accent/10 px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.16em] text-rose-100 transition-colors hover:border-piu-accent/30 hover:text-white"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
          )}
        />
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <TournamentTabs
          className="mb-4 sm:mb-6"
          activeTab={activeTab}
          onChange={setActiveTab}
          tabs={tabs.map((tab) => ({
            key: tab,
            label: tab === 'rounds' ? `Rounds (${currentRound})` : tab === 'final' ? 'Final' : tab.charAt(0).toUpperCase() + tab.slice(1),
          }))}
        />
      )}

      {/* Tab Content */}
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
            onUpdate={noop}
            tournamentId={id}
          />
        </div>
      )}

      {activeTab === 'gauntlet' && (
        <Gauntlet matches={matches} players={players} onUpdate={noop} />
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

      {/* Empty state for SETUP */}
      {tournament.phase === 'SETUP' && (
        <TournamentEmptyPanel
          title="Tournament is being set up"
          description={`${players.length} players are registered so far. Check back soon.`}
        />
      )}
    </div>
  );
}
