import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, generateRoundRobin, generateGauntlet } from '../utils/api';
import PlayerRegistration from '../components/PlayerRegistration';
import SwissRound from '../components/SwissRound';
import Standings from '../components/Standings';
import Gauntlet from '../components/Gauntlet';

const PHASE_TABS = {
  SETUP: ['players'],
  ROUND_ROBIN: ['rounds', 'standings', 'players'],
  GAUNTLET: ['gauntlet', 'standings', 'players'],
  COMPLETED: ['standings', 'gauntlet', 'players'],
};

export default function TournamentView() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(null);

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
      if (!activeTab) {
        const tabs = PHASE_TABS[t.phase] || ['players'];
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

  const handleStartRound = async () => {
    if (players.length < 2) return alert('Need at least 2 players');
    try {
      await generateRoundRobin(id);
      await loadData();
      setActiveTab('rounds');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleNextRound = async () => {
    try {
      await generateRoundRobin(id);
      await loadData();
      setSelectedRound((tournament?.current_round || 0) + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartGauntlet = async () => {
    try {
      await generateGauntlet(id);
      await loadData();
      setActiveTab('gauntlet');
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!tournament) return <div className="text-center py-20 text-red-400">Tournament not found</div>;

  const config = tournament.config || {};
  const hasGauntlet = config.gauntlet_enabled;
  const gauntletMatches = matches.filter(m => m.match_type === 'gauntlet');
  const hasGauntletMatches = gauntletMatches.length > 0;
  let tabs = PHASE_TABS[tournament.phase] || ['players'];
  // Only show gauntlet tab in COMPLETED phase if gauntlet was enabled and matches exist
  if (tournament.phase === 'COMPLETED' && !hasGauntletMatches) {
    tabs = tabs.filter(t => t !== 'gauntlet');
  }
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
        <div className="flex gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 flex-wrap">
          {tournament.location && <span>{tournament.location}</span>}
          {tournament.date && <span>{tournament.date}</span>}
          <span>{players.length} players</span>
          {currentRound > 0 && <span>Round {currentRound}/{totalRounds}</span>}
          {matchesPerRound > 0 && <span>{matchesPerRound} matches/round</span>}
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
      <div className="flex gap-1 mb-4 sm:mb-6 border-b border-piu-border">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 sm:px-4 py-2 font-display font-semibold text-xs sm:text-sm uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-piu-accent text-piu-accent'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'rounds' ? `Rounds (${currentRound})` : tab}
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
          {/* Round selector */}
          {currentRound > 1 && (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: currentRound }, (_, i) => i + 1).map(r => {
                const rMatches = matches.filter(m => m.round_number === r);
                const rDone = rMatches.every(m => m.status === 'COMPLETED');
                const rLevel = (config.round_levels || []).find(l => l.round === r);
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className={`px-4 py-2 rounded-lg font-display font-bold text-sm transition-all ${
                      displayRound === r
                        ? 'bg-piu-accent text-white'
                        : rDone
                          ? 'bg-piu-green/10 text-piu-green border border-piu-green/30 hover:bg-piu-green/20'
                          : 'bg-piu-card text-gray-400 border border-piu-border hover:border-piu-accent/50'
                    }`}
                  >
                    R{r} {rLevel ? `(Lv.${rLevel.min}-${rLevel.max})` : ''}
                    {rDone && ' '}
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
        <Gauntlet
          matches={matches}
          players={players}
          onUpdate={loadData}
        />
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
