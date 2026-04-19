import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, getPhases } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS } from '../utils/tournamentConstants';
import BracketView from '../components/tournament/BracketView';
import DoubleElimBracketView from '../components/tournament/DoubleElimBracketView';

const REFRESH_INTERVAL = 10000;

function computeStandings(players, matches) {
  const stats = {};
  players.forEach(p => { stats[p.id] = { id: p.id, name: p.name, wins: 0, losses: 0 }; });
  matches.forEach(m => {
    if (m.status !== 'COMPLETED') return;
    if (m.scores?.shared_win) {
      if (stats[m.player1_id]) stats[m.player1_id].wins++;
      if (stats[m.player2_id]) stats[m.player2_id].wins++;
      return;
    }
    if (m.winner_id && stats[m.winner_id]) stats[m.winner_id].wins++;
    const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
    if (loserId && stats[loserId]) stats[loserId].losses++;
  });
  return Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

function getPlayerName(id, players) {
  const p = players.find(pl => pl.id === id);
  return p ? p.name : '???';
}

function DefaultOverlay({ tournament, phases, players, matches }) {
  const activePhase = phases.find(p => p.status === 'ACTIVE');
  const standings = computeStandings(players, matches);
  const top = standings.slice(0, 6);

  // Find active match
  const activeMatch = matches.find(m =>
    m.status === 'DRAWING' || m.status === 'VETOING' || m.status === 'READY' || m.status === 'IN_PROGRESS'
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display font-bold text-lg text-white leading-tight">{tournament.name}</h1>
        {activePhase && (
          <p className="text-xs text-piu-accent font-display font-semibold">
            {FORMAT_ICONS[activePhase.format]} {activePhase.name || FORMAT_LABELS[activePhase.format]}
          </p>
        )}
      </div>

      {activeMatch && (
        <div className="bg-piu-accent/20 border border-piu-accent/40 rounded-lg px-3 py-2">
          <p className="text-[10px] text-piu-accent font-display font-bold uppercase tracking-wider mb-0.5">Now Playing</p>
          <p className="text-sm text-white font-display font-bold">
            {getPlayerName(activeMatch.player1_id, players)} vs {getPlayerName(activeMatch.player2_id, players)}
          </p>
        </div>
      )}

      {top.length > 0 && (
        <div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
                <th className="text-left pb-1">#</th>
                <th className="text-left pb-1">Player</th>
                <th className="text-center pb-1">W</th>
                <th className="text-center pb-1">L</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s, i) => (
                <tr key={s.id} className={
                  i === 0 ? 'text-piu-gold' :
                  i === 1 ? 'text-piu-silver' :
                  i === 2 ? 'text-piu-bronze' :
                  'text-gray-300'
                }>
                  <td className="py-0.5 font-mono text-[10px]">{i + 1}</td>
                  <td className="py-0.5 font-display font-semibold truncate max-w-[180px]">{s.name}</td>
                  <td className="py-0.5 text-center font-mono">{s.wins}</td>
                  <td className="py-0.5 text-center font-mono">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StandingsOverlay({ players, matches }) {
  const standings = computeStandings(players, matches);
  const top = standings.slice(0, 8);

  return (
    <div>
      <h2 className="font-display font-bold text-sm text-piu-accent uppercase tracking-wider mb-2">Standings</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 text-[10px] uppercase tracking-wider">
            <th className="text-left pb-1">#</th>
            <th className="text-left pb-1">Player</th>
            <th className="text-center pb-1">W</th>
            <th className="text-center pb-1">L</th>
          </tr>
        </thead>
        <tbody>
          {top.map((s, i) => (
            <tr key={s.id} className={
              i === 0 ? 'text-piu-gold' :
              i === 1 ? 'text-piu-silver' :
              i === 2 ? 'text-piu-bronze' :
              'text-gray-300'
            }>
              <td className="py-0.5 font-mono text-[10px]">{i + 1}</td>
              <td className="py-0.5 font-display font-semibold truncate max-w-[220px]">{s.name}</td>
              <td className="py-0.5 text-center font-mono">{s.wins}</td>
              <td className="py-0.5 text-center font-mono">{s.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BracketOverlay({ matches, players, phases }) {
  const activePhase = phases.find(p => p.status === 'ACTIVE');
  const phaseMatches = activePhase
    ? matches.filter(m => m.phase_id === activePhase.id)
    : matches;
  const format = activePhase?.format;

  if (format === 'double_elim') {
    return (
      <div className="transform scale-75 origin-top-left">
        <DoubleElimBracketView
          matches={phaseMatches}
          players={players}
          phaseConfig={activePhase?.config || {}}
          onUpdate={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="transform scale-75 origin-top-left">
      <BracketView
        matches={phaseMatches}
        players={players}
        phaseConfig={activePhase?.config || {}}
        onUpdate={() => {}}
      />
    </div>
  );
}

function MatchOverlay({ matches, players }) {
  const activeMatch = matches.find(m =>
    m.status !== 'COMPLETED' && m.status !== 'BYE' && m.status !== 'PENDING'
  ) || matches.find(m => m.status === 'PENDING');

  if (!activeMatch) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-400 font-display">No active match</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <p className="text-[10px] text-piu-accent font-display font-bold uppercase tracking-wider">
        {activeMatch.status === 'PENDING' ? 'Up Next' : 'Now Playing'}
      </p>
      <div className="flex items-center justify-center gap-4">
        <span className="font-display font-bold text-lg text-white">{getPlayerName(activeMatch.player1_id, players)}</span>
        <span className="text-gray-500 font-mono text-sm">vs</span>
        <span className="font-display font-bold text-lg text-white">{getPlayerName(activeMatch.player2_id, players)}</span>
      </div>
      {activeMatch.player1_score != null && activeMatch.player2_score != null && (
        <div className="flex items-center justify-center gap-4 font-mono text-sm">
          <span className={activeMatch.player1_score > activeMatch.player2_score ? 'text-piu-green' : 'text-gray-400'}>
            {activeMatch.player1_score}
          </span>
          <span className="text-gray-600">-</span>
          <span className={activeMatch.player2_score > activeMatch.player1_score ? 'text-piu-green' : 'text-gray-400'}>
            {activeMatch.player2_score}
          </span>
        </div>
      )}
    </div>
  );
}

export default function TournamentOverlay() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'default';

  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Set transparent body background
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.backgroundColor = prev;
      document.documentElement.style.backgroundColor = '';
    };
  }, []);

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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [id]);
  useEffect(() => {
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="bg-transparent p-4">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 max-w-[480px] animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!tournament) return null;

  return (
    <div className="bg-transparent p-2 max-w-[500px]">
      <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-white/10">
        {view === 'bracket' && (
          <BracketOverlay matches={matches} players={players} phases={phases} />
        )}
        {view === 'standings' && (
          <StandingsOverlay players={players} matches={matches} />
        )}
        {view === 'match' && (
          <MatchOverlay matches={matches} players={players} />
        )}
        {view === 'default' && (
          <DefaultOverlay tournament={tournament} phases={phases} players={players} matches={matches} />
        )}
      </div>
    </div>
  );
}
