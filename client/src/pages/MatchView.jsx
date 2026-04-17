import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMatch, drawCards, vetoSong, submitResult } from '../utils/api';
import SongCard from '../components/SongCard';
import { getAvatarUrl } from '../components/AvatarPicker';
import { useToast } from '../contexts/ToastContext';
import { useChopSound, useShuffleSound } from '../hooks/useSound';

const STATUS_FLOW = {
  PENDING: { label: 'Ready to Draw', action: 'Draw Cards' },
  DRAWING: { label: 'Cards Drawn - Veto Phase', action: null },
  VETOING: { label: 'Veto in Progress', action: null },
  READY: { label: 'Set List Ready - Play!', action: null },
  COMPLETED: { label: 'Match Complete', action: null },
};

const GAUNTLET_STATUS_FLOW = {
  PENDING: { label: 'Ready to Draw', action: 'Draw Cards' },
  DRAWING: { label: 'Cards Drawn - Veto Phase', action: null },
  VETOING: { label: 'Veto in Progress', action: null },
  READY: { label: 'Set List Ready - Play!', action: null },
  COMPLETED: { label: 'Match Complete', action: null },
};

const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

const SKILL_COLORS = {
  Beginner: 'text-green-400',
  Intermediate: 'text-piu-bronze',
  Advanced: 'text-piu-silver',
  Expert: 'text-piu-gold',
};

const formatScore = (score) => {
  if (!score && score !== 0) return '';
  return Number(score).toLocaleString();
};

const getSkillColorFromTitle = (title) => {
  if (!title) return 'text-gray-500';
  for (const [key, val] of Object.entries(SKILL_COLORS)) {
    if (title.startsWith(key)) return val;
  }
  return 'text-gray-500';
};

const getBestOf = (match) => (parseInt(match?.match_rules?.best_of, 10) === 1 ? 1 : 3);

const usesLegacyGauntletScoring = (match) => (
  match?.match_type === 'gauntlet'
  && (match?.played_songs || []).length === 2
  && match?.scores?.player1_wins == null
  && match?.scores?.player2_wins == null
  && match?.scores?.p1_total != null
  && match?.scores?.p2_total != null
);

const getPlayableSongs = (match, legacyGauntlet = false) => {
  const drawn = match?.drawn_songs || [];
  const existingPlayed = match?.played_songs || [];
  if (legacyGauntlet && match?.match_type === 'gauntlet') return drawn;
  if ((match?.status === 'READY' || match?.status === 'COMPLETED') && existingPlayed.length > 0) {
    return existingPlayed.map((ps) => ps.song || ps);
  }
  const vetoedIds = (match?.vetoed_songs || []).map((v) => v.song_id);
  return drawn.filter((song) => !vetoedIds.includes(song.id));
};

