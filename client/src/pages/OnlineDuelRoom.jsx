import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getOnlineDuel, getOnlineDuelChat, sendChatMessage, joinOnlineDuel,
  onlineDuelDraw, onlineDuelAccept, onlineDuelDecline, onlineDuelSubmitScore,
  onlineDuelEndRequest, onlineDuelCancelEnd, parseScorePhoto,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag, getSkillColor, GENDER_SYMBOLS } from '../components/PlayerRegistration';

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

function getRank(score) {
  const s = parseInt(score) || 0;
  for (const r of RANKS) {
    if (s >= r.min) return r;
  }
  return RANKS[RANKS.length - 1];
}

export default function OnlineDuelRoom() {
  const { id } = useParams();
  const { user } = useAuth();
  const [duel, setDuel] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [drawLevel, setDrawLevel] = useState(15);
  const [drawMode, setDrawMode] = useState('any');
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);
  const [tab, setTab] = useState('match');
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastChatTime = useRef('');

  // Determine current user's role
  const playerSlot = duel && user ? (
    duel.creator_user_id === user.id ? 'player1' :
    duel.opponent_user_id === user.id ? 'player2' : null
  ) : null;
  const isParticipant = !!playerSlot;

  // Poll for duel state
  useEffect(() => {
    const load = () => getOnlineDuel(id).then(setDuel).catch(() => {});
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [id]);

  // Poll for chat
  useEffect(() => {
    const loadChat = () => {
      getOnlineDuelChat(id, lastChatTime.current).then(msgs => {
        if (msgs.length > 0) {
          setChat(prev => [...prev, ...msgs]);
          lastChatTime.current = msgs[msgs.length - 1].created_at;
        }
      }).catch(() => {});
    };
    loadChat();
    const interval = setInterval(loadChat, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await sendChatMessage(id, { message: chatInput, guest_name: guestName || undefined });
      setChatInput('');
    } catch (err) { /* ignore */ }
  };

  const handleJoin = async () => {
    try {
      await joinOnlineDuel(id);
    } catch (err) { alert(err.message); }
  };

  const handleDraw = async () => {
    if (!drawLevel || parseInt(drawLevel) < 1) return alert('Please enter a level');
    try {
      await onlineDuelDraw(id, { level: parseInt(drawLevel), draw_mode: drawMode === 'any' ? undefined : drawMode });
    } catch (err) { alert(err.message); }
  };

  const handleAccept = async (songId) => {
    try {
      await onlineDuelAccept(id, songId);
    } catch (err) { alert(err.message); }
  };

  const handleDecline = async (songId) => {
    try {
      await onlineDuelDecline(id, songId);
    } catch (err) { alert(err.message); }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setParseResult(null);
    try {
      const result = await parseScorePhoto(file);
      // Flatten: parser returns { score, breakdown: { perfect, ... } }
      const bd = result.breakdown || {};
      setParseResult({
        score: result.score || bd.score || 0,
        perfect: bd.perfect ?? result.perfect ?? 0,
        great: bd.great ?? result.great ?? 0,
        good: bd.good ?? result.good ?? 0,
        bad: bd.bad ?? result.bad ?? 0,
        miss: bd.miss ?? result.miss ?? 0,
        max_combo: bd.max_combo ?? result.max_combo ?? 0,
        kcal: bd.kcal ?? result.kcal ?? 0,
      });
    } catch (err) {
      alert('Failed to parse photo: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitScore = async () => {
    if (!parseResult) return;
    try {
      await onlineDuelSubmitScore(id, {
        score: Number(parseResult.score) || 0,
        perfect: Number(parseResult.perfect) || 0,
        great: Number(parseResult.great) || 0,
        good: Number(parseResult.good) || 0,
        bad: Number(parseResult.bad) || 0,
        miss: Number(parseResult.miss) || 0,
        max_combo: Number(parseResult.max_combo) || 0,
        kcal: Number(parseResult.kcal) || 0,
      });
      setParseResult(null);
      setManualEntry(false);
    } catch (err) { alert(err.message); }
  };

  const handleEndRequest = async () => {
    if (!confirm('Request to end the duel? Both players must agree.')) return;
    try { await onlineDuelEndRequest(id); } catch (err) { alert(err.message); }
  };

  // Compute stats
  const stats = useMemo(() => {
    if (!duel?.songs) return { p1Wins: 0, p2Wins: 0, completed: [] };
    const completed = duel.songs.filter(s => s.status === 'completed');
    const p1Wins = completed.filter(s => s.winner === 'player1').length;
    const p2Wins = completed.filter(s => s.winner === 'player2').length;
    const p1TotalKcal = completed.reduce((s, c) => s + (c.player1_kcal || 0), 0);
    const p2TotalKcal = completed.reduce((s, c) => s + (c.player2_kcal || 0), 0);
    const draws = completed.filter(s => s.winner === 'draw').length;
    const p1TotalScore = completed.reduce((s, c) => s + c.player1_score, 0);
    const p2TotalScore = completed.reduce((s, c) => s + c.player2_score, 0);
    const p1Avg = completed.length > 0 ? Math.round(p1TotalScore / completed.length) : 0;
    const p2Avg = completed.length > 0 ? Math.round(p2TotalScore / completed.length) : 0;
    const p1Best = completed.length > 0 ? Math.max(...completed.map(s => s.player1_score)) : 0;
    const p2Best = completed.length > 0 ? Math.max(...completed.map(s => s.player2_score)) : 0;
    const p1TotalSteps = completed.reduce((s, c) => s + c.player1_perfect + c.player1_great + c.player1_good + c.player1_bad, 0);
    const p2TotalSteps = completed.reduce((s, c) => s + c.player2_perfect + c.player2_great + c.player2_good + c.player2_bad, 0);
    return { p1Wins, p2Wins, draws, completed, p1TotalKcal, p2TotalKcal, p1TotalSteps, p2TotalSteps, p1Avg, p2Avg, p1Best, p2Best };
  }, [duel]);

  const currentSong = duel?.songs?.find(s => s.status !== 'completed');

  if (!duel) return <div className="text-center py-20 text-gray-500">Loading match room...</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display font-bold text-xl tracking-wider">{duel.name}</h1>
          <p className="text-xs text-gray-500">{duel.location} {duel.date && `- ${duel.date}`} | Online Duel</p>
        </div>
        <span className={`badge ${duel.status === 'COMPLETED' ? 'badge-completed' : duel.status === 'WAITING' ? 'badge-pending' : 'badge-active'}`}>
          {duel.status}
        </span>
      </div>

      {/* Scoreboard — VS layout similar to offline duel */}
      <div className="card mb-4">
        <div className="flex items-center justify-center gap-3 sm:gap-6 py-4">
          <div className="text-center flex-1">
            <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
              duel.status === 'COMPLETED' && duel.winner === 'player1' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
              duel.status === 'COMPLETED' && duel.winner === 'player2' ? 'border-gray-500' : 'border-red-500/50'
            }`}>
              {duel.player1_avatar ? (
                <img src={getAvatarUrl(duel.player1_avatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                  {(duel.player1_name || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player1_nationality && <span className="text-sm">{getCountryFlag(duel.player1_nationality)}</span>}
              <Link to={`/profile/${duel.creator_user_id}`} className="font-display font-bold text-sm sm:text-base hover:text-piu-accent transition-colors">{duel.player1_name || 'Waiting...'}</Link>
              {duel.player1_gender && <span className={`text-xs ${duel.player1_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>{GENDER_SYMBOLS[duel.player1_gender]}</span>}
            </div>
            {duel.player1_skill_title && <span className={`badge border text-[10px] ${getSkillColor(duel.player1_skill_title)}`}>{duel.player1_skill_title}</span>}
            {duel.status === 'COMPLETED' && duel.winner === 'player1' && <div className="text-piu-gold text-xs font-display">&#127942; GOLD</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'player2' && <div className="text-gray-400 text-xs font-display">&#129352; SILVER</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'draw' && <div className="text-gray-400 text-xs font-display">DRAW</div>}
          </div>

          <div className="flex flex-col items-center shrink-0">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-piu-accent">
              <path d="M8 8L32 32M8 8L12 4M8 8L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M32 8L8 32M32 8L28 4M32 8L36 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.5"/>
            </svg>
            <div className="font-mono font-bold text-lg sm:text-2xl mt-1">
              <span className={stats.p1Wins > stats.p2Wins ? 'text-piu-green' : ''}>{stats.p1Wins}</span>
              <span className="text-gray-600 mx-1">-</span>
              <span className={stats.p2Wins > stats.p1Wins ? 'text-piu-green' : ''}>{stats.p2Wins}</span>
            </div>
            {duel.status === 'ACTIVE' && (
              <p className="text-[10px] text-gray-500 font-display mt-0.5">
                {duel.current_turn === playerSlot ? "Your turn" : duel.current_turn === 'player1' ? `${duel.player1_name}'s turn` : `${duel.player2_name}'s turn`}
              </p>
            )}
          </div>

          <div className="text-center flex-1">
            <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 mx-auto ${
              duel.status === 'COMPLETED' && duel.winner === 'player2' ? 'border-piu-gold shadow-lg shadow-piu-gold/30' :
              duel.status === 'COMPLETED' && duel.winner === 'player1' ? 'border-gray-500' : 'border-blue-500/50'
            }`}>
              {duel.player2_avatar ? (
                <img src={getAvatarUrl(duel.player2_avatar)} alt="" className="w-full h-full object-cover" />
              ) : duel.player2_name ? (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center font-display font-bold text-lg sm:text-2xl">
                  {duel.player2_name[0].toUpperCase()}
                </div>
              ) : (
                <div className="w-full h-full border-2 border-dashed border-piu-border flex items-center justify-center"><span className="text-gray-600 text-2xl">?</span></div>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {duel.player2_nationality && <span className="text-sm">{getCountryFlag(duel.player2_nationality)}</span>}
              {duel.player2_name ? (
                <Link to={`/profile/${duel.opponent_user_id}`} className="font-display font-bold text-sm sm:text-base hover:text-piu-accent transition-colors">{duel.player2_name}</Link>
              ) : <span className="text-gray-500 text-sm font-display">Waiting...</span>}
              {duel.player2_gender && <span className={`text-xs ${duel.player2_gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>{GENDER_SYMBOLS[duel.player2_gender]}</span>}
            </div>
            {duel.player2_skill_title && <span className={`badge border text-[10px] ${getSkillColor(duel.player2_skill_title)}`}>{duel.player2_skill_title}</span>}
            {duel.status === 'COMPLETED' && duel.winner === 'player2' && <div className="text-piu-gold text-xs font-display">&#127942; GOLD</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'player1' && <div className="text-gray-400 text-xs font-display">&#129352; SILVER</div>}
            {duel.status === 'COMPLETED' && duel.winner === 'draw' && <div className="text-gray-400 text-xs font-display">DRAW</div>}
          </div>
        </div>
      </div>

      {/* Join button for opponent */}
      {duel.status === 'WAITING' && user && duel.opponent_user_id === user.id && (
        <div className="card text-center py-6 mb-4">
          <p className="text-gray-400 mb-3">You've been challenged!</p>
          <button onClick={handleJoin} className="btn-primary">Accept & Join Duel</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {['match', 'stats'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${tab === t ? 'bg-piu-accent text-white' : 'bg-piu-card text-gray-400 hover:text-white'}`}>
            {t === 'match' ? 'Match Room' : 'Statistics'}
          </button>
        ))}
      </div>

      {tab === 'match' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Match Area (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Song / Draw Controls */}
            {duel.status === 'ACTIVE' && (
              <>
                {currentSong ? (
                  <div className="card space-y-3">
                    <div className="flex items-center gap-3">
                      {currentSong.song_jacket_url && <img src={currentSong.song_jacket_url} alt="" className="w-16 h-16 rounded-lg object-cover shadow-lg" />}
                      <div className="flex-1">
                        <h3 className="font-display font-bold">{currentSong.song_title}</h3>
                        <p className="text-xs text-gray-500">{currentSong.song_artist} | {currentSong.song_mode} Lv.{currentSong.song_level}</p>
                        <p className="text-xs text-piu-accent font-display mt-1">
                          {currentSong.status === 'drawn' && 'Waiting for players to accept...'}
                          {currentSong.status === 'playing' && 'Players are Pumping it Up right now..'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <span className={`w-3 h-3 rounded-full ${currentSong.player1_accepted ? 'bg-piu-green' : currentSong.player1_declined ? 'bg-red-500' : 'bg-gray-600'}`} title={`${duel.player1_name} ${currentSong.player1_accepted ? 'accepted' : currentSong.player1_declined ? 'declined' : 'pending'}`} />
                        <span className={`w-3 h-3 rounded-full ${currentSong.player2_accepted ? 'bg-piu-green' : currentSong.player2_declined ? 'bg-red-500' : 'bg-gray-600'}`} title={`${duel.player2_name} ${currentSong.player2_accepted ? 'accepted' : currentSong.player2_declined ? 'declined' : 'pending'}`} />
                      </div>
                    </div>

                    {/* Accept / Decline buttons */}
                    {currentSong.status === 'drawn' && isParticipant && (() => {
                      const myAccepted = playerSlot === 'player1' ? currentSong.player1_accepted : currentSong.player2_accepted;
                      const myDeclined = playerSlot === 'player1' ? currentSong.player1_declined : currentSong.player2_declined;
                      if (myAccepted) return <p className="text-xs text-piu-green font-display">You accepted. Waiting for opponent...</p>;
                      if (myDeclined) return <p className="text-xs text-red-400 font-display">You declined. Waiting for opponent...</p>;
                      return (
                        <div className="flex gap-2">
                          <button onClick={() => handleAccept(currentSong.id)} className="btn-primary flex-1 text-sm">Accept Song</button>
                          <button onClick={() => handleDecline(currentSong.id)} className="flex-1 text-sm px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-display font-bold hover:bg-red-500/30 transition-colors">Decline Song</button>
                        </div>
                      );
                    })()}

                    {/* Score submission */}
                    {currentSong.status === 'playing' && isParticipant && (
                      !(playerSlot === 'player1' ? currentSong.player1_submitted : currentSong.player2_submitted) ? (
                        <div className="space-y-2 pt-2 border-t border-piu-border/50">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-400 font-display">{manualEntry ? 'Enter your score manually' : 'Upload your result photo'}</p>
                            <button
                              type="button"
                              onClick={() => { setManualEntry(!manualEntry); if (!manualEntry && !parseResult) setParseResult({ score: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, max_combo: 0, kcal: 0 }); }}
                              className="text-[10px] text-piu-accent hover:underline font-display"
                            >
                              {manualEntry ? 'Upload photo instead' : 'Enter manually'}
                            </button>
                          </div>
                          {!manualEntry && (
                            <>
                              <input ref={fileInputRef} type="file" accept="image/*" className="input-field text-sm" onChange={handlePhotoUpload} />
                              {uploading && <p className="text-xs text-piu-accent animate-pulse">Parsing score from photo...</p>}
                            </>
                          )}
                          {parseResult && (
                            <div className="bg-piu-dark/50 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-display font-bold">{manualEntry ? 'Score Entry:' : 'Parsed Result:'}</p>
                                {!manualEntry && <span className="text-[10px] text-gray-500">Click values to edit</span>}
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                                {[
                                  { key: 'score', label: 'Score' },
                                  { key: 'perfect', label: 'Perfect' },
                                  { key: 'great', label: 'Great' },
                                  { key: 'good', label: 'Good' },
                                  { key: 'bad', label: 'Bad' },
                                  { key: 'miss', label: 'Miss' },
                                  { key: 'max_combo', label: 'Max Combo' },
                                  { key: 'kcal', label: 'KCAL' },
                                ].map(({ key, label }) => (
                                  <div key={key}>
                                    <label className="text-gray-500 block text-[10px]">{label}</label>
                                    <input
                                      type="number"
                                      className="input-field text-xs font-mono w-full py-1 px-1.5"
                                      value={parseResult[key] ?? ''}
                                      step={key === 'kcal' ? '0.1' : '1'}
                                      min="0"
                                      onChange={e => setParseResult(prev => ({ ...prev, [key]: e.target.value === '' ? '' : (key === 'kcal' ? parseFloat(e.target.value) : parseInt(e.target.value) || '') }))}
                                      onBlur={e => { if (e.target.value === '') setParseResult(prev => ({ ...prev, [key]: 0 })); }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {parseResult.score > 0 && (
                                <p className="text-xs text-center">
                                  <span className="text-gray-500">Rank: </span>
                                  <span className={`font-display font-bold ${getRank(parseResult.score).color}`}>{getRank(parseResult.score).label}</span>
                                </p>
                              )}
                              <button onClick={handleSubmitScore} className="btn-primary w-full text-sm mt-2">Confirm & Submit Score</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-piu-green font-display">Score submitted! Waiting for opponent...</p>
                      )
                    )}
                  </div>
                ) : (
                  /* Draw controls */
                  duel.current_turn === playerSlot ? (
                    <div className="card space-y-3">
                      <h3 className="font-display font-bold text-sm text-piu-accent">Your Turn - Draw a Song</h3>
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Level</label>
                          <input type="number" className="input-field" min="1" max="28" value={drawLevel} onChange={e => setDrawLevel(e.target.value === '' ? '' : (parseInt(e.target.value) || ''))} onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) setDrawLevel(1); }} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Mode</label>
                          <select className="input-field" value={drawMode} onChange={e => setDrawMode(e.target.value)}>
                            <option value="any">Any</option>
                            {duel.mode !== 'doubles' && <option value="Single">Singles</option>}
                            {duel.mode !== 'singles' && <option value="Double">Doubles</option>}
                          </select>
                        </div>
                        <button onClick={handleDraw} className="btn-primary text-sm px-6">Draw</button>
                      </div>
                    </div>
                  ) : (
                    <div className="card text-center py-4">
                      <p className="text-gray-400 font-display text-sm">
                        Waiting for {duel.current_turn === 'player1' ? duel.player1_name : duel.player2_name} to draw a song...
                      </p>
                    </div>
                  )
                )}

                {/* End duel */}
                {isParticipant && (
                  <div className="flex items-center justify-between text-xs">
                    {(playerSlot === 'player1' ? duel.player1_end_requested : duel.player2_end_requested) ? (
                      <span className="text-yellow-400 font-display">You requested to end the duel. Waiting for opponent...</span>
                    ) : (
                      <button onClick={handleEndRequest} className="text-gray-500 hover:text-red-400 transition-colors font-display">End Duel</button>
                    )}
                    {(playerSlot === 'player1' ? duel.player2_end_requested : duel.player1_end_requested) && (
                      <button onClick={handleEndRequest} className="text-yellow-400 hover:text-yellow-300 font-display font-bold">Opponent wants to end - Confirm?</button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Winner banner */}
            {duel.status === 'COMPLETED' && (
              <div className="card text-center py-6">
                <h2 className="font-display font-bold text-xl text-piu-gold mb-2">DUEL COMPLETE</h2>
                <p className="text-lg font-display font-bold">
                  {duel.winner === 'draw' ? "It's a draw!" :
                    duel.winner === 'player1' ? `${duel.player1_name} wins!` : `${duel.player2_name} wins!`}
                </p>
                <p className="text-gray-400 mt-1">{stats.p1Wins} - {stats.p2Wins}</p>
              </div>
            )}

            {/* Song History */}
            {stats.completed.length > 0 && (
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Song Results</h3>
                <div className="space-y-2">
                  {stats.completed.map(song => {
                    const p1Rank = getRank(song.player1_score);
                    const p2Rank = getRank(song.player2_score);
                    return (
                      <button key={song.id} onClick={() => setSelectedBreakdown(song)} className="flex items-center gap-2 py-1.5 border-b border-piu-border/20 last:border-0 w-full hover:bg-piu-dark/30 rounded transition-colors">
                        <div className={`flex-1 flex items-center justify-end gap-1 ${song.winner === 'player1' ? 'text-piu-green' : ''}`}>
                          {song.winner === 'player1' && <span className="text-[10px]">&#9733;</span>}
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>{p1Rank.label}</span>
                          <span className="font-mono text-xs font-bold">{song.player1_score.toLocaleString()}</span>
                        </div>
                        {song.song_jacket_url && <img src={song.song_jacket_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                        <div className={`flex-1 flex items-center gap-1 ${song.winner === 'player2' ? 'text-piu-green' : ''}`}>
                          <span className="font-mono text-xs font-bold">{song.player2_score.toLocaleString()}</span>
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>{p2Rank.label}</span>
                          {song.winner === 'player2' && <span className="text-[10px]">&#9733;</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Chat (1/3) */}
          <div className="card flex flex-col h-[500px] lg:h-auto">
            <h3 className="font-display font-bold text-sm text-piu-accent mb-2 shrink-0">Match Chat</h3>
            <div className="flex-1 overflow-y-auto space-y-1 mb-2 min-h-0">
              {chat.map(msg => {
                const isP1 = msg.user_id && msg.user_id === duel.creator_user_id;
                const isP2 = msg.user_id && msg.user_id === duel.opponent_user_id;
                const nameColor = isP1 ? 'text-red-400 font-bold' : isP2 ? 'text-blue-400 font-bold' : msg.is_participant ? 'font-bold text-white' : 'text-gray-500';
                const msgColor = isP1 ? 'text-red-200/80' : isP2 ? 'text-blue-200/80' : msg.is_participant ? 'text-gray-200' : 'text-gray-500';
                return (
                  <div key={msg.id} className={`text-xs ${msg.is_system ? 'text-piu-accent italic' : ''}`}>
                    {msg.is_system ? (
                      <span>{msg.message}</span>
                    ) : (
                      <>
                        <span className={nameColor}>
                          {isP1 && <span className="text-red-500 mr-0.5" title="Player 1">&#9876;</span>}
                          {isP2 && <span className="text-blue-500 mr-0.5" title="Player 2">&#9876;</span>}
                          {msg.username}:
                        </span>{' '}
                        <span className={msgColor}>{msg.message}</span>
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2 shrink-0">
              {!user && (
                <input type="text" className="input-field text-xs w-16" placeholder="Name" value={guestName} onChange={e => setGuestName(e.target.value)} />
              )}
              <input type="text" className="input-field text-xs flex-1" placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} maxLength={500} />
              <button type="submit" className="btn-primary text-xs px-3 py-1">Send</button>
            </form>
          </div>
        </div>
      ) : (
        /* Statistics tab */
        <div className="space-y-4">
          {stats.completed.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-display">No completed songs yet</p>
              <p className="text-sm mt-1">Play some songs to see statistics</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-xs text-gray-500 font-display mb-1">{duel.player1_name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="font-mono font-bold text-lg text-piu-green">{stats.p1Wins}</p>
                      <p className="text-[10px] text-gray-600">Wins</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{stats.p1Avg.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Avg Score</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{stats.p1Best.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Best</p>
                    </div>
                  </div>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-500 font-display mb-1">{duel.player2_name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="font-mono font-bold text-lg text-piu-green">{stats.p2Wins}</p>
                      <p className="text-[10px] text-gray-600">Wins</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{stats.p2Avg.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Avg Score</p>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-sm">{stats.p2Best.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-600">Best</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card text-center py-3">
                  <p className="font-mono font-bold text-lg text-piu-accent">{stats.p1TotalKcal?.toFixed(1)}</p>
                  <p className="text-[10px] text-gray-500 font-display">{duel.player1_name} KCAL</p>
                </div>
                <div className="card text-center py-3">
                  <p className="font-mono font-bold text-lg text-piu-accent">{stats.p2TotalKcal?.toFixed(1)}</p>
                  <p className="text-[10px] text-gray-500 font-display">{duel.player2_name} KCAL</p>
                </div>
                <div className="card text-center py-3">
                  <p className="font-mono font-bold text-lg">{stats.p1TotalSteps?.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 font-display">{duel.player1_name} Steps</p>
                </div>
                <div className="card text-center py-3">
                  <p className="font-mono font-bold text-lg">{stats.p2TotalSteps?.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-500 font-display">{duel.player2_name} Steps</p>
                </div>
              </div>

              {/* Song-by-Song Comparison */}
              <div className="card">
                <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Song Results</h3>
                <div className="flex items-center text-[10px] text-gray-500 font-display font-bold mb-2 px-1">
                  <div className="flex-1 text-right pr-2">{duel.player1_name}</div>
                  <div className="w-10 text-center shrink-0"></div>
                  <div className="flex-1 pl-2">{duel.player2_name}</div>
                </div>
                <div className="space-y-1.5">
                  {stats.completed.map(song => {
                    const p1Rank = getRank(song.player1_score);
                    const p2Rank = getRank(song.player2_score);
                    return (
                      <div key={song.id} className="flex items-center gap-0 py-1 border-b border-piu-border/20 last:border-0">
                        <div className={`flex-1 flex items-center justify-end gap-1 pr-2 ${song.winner === 'player1' ? 'text-piu-green' : ''}`}>
                          {song.winner === 'player1' && <span className="text-[10px]">&#9733;</span>}
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p1Rank.bg} ${p1Rank.color}`}>{p1Rank.label}</span>
                          <span className="font-mono text-xs font-bold">{song.player1_score.toLocaleString()}</span>
                        </div>
                        <div className="shrink-0">
                          {song.song_jacket_url ? (
                            <img src={song.song_jacket_url} alt="" className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-piu-dark flex items-center justify-center text-[8px] text-gray-600 font-display">Lv.{song.song_level}</div>
                          )}
                        </div>
                        <div className={`flex-1 flex items-center gap-1 pl-2 ${song.winner === 'player2' ? 'text-piu-green' : ''}`}>
                          <span className="font-mono text-xs font-bold">{song.player2_score.toLocaleString()}</span>
                          <span className={`text-[10px] font-display font-bold px-1 py-0.5 rounded border ${p2Rank.bg} ${p2Rank.color}`}>{p2Rank.label}</span>
                          {song.winner === 'player2' && <span className="text-[10px]">&#9733;</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Results — Phoenix-style score cards */}
              <div>
                <h3 className="font-display font-bold text-sm text-piu-accent mb-3">Detailed Results</h3>
                <div className="space-y-4">
                  {stats.completed.map(song => (
                    <div key={song.id}>
                      {/* Song header */}
                      <div className="flex items-center gap-2 mb-2">
                        {song.song_jacket_url && <img src={song.song_jacket_url} alt="" className="w-10 h-10 rounded object-cover" />}
                        <div>
                          <p className="font-display font-bold text-sm">{song.song_title}</p>
                          <p className="text-[10px] text-gray-500">{song.song_artist} | {song.song_mode} Lv.{song.song_level}</p>
                        </div>
                      </div>
                      {/* Two Phoenix-style score cards side by side */}
                      <div className="grid grid-cols-2 gap-2">
                        <PhoenixScoreCard name={duel.player1_name} song={song} prefix="player1" won={song.winner === 'player1'} />
                        <PhoenixScoreCard name={duel.player2_name} song={song} prefix="player2" won={song.winner === 'player2'} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rank Distribution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <RankDistribution playerName={duel.player1_name} songs={stats.completed} scoreKey="player1_score" color="red" />
                <RankDistribution playerName={duel.player2_name} songs={stats.completed} scoreKey="player2_score" color="blue" />
              </div>
            </>
          )}
        </div>
      )}

      {/* Score Breakdown Modal — both players Phoenix-style */}
      {selectedBreakdown && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedBreakdown(null)}>
          <div className="card max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                {selectedBreakdown.song_jacket_url && <img src={selectedBreakdown.song_jacket_url} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                <div>
                  <h3 className="font-display font-bold">{selectedBreakdown.song_title}</h3>
                  <p className="text-xs text-gray-500">{selectedBreakdown.song_artist} | {selectedBreakdown.song_mode} Lv.{selectedBreakdown.song_level}</p>
                </div>
              </div>
              <button onClick={() => setSelectedBreakdown(null)} className="text-gray-500 hover:text-white text-xl">&#10005;</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PhoenixScoreCard name={duel.player1_name} song={selectedBreakdown} prefix="player1" won={selectedBreakdown.winner === 'player1'} />
              <PhoenixScoreCard name={duel.player2_name} song={selectedBreakdown} prefix="player2" won={selectedBreakdown.winner === 'player2'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhoenixScoreCard({ name, song, prefix, won }) {
  const score = song[`${prefix}_score`];
  const rank = getRank(score);
  const judgments = [
    { label: 'Perfect', value: song[`${prefix}_perfect`], color: 'text-sky-300' },
    { label: 'Great', value: song[`${prefix}_great`], color: 'text-green-400' },
    { label: 'Good', value: song[`${prefix}_good`], color: 'text-yellow-400' },
    { label: 'Bad', value: song[`${prefix}_bad`], color: 'text-orange-400' },
    { label: 'Miss', value: song[`${prefix}_miss`], color: 'text-red-400' },
  ];
  return (
    <div className={`rounded-lg border p-3 ${won ? 'border-piu-green/40 bg-piu-green/5' : 'border-piu-border/30 bg-piu-dark/30'}`}>
      {/* Player name */}
      <p className={`text-[10px] font-display font-bold text-center mb-2 ${won ? 'text-piu-green' : 'text-gray-400'}`}>
        {won && <span className="mr-0.5">&#9733;</span>}{name}
      </p>
      {/* Rank badge */}
      <div className="text-center mb-1">
        <span className={`text-sm font-display font-bold px-2 py-0.5 rounded border ${rank.bg} ${rank.color}`}>
          {rank.label}
        </span>
      </div>
      {/* Score */}
      <p className={`font-mono font-bold text-center text-lg ${won ? 'text-piu-green' : 'text-white'}`}>
        {score.toLocaleString()}
      </p>
      {/* Judgment breakdown */}
      <div className="mt-2 space-y-0.5">
        {judgments.map(j => (
          <div key={j.label} className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500">{j.label}</span>
            <span className={`font-mono font-bold ${j.color}`}>{j.value}</span>
          </div>
        ))}
      </div>
      {/* Max Combo & KCAL */}
      <div className="mt-1.5 pt-1.5 border-t border-piu-border/20 space-y-0.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500">Max Combo</span>
          <span className="font-mono font-bold text-white">{song[`${prefix}_max_combo`]}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-500">KCAL</span>
          <span className="font-mono font-bold text-piu-accent">{(song[`${prefix}_kcal`] || 0).toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function RankDistribution({ playerName, songs, scoreKey, color }) {
  const rankCounts = {};
  songs.forEach(s => {
    const rank = getRank(s[scoreKey]);
    rankCounts[rank.label] = (rankCounts[rank.label] || 0) + 1;
  });

  const entries = RANKS.map(r => r.label).filter(r => rankCounts[r]).map(r => ({ rank: r, count: rankCounts[r] }));
  if (entries.length === 0) return null;

  return (
    <div className="card">
      <p className={`text-xs font-display font-bold mb-2 ${color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{playerName} Ranks</p>
      <div className="space-y-1">
        {entries.map(e => {
          const r = RANKS.find(x => x.label === e.rank);
          return (
            <div key={e.rank} className="flex items-center gap-2">
              <span className={`font-display font-bold text-xs w-10 ${r?.color || 'text-gray-400'}`}>{e.rank}</span>
              <div className="flex-1 h-3 bg-piu-dark rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, (e.count / songs.length) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono w-6 text-right">{e.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
