import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getTournament, getPlayers, getMatches, getPhases } from '../utils/api';
import { FORMAT_LABELS, FORMAT_ICONS, PHASE_STATUS_LABELS } from '../utils/tournamentConstants';
import BracketView from '../components/tournament/BracketView';
import DoubleElimBracketView from '../components/tournament/DoubleElimBracketView';
import PoolsView from '../components/tournament/PoolsView';
import Standings from '../components/Standings';

const REFRESH_INTERVAL = 20000;

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

function EmbedHeader({ tournament, phases, theme }) {
  const activePhase = phases.find(p => p.status === 'ACTIVE');
  const isActive = tournament.phase !== 'SETUP' && tournament.phase !== 'COMPLETED';
  const isDark = theme === 'dark';

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <h1 className={`font-display font-bold text-base leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {tournament.name}
        </h1>
        {isActive && (
          <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold text-piu-accent bg-piu-accent/10 border border-piu-accent/30 rounded-full px-1.5 py-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-piu-accent animate-pulse"></span>
            LIVE
          </span>
        )}
      </div>
      <div className={`flex gap-3 text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        {activePhase && (
          <span>{FORMAT_ICONS[activePhase.format]} {activePhase.name || FORMAT_LABELS[activePhase.format]}</span>
        )}
        {tournament.location && <span>{tournament.location}</span>}
        {tournament.date && <span>{tournament.date}</span>}
      </div>
    </div>
  );
}

function EmbedBracketView({ matches, players, phases }) {
  const activePhase = phases.find(p => p.status === 'ACTIVE') || phases.find(p => p.status === 'COMPLETED');
  const phaseMatches = activePhase
    ? matches.filter(m => m.phase_id === activePhase.id)
    : matches;

  if (activePhase?.format === 'double_elim') {
    return (
      <div className="overflow-auto max-h-[480px]">
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
    <div className="overflow-auto max-h-[480px]">
      <BracketView
        matches={phaseMatches}
        players={players}
        phaseConfig={activePhase?.config || {}}
        onUpdate={() => {}}
      />
    </div>
  );
}

function EmbedPoolsView({ matches, players, phases }) {
  const activePhase = phases.find(p => p.format === 'pools' && (p.status === 'ACTIVE' || p.status === 'COMPLETED'));
  const phaseMatches = activePhase
    ? matches.filter(m => m.phase_id === activePhase.id)
    : matches;

  return (
    <div className="overflow-auto max-h-[480px]">
      <PoolsView
        matches={phaseMatches}
        players={players}
        phaseConfig={activePhase?.config || {}}
        onUpdate={() => {}}
      />
    </div>
  );
}

function EmbedStandingsView({ players, matches, theme }) {
  const standings = computeStandings(players, matches);
  const isDark = theme === 'dark';

  return (
    <div className="overflow-auto max-h-[480px]">
      <table className="w-full text-xs">
        <thead>
          <tr className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            <th className="text-left pb-1.5 pl-2">#</th>
            <th className="text-left pb-1.5">Player</th>
            <th className="text-center pb-1.5">W</th>
            <th className="text-center pb-1.5">L</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.id} className={`${
              isDark
                ? i % 2 === 0 ? 'bg-white/[0.02]' : ''
                : i % 2 === 0 ? 'bg-gray-50' : ''
            }`}>
              <td className={`py-1 pl-2 font-mono text-[10px] ${
                i === 0 ? 'text-piu-gold' :
                i === 1 ? 'text-piu-silver' :
                i === 2 ? 'text-piu-bronze' :
                isDark ? 'text-gray-500' : 'text-gray-400'
              }`}>{i + 1}</td>
              <td className={`py-1 font-display font-semibold truncate max-w-[200px] ${
                i === 0 ? 'text-piu-gold' :
                i === 1 ? 'text-piu-silver' :
                i === 2 ? 'text-piu-bronze' :
                isDark ? 'text-gray-200' : 'text-gray-800'
              }`}>{s.name}</td>
              <td className={`py-1 text-center font-mono ${isDark ? 'text-piu-green' : 'text-green-600'}`}>{s.wins}</td>
              <td className={`py-1 text-center font-mono ${isDark ? 'text-red-400' : 'text-red-500'}`}>{s.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmbedDefaultView({ tournament, phases, players, matches, theme }) {
  const activePhase = phases.find(p => p.status === 'ACTIVE');
  const isDark = theme === 'dark';
  const standings = computeStandings(players, matches);
  const top8 = standings.slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Phase flow */}
      {phases.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-[10px]">
          {phases.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>{'\u2192'}</span>}
              <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-display font-bold ${
                p.status === 'COMPLETED'
                  ? isDark ? 'border-piu-green/40 text-piu-green' : 'border-green-300 text-green-600'
                  : p.status === 'ACTIVE'
                    ? 'border-piu-accent/40 text-piu-accent'
                    : isDark ? 'border-piu-border/40 text-gray-500' : 'border-gray-200 text-gray-400'
              }`}>
                {FORMAT_ICONS[p.format]} {p.name || FORMAT_LABELS[p.format]}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Standings */}
      {top8.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <th className="text-left pb-1 pl-2">#</th>
              <th className="text-left pb-1">Player</th>
              <th className="text-center pb-1">W</th>
              <th className="text-center pb-1">L</th>
            </tr>
          </thead>
          <tbody>
            {top8.map((s, i) => (
              <tr key={s.id} className={`${
                isDark
                  ? i % 2 === 0 ? 'bg-white/[0.02]' : ''
                  : i % 2 === 0 ? 'bg-gray-50' : ''
              }`}>
                <td className={`py-0.5 pl-2 font-mono text-[10px] ${
                  i === 0 ? 'text-piu-gold' :
                  i === 1 ? 'text-piu-silver' :
                  i === 2 ? 'text-piu-bronze' :
                  isDark ? 'text-gray-500' : 'text-gray-400'
                }`}>{i + 1}</td>
                <td className={`py-0.5 font-display font-semibold truncate max-w-[200px] ${
                  i === 0 ? 'text-piu-gold' :
                  i === 1 ? 'text-piu-silver' :
                  i === 2 ? 'text-piu-bronze' :
                  isDark ? 'text-gray-200' : 'text-gray-800'
                }`}>{s.name}</td>
                <td className={`py-0.5 text-center font-mono ${isDark ? 'text-piu-green' : 'text-green-600'}`}>{s.wins}</td>
                <td className={`py-0.5 text-center font-mono ${isDark ? 'text-red-400' : 'text-red-500'}`}>{s.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Empty state */}
      {top8.length === 0 && (
        <div className={`text-center py-6 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Tournament in progress. Matches haven't started yet.
        </div>
      )}
    </div>
  );
}

