import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMatch, drawCards, vetoSong, submitResult } from '../utils/api';
import SongCard from '../components/SongCard';

const STATUS_FLOW = {
  PENDING: { label: 'Ready to Draw', action: 'Draw Cards' },
  DRAWING: { label: 'Cards Drawn - Veto Phase', action: null },
  VETOING: { label: 'Veto in Progress', action: null },
  READY: { label: 'Set List Ready - Play!', action: null },
  COMPLETED: { label: 'Match Complete', action: null },
};

const formatScore = (score) => {
  if (!score && score !== 0) return '';
  return Number(score).toLocaleString();
};

export default function MatchView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [vetoTurn, setVetoTurn] = useState(null);
  const [scores, setScores] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadMatch = useCallback(async () => {
    try {
      const data = await getMatch(id);
      setMatch(data);

      // Determine veto turn: higher seed (player1) vetos first
      const vetoed = data.vetoed_songs || [];
      if (data.status === 'DRAWING' || data.status === 'VETOING') {
        if (vetoed.length === 0) setVetoTurn('player1'); // Higher seed first
        else if (vetoed.length === 1) setVetoTurn('player2');
        else setVetoTurn(null);
      }

      // Init scores
      if (data.status === 'READY' || data.status === 'COMPLETED') {
        const drawn = data.drawn_songs || [];
        const vetodIds = (data.vetoed_songs || []).map(v => v.song_id);
        const playable = drawn.filter(s => !vetodIds.includes(s.id));
        const existingPlayed = data.played_songs || [];

        const s = {};
        playable.forEach((song, i) => {
          const existing = existingPlayed[i] || {};
          s[song.id] = {
            p1: existing.p1_score != null ? String(existing.p1_score) : '',
            p2: existing.p2_score != null ? String(existing.p2_score) : '',
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
    const num = value.replace(/[^0-9]/g, '');
    const clamped = num ? Math.min(parseInt(num), 1000000) : '';
    setScores(prev => ({
      ...prev,
      [songId]: { ...prev[songId], [player]: String(clamped) },
    }));
  };

  // Calculate song winners and match state from scores
  const getSongResults = () => {
    if (!match) return { results: [], p1Wins: 0, p2Wins: 0, matchOver: false, winnerId: null };

    const drawn = match.drawn_songs || [];
    const vetodIds = (match.vetoed_songs || []).map(v => v.song_id);
    const playable = drawn.filter(s => !vetodIds.includes(s.id));

    let p1Wins = 0, p2Wins = 0;
    const results = [];

    for (const song of playable) {
      const s = scores[song.id] || {};
      const p1Score = parseInt(s.p1) || 0;
      const p2Score = parseInt(s.p2) || 0;
      const hasScores = s.p1 !== '' && s.p2 !== '';

      let songWinnerId = null;
      if (hasScores) {
        if (p1Score > p2Score) { songWinnerId = match.player1_id; p1Wins++; }
        else if (p2Score > p1Score) { songWinnerId = match.player2_id; p2Wins++; }
      }

      results.push({ song, p1Score, p2Score, songWinnerId, hasScores });

      // Check if match is already decided (best of 3)
      if (p1Wins >= 2 || p2Wins >= 2) break;
    }

    const matchOver = p1Wins >= 2 || p2Wins >= 2;
    const winnerId = p1Wins >= 2 ? match.player1_id : p2Wins >= 2 ? match.player2_id : null;

    return { results, p1Wins, p2Wins, matchOver, winnerId };
  };

  const handleSubmitResult = async () => {
    const { results, p1Wins, p2Wins, matchOver, winnerId } = getSongResults();

    if (!matchOver) {
      return alert('Match is not decided yet. A player must win 2 songs.');
    }

    const playedSongs = results.filter(r => r.hasScores).map(r => ({
      song_id: r.song.id,
      song: r.song,
      p1_score: r.p1Score,
      p2_score: r.p2Score,
      song_winner_id: r.songWinnerId,
      title: r.song.title,
      mode: r.song.mode,
      level: r.song.level,
    }));

    setSubmitting(true);
    try {
      await submitResult(id, {
        winner_id: winnerId,
        played_songs: playedSongs,
        scores: { player1_wins: p1Wins, player2_wins: p2Wins },
      });
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
  const statusInfo = STATUS_FLOW[status] || {};
  const songResults = getSongResults();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-white transition-colors text-sm mb-4"
      >
        &#8592; Back to matches
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
            Round {match.round_number} | Lv.{match.difficulty_min}{match.difficulty_max !== match.difficulty_min ? `-${match.difficulty_max}` : ''}
          </div>
        </div>

        {/* Players */}
        <div className="flex items-center justify-between">
          <PlayerHeader
            player={player1}
            label={`Seed #${player1?.seed_rank || '?'}`}
            isWinner={match.winner_id === match.player1_id}
            sublabel="Higher Seed"
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
            label={`Seed #${player2?.seed_rank || '?'}`}
            isWinner={match.winner_id === match.player2_id}
            sublabel="Lower Seed"
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
          <p className="text-sm text-gray-500 mt-2">5 random charts (min 2 Single + 2 Double)</p>
        </div>
      )}

      {/* Card Draw Display */}
      {drawn.length > 0 && status !== 'PENDING' && (
        <div className="mb-6">
          <h3 className="font-display font-bold text-lg mb-3">
            {status === 'DRAWING' || status === 'VETOING' ? 'Veto Phase' :
             status === 'READY' ? 'Set List (Best of 3)' : 'Songs Played'}
          </h3>

          {/* Veto instruction */}
          {(status === 'DRAWING' || status === 'VETOING') && vetoTurn && (
            <div className="card mb-4 border-piu-accent/50 bg-piu-accent/5 text-center py-3">
              <p className="font-display font-bold text-piu-accent">
                {vetoTurn === 'player1' ? player1?.name : player2?.name}'s turn to ban
              </p>
              <p className="text-sm text-gray-400">
                {vetoTurn === 'player1' ? '(Higher seed bans first)' : '(Lower seed bans second)'}
                {' - '}Click a song card to ban it
              </p>
            </div>
          )}

          {/* Song Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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

      {/* Scoring Section - Best of 3 */}
      {status === 'READY' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg">Score Entry</h3>
            {songResults.matchOver && (
              <span className="badge badge-completed font-display">
                {songResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins {songResults.p1Wins}-{songResults.p2Wins}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500">
            Enter scores (0 - 1,000,000). Higher score wins each song. Match ends when a player wins 2 songs.
          </p>

          {playable.map((song, idx) => {
            const result = songResults.results[idx];
            // Only show songs up to the match-deciding one
            if (!result && songResults.matchOver) return null;
            // If match is already won in previous songs, don't show this one
            const prevResults = songResults.results.slice(0, idx);
            const prevP1 = prevResults.filter(r => r.songWinnerId === match.player1_id).length;
            const prevP2 = prevResults.filter(r => r.songWinnerId === match.player2_id).length;
            if (prevP1 >= 2 || prevP2 >= 2) return null;

            const songScore = scores[song.id] || {};
            const p1Val = parseInt(songScore.p1) || 0;
            const p2Val = parseInt(songScore.p2) || 0;
            const hasScores = songScore.p1 !== '' && songScore.p2 !== '';
            const p1Wins = hasScores && p1Val > p2Val;
            const p2Wins = hasScores && p2Val > p1Val;

            return (
              <div key={song.id} className={`card ${hasScores ? (p1Val === p2Val ? 'border-yellow-500/30' : 'border-piu-green/20') : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-sm
                    ${song.mode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    {song.mode[0]}{song.level}
                  </div>
                  <div className="flex-1">
                    <span className="font-display font-bold">{song.title}</span>
                    <span className="text-xs text-gray-500 ml-2">{song.artist}</span>
                  </div>
                  {hasScores && p1Val === p2Val && songScore.p1 !== '' && (
                    <span className="text-xs text-yellow-400 font-display">TIE</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 items-center">
                  <div>
                    <label className={`text-xs block mb-1 ${p1Wins ? 'text-piu-green font-bold' : 'text-gray-500'}`}>
                      {player1?.name} {p1Wins ? '- WIN' : ''}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`input-field text-center font-mono ${p1Wins ? 'border-piu-green/50' : ''}`}
                      placeholder="0 - 1,000,000"
                      value={songScore.p1 !== undefined ? formatScore(songScore.p1) : ''}
                      onChange={e => handleScoreChange(song.id, 'p1', e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-gray-600 font-display text-xs">VS</span>
                  </div>

                  <div>
                    <label className={`text-xs block mb-1 text-right ${p2Wins ? 'text-piu-green font-bold' : 'text-gray-500'}`}>
                      {player2?.name} {p2Wins ? '- WIN' : ''}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`input-field text-center font-mono ${p2Wins ? 'border-piu-green/50' : ''}`}
                      placeholder="0 - 1,000,000"
                      value={songScore.p2 !== undefined ? formatScore(songScore.p2) : ''}
                      onChange={e => handleScoreChange(song.id, 'p2', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {songResults.matchOver && (
            <div className="card border-piu-green/30 bg-piu-green/5 text-center py-4">
              <p className="font-display font-bold text-piu-green text-xl">
                {songResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins!
              </p>
              <p className="text-sm text-gray-400">
                {songResults.p1Wins} - {songResults.p2Wins}
                {(songResults.p1Wins === 2 && songResults.p2Wins === 0) || (songResults.p2Wins === 2 && songResults.p1Wins === 0)
                  ? ' (3rd song not needed)' : ''}
              </p>
            </div>
          )}

          <button
            onClick={handleSubmitResult}
            className="btn-primary w-full text-lg py-3 font-display"
            disabled={submitting || !songResults.matchOver}
          >
            {submitting ? 'Submitting...' : songResults.matchOver ? 'Submit Results' : 'Enter scores to determine winner'}
          </button>
        </div>
      )}

      {/* Completed result */}
      {status === 'COMPLETED' && match.played_songs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-lg">Songs Played</h3>
          {match.played_songs.map((ps, idx) => {
            const songMode = ps.mode || ps.song?.mode || 'Single';
            const songLevel = ps.level || ps.song?.level;
            return (
              <div key={idx} className="card flex items-center gap-4">
                <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs
                  ${songMode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {songMode[0]}{songLevel}
                </div>
                <div className="flex-1">
                  <span className="font-display font-bold">{ps.title || ps.song?.title}</span>
                  <span className="text-xs text-gray-500 ml-2">{ps.song?.artist}</span>
                </div>
                <div className="flex gap-4 text-sm font-mono">
                  <span className={ps.song_winner_id === match.player1_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                    {formatScore(ps.p1_score)}
                  </span>
                  <span className="text-gray-700">-</span>
                  <span className={ps.song_winner_id === match.player2_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                    {formatScore(ps.p2_score)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlayerHeader({ player, label, isWinner, sublabel, align = 'left' }) {
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
      {sublabel && (
        <p className="text-[10px] text-gray-600">{sublabel}</p>
      )}
    </div>
  );
}
