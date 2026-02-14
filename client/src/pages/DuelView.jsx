import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDuel, duelDraw, duelScore, duelDeleteSong, endDuel, deleteDuel } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';
import DuelStats from '../components/DuelStats';

// PIU Score Ranks with colors matching the game
const RANKS = [
  { min: 995000, label: 'SSS+', color: 'text-sky-300',      bg: 'bg-sky-400/20 border-sky-400/40' },
  { min: 990000, label: 'SSS',  color: 'text-sky-400',      bg: 'bg-sky-400/15 border-sky-400/30' },
  { min: 985000, label: 'SS+',  color: 'text-piu-gold',     bg: 'bg-piu-gold/20 border-piu-gold/40' },
  { min: 980000, label: 'SS',   color: 'text-yellow-400',   bg: 'bg-yellow-400/15 border-yellow-400/30' },
  { min: 975000, label: 'S+',   color: 'text-amber-400',    bg: 'bg-amber-400/15 border-amber-400/30' },
  { min: 970000, label: 'S',    color: 'text-amber-500',    bg: 'bg-amber-500/15 border-amber-500/30' },
  { min: 960000, label: 'AAA+', color: 'text-piu-silver',   bg: 'bg-piu-silver/15 border-piu-silver/30' },
  { min: 950000, label: 'AAA',  color: 'text-gray-300',     bg: 'bg-gray-300/15 border-gray-300/30' },
  { min: 925000, label: 'AA+',  color: 'text-piu-bronze',   bg: 'bg-piu-bronze/15 border-piu-bronze/30' },
  { min: 900000, label: 'AA',   color: 'text-piu-bronze',   bg: 'bg-piu-bronze/15 border-piu-bronze/30' },
  { min: 825000, label: 'A+',   color: 'text-amber-700',    bg: 'bg-amber-700/15 border-amber-700/30' },
  { min: 750000, label: 'A',    color: 'text-amber-700',    bg: 'bg-amber-700/15 border-amber-700/30' },
  { min: 650000, label: 'B',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 550000, label: 'C',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 450000, label: 'D',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
  { min: 0,      label: 'F',    color: 'text-gray-600',     bg: 'bg-gray-600/15 border-gray-600/30' },
];

export function getRank(score) {
  const s = parseInt(score) || 0;
  for (const r of RANKS) {
    if (s >= r.min) return r;
  }
  return RANKS[RANKS.length - 1];
}

function RankBadge({ score }) {
  const rank = getRank(score);
  return (
    <span className={`text-[10px] sm:text-xs font-display font-bold px-1.5 py-0.5 rounded border ${rank.bg} ${rank.color}`}>
      {rank.label}
    </span>
  );
}

function ScoreDisplay({ score, isWinner }) {
  return (
    <div className={`flex items-center gap-1.5 ${isWinner ? 'text-piu-green' : ''}`}>
      <span className="font-mono text-sm sm:text-base font-bold">{Number(score).toLocaleString()}</span>
      <RankBadge score={score} />
      {isWinner && <span className="text-xs">&#9733;</span>}
    </div>
  );
}

export default function DuelView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [duel, setDuel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawLevel, setDrawLevel] = useState(19);
  const [drawMode, setDrawMode] = useState('any');
  const [drawing, setDrawing] = useState(false);
  const [scoreInputs, setScoreInputs] = useState({});
  const [submittingScore, setSubmittingScore] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [tab, setTab] = useState('play'); // 'play' or 'stats'

  const loadDuel = useCallback(async () => {
    try {
      const data = await getDuel(id);
      setDuel(data);
      if (data.status === 'COMPLETED') setTab('stats');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDuel(); }, [loadDuel]);

  const handleDraw = async () => {
    setDrawing(true);
    try {
      await duelDraw(id, { level: drawLevel, draw_mode: drawMode });
      await loadDuel();
    } catch (err) {
      alert(err.message);
    } finally {
      setDrawing(false);
    }
  };

  const handleScoreSubmit = async (songEntry) => {
    const p1 = scoreInputs[`${songEntry.id}_p1`];
    const p2 = scoreInputs[`${songEntry.id}_p2`];
    if (p1 === undefined || p1 === '' || p2 === undefined || p2 === '') {
      alert('Enter both scores');
      return;
    }
    setSubmittingScore(songEntry.id);
    try {
      await duelScore(id, {
        song_entry_id: songEntry.id,
        player1_score: parseInt(p1) || 0,
        player2_score: parseInt(p2) || 0,
      });
      await loadDuel();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingScore(null);
    }
  };

  const handleDeleteSong = async (songEntryId) => {
    if (!confirm('Remove this drawn card?')) return;
    try {
      await duelDeleteSong(id, songEntryId);
      await loadDuel();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEndDuel = async () => {
    try {
      await endDuel(id);
      await loadDuel();
      setShowEndConfirm(false);
      setTab('stats');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDuel = async () => {
    if (!confirm('Delete this duel? This cannot be undone.')) return;
    await deleteDuel(id);
    navigate('/');
  };

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>;
  if (!duel) return <div className="text-center py-20 text-gray-500">Duel not found</div>;

  const songs = duel.songs || [];
  const scoredSongs = songs.filter(s => s.winner);
  const p1Wins = scoredSongs.filter(s => s.winner === 'player1').length;
  const p2Wins = scoredSongs.filter(s => s.winner === 'player2').length;
  const draws = scoredSongs.filter(s => s.winner === 'draw').length;
  const isCompleted = duel.status === 'COMPLETED';
  const lastSong = songs[songs.length - 1];
  const pendingSong = lastSong && !lastSong.winner ? lastSong : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header with duel avatar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-display font-bold text-xl sm:text-2xl">{duel.name}</h1>
            <div className="flex gap-3 text-xs text-gray-500 mt-1">
              {duel.location && <span>{duel.location}</span>}
              {duel.date && <span>{duel.date}</span>}
              {duel.time && <span>{duel.time}</span>}
              <span className={`font-display font-bold ${
                duel.mode === 'singles' ? 'text-red-400' : duel.mode === 'doubles' ? 'text-green-400' : 'text-piu-accent'
              }`}>
                {duel.mode === 'singles' ? 'SINGLES' : duel.mode === 'doubles' ? 'DOUBLES' : 'BOTH'}
              </span>
            </div>
          </div>
          {isCompleted && (
            <span className="badge badge-completed">COMPLETED</span>
          )}
        </div>

        {/* Duel Avatar - players vs each other */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 py-4">
          <div className="text-center flex-1">
            <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
              isCompleted && duel.winner === 'player1' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
              isCompleted && duel.winner === 'player2' ? 'border-gray-500' : 'border-red-500/50'
            }`}>
              {duel.player1_avatar ? (
                <img src={getAvatarUrl(duel.player1_avatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                  {duel.player1_name[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player1_nationality && <span className="text-sm">{getCountryFlag(duel.player1_nationality)}</span>}
              <p className="font-display font-bold text-sm sm:text-base">{duel.player1_name}</p>
              {duel.player1_gender && (
                <span className={`text-xs ${duel.player1_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                  {GENDER_SYMBOLS[duel.player1_gender]}
                </span>
              )}
            </div>
            {duel.player1_skill_title && (
              <span className={`badge border text-[10px] ${getSkillColor(duel.player1_skill_title)}`}>
                {duel.player1_skill_title}
              </span>
            )}
            {isCompleted && duel.winner === 'player1' && (
              <span className="text-piu-gold text-xs font-display">&#127942; GOLD</span>
            )}
            {isCompleted && duel.winner === 'player2' && (
              <span className="text-gray-400 text-xs font-display">&#129352; SILVER</span>
            )}
            {isCompleted && duel.winner === 'draw' && (
              <span className="text-gray-400 text-xs font-display">DRAW</span>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-piu-accent">
              <path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.5"/>
            </svg>
            <div className="font-mono font-bold text-lg sm:text-2xl mt-1">
              <span className={p1Wins > p2Wins ? 'text-piu-green' : ''}>{p1Wins}</span>
              <span className="text-gray-600 mx-1">-</span>
              <span className={p2Wins > p1Wins ? 'text-piu-green' : ''}>{p2Wins}</span>
            </div>
            {draws > 0 && <span className="text-[10px] text-gray-600">{draws} draw{draws !== 1 ? 's' : ''}</span>}
          </div>

          <div className="text-center flex-1">
            <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
              isCompleted && duel.winner === 'player2' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
              isCompleted && duel.winner === 'player1' ? 'border-gray-500' : 'border-blue-500/50'
            }`}>
              {duel.player2_avatar ? (
                <img src={getAvatarUrl(duel.player2_avatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                  {duel.player2_name[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player2_nationality && <span className="text-sm">{getCountryFlag(duel.player2_nationality)}</span>}
              <p className="font-display font-bold text-sm sm:text-base">{duel.player2_name}</p>
              {duel.player2_gender && (
                <span className={`text-xs ${duel.player2_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                  {GENDER_SYMBOLS[duel.player2_gender]}
                </span>
              )}
            </div>
            {duel.player2_skill_title && (
              <span className={`badge border text-[10px] ${getSkillColor(duel.player2_skill_title)}`}>
                {duel.player2_skill_title}
              </span>
            )}
            {isCompleted && duel.winner === 'player2' && (
              <span className="text-piu-gold text-xs font-display">&#127942; GOLD</span>
            )}
            {isCompleted && duel.winner === 'player1' && (
              <span className="text-gray-400 text-xs font-display">&#129352; SILVER</span>
            )}
            {isCompleted && duel.winner === 'draw' && (
              <span className="text-gray-400 text-xs font-display">DRAW</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('play')}
          className={`px-4 py-2 rounded-lg font-display font-bold text-sm transition-colors ${
            tab === 'play' ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
          }`}
        >
          {isCompleted ? 'Results' : 'Play'}
        </button>
        <button
          onClick={() => setTab('stats')}
          className={`px-4 py-2 rounded-lg font-display font-bold text-sm transition-colors ${
            tab === 'stats' ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'
          }`}
        >
          Statistics
        </button>
      </div>

      {tab === 'play' && (
        <>
          {/* Card Draw Controls */}
          {!isCompleted && (
            <div className="card mb-6 space-y-4">
              <h2 className="font-display font-bold text-piu-accent">Draw a Card</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Level</label>
                  <input
                    type="number"
                    className="input-field w-20"
                    min="1"
                    max="28"
                    value={drawLevel}
                    onChange={e => setDrawLevel(parseInt(e.target.value) || 1)}
                    onFocus={e => e.target.select()}
                  />
                </div>
                {duel.mode === 'both' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Chart Type</label>
                    <select
                      className="input-field"
                      value={drawMode}
                      onChange={e => setDrawMode(e.target.value)}
                    >
                      <option value="any">Any</option>
                      <option value="Single">Singles</option>
                      <option value="Double">Doubles</option>
                    </select>
                  </div>
                )}
                <button
                  onClick={handleDraw}
                  disabled={drawing || !!pendingSong}
                  className="btn-primary"
                >
                  {drawing ? 'Drawing...' : pendingSong ? 'Enter scores first' : 'Draw Card'}
                </button>
              </div>
              {pendingSong && (
                <p className="text-xs text-yellow-400">Submit scores for the current song before drawing another.</p>
              )}
            </div>
          )}

          {/* Song List - Mobile Card Layout */}
          {songs.length > 0 && (
            <div className="sm:hidden space-y-3">
              {songs.map((song, idx) => {
                const isModeS = song.song_mode === 'Single';
                const hasScore = !!song.winner;
                return (
                  <div key={song.id} className={`card ${!hasScore ? 'border border-piu-accent/20' : ''}`}>
                    {/* Song info row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-gray-600 font-mono text-xs">{idx + 1}</span>
                      {song.song_jacket_url ? (
                        <img src={song.song_jacket_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold shrink-0 ${isModeS ? 'bg-red-900/50' : 'bg-green-900/50'}`}>
                          {song.song_title[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-bold text-sm truncate">{song.song_title}</p>
                        <span className={`text-xs font-display font-bold ${isModeS ? 'text-red-400' : 'text-green-400'}`}>
                          {isModeS ? 'S' : 'D'}{song.song_level}
                        </span>
                      </div>
                      {!hasScore && (
                        <button
                          onClick={() => handleDeleteSong(song.id)}
                          className="text-gray-600 hover:text-red-400 text-sm shrink-0 p-1"
                          title="Remove card"
                        >
                          &#10005;
                        </button>
                      )}
                    </div>
                    {/* Score rows */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-red-400 font-display font-bold shrink-0 w-20 truncate">{duel.player1_name}</span>
                        {hasScore ? (
                          <ScoreDisplay score={song.player1_score} isWinner={song.winner === 'player1'} />
                        ) : (
                          <input
                            type="number"
                            className="input-field flex-1 text-right text-sm"
                            placeholder="Score"
                            min="0"
                            max="1000000"
                            value={scoreInputs[`${song.id}_p1`] || ''}
                            onChange={e => setScoreInputs(s => ({ ...s, [`${song.id}_p1`]: e.target.value }))}
                            onFocus={e => e.target.select()}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-blue-400 font-display font-bold shrink-0 w-20 truncate">{duel.player2_name}</span>
                        {hasScore ? (
                          <ScoreDisplay score={song.player2_score} isWinner={song.winner === 'player2'} />
                        ) : (
                          <input
                            type="number"
                            className="input-field flex-1 text-right text-sm"
                            placeholder="Score"
                            min="0"
                            max="1000000"
                            value={scoreInputs[`${song.id}_p2`] || ''}
                            onChange={e => setScoreInputs(s => ({ ...s, [`${song.id}_p2`]: e.target.value }))}
                            onFocus={e => e.target.select()}
                          />
                        )}
                      </div>
                    </div>
                    {/* Submit button */}
                    {!hasScore && (
                      <button
                        onClick={() => handleScoreSubmit(song)}
                        disabled={submittingScore === song.id}
                        className="btn-primary w-full mt-3 text-sm py-2"
                      >
                        {submittingScore === song.id ? 'Submitting...' : 'Submit Scores'}
                      </button>
                    )}
                  </div>
                );
              })}
              {/* Mobile tally */}
              <div className="card">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs text-gray-400">
                    TOTAL ({scoredSongs.length} song{scoredSongs.length !== 1 ? 's' : ''})
                  </span>
                  <div className="flex gap-4">
                    <span className={`font-mono font-bold text-sm ${p1Wins > p2Wins ? 'text-piu-green' : ''}`}>{p1Wins} W</span>
                    <span className={`font-mono font-bold text-sm ${p2Wins > p1Wins ? 'text-piu-green' : ''}`}>{p2Wins} W</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Song List - Desktop Table */}
          {songs.length > 0 && (
            <div className="card hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-piu-border text-gray-500 text-xs font-display">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Song</th>
                    <th className="text-right py-2 px-2">{duel.player1_name}</th>
                    <th className="text-right py-2 px-2">{duel.player2_name}</th>
                    <th className="text-center py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {songs.map((song, idx) => {
                    const isModeS = song.song_mode === 'Single';
                    const hasScore = !!song.winner;
                    return (
                      <tr key={song.id} className={`border-b border-piu-border/30 ${!hasScore ? 'bg-piu-accent/5' : ''}`}>
                        <td className="py-2 px-2 text-gray-600 font-mono text-xs">{idx + 1}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            {song.song_jacket_url ? (
                              <img src={song.song_jacket_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                            ) : (
                              <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${isModeS ? 'bg-red-900/50' : 'bg-green-900/50'}`}>
                                {song.song_title[0]}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-display font-bold text-xs truncate max-w-none">{song.song_title}</p>
                              <div className="flex gap-1 items-center">
                                <span className={`text-[10px] font-display font-bold ${isModeS ? 'text-red-400' : 'text-green-400'}`}>
                                  {isModeS ? 'S' : 'D'}{song.song_level}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {hasScore ? (
                            <ScoreDisplay score={song.player1_score} isWinner={song.winner === 'player1'} />
                          ) : (
                            <input
                              type="number"
                              className="input-field w-28 text-right text-sm"
                              placeholder="Score"
                              min="0"
                              max="1000000"
                              value={scoreInputs[`${song.id}_p1`] || ''}
                              onChange={e => setScoreInputs(s => ({ ...s, [`${song.id}_p1`]: e.target.value }))}
                              onFocus={e => e.target.select()}
                            />
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {hasScore ? (
                            <ScoreDisplay score={song.player2_score} isWinner={song.winner === 'player2'} />
                          ) : (
                            <input
                              type="number"
                              className="input-field w-28 text-right text-sm"
                              placeholder="Score"
                              min="0"
                              max="1000000"
                              value={scoreInputs[`${song.id}_p2`] || ''}
                              onChange={e => setScoreInputs(s => ({ ...s, [`${song.id}_p2`]: e.target.value }))}
                              onFocus={e => e.target.select()}
                            />
                          )}
                        </td>
                        <td className="py-2 px-1 text-center">
                          {!hasScore && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleScoreSubmit(song)}
                                disabled={submittingScore === song.id}
                                className="text-piu-accent hover:text-piu-accent/80 text-xs font-display font-bold"
                                title="Submit scores"
                              >
                                &#10003;
                              </button>
                              <button
                                onClick={() => handleDeleteSong(song.id)}
                                className="text-gray-600 hover:text-red-400 text-xs"
                                title="Remove card"
                              >
                                &#10005;
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Tally row */}
                <tfoot>
                  <tr className="border-t-2 border-piu-border">
                    <td colSpan="2" className="py-2 px-2 font-display font-bold text-xs text-gray-400">
                      TOTAL ({scoredSongs.length} song{scoredSongs.length !== 1 ? 's' : ''})
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-mono font-bold text-sm ${p1Wins > p2Wins ? 'text-piu-green' : ''}`}>{p1Wins} W</span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-mono font-bold text-sm ${p2Wins > p1Wins ? 'text-piu-green' : ''}`}>{p2Wins} W</span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {songs.length === 0 && !isCompleted && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-display">No songs played yet</p>
              <p className="text-sm mt-1">Draw a card to start the duel!</p>
            </div>
          )}

          {/* End Duel / Actions */}
          {!isCompleted && songs.length > 0 && (
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEndConfirm(true)}
                className="btn-primary bg-red-600 hover:bg-red-700 flex-1"
              >
                End Duel
              </button>
            </div>
          )}

          {isCompleted && (
            <div className="flex gap-3 mt-6">
              <button onClick={handleDeleteDuel} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                Delete Duel
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'stats' && (
        <DuelStats duel={duel} songs={scoredSongs} />
      )}

      {/* End Duel Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowEndConfirm(false)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-display font-bold text-lg mb-3">End this Duel?</h2>
            <p className="text-sm text-gray-400 mb-4">
              The duel will be finalized with the current scores.
              {p1Wins > p2Wins && <><br/><strong className="text-piu-green">{duel.player1_name}</strong> wins with {p1Wins}-{p2Wins}.</>}
              {p2Wins > p1Wins && <><br/><strong className="text-piu-green">{duel.player2_name}</strong> wins with {p2Wins}-{p1Wins}.</>}
              {p1Wins === p2Wins && <><br/>It&apos;s currently a draw at {p1Wins}-{p2Wins}.</>}
            </p>
            <div className="flex gap-3">
              <button onClick={handleEndDuel} className="btn-primary bg-red-600 hover:bg-red-700 flex-1">
                End Duel
              </button>
              <button onClick={() => setShowEndConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