export default function MatchView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [vetoTurn, setVetoTurn] = useState(null);
  const [scores, setScores] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [focusedCardIdx, setFocusedCardIdx] = useState(0);
  const { play: playChop } = useChopSound(0.7);
  const { play: playShuffle, stop: stopShuffle } = useShuffleSound(0.4);
  const [shuffleRevealed, setShuffleRevealed] = useState(false);

  const loadMatch = useCallback(async () => {
    try {
      const data = await getMatch(id);
      setMatch(data);

      const isGauntlet = data.match_type === 'gauntlet';
      const legacyGauntlet = usesLegacyGauntletScoring(data);

      // If cards have already been drawn, make sure they're visible
      // (handles the case where user navigates away and comes back)
      if ((data.drawn_songs || []).length > 0 && data.status !== 'PENDING') {
        setShowCards(true);
      }

      // Determine veto turn: lower seed (player2) vetos first when vetoes are active
      if (!legacyGauntlet && (data.status === 'DRAWING' || data.status === 'VETOING')) {
        const vetoed = data.vetoed_songs || [];
        if (vetoed.length === 0) setVetoTurn('player2');
        else if (vetoed.length === 1) setVetoTurn('player1');
        else setVetoTurn(null);
      } else {
        setVetoTurn(null);
      }

      // Init scores
      if (data.status === 'READY' || data.status === 'COMPLETED') {
        const existingPlayed = data.played_songs || [];
        const playable = getPlayableSongs(data, legacyGauntlet && isGauntlet);

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

  useEffect(() => {
    if (shuffling) playShuffle();
    else stopShuffle();
  }, [shuffling, playShuffle, stopShuffle]);

  const handleDraw = async () => {
    setDrawing(true);
    try {
      await drawCards(id);
      setShowCards(false);
      await loadMatch();
      setTimeout(() => setShowCards(true), 100);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDrawing(false);
    }
  };

  const handleVeto = async (songId) => {
    if (!vetoTurn) return;
    playChop();
    const playerId = vetoTurn === 'player1' ? match.player1_id : match.player2_id;
    try {
      const result = await vetoSong(id, { song_id: songId, player_id: playerId });
      if (result.status === 'READY') {
        // Both vetoes done - trigger shuffle animation before loading final state
        setShuffling(true);
        setShuffleRevealed(false);
        setTimeout(() => {
          setShuffling(false);
          setShuffleRevealed(true);
          loadMatch();
        }, 2000);
      } else {
        await loadMatch();
      }
    } catch (err) {
      addToast(err.message, 'error');
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

  const getSeriesResults = () => {
    const bestOf = getBestOf(match);
    const majority = Math.ceil(bestOf / 2);
    if (!match) {
      return { results: [], p1Wins: 0, p2Wins: 0, matchOver: false, winnerId: null, p1Total: 0, p2Total: 0, songsNeeded: bestOf };
    }

    const songsToScore = getPlayableSongs(match, false);

    let p1Wins = 0, p2Wins = 0, p1Total = 0, p2Total = 0;
    const results = [];

    for (let i = 0; i < songsToScore.length; i++) {
      const song = songsToScore[i];
      const s = scores[song.id] || {};
      const p1Score = parseInt(s.p1) || 0;
      const p2Score = parseInt(s.p2) || 0;
      const hasScores = s.p1 !== '' && s.p2 !== '';

      if (p1Wins >= majority || p2Wins >= majority) {
        results.push({ song, p1Score: 0, p2Score: 0, songWinnerId: null, hasScores: false, skipped: true });
        continue;
      }

      let songWinnerId = null;
      if (hasScores) {
        p1Total += p1Score;
        p2Total += p2Score;
        if (p1Score > p2Score) { songWinnerId = match.player1_id; p1Wins++; }
        else if (p2Score > p1Score) { songWinnerId = match.player2_id; p2Wins++; }
      }

      results.push({ song, p1Score, p2Score, songWinnerId, hasScores, skipped: false });
    }

    const matchOver = p1Wins >= majority || p2Wins >= majority;
    const winnerId = matchOver ? (p1Wins >= majority ? match.player1_id : match.player2_id) : null;
    const scoredCount = results.filter((r) => r.hasScores && !r.skipped).length;
    const allScoredDone = scoredCount > 0 && results.filter((r) => !r.skipped).every((r) => r.hasScores);

    return { results, p1Wins, p2Wins, matchOver, winnerId, p1Total, p2Total, allScoredDone, songsNeeded: matchOver ? scoredCount : bestOf };
  };

  // Calculate gauntlet results (combined total score)
  const getGauntletResults = () => {
    if (!match) return { results: [], p1Total: 0, p2Total: 0, matchOver: false, winnerId: null };

    const drawn = match.drawn_songs || [];
    let p1Total = 0, p2Total = 0;
    let allHaveScores = true;
    const results = [];

    for (const song of drawn) {
      const s = scores[song.id] || {};
      const p1Score = parseInt(s.p1) || 0;
      const p2Score = parseInt(s.p2) || 0;
      const hasScores = s.p1 !== '' && s.p2 !== '';

      if (!hasScores) allHaveScores = false;
      if (hasScores) {
        p1Total += p1Score;
        p2Total += p2Score;
      }

      results.push({ song, p1Score, p2Score, hasScores });
    }

    const matchOver = allHaveScores && drawn.length === 2 && p1Total !== p2Total;
    const winnerId = matchOver ? (p1Total > p2Total ? match.player1_id : match.player2_id) : null;

    return { results, p1Total, p2Total, matchOver, winnerId, allHaveScores };
  };

  const handleSubmitResult = async () => {
    if (usesLegacyGauntletScoring(match)) {
      const { results, p1Total, p2Total, matchOver, winnerId, allHaveScores } = getGauntletResults();

      if (!allHaveScores) {
        return addToast('Enter scores for both songs.', 'error');
      }
      if (p1Total === p2Total) {
        return addToast('Combined scores are tied. There must be a winner.', 'error');
      }
      if (!matchOver) {
        return addToast('Match is not decided yet.', 'error');
      }

      const playedSongs = results.filter(r => r.hasScores).map(r => ({
        song_id: r.song.id,
        song: r.song,
        p1_score: r.p1Score,
        p2_score: r.p2Score,
        title: r.song.title,
        mode: r.song.mode,
        level: r.song.level,
      }));

      setSubmitting(true);
      try {
        await submitResult(id, {
          winner_id: winnerId,
          played_songs: playedSongs,
          scores: { p1_total: p1Total, p2_total: p2Total },
        });
        await loadMatch();
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setSubmitting(false);
      }
    } else {
      const { results, p1Wins, p2Wins, matchOver, winnerId, p1Total, p2Total } = getSeriesResults();

      if (!matchOver) {
        return addToast('Match is not decided yet.', 'error');
      }

      const playedSongs = results.filter(r => r.hasScores && !r.skipped).map(r => ({
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
          scores: { player1_wins: p1Wins, player2_wins: p2Wins, p1_total: p1Total, p2_total: p2Total },
        });
        await loadMatch();
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!match) return <div className="text-center py-20 text-red-400">Match not found</div>;

  const { player1, player2, status } = match;
  const isGauntlet = match.match_type === 'gauntlet';
  const bestOf = getBestOf(match);
  const legacyGauntlet = usesLegacyGauntletScoring(match);
  const drawn = match.drawn_songs || [];
  const vetoed = match.vetoed_songs || [];
  const vetoedIds = vetoed.map(v => v.song_id);
  const playable = getPlayableSongs(match, legacyGauntlet);
  const statusInfo = (isGauntlet ? GAUNTLET_STATUS_FLOW : STATUS_FLOW)[status] || {};
  const songResults = legacyGauntlet ? null : getSeriesResults();
  const gauntletResults = legacyGauntlet ? getGauntletResults() : null;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-500 hover:text-white transition-colors text-sm mb-4"
      >
        &#8592; Back to matches
      </button>

      {/* Match Header */}
      <div className="card mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <span className={`badge ${
              status === 'COMPLETED' ? 'badge-completed' :
              status === 'PENDING' ? 'badge-pending' : 'badge-active'
            }`}>
              {statusInfo.label}
            </span>
            {isGauntlet && (
              <span className="badge bg-piu-accent/20 text-piu-accent text-[10px]">GAUNTLET</span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            {isGauntlet
              ? `Match #${match.gauntlet_order} | Lv.${match.difficulty_min} mixed draw | ${bestOf === 1 ? '1 song' : 'Best of 3'}`
              : `Round ${match.round_number} | Lv.${match.difficulty_min}${match.difficulty_max !== match.difficulty_min ? `-${match.difficulty_max}` : ''}`
            }
          </div>
        </div>

        {/* Players */}
        <div className="flex items-center justify-between">
          <PlayerHeader
            player={player1}
            label={isGauntlet ? 'Challenger' : `Seed #${player1?.seed_rank || '?'}`}
            isWinner={match.winner_id === match.player1_id}
            sublabel={isGauntlet ? '' : 'Higher Seed'}
          />

          <div className="text-center px-3 sm:px-6">
            {status === 'COMPLETED' ? (
              legacyGauntlet ? (
                <div className="flex flex-col items-center">
                  <div className="font-display font-bold text-lg sm:text-xl">
                    <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-600'}>
                      {match.scores?.p1_total != null ? Number(match.scores.p1_total).toLocaleString() : '0'}
                    </span>
                  </div>
                  <span className="text-gray-700 text-xs">vs</span>
                  <div className="font-display font-bold text-lg sm:text-xl">
                    <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-600'}>
                      {match.scores?.p2_total != null ? Number(match.scores.p2_total).toLocaleString() : '0'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="font-display font-bold text-2xl sm:text-3xl">
                  <span className={match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-600'}>
                    {match.scores?.player1_wins || 0}
                  </span>
                  <span className="text-gray-700 mx-1 sm:mx-2">-</span>
                  <span className={match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-600'}>
                    {match.scores?.player2_wins || 0}
                  </span>
                </div>
              )
            ) : (
              <div className="font-display font-bold text-xl sm:text-2xl text-gray-600">VS</div>
            )}
          </div>

          <PlayerHeader
            player={player2}
            label={isGauntlet ? (match.gauntlet_order === 1 ? 'Bottom Rank' : 'Defender') : `Seed #${player2?.seed_rank || '?'}`}
            isWinner={match.winner_id === match.player2_id}
            sublabel={isGauntlet ? '' : 'Lower Seed'}
            align="right"
          />
        </div>
      </div>

      {/* Draw Button */}
      {status === 'PENDING' && (
        <div className="text-center py-6 sm:py-8">
          <button
            onClick={handleDraw}
            className="btn-primary text-lg sm:text-xl px-8 sm:px-12 py-3 sm:py-4 font-display tracking-wider"
            disabled={drawing}
          >
            {drawing ? 'Drawing...' : 'DRAW CARDS'}
          </button>
          <p className="text-sm text-gray-500 mt-2">
            {isGauntlet
              ? (bestOf === 1
                ? `Draw 1 singles-or-doubles chart at Lv.${match.difficulty_min}`
                : `Draw 5 singles-or-doubles charts at Lv.${match.difficulty_min}, veto 1 each, then play the final 3`)
              : '5 drawn, 2 vetoed, best of 3 remaining'
            }
          </p>
        </div>
      )}

      {/* Shuffle Animation Overlay */}
      {shuffling && (
        <div className="mb-4 sm:mb-6">
          <h3 className="font-display font-bold text-lg mb-3 text-piu-accent text-center animate-pulse">
            Shuffling songs...
          </h3>
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-20 h-28 sm:w-28 sm:h-40 rounded-xl bg-gradient-to-b from-piu-accent/30 to-purple-900/30 border-2 border-piu-accent/50"
                style={{
                  animation: `shuffleCard 0.4s ease-in-out ${i * 0.13}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes shuffleCard {
              0% { transform: translateX(-20px) rotate(-8deg) scale(0.95); }
              50% { transform: translateX(0) rotate(0deg) scale(1.05); }
              100% { transform: translateX(20px) rotate(8deg) scale(0.95); }
            }
          `}</style>
        </div>
      )}

      {/* Card Draw Display - Round Robin (with veto) */}
      {(!isGauntlet || (!legacyGauntlet && bestOf > 1)) && !shuffling && drawn.length > 0 && status !== 'PENDING' && (
        <div className="mb-4 sm:mb-6">
          <h3 className="font-display font-bold text-lg mb-3">
            {status === 'DRAWING' || status === 'VETOING' ? 'Veto Phase' :
             status === 'READY' ? 'Songs to Play' : 'Songs Played'}
          </h3>

          {/* Veto instruction */}
          {(status === 'DRAWING' || status === 'VETOING') && vetoTurn && (
            <div className="card mb-3 sm:mb-4 border-piu-accent/50 bg-piu-accent/5 text-center py-2 sm:py-3">
              <p className="font-display font-bold text-piu-accent">
                {vetoTurn === 'player1' ? player1?.name : player2?.name}'s turn to ban
              </p>
              <p className="text-sm text-gray-400">
                {vetoTurn === 'player2' ? '(Lower seed bans first)' : '(Higher seed bans second)'}
                {' - '}Tap a song card to ban it
              </p>
            </div>
          )}

          {/* Song Cards Grid - Veto phase: show all 5 */}
          {(status === 'DRAWING' || status === 'VETOING') && (
            <div
              className="grid grid-cols-5 gap-1.5 sm:gap-3"
              tabIndex={0}
              onKeyDown={(e) => {
                const maxIdx = drawn.length - 1;
                if (e.key === 'ArrowRight') setFocusedCardIdx(i => Math.min(i + 1, maxIdx));
                if (e.key === 'ArrowLeft') setFocusedCardIdx(i => Math.max(i - 1, 0));
                if ((e.key === 'Enter' || e.key === ' ') && vetoTurn) {
                  const nonVetoed = drawn.filter(s => !vetoedIds.includes(s.id));
                  const target = nonVetoed[focusedCardIdx];
                  if (target) handleVeto(target.id);
                }
              }}
            >
              {drawn.map((song, idx) => {
                const isVetoed = vetoedIds.includes(song.id);
                const vetoInfo = vetoed.find(v => v.song_id === song.id);
                const canVeto = !isVetoed && vetoTurn;

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
          )}

          {/* READY / COMPLETED: show the 3 remaining songs */}
          {(status === 'READY' || status === 'COMPLETED') && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
              {playable.map((song, idx) => (
                <SongCard
                  key={song.id}
                  song={song}
                  index={idx}
                  isVetoed={false}
                  canVeto={false}
                  showAnimation={shuffleRevealed || !shuffling}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Card Draw Display - Gauntlet (no veto) */}
      {isGauntlet && (legacyGauntlet || bestOf === 1) && drawn.length > 0 && status !== 'PENDING' && status !== 'COMPLETED' && (
        <div className="mb-4 sm:mb-6">
          <h3 className="font-display font-bold text-lg mb-3">Songs to Play</h3>
          <div className={`grid gap-2 sm:gap-4 ${drawn.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {drawn.map((song, idx) => (
              <SongCard
                key={song.id}
                song={song}
                index={idx}
                isVetoed={false}
                canVeto={false}
                showAnimation={showCards || status !== 'READY'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scoring Section - Round Robin (Best of 3) */}
      {songResults && status === 'READY' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg">Score Entry</h3>
            {songResults.matchOver && (
              <span className="badge badge-completed font-display">
                {songResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins {songResults.p1Wins}-{songResults.p2Wins}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500">
            {bestOf === 1
              ? 'Single-song draw: higher score wins the match. Enter scores (0 - 1,000,000).'
              : 'Best of 3: first to win 2 songs wins the match. Enter scores (0 - 1,000,000).'}
          </p>

          {playable.map((song, idx) => {
            const songResult = songResults.results[idx];
            const isSkipped = songResult?.skipped;
            const songScore = scores[song.id] || {};
            const p1Val = parseInt(songScore.p1) || 0;
            const p2Val = parseInt(songScore.p2) || 0;
            const hasScores = songScore.p1 !== '' && songScore.p2 !== '';
            const p1SongWin = hasScores && p1Val > p2Val;
            const p2SongWin = hasScores && p2Val > p1Val;

            if (isSkipped) {
              return (
                <div key={song.id} className="card opacity-40">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs sm:text-sm
                      ${song.mode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                      {song.mode[0]}{song.level}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-display font-bold text-sm sm:text-base truncate block">{song.title}</span>
                    </div>
                    <span className="text-xs text-gray-500 font-display">NOT NEEDED</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={song.id} className={`card ${hasScores ? (p1Val === p2Val ? 'border-yellow-500/30' : 'border-piu-green/20') : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3 mb-3">
                  <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs sm:text-sm
                    ${song.mode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    {song.mode[0]}{song.level}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-display font-bold text-sm sm:text-base truncate block">{song.title}</span>
                    <span className="text-xs text-gray-500">{song.artist}</span>
                  </div>
                  {hasScores && p1Val === p2Val && songScore.p1 !== '' && (
                    <span className="text-xs text-yellow-400 font-display">TIE</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                  <div>
                    <label className={`text-xs block mb-1 ${p1SongWin ? 'text-piu-green font-bold' : 'text-gray-500'}`}>
                      {player1?.name} {p1SongWin ? '- WIN' : ''}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`input-field text-center font-mono text-sm ${p1SongWin ? 'border-piu-green/50' : ''}`}
                      placeholder="Score"
                      value={songScore.p1 !== undefined ? formatScore(songScore.p1) : ''}
                      onChange={e => handleScoreChange(song.id, 'p1', e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-gray-600 font-display text-xs">VS</span>
                  </div>

                  <div>
                    <label className={`text-xs block mb-1 text-right ${p2SongWin ? 'text-piu-green font-bold' : 'text-gray-500'}`}>
                      {player2?.name} {p2SongWin ? '- WIN' : ''}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`input-field text-center font-mono text-sm ${p2SongWin ? 'border-piu-green/50' : ''}`}
                      placeholder="Score"
                      value={songScore.p2 !== undefined ? formatScore(songScore.p2) : ''}
                      onChange={e => handleScoreChange(song.id, 'p2', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {songResults.matchOver && (
            <div className="card text-center py-4 border-piu-green/30 bg-piu-green/5">
              <p className="font-display font-bold text-piu-green text-xl">
                {songResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins!
              </p>
              <p className="text-sm text-gray-400">
                Songs: {songResults.p1Wins} - {songResults.p2Wins}
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

      {/* Scoring Section - Legacy Gauntlet (Combined Score) */}
      {gauntletResults && status === 'READY' && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg">Score Entry</h3>
            {gauntletResults.matchOver && (
              <span className="badge badge-completed font-display">
                {gauntletResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins!
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500">
            Enter scores (0 - 1,000,000) for each song. Highest combined total wins.
          </p>

          {playable.map((song, idx) => {
            const songScore = scores[song.id] || {};

            return (
              <div key={song.id} className="card">
                <div className="flex items-center gap-2 sm:gap-3 mb-3">
                  <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs sm:text-sm
                    ${song.mode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                    {song.mode[0]}{song.level}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-display font-bold text-sm sm:text-base truncate block">{song.title}</span>
                    <span className="text-xs text-gray-500">{song.artist}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                  <div>
                    <label className="text-xs block mb-1 text-gray-500">
                      {player1?.name}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-field text-center font-mono text-sm"
                      placeholder="Score"
                      value={songScore.p1 !== undefined ? formatScore(songScore.p1) : ''}
                      onChange={e => handleScoreChange(song.id, 'p1', e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-gray-600 font-display text-xs">VS</span>
                  </div>

                  <div>
                    <label className="text-xs block mb-1 text-right text-gray-500">
                      {player2?.name}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-field text-center font-mono text-sm"
                      placeholder="Score"
                      value={songScore.p2 !== undefined ? formatScore(songScore.p2) : ''}
                      onChange={e => handleScoreChange(song.id, 'p2', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Combined Total Display */}
          {gauntletResults.allHaveScores && (
            <div className={`card text-center py-4 ${
              gauntletResults.matchOver
                ? 'border-piu-green/30 bg-piu-green/5'
                : 'border-yellow-500/30 bg-yellow-500/5'
            }`}>
              <p className="text-xs text-gray-400 font-display uppercase tracking-wider mb-2">Combined Total</p>
              <div className="flex items-center justify-center gap-4 sm:gap-8">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{player1?.name}</p>
                  <p className={`font-display font-bold text-xl sm:text-2xl ${
                    gauntletResults.winnerId === match.player1_id ? 'text-piu-green' : 'text-gray-400'
                  }`}>
                    {Number(gauntletResults.p1Total).toLocaleString()}
                  </p>
                </div>
                <span className="text-gray-600 font-display">vs</span>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{player2?.name}</p>
                  <p className={`font-display font-bold text-xl sm:text-2xl ${
                    gauntletResults.winnerId === match.player2_id ? 'text-piu-green' : 'text-gray-400'
                  }`}>
                    {Number(gauntletResults.p2Total).toLocaleString()}
                  </p>
                </div>
              </div>
              {gauntletResults.matchOver && (
                <p className="font-display font-bold text-piu-green text-lg mt-2">
                  {gauntletResults.winnerId === match.player1_id ? player1?.name : player2?.name} wins!
                </p>
              )}
              {!gauntletResults.matchOver && gauntletResults.p1Total === gauntletResults.p2Total && (
                <p className="text-yellow-400 text-sm mt-2 font-display">Tied - scores cannot be equal</p>
              )}
            </div>
          )}

          <button
            onClick={handleSubmitResult}
            className="btn-primary w-full text-lg py-3 font-display"
            disabled={submitting || !gauntletResults.matchOver}
          >
            {submitting ? 'Submitting...' : gauntletResults.matchOver ? 'Submit Results' : 'Enter scores to determine winner'}
          </button>
        </div>
      )}

      {/* Completed result - Round Robin */}
      {songResults && status === 'COMPLETED' && match.played_songs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-lg">Songs Played</h3>
          {match.played_songs.map((ps, idx) => {
            const songMode = ps.mode || ps.song?.mode || 'Single';
            const songLevel = ps.level || ps.song?.level;
            return (
              <div key={idx} className="card flex items-center gap-3 sm:gap-4">
                <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs
                  ${songMode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {songMode[0]}{songLevel}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-display font-bold text-sm sm:text-base truncate block">{ps.title || ps.song?.title}</span>
                  <span className="text-xs text-gray-500">{ps.song?.artist}</span>
                </div>
                <div className="flex gap-2 sm:gap-4 text-sm font-mono">
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

      {/* Completed result - Gauntlet */}
      {legacyGauntlet && status === 'COMPLETED' && match.played_songs.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-lg">Songs Played</h3>
          {match.played_songs.map((ps, idx) => {
            const songMode = ps.mode || ps.song?.mode || 'Single';
            const songLevel = ps.level || ps.song?.level;
            return (
              <div key={idx} className="card flex items-center gap-3 sm:gap-4">
                <div className="font-display font-bold text-gray-600 w-6">#{idx + 1}</div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-display font-bold text-xs
                  ${songMode === 'Double' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                  {songMode[0]}{songLevel}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-display font-bold text-sm sm:text-base truncate block">{ps.title || ps.song?.title}</span>
                  <span className="text-xs text-gray-500">{ps.song?.artist}</span>
                </div>
                <div className="flex gap-2 sm:gap-4 text-sm font-mono">
                  <span className={match.winner_id === match.player1_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                    {formatScore(ps.p1_score)}
                  </span>
                  <span className="text-gray-700">-</span>
                  <span className={match.winner_id === match.player2_id ? 'text-piu-green font-bold' : 'text-gray-500'}>
                    {formatScore(ps.p2_score)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Combined Total */}
          <div className="card text-center py-3 border-piu-green/20">
            <p className="text-xs text-gray-400 font-display uppercase tracking-wider mb-1">Combined Total</p>
            <div className="flex items-center justify-center gap-4">
              <span className={`font-mono font-bold ${match.winner_id === match.player1_id ? 'text-piu-green' : 'text-gray-500'}`}>
                {match.scores?.p1_total != null ? Number(match.scores.p1_total).toLocaleString() : '0'}
              </span>
              <span className="text-gray-600">-</span>
              <span className={`font-mono font-bold ${match.winner_id === match.player2_id ? 'text-piu-green' : 'text-gray-500'}`}>
                {match.scores?.p2_total != null ? Number(match.scores.p2_total).toLocaleString() : '0'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerHeader({ player, label, isWinner, sublabel, align = 'left' }) {
  if (!player) return <div className="flex-1" />;

  const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
  const skillColor = getSkillColorFromTitle(player.skill_title);
  const getInitials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className={`flex-1 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-xs text-gray-500 font-display uppercase">{label}</p>
      <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
        {align === 'left' && player.avatar && (
          <img src={getAvatarUrl(player.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
        )}
        {align === 'left' && !player.avatar && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
            {getInitials(player.name)}
          </div>
        )}
        <p className={`font-display font-bold text-lg sm:text-xl ${isWinner ? 'text-piu-green' : ''}`}>
          {player.name}
          {isWinner && <span className="ml-1 text-sm">&#9733;</span>}
        </p>
        {align === 'right' && player.avatar && (
          <img src={getAvatarUrl(player.avatar)} alt="" className="w-8 h-8 rounded-full object-cover" />
        )}
        {align === 'right' && !player.avatar && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs">
            {getInitials(player.name)}
          </div>
        )}
      </div>
      {player.skill_title && (
        <p className={`text-xs ${skillColor}`}>
          {player.skill_title}
          {genderSymbol && <span className="ml-1">{genderSymbol}</span>}
        </p>
      )}
      {sublabel && (
        <p className="text-[10px] text-gray-600">{sublabel}</p>
      )}
    </div>
  );
}
