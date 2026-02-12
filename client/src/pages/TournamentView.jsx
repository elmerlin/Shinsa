import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, updateTournament, generateSwissRound, generateKoth } from '../utils/api';
import PlayerRegistration from '../components/PlayerRegistration';
import SwissRound from '../components/SwissRound';
import Standings from '../components/Standings';
import KothBracket from '../components/KothBracket';

const PHASE_TABS = {
  SETUP: ['players', 'settings'],
  SWISS: ['rounds', 'standings', 'players'],
  KOTH: ['gauntlet', 'standings', 'players'],
  COMPLETED: ['results', 'standings'],
};

export default function TournamentView() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [loading, setLoading] = useState(true);

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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id, activeTab]);

  useEffect(() => { loadData(); }, [id]);

  const handleStartSwiss = async () => {
    if (players.length < 2) return alert('Need at least 2 players');
    try {
      await generateSwissRound(id);
      await loadData();
      setActiveTab('rounds');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleNextSwissRound = async () => {
    try {
      await generateSwissRound(id);
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartKoth = async () => {
    try {
      await generateKoth(id);
      await loadData();
      setActiveTab('gauntlet');
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!tournament) return <div className="text-center py-20 text-red-400">Tournament not found</div>;

  const config = tournament.config || {};
  const tabs = PHASE_TABS[tournament.phase] || ['players'];
  const swissMatches = matches.filter(m => m.stage_phase === 'SWISS');
  const kothMatches = matches.filter(m => m.stage_phase === 'KOTH');
  const currentRound = tournament.current_round;
  const allRoundsDone = currentRound >= tournament.swiss_rounds;
  const roundMatches = swissMatches.filter(m => m.round_number === currentRound);
  const allCurrentDone = roundMatches.every(m => m.status === 'COMPLETED');

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-display font-bold tracking-wider">{tournament.name}</h1>
          <span className={`badge ${
            tournament.phase === 'SETUP' ? 'badge-pending' :
            tournament.phase === 'COMPLETED' ? 'badge-completed' : 'badge-active'
          }`}>
            {tournament.phase}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-gray-400">
          {tournament.location && <span>{tournament.location}</span>}
          {tournament.date && <span>{tournament.date}</span>}
          <span>{players.length} players</span>
          {currentRound > 0 && <span>Round {currentRound}/{tournament.swiss_rounds}</span>}
        </div>
      </div>

      {/* Phase controls */}
      {tournament.phase === 'SETUP' && (
        <div className="card mb-6 flex items-center justify-between">
          <div>
            <p className="font-display font-bold">Ready to start?</p>
            <p className="text-sm text-gray-400">{players.length} players registered</p>
          </div>
          <button onClick={handleStartSwiss} className="btn-primary" disabled={players.length < 2}>
            Start Swiss Round 1
          </button>
        </div>
      )}

      {tournament.phase === 'SWISS' && allCurrentDone && !allRoundsDone && (
        <div className="card mb-6 flex items-center justify-between border-piu-green/30">
          <div>
            <p className="font-display font-bold text-piu-green">Round {currentRound} Complete!</p>
            <p className="text-sm text-gray-400">All matches have been played</p>
          </div>
          <button onClick={handleNextSwissRound} className="btn-primary">
            Generate Round {currentRound + 1}
          </button>
        </div>
      )}

      {tournament.phase === 'SWISS' && allRoundsDone && allCurrentDone && (
        <div className="card mb-6 flex items-center justify-between border-piu-gold/30">
          <div>
            <p className="font-display font-bold text-piu-gold">Swiss Phase Complete!</p>
            <p className="text-sm text-gray-400">Top {tournament.koth_top_n} players advance to King of the Hill</p>
          </div>
          <button onClick={handleStartKoth} className="btn-gold">
            Start King of the Hill
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-piu-border">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-display font-semibold text-sm uppercase tracking-wider border-b-2 transition-colors ${
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
            <div className="flex gap-2">
              {Array.from({ length: currentRound }, (_, i) => i + 1).map(r => (
                <RoundTab
                  key={r}
                  round={r}
                  matches={swissMatches.filter(m => m.round_number === r)}
                  players={players}
                  currentRound={currentRound}
                  config={config}
                  onUpdate={loadData}
                  tournamentId={id}
                />
              ))}
            </div>
          )}
          <SwissRound
            round={currentRound}
            matches={roundMatches}
            players={players}
            config={config}
            onUpdate={loadData}
            tournamentId={id}
          />
        </div>
      )}

      {activeTab === 'standings' && (
        <Standings players={players} matches={matches} />
      )}

      {activeTab === 'gauntlet' && (
        <KothBracket
          matches={kothMatches}
          players={players}
          tournament={tournament}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'results' && (
        <Standings players={players} matches={matches} showFinal />
      )}
    </div>
  );
}

function RoundTab({ round, matches, players, currentRound }) {
  const done = matches.every(m => m.status === 'COMPLETED');
  return null; // Handled inline by SwissRound
}
