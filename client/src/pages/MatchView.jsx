import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMatch, drawCards, vetoSong, submitResult, advanceKoth } from '../utils/api';
import SongCard from '../components/SongCard';

const STATUS_FLOW = {
  PENDING: { label: 'Ready to Draw', action: 'Draw Cards' },
  DRAWING: { label: 'Cards Drawn - Veto Phase', action: null },
  VETOING: { label: 'Veto in Progress', action: null },
  READY: { label: 'Set List Ready - Play!', action: null },
  COMPLETED: { label: 'Match Complete', action: null },
};

export default function MatchView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [vetoTurn, setVetoTurn] = useState(null); // 'player2' first, then 'player1'
  const [scores, setScores] = useState({}); // {songId: {p1: 0, p2: 0, winner: null}}
  const [submitting, setSubmitting] = useState(false);

  const loadMatch = useCallback(async () => {
    try {
      const data = await getMatch(id);
      setMatch(data);

      // Determine veto turn
      const vetoed = data.vetoed_songs || [];
      if (data.status === 'DRAWING' || data.status === 'VETOING') {
        if (vetoed.length === 0) setVetoTurn('player2'); // Lower seed vetos first
        else if (vetoed.length === 1) setVetoTurn('player1');
        else setVetoTurn(null);
      }

      // Init scores for ready/completed
      if (data.status === 'READY' || data.status === 'COMPLETED') {
        const drawn = data.drawn_songs || [];
        const vetodIds = (data.vetoed_songs || []).map(v => v.song_id);
        const playable = drawn.filter(s => !vetodIds.includes(s.id));
        const existingPlayed = data.played_songs || [];

        const s = {};
        playable.forEach((song, i) => {
          const existing = existingPlayed[i] || {};
          s[song.id] = {
            p1: existing.p1_score || '',
            p2: existing.p2_score || '',
            winner: existing.song_winner_id || null,
          };
        });
        setScores(s);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadMatch(); }, [loadMatch]);

  const handleDraw = async () => {
    setDrawing(true);
    try {
      await drawCards(id);
      setShowCards(false);
      await loadMatch();
      // Animate cards appearing
      setTimeout(() => setShowCards(true), 100);
    } catch (err) {
      alert(err.message);
    } finally {
      setDrawing(false);
    }
  };

  const handleVeto = async (songId) => {
    if (!vetoTurn) return;
    const playerId = vetoTurn === 'player1' ? match.player1_id : match.player2_id;
    try {
      await vetoSong(id, { song_id: songId, player_id: playerId });
      await loadMatch();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleScoreChange = (songId, player, value) => {
    setScores(prev => ({
      ...prev,
      [songId]: { ...prev[songId], [player]: value },
    }));
  };

  const handleSongWinner = (songId, winnerId) => {
    setScores(prev => ({
      ...prev,
      [songId]: { ...prev[songId], winner: winnerId },
    }));
  };

  const handleSubmitResult = async () => {
    const drawn = match.drawn_songs || [];
    const vetodIds = (match.vetoed_songs || []).map(v => v.song_id);
    const playable = drawn.filter(s => !vetodIds.includes(s.id));

    const playedSongs = playable.map(song => ({
      song_id: song.id,
      song,
      p1_score: parseInt(scores[song.id]?.p1) || 0,
      p2_score: parseInt(scores[song.id]?.p2) || 0,
      song_winner_id: scores[song.id]?.winner,
      title: song.title,
      mode: song.mode,
      level: song.level,
    }));

    // Count song wins
    let p1Wins = 0, p2Wins = 0;
    playedSongs.forEach(ps => {
      if (ps.song_winner_id === match.player1_id) p1Wins++;
      else if (ps.song_winner_id === match.player2_id) p2Wins++;
    });

    if (p1Wins === p2Wins) return alert('Match cannot be a draw. Please select a winner for each song.');
    if (p1Wins + p2Wins < playedSongs.length) return alert('Please select a winner for each song.');

    const winnerId = p1Wins > p2Wins ? match.player1_id : match.player2_id;

    setSubmitting(true);
    try {
      await submitResult(id, {
        winner_id: winnerId,
        played_songs: playedSongs,
        scores: { player1_wins: p1Wins, player2_wins: p2Wins },
      });

      // If KotH match, advance
      if (match.stage_phase === 'KOTH') {
        await advanceKoth(id);
      }

      await loadMatch();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!match) return <div className="text-center py-20 text-red-400">Match not found</div>;

  const { player1, player2, status } = match;
  const drawn = match.drawn_songs || [];
  const vetoed = match.vetoed_songs || [];
  const vetoedIds = vetoed.map(v => v.song_id);
  const playable = drawn.filter(s => !vetoedIds.includes(s.id));
  const isKoth = match.stage_phase === 'KOTH';
  const statusInfo = STATUS_FLOW[status] || {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-white transition-colors text-sm mb-4"
      >
        &#8592; Back
      </button>

      {/* Match Header */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className={`badge ${
            status === 'COMPLETED' ? 'badge-completed' :
            status === 'PENDING' ? 'badge-pending' : 'badge-active'
          }`}>
            {statusInfo.label}
          </span>
          <div className="text-sm text-gray-500">
            {isKoth ? `KotH Match ${match.koth_position}` : `Swiss Round ${match.round_number}`}
            {' | '}Lv.{match.difficulty_min}{match.difficulty_max !== match.difficulty_min ? `-${match.difficulty_max}` : ''}
          </div>
        </div>

        {/* Players */}
        <div className="flex items-center justify-between">
          <PlayerHeader
            player={player1}
            label={isKoth ? 'Challenger' : `Seed ${player1?.seed_rank}`}
            isWinner={match.winner_id === match.player1_id}
            score={match.scores?.player1_wins}
          />

          <div className="text-center px-6">
            {status === 'COMPLETED' ? (
              <div className="font-display font-bold text-3xl">
                <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-600'}>
                  {match.scores?.player1_wins || 0}
                </span>
                <span className="text-gray-700 mx-2">-</span>
                <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-600'}>
                  {match.scores?.player2_wins || 0}
                </span>
              </div>
            ) : (
              <div className="font-display font-bold text-2xl text-gray-600">VS</div>
            )}
          </div>

          <PlayerHeader
            player={player2}
            label={isKoth ? 'Defender' : `Seed ${player2?.seed_rank}`}
            isWinner={match.winner_id === match.player2_id}
            score={match.scores?.player2_wins}
            align="right"
          />
        </div>
      </div>

      {/* Draw Button */}
      {status === 'PENDING' && (
        <div className="text-center py-8">
          <button
            onClick={handleDraw}
            className="btn-primary text-xl px-12 py-4 font-display tracking-wider"
            disabled={drawing}
          >
            {drawing ? 'Drawing...' : 'DRAW CARDS'}
          </button>
          <p className="text-sm text-gray-500 mt-2">5 random charts from the song pool</p>
        </div>
      )}

      {/* Card Draw Display */}
      {drawn.length > 0 && status !== 'PENDING' && (
        <div className="mb-6">
          <h3 className="font-display font-bold text-lg mb-3">
            {status === 'DRAWING' || status === 'VETOING' ? 'Veto Phase' :
             status === 'READY' ? 'Set List' : 'Songs Played'}
          </h3>

          {/* Veto instruction */}
          {(status === 'DRAWING' || status === 'VETOING') && vetoTurn && (
            <div className="card mb-4 border-piu-accent/50 bg-piu-accent/5 text-center py-3">
              <p className="font-display font-bold text-piu-accent">
                {vetoTurn === 'player2' ? player2?.name : player1?.name}'s turn to veto
              </p>
              <p className="text-sm text-gray-400">Click a song card to ban it</p>
            </div>
          )}

          {/* Song Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {drawn.map((song, idx) => {
              const isVetoed = vetoedIds.includes(song.id);
              const vetoInfo = vetoed.find(v => v.song_id === song.id);
              const canVeto = (status === 'DRAWING' || status === 'VETOING') && !isVetoed && vetoTurn;

              return (
                <SongCard
                  key={song.id}
                  song={song}
                  index={idx}
                  isVetoed={isVetoed}
                  vetoInfo={vetoInfo}
                  player1={player1}
                  player2={player2}
                  canVeto={canVeto}
                  onVeto={() => handleVeto(song.id)}
                  showAnimation={showCards || status !== 'DRAWING'}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Scoring Section */}
      {(status === 'READY') && (
        <div className="space-y-4">
          <h3 className="font-display font-bold text-lg">Score Entry</h3>

          {playable.map((song, idx) => (
            <div key={song.id} className="card">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center font-display font-bold text-sm
                  ${song.mode === 'Double' ? 'bg-blue-500/20 text-blue-400' : 'bg-piu-accent/20 text-piu-accent'}`}>
                  {song.mode[0]}{song.level}
                </div>
                <div>
                  <span className="font-display font-bold">{song.title}</span>
                  <span className="text-xs text-gray-500 ml-2">{song.artist}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center">
                {/* Player 1 score */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{player1?.name}</label>
                  <input
                    type="number"
                    className="input-field text-center"
                    placeholder="Score"
                    value={scores[song.id]?.p1 || ''}
                    onChange={e => handleScoreChange(song.id, 'p1', e.target.value)}
                  />
                </div>

                {/* Winner toggle */}
                <div className="flex flex-col items-center gap-1">
                  <label className="text-xs text-gray-500">Winner</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleSongWinner(song.id, match.player1_id)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                        scores[song.id]?.winner === match.player1_id
                          ? 'bg-piu-green text-black'
                          : 'bg-piu-dark text-gray-500 hover:text-white'
                      }`}
                    >
                      P1
                    </button>
                    <button
                      onClick={() => handleSongWinner(song.id, match.player2_id)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                        scores[song.id]?.winner === match.player2_id
                          ? 'bg-piu-green text-black'
                          : 'bg-piu-dark text-gray-500 hover:text-white'
                      }`}
                    >
                      P2
                    </button>
                  </div>
                </div>

                {/* Player 2 score */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{player2?.name}</label>
                  <input
                    type="number"
                    className="input-field text-center"
                    placeholder="Score"
                    value={scores[song.id]?.p2 || ''}
                    onChange={e => handleScoreChange(song.id, 'p2', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={handleSubmitResult}
            className="btn-primary w-full text-lg py-3 font-display"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Results'}
          </button>
        </div>
      )}

      {/* Completed result */}
      {status === 'COMPLETED' && match.played_songs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-lg">Songs Played</h3>
          {match.played_songs.map((ps, idx) => (
            <div key={idx} className="card flex items-center gap-4">
              <div className={`w-8 h-8 rounded flex items-center justify-center font-display font-bold text-xs
                ${(ps.mode || ps.song?.mode) === 'Double' ? 'bg-blue-500/20 text-blue-400' : 'bg-piu-accent/20 text-piu-accent'}`}>
                {(ps.mode || ps.song?.mode || 'S')[0]}{ps.level || ps.song?.level}
              </div>
              <div className="flex-1">
                <span className="font-display font-bold">{ps.title || ps.song?.title}</span>
                <span className="text-xs text-gray-500 ml-2">{ps.song?.artist}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className={ps.song_winner_id === match.player1_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                  {ps.p1_score}
                </span>
                <span className="text-gray-700">-</span>
                <span className={ps.song_winner_id === match.player2_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                  {ps.p2_score}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerHeader({ player, label, isWinner, score, align = 'left' }) {
  if (!player) return <div className="flex-1" />;

  return (
    <div className={`flex-1 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-xs text-gray-500 font-display uppercase">{label}</p>
      <p className={`font-display font-bold text-xl ${isWinner ? 'text-piu-green' : ''}`}>
        {player.name}
        {isWinner && <span className="ml-2 text-sm">&#9733;</span>}
      </p>
      {player.skill_title && (
        <p className="text-xs text-gray-500">{player.skill_title}</p>
      )}
    </div>
  );
}
