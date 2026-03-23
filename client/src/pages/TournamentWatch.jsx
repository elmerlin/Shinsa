import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, getPhases } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, FORMAT_DESCRIPTIONS, PHASE_STATUS_LABELS } from '../utils/tournamentConstants';
import SwissRound from '../components/SwissRound';
import Standings from '../components/Standings';
import Gauntlet from '../components/Gauntlet';
import FinalStandings from '../components/FinalStandings';
import PoolsView from '../components/tournament/PoolsView';
import BracketView from '../components/tournament/BracketView';
import DoubleElimBracketView from '../components/tournament/DoubleElimBracketView';
import TournamentSkeleton from '../components/tournament/TournamentSkeleton';

const LEGACY_PHASE_TABS = {
  SETUP: [],
  ROUND_ROBIN: ['rounds', 'standings'],
  GAUNTLET: ['gauntlet', 'rounds', 'standings'],
  COMPLETED: ['final', 'rounds', 'gauntlet', 'standings'],
};

const REFRESH_INTERVAL = 15000;

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

      try {
        const ph = await getPhases(id);
        setPhases(ph || []);
      } catch { setPhases([]); }

      if (!activeTabRef.current) {
        const tabs = LEGACY_PHASE_TABS[t.phase] || [];
        setActiveTab(tabs[0] || '');
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

    if (!activeTab || !phaseTabs.find(t => t.key === activeTab)) {
      if (activePhase) setActiveTab(`phase-${activePhase.id}`);
      else if (allPhasesComplete) setActiveTab('final');
      else setActiveTab(phaseTabs[0]?.key || '');
    }

    const currentTabPhase = phaseTabs.find(t => t.key === activeTab)?.phase;
    const phaseMatches = currentTabPhase
      ? matches.filter(m => m.phase_id === currentTabPhase.id)
      : [];

    return (
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">{tournament.name}</h1>
            {isActive && (
              <span className="badge badge-active animate-pulse-glow flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-piu-accent animate-pulse"></span>
                LIVE
              </span>
            )}
            <span className={`badge ${
              tournament.phase === 'SETUP' ? 'badge-pending' :
              tournament.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
            }`}>
              {activePhase ? (FORMAT_LABELS[activePhase.format] || activePhase.format) : tournament.phase}
            </span>
            <button
              onClick={handleShare}
              className="ml-auto text-xs text-gray-400 hover:text-white transition-colors border border-piu-border rounded px-2 py-1"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
          <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 flex-wrap">
            {tournament.location && <span>{tournament.location}</span>}
            {tournament.date && <span>{tournament.date}</span>}
            <span>{players.length} players</span>
            <span>{completedPhases.length}/{phases.length} phases</span>
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
            <PhaseRuleCard phase={currentTabPhase} />

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
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">{tournament.name}</h1>
          {isActive && (
            <span className="badge badge-active animate-pulse-glow flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-piu-accent animate-pulse"></span>
              LIVE
            </span>
          )}
          <span className={`badge ${
            tournament.phase === 'SETUP' ? 'badge-pending' :
            tournament.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
          }`}>
            {tournament.phase === 'ROUND_ROBIN' ? 'Round Robin' :
             tournament.phase === 'GAUNTLET' ? 'Gauntlet' : tournament.phase}
          </span>
          <button
            onClick={handleShare}
            className="ml-auto text-xs text-gray-400 hover:text-white transition-colors border border-piu-border rounded px-2 py-1"
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
        <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 flex-wrap">
          {tournament.location && <span>{tournament.location}</span>}
          {tournament.date && <span>{tournament.date}</span>}
          <span>{players.length} players</span>
          {currentRound > 0 && <span>Round {currentRound}/{totalRounds}</span>}
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
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
        <div className="card text-center py-12">
          <p className="text-lg font-display font-bold text-gray-400 mb-2">Tournament is being set up</p>
          <p className="text-sm text-gray-500">{players.length} players registered so far. Check back soon!</p>
        </div>
      )}
    </div>
  );
}