export default function TournamentEmbed() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'default';
  const theme = searchParams.get('theme') || 'dark';
  const isDark = theme === 'dark';

  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [phases, setPhases] = useState([]);
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
      <div className={`p-4 rounded-xl ${isDark ? 'bg-piu-bg' : 'bg-white'}`}>
        <div className="animate-pulse space-y-3">
          <div className={`h-4 rounded w-3/4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
          <div className={`h-3 rounded w-1/2 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
          <div className={`h-40 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-piu-bg text-red-400' : 'bg-white text-red-500'}`}>
        Tournament not found
      </div>
    );
  }

  const watchUrl = `${window.location.origin}/tournament/${id}/watch`;

  return (
    <div className={`rounded-xl border overflow-hidden flex flex-col ${
      isDark
        ? 'bg-piu-bg border-piu-border text-white'
        : 'bg-white border-gray-200 text-gray-900'
    }`} style={{ maxHeight: '600px', minHeight: '200px' }}>
      {/* Content */}
      <div className="p-3 flex-1 overflow-auto">
        <EmbedHeader tournament={tournament} phases={phases} theme={theme} />

        {view === 'bracket' && (
          <EmbedBracketView matches={matches} players={players} phases={phases} />
        )}
        {view === 'standings' && (
          <EmbedStandingsView players={players} matches={matches} theme={theme} />
        )}
        {view === 'pools' && (
          <EmbedPoolsView matches={matches} players={players} phases={phases} />
        )}
        {view === 'default' && (
          <EmbedDefaultView tournament={tournament} phases={phases} players={players} matches={matches} theme={theme} />
        )}
      </div>

      {/* Footer */}
      <div className={`px-3 py-1.5 flex items-center justify-between border-t text-[10px] ${
        isDark ? 'border-piu-border bg-piu-card/50 text-gray-500' : 'border-gray-100 bg-gray-50 text-gray-400'
      }`}>
        <span className="font-display">Powered by Shinsa</span>
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`hover:underline ${isDark ? 'text-piu-accent' : 'text-pink-500'}`}
        >
          View full tournament
        </a>
      </div>
    </div>
  );
}
