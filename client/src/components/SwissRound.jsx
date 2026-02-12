import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SwissRound({ round, matches, players, config, onUpdate, tournamentId }) {
  const navigate = useNavigate();
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });

  const levelConfig = (config.swiss_levels || []).find(l => l.round === round);

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No matches generated yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Round {round}</h2>
          {levelConfig && (
            <p className="text-sm text-gray-400">
              Level {levelConfig.min} - {levelConfig.max}
            </p>
          )}
        </div>
        <div className="text-sm text-gray-400">
          {matches.filter(m => m.status === 'COMPLETED').length}/{matches.length} complete
        </div>
      </div>

      <div className="grid gap-3">
        {matches.map(match => {
          const p1 = playerMap[match.player1_id];
          const p2 = playerMap[match.player2_id];
          const isBye = match.is_bye;
          const isComplete = match.status === 'COMPLETED';
          const scores = match.scores || {};

          return (
            <div
              key={match.id}
              onClick={() => !isBye && navigate(`/match/${match.id}`)}
              className={`card flex items-center gap-4 ${
                isBye ? 'opacity-60' : 'cursor-pointer hover:border-piu-accent/50 hover:shadow-lg hover:shadow-piu-accent/10'
              } ${isComplete ? 'border-piu-green/20' : ''}`}
            >
              {/* Player 1 */}
              <div className={`flex-1 text-right ${match.winner_id === match.player1_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold">
                  {p1?.name || 'TBD'}
                </div>
                {p1 && (
                  <div className="text-xs text-gray-500">
                    Seed {p1.seed_rank} | {p1.wins}W-{p1.losses}L
                  </div>
                )}
              </div>

              {/* Score / Status */}
              <div className="flex flex-col items-center min-w-[80px]">
                {isComplete ? (
                  <div className="flex items-center gap-2 font-display font-bold text-lg">
                    <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player1_wins || 0}
                    </span>
                    <span className="text-gray-600">-</span>
                    <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}>
                      {scores.player2_wins || 0}
                    </span>
                  </div>
                ) : (
                  <span className={`badge ${
                    match.status === 'PENDING' ? 'badge-pending' :
                    match.status === 'DRAWING' || match.status === 'VETOING' ? 'badge-active' :
                    match.status === 'READY' ? 'bg-piu-blue/20 text-piu-blue' : 'badge-pending'
                  }`}>
                    {match.status}
                  </span>
                )}
                {isBye && <span className="text-xs text-gray-500 mt-1">BYE</span>}
              </div>

              {/* Player 2 */}
              <div className={`flex-1 ${match.winner_id === match.player2_id ? 'text-piu-green' : ''}`}>
                <div className="font-display font-bold">
                  {isBye ? '---' : (p2?.name || 'TBD')}
                </div>
                {p2 && (
                  <div className="text-xs text-gray-500">
                    Seed {p2.seed_rank} | {p2.wins}W-{p2.losses}L
                  </div>
                )}
              </div>

              {/* Arrow indicator */}
              {!isBye && !isComplete && (
                <div className="text-gray-600 text-lg">&#8250;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
