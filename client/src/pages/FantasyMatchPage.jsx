import React, { useState, useEffect, useCallback } from 'react';
import { getFantasyPool } from '../utils/api';

const PHASES = { START: 'start', LOADING: 'loading', DRAFT: 'draft', MATCH: 'match', BATTLE: 'battle', RESULT: 'result' };

const ROUND_THEMES = [
  { name: 'Speed Blitz', icon: '\u26A1', desc: 'Burst patterns dominate', weights: { speed: 0.4, tech: 0.3, stamina: 0.2, mobility: 0.1 }, gradient: 'from-amber-500 to-orange-600' },
  { name: 'Endurance Trial', icon: '\uD83D\uDD25', desc: 'Sustained energy wins', weights: { stamina: 0.4, mobility: 0.3, speed: 0.15, tech: 0.15 }, gradient: 'from-emerald-500 to-teal-600' },
  { name: 'Technical Showcase', icon: '\u2699\uFE0F', desc: 'Precision is everything', weights: { tech: 0.35, mobility: 0.3, speed: 0.2, stamina: 0.15 }, gradient: 'from-violet-500 to-purple-600' },
];

const BUCKET_META = {
  speed: { label: 'Speed', icon: '\u26A1' },
  stamina: { label: 'Stamina', icon: '\uD83D\uDD25' },
  mobility: { label: 'Mobility', icon: '\uD83C\uDF00' },
  tech: { label: 'Tech', icon: '\u2699\uFE0F' },
};

function ratingColor(v) {
  if (v >= 85) return 'text-amber-300';
  if (v >= 65) return 'text-cyan-300';
  if (v >= 40) return 'text-zinc-200';
  return 'text-zinc-400';
}

function computeScore(card, theme) {
  const attrs = card.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const ovr = card.ratings?.overall?.score100 || 0;
  const weighted = Object.entries(theme.weights).reduce((sum, [k, w]) => sum + (attrs[k] || 0) * w, 0);
  const randomFactor = 0.85 + Math.random() * 0.3;
  return Math.round((weighted + ovr / 10) * randomFactor * 10) / 10;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Mini Player Card ──
function MiniCard({ card, onClick, selected, disabled, highlight, animDelay = 0, showWeights, compact }) {
  const attrs = card.attributes?.overall || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const ovr = card.ratings?.overall?.score100 || 0;
  const user = card.user || {};
  const comp = card.competitive || {};

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{ animationDelay: `${animDelay}ms` }}
      className={[
        'relative rounded-xl border p-3 transition-all duration-300',
        'animate-[cardFlip_0.5s_ease-out_both]',
        selected ? 'border-[#ff3366] bg-[#ff3366]/10 shadow-[0_0_20px_rgba(255,51,102,0.2)]' : 'border-[#2a2a4a] bg-[#141428]',
        highlight ? 'ring-2 ring-amber-400/40' : '',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-[#ff3366]/50 hover:shadow-lg hover:scale-[1.02]',
        compact ? 'p-2' : 'p-3',
      ].filter(Boolean).join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 bg-zinc-800 shrink-0">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-display font-bold text-sm text-zinc-500">
              {(user.username || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-sm text-white truncate">{user.username || 'Unknown'}</div>
          <div className="flex gap-1 mt-0.5">
            {comp.singleLevel && (
              <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/20">
                S{comp.singleLevel}
              </span>
            )}
            {comp.doubleLevel && (
              <span className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">
                D{comp.doubleLevel}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-display font-bold text-xl leading-none tabular-nums ${ratingColor(ovr)}`}>{ovr}</div>
          <div className="text-[8px] font-display font-bold uppercase tracking-widest text-zinc-500">OVR</div>
        </div>
      </div>

      {/* Attribute Bars */}
      <div className="space-y-1.5">
        {['speed', 'stamina', 'mobility', 'tech'].map((bucket) => {
          const val = attrs[bucket] || 0;
          const weight = showWeights?.weights?.[bucket];
          return (
            <div key={bucket} className="flex items-center gap-1.5">
              <span className="w-[52px] text-right font-display text-[9px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">
                {BUCKET_META[bucket].icon} {BUCKET_META[bucket].label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, val)}%` }}
                />
              </div>
              <span className={`w-6 text-right font-display text-[10px] font-bold tabular-nums ${ratingColor(val)}`}>
                {val}
              </span>
              {weight !== undefined && (
                <span className="w-8 text-right text-[9px] font-display text-amber-400/70">{Math.round(weight * 100)}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Battle View ──
function BattleView({ userCard, cpuCard, theme, userScore, cpuScore, roundNum, onContinue }) {
  const [revealed, setRevealed] = useState(false);
  const maxScore = Math.max(userScore, cpuScore, 1);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* Round Theme Banner */}
      <div className={`text-center py-4 rounded-2xl bg-gradient-to-r ${theme.gradient} bg-opacity-20`}>
        <div className="text-3xl mb-1">{theme.icon}</div>
        <h3 className="font-display font-black text-xl text-white uppercase tracking-wider">
          Round {roundNum}: {theme.name}
        </h3>
        <p className="text-sm text-white/70 font-display">{theme.desc}</p>
      </div>

      {/* VS Layout */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
        <div>
          <div className="text-center mb-2">
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-cyan-400">Your Pick</span>
          </div>
          <MiniCard card={userCard} compact showWeights={theme} />
        </div>

        <div className="flex flex-col items-center justify-center pt-12">
          <div className="w-10 h-10 rounded-full bg-[#ff3366]/20 border border-[#ff3366]/30 flex items-center justify-center">
            <span className="font-display font-black text-sm text-[#ff3366]">VS</span>
          </div>
        </div>

        <div>
          <div className="text-center mb-2">
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-rose-400">CPU Pick</span>
          </div>
          <MiniCard card={cpuCard} compact showWeights={theme} />
        </div>
      </div>

      {/* Score Reveal */}
      <div className={`transition-all duration-1000 ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="bg-[#141428] border border-[#2a2a4a] rounded-2xl p-4 space-y-4">
          <h4 className="font-display font-bold text-center text-sm uppercase tracking-widest text-zinc-400">Performance Scores</h4>

          {/* User Score Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-display font-bold text-sm text-cyan-300">{userCard.user?.username}</span>
              <span className={`font-display font-black text-lg tabular-nums ${userScore >= cpuScore ? 'text-amber-300' : 'text-zinc-300'}`}>
                {userScore.toFixed(1)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${userScore >= cpuScore ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-cyan-400 to-blue-500'}`}
                style={{ width: revealed ? `${(userScore / maxScore) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* CPU Score Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="font-display font-bold text-sm text-rose-300">{cpuCard.user?.username}</span>
              <span className={`font-display font-black text-lg tabular-nums ${cpuScore > userScore ? 'text-amber-300' : 'text-zinc-300'}`}>
                {cpuScore.toFixed(1)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${cpuScore > userScore ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-rose-400 to-pink-500'}`}
                style={{ width: revealed ? `${(cpuScore / maxScore) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Winner */}
          {revealed && (
            <div className="text-center pt-2 animate-[scaleIn_0.4s_ease-out]">
              <span className={`inline-block px-4 py-1.5 rounded-full font-display font-black text-sm uppercase tracking-wider ${
                userScore > cpuScore
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : userScore < cpuScore
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
              }`}>
                {userScore > cpuScore ? 'You Win This Round!' : userScore < cpuScore ? 'CPU Wins This Round!' : 'Draw!'}
              </span>
            </div>
          )}
        </div>

        {revealed && (
          <div className="flex justify-center mt-4">
            <button
              onClick={onContinue}
              className="px-6 py-2.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-[#ff3366] to-[#ff6699] text-white hover:shadow-[0_0_20px_rgba(255,51,102,0.3)] transition-all hover:scale-105"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function FantasyMatchPage({ embedded = false }) {
  const [phase, setPhase] = useState(PHASES.START);
  const [pool, setPool] = useState([]);
  const [draftCards, setDraftCards] = useState([]);
  const [myTeam, setMyTeam] = useState([]);
  const [cpuTeam, setCpuTeam] = useState([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [myRemaining, setMyRemaining] = useState([]);
  const [cpuRemaining, setCpuRemaining] = useState([]);
  const [roundResults, setRoundResults] = useState([]);
  const [battleState, setBattleState] = useState(null);
  const [error, setError] = useState(null);

  const startDraft = useCallback(async () => {
    setPhase(PHASES.LOADING);
    setError(null);
    try {
      const data = await getFantasyPool(10);
      const cards = data.cards || [];
      if (cards.length < 8) throw new Error('Not enough players available');
      const shuffled = shuffle(cards);
      setPool(shuffled);
      setDraftCards(shuffled.slice(0, 5));
      setMyTeam([]);
      setCpuTeam([]);
      setRoundIndex(0);
      setRoundResults([]);
      setBattleState(null);
      setPhase(PHASES.DRAFT);
    } catch (err) {
      setError(err.message || 'Failed to load player pool');
      setPhase(PHASES.START);
    }
  }, []);

  const selectForTeam = useCallback((card) => {
    if (myTeam.length >= 3) return;
    const newTeam = [...myTeam, card];
    setMyTeam(newTeam);

    if (newTeam.length === 3) {
      // CPU picks from remaining draft cards + extra pool cards
      const userIds = new Set(newTeam.map(c => c.user.id));
      const remaining = pool.filter(c => !userIds.has(c.user.id));
      const cpuPool = shuffle(remaining).slice(0, 5);
      // CPU picks best 3 by OVR
      const cpuPicks = cpuPool
        .sort((a, b) => (b.ratings?.overall?.score100 || 0) - (a.ratings?.overall?.score100 || 0))
        .slice(0, 3);
      setCpuTeam(cpuPicks);
      setMyRemaining(newTeam);
      setCpuRemaining(cpuPicks);

      setTimeout(() => setPhase(PHASES.MATCH), 600);
    }
  }, [myTeam, pool]);

  const fieldPlayer = useCallback((card) => {
    if (battleState) return;
    const theme = ROUND_THEMES[roundIndex];

    // CPU picks: best match for this theme
    const cpuPick = [...cpuRemaining].sort((a, b) => {
      const sa = computeScore(a, theme);
      const sb = computeScore(b, theme);
      return sb - sa;
    })[0];

    const userScore = computeScore(card, theme);
    const cpuScore = computeScore(cpuPick, theme);

    setMyRemaining(prev => prev.filter(c => c.user.id !== card.user.id));
    setCpuRemaining(prev => prev.filter(c => c.user.id !== cpuPick.user.id));

    setBattleState({ userCard: card, cpuCard: cpuPick, userScore, cpuScore, theme });
    setPhase(PHASES.BATTLE);
  }, [battleState, roundIndex, cpuRemaining]);

  const continueBattle = useCallback(() => {
    const newResults = [...roundResults, battleState];
    setRoundResults(newResults);
    setBattleState(null);

    if (newResults.length >= 3) {
      setPhase(PHASES.RESULT);
    } else {
      setRoundIndex(prev => prev + 1);
      setPhase(PHASES.MATCH);
    }
  }, [roundResults, battleState]);

  const playAgain = useCallback(() => {
    setPhase(PHASES.START);
    setPool([]);
    setDraftCards([]);
    setMyTeam([]);
    setCpuTeam([]);
    setRoundIndex(0);
    setMyRemaining([]);
    setCpuRemaining([]);
    setRoundResults([]);
    setBattleState(null);
    setError(null);
  }, []);

  const userWins = roundResults.filter(r => r.userScore > r.cpuScore).length;
  const cpuWins = roundResults.filter(r => r.cpuScore > r.userScore).length;

  return (
    <div className={embedded ? 'rounded-[30px] border border-[#2a2a4a] bg-[#0a0a1a] shadow-[0_24px_70px_rgba(0,0,0,0.28)]' : 'min-h-screen bg-[#0a0a1a] pb-20'}>
      {/* Inline animation keyframes */}
      <style>{`
        @keyframes cardFlip { 0% { transform: rotateY(90deg); opacity: 0; } 100% { transform: rotateY(0); opacity: 1; } }
        @keyframes scaleIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { 0% { transform: translateY(20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 8px rgba(255,51,102,0.3); } 50% { box-shadow: 0 0 24px rgba(255,51,102,0.6); } }
      `}</style>

      {/* Header */}
      {embedded ? (
        <div className="border-b border-[#2a2a4a]/60 bg-[radial-gradient(circle_at_top_left,rgba(255,102,153,0.18),transparent_36%),linear-gradient(180deg,rgba(20,20,40,0.95),rgba(10,10,26,0.92))] px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.26em] text-[#ff8db1]/70">
                Fun Draft
              </p>
              <h2 className="mt-2 font-display text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-3xl">
                Fantasy Match
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
                Draft three real Shinsa scouting cards and play a short best-of-three against the CPU.
              </p>
            </div>
            {phase !== PHASES.START && phase !== PHASES.LOADING && (
              <div className="flex gap-3 rounded-2xl border border-[#2a2a4a] bg-[#101225]/90 px-4 py-3">
                <div className="text-center">
                  <div className="font-display text-lg font-black tabular-nums text-cyan-300">{userWins}</div>
                  <div className="text-[8px] font-display font-bold uppercase tracking-widest text-zinc-500">You</div>
                </div>
                <div className="h-8 w-px bg-[#2a2a4a]" />
                <div className="text-center">
                  <div className="font-display text-lg font-black tabular-nums text-rose-300">{cpuWins}</div>
                  <div className="text-[8px] font-display font-bold uppercase tracking-widest text-zinc-500">CPU</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-b from-[#141428] to-transparent border-b border-[#2a2a4a]/50 px-4 py-4 sm:py-6">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="font-display font-black text-xl sm:text-2xl text-white uppercase tracking-wide">
                Fantasy Match
              </h1>
            </div>
            {phase !== PHASES.START && phase !== PHASES.LOADING && (
              <div className="flex gap-3 items-center">
                <div className="text-center">
                  <div className="font-display font-black text-lg text-cyan-300 tabular-nums">{userWins}</div>
                  <div className="text-[8px] font-display font-bold uppercase tracking-widest text-zinc-500">You</div>
                </div>
                <div className="w-px h-8 bg-[#2a2a4a]" />
                <div className="text-center">
                  <div className="font-display font-black text-lg text-rose-300 tabular-nums">{cpuWins}</div>
                  <div className="text-[8px] font-display font-bold uppercase tracking-widest text-zinc-500">CPU</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`${embedded ? 'max-w-3xl px-4 py-6 sm:px-6 sm:py-8' : 'max-w-2xl px-4 mt-6'} mx-auto`}>
        {/* ── START Phase ── */}
        {phase === PHASES.START && (
          <div className="animate-[slideUp_0.5s_ease-out] text-center space-y-6 pt-8">
            <div className="text-6xl">&#127183;</div>
            <h2 className="font-display font-black text-3xl sm:text-4xl text-white uppercase tracking-wider">
              Fantasy Match
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Draft a team of 3 players from real Shinsa scouting cards. Battle the CPU across
              3 themed rounds. Each round rewards different attributes — pick wisely!
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto text-center">
                {ROUND_THEMES.map((t, i) => (
                  <div key={i} className="bg-[#141428] border border-[#2a2a4a] rounded-xl p-3">
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="font-display font-bold text-[10px] text-white uppercase tracking-wider">{t.name}</div>
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(t.weights).sort((a,b) => b[1] - a[1]).map(([k, w]) => (
                        <div key={k} className="text-[8px] font-display text-zinc-500">
                          {BUCKET_META[k].icon} {Math.round(w * 100)}%
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-300 font-display">
                {error}
              </div>
            )}
            <button
              onClick={startDraft}
              className="px-8 py-3 rounded-xl font-display font-black text-base uppercase tracking-wider bg-gradient-to-r from-[#ff3366] to-[#ff6699] text-white hover:shadow-[0_0_30px_rgba(255,51,102,0.4)] transition-all hover:scale-105 animate-[pulseGlow_2s_infinite]"
            >
              Start Draft
            </button>
          </div>
        )}

        {/* ── LOADING Phase ── */}
        {phase === PHASES.LOADING && (
          <div className="text-center pt-16 space-y-4 animate-pulse">
            <div className="text-5xl">&#127183;</div>
            <p className="font-display font-bold text-zinc-400 uppercase tracking-widest text-sm">Drawing Player Cards...</p>
          </div>
        )}

        {/* ── DRAFT Phase ── */}
        {phase === PHASES.DRAFT && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-display font-black text-lg text-white uppercase tracking-wider">Draft Your Team</h2>
              <p className="text-zinc-500 text-xs font-display mt-1">
                Pick {3 - myTeam.length} more player{3 - myTeam.length !== 1 ? 's' : ''} from the draw
              </p>
            </div>

            {/* Your Team Panel */}
            {myTeam.length > 0 && (
              <div className="bg-[#141428] border border-cyan-500/20 rounded-2xl p-3">
                <div className="text-[10px] font-display font-bold uppercase tracking-widest text-cyan-400 mb-2">
                  Your Team ({myTeam.length}/3)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {myTeam.map((card, i) => (
                    <div key={card.user.id} className="bg-[#0a0a1a] rounded-lg border border-cyan-500/10 p-2 text-center animate-[scaleIn_0.3s_ease-out]">
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-zinc-800 mx-auto">
                        {card.user.avatar ? (
                          <img src={card.user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-display font-bold text-xs text-zinc-500">
                            {(card.user.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="font-display font-bold text-[10px] text-white mt-1 truncate">{card.user.username}</div>
                      <div className={`font-display font-bold text-xs tabular-nums ${ratingColor(card.ratings?.overall?.score100 || 0)}`}>
                        {card.ratings?.overall?.score100 || 0}
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: 3 - myTeam.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-[#0a0a1a] rounded-lg border border-dashed border-zinc-700/50 p-2 flex items-center justify-center min-h-[80px]">
                      <span className="text-zinc-600 text-xs font-display">?</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Draft Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {draftCards.map((card, i) => {
                const alreadyPicked = myTeam.some(c => c.user.id === card.user.id);
                return (
                  <div key={card.user.id} className="relative">
                    <MiniCard
                      card={card}
                      selected={alreadyPicked}
                      disabled={alreadyPicked || myTeam.length >= 3}
                      onClick={() => selectForTeam(card)}
                      animDelay={i * 150}
                    />
                    {!alreadyPicked && myTeam.length < 3 && (
                      <button
                        onClick={() => selectForTeam(card)}
                        className="absolute bottom-2 right-2 px-3 py-1 rounded-lg font-display font-bold text-[10px] uppercase tracking-wider bg-[#ff3366] text-white hover:bg-[#ff4477] transition-all hover:shadow-[0_0_12px_rgba(255,51,102,0.4)]"
                      >
                        Select
                      </button>
                    )}
                    {alreadyPicked && (
                      <div className="absolute inset-0 rounded-xl bg-cyan-500/5 flex items-center justify-center">
                        <span className="bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 rounded-full font-display font-bold text-[10px] text-cyan-300 uppercase tracking-wider">
                          Drafted
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MATCH Phase ── */}
        {phase === PHASES.MATCH && (
          <div className="space-y-6 animate-[slideUp_0.4s_ease-out]">
            {/* Round Info */}
            <div className={`text-center py-4 rounded-2xl bg-gradient-to-r ${ROUND_THEMES[roundIndex].gradient} bg-opacity-20 border border-white/10`}>
              <div className="text-[10px] font-display font-bold uppercase tracking-widest text-white/60 mb-1">
                Round {roundIndex + 1} of 3
              </div>
              <div className="text-3xl mb-1">{ROUND_THEMES[roundIndex].icon}</div>
              <h3 className="font-display font-black text-xl text-white uppercase tracking-wider">
                {ROUND_THEMES[roundIndex].name}
              </h3>
              <p className="text-sm text-white/70 font-display mt-1">{ROUND_THEMES[roundIndex].desc}</p>
              <div className="flex justify-center gap-3 mt-2">
                {Object.entries(ROUND_THEMES[roundIndex].weights).sort((a,b) => b[1] - a[1]).map(([k, w]) => (
                  <span key={k} className="text-[10px] font-display font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded-full">
                    {BUCKET_META[k].icon} {BUCKET_META[k].label} {Math.round(w * 100)}%
                  </span>
                ))}
              </div>
            </div>

            {/* Score so far */}
            {roundResults.length > 0 && (
              <div className="flex justify-center gap-2">
                {roundResults.map((r, i) => (
                  <div key={i} className={`px-3 py-1 rounded-full text-[10px] font-display font-bold ${
                    r.userScore > r.cpuScore ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20' :
                    r.cpuScore > r.userScore ? 'bg-rose-500/20 text-rose-300 border border-rose-500/20' :
                    'bg-zinc-500/20 text-zinc-300 border border-zinc-500/20'
                  }`}>
                    R{i + 1}: {r.userScore > r.cpuScore ? 'Win' : r.cpuScore > r.userScore ? 'Loss' : 'Draw'}
                  </div>
                ))}
              </div>
            )}

            {/* Pick a player */}
            <div className="text-center">
              <h3 className="font-display font-bold text-sm text-zinc-300 uppercase tracking-wider">Choose Your Fighter</h3>
              <p className="text-zinc-500 text-xs font-display mt-0.5">Tap a player to field them this round</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {myRemaining.map((card, i) => (
                <div key={card.user.id} className="relative">
                  <MiniCard
                    card={card}
                    onClick={() => fieldPlayer(card)}
                    animDelay={i * 100}
                    showWeights={ROUND_THEMES[roundIndex]}
                  />
                  <button
                    onClick={() => fieldPlayer(card)}
                    className="mt-2 w-full py-2 rounded-lg font-display font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-[#ff3366] to-[#ff6699] text-white hover:shadow-[0_0_12px_rgba(255,51,102,0.4)] transition-all"
                  >
                    Field This Player
                  </button>
                </div>
              ))}
            </div>

            {/* CPU Team Preview */}
            <div className="bg-[#141428] border border-rose-500/10 rounded-2xl p-3 mt-4">
              <div className="text-[10px] font-display font-bold uppercase tracking-widest text-rose-400 mb-2">
                CPU Team ({cpuRemaining.length} remaining)
              </div>
              <div className="flex gap-2">
                {cpuRemaining.map((card) => (
                  <div key={card.user.id} className="bg-[#0a0a1a] rounded-lg border border-rose-500/10 p-2 text-center flex-1">
                    <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 bg-zinc-800 mx-auto">
                      {card.user.avatar ? (
                        <img src={card.user.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-display font-bold text-[10px] text-zinc-500">
                          {(card.user.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="font-display font-bold text-[9px] text-zinc-400 mt-1 truncate">{card.user.username}</div>
                    <div className={`font-display font-bold text-[10px] tabular-nums ${ratingColor(card.ratings?.overall?.score100 || 0)}`}>
                      {card.ratings?.overall?.score100 || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── BATTLE Phase ── */}
        {phase === PHASES.BATTLE && battleState && (
          <BattleView
            userCard={battleState.userCard}
            cpuCard={battleState.cpuCard}
            theme={battleState.theme}
            userScore={battleState.userScore}
            cpuScore={battleState.cpuScore}
            roundNum={roundIndex + 1}
            onContinue={continueBattle}
          />
        )}

        {/* ── RESULT Phase ── */}
        {phase === PHASES.RESULT && (
          <div className="space-y-6 animate-[slideUp_0.5s_ease-out] pt-4">
            {/* Final Banner */}
            <div className={`text-center py-8 rounded-2xl border ${
              userWins > cpuWins
                ? 'bg-gradient-to-b from-amber-500/10 to-transparent border-amber-500/20'
                : userWins < cpuWins
                  ? 'bg-gradient-to-b from-rose-500/10 to-transparent border-rose-500/20'
                  : 'bg-gradient-to-b from-zinc-500/10 to-transparent border-zinc-500/20'
            }`}>
              <div className="text-5xl mb-3">
                {userWins > cpuWins ? '\uD83C\uDFC6' : userWins < cpuWins ? '\uD83D\uDCA5' : '\uD83E\uDD1D'}
              </div>
              <h2 className={`font-display font-black text-3xl uppercase tracking-wider ${
                userWins > cpuWins ? 'text-amber-300' : userWins < cpuWins ? 'text-rose-300' : 'text-zinc-300'
              }`}>
                {userWins > cpuWins ? 'Victory!' : userWins < cpuWins ? 'Defeat' : 'Draw'}
              </h2>
              <div className="mt-2 flex justify-center gap-4 font-display font-bold text-xl">
                <span className="text-cyan-300">{userWins}</span>
                <span className="text-zinc-600">-</span>
                <span className="text-rose-300">{cpuWins}</span>
              </div>
            </div>

            {/* Round Breakdown */}
            <div className="space-y-3">
              <h3 className="font-display font-bold text-sm text-zinc-400 uppercase tracking-widest text-center">Round Breakdown</h3>
              {roundResults.map((r, i) => (
                <div key={i} className="bg-[#141428] border border-[#2a2a4a] rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-display font-bold text-xs uppercase tracking-wider bg-gradient-to-r ${ROUND_THEMES[i].gradient} bg-clip-text text-transparent`}>
                      {ROUND_THEMES[i].icon} {ROUND_THEMES[i].name}
                    </span>
                    <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full ${
                      r.userScore > r.cpuScore ? 'bg-emerald-500/20 text-emerald-300' :
                      r.cpuScore > r.userScore ? 'bg-rose-500/20 text-rose-300' :
                      'bg-zinc-500/20 text-zinc-300'
                    }`}>
                      {r.userScore > r.cpuScore ? 'WIN' : r.cpuScore > r.userScore ? 'LOSS' : 'DRAW'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center">
                    <div>
                      <div className="font-display font-bold text-xs text-cyan-300 truncate">{r.userCard.user?.username}</div>
                      <div className={`font-display font-black text-lg tabular-nums ${r.userScore >= r.cpuScore ? 'text-amber-300' : 'text-zinc-400'}`}>
                        {r.userScore.toFixed(1)}
                      </div>
                    </div>
                    <span className="text-zinc-600 font-display font-bold text-xs">vs</span>
                    <div>
                      <div className="font-display font-bold text-xs text-rose-300 truncate">{r.cpuCard.user?.username}</div>
                      <div className={`font-display font-black text-lg tabular-nums ${r.cpuScore > r.userScore ? 'text-amber-300' : 'text-zinc-400'}`}>
                        {r.cpuScore.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Teams Used */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#141428] border border-cyan-500/10 rounded-xl p-3">
                <div className="text-[10px] font-display font-bold uppercase tracking-widest text-cyan-400 mb-2">Your Team</div>
                {myTeam.map(card => (
                  <div key={card.user.id} className="flex items-center gap-2 py-1">
                    <div className="w-6 h-6 rounded overflow-hidden bg-zinc-800 shrink-0">
                      {card.user.avatar ? <img src={card.user.avatar} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <span className="font-display font-bold text-xs text-white truncate">{card.user.username}</span>
                    <span className={`ml-auto font-display font-bold text-xs tabular-nums ${ratingColor(card.ratings?.overall?.score100 || 0)}`}>
                      {card.ratings?.overall?.score100 || 0}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-[#141428] border border-rose-500/10 rounded-xl p-3">
                <div className="text-[10px] font-display font-bold uppercase tracking-widest text-rose-400 mb-2">CPU Team</div>
                {cpuTeam.map(card => (
                  <div key={card.user.id} className="flex items-center gap-2 py-1">
                    <div className="w-6 h-6 rounded overflow-hidden bg-zinc-800 shrink-0">
                      {card.user.avatar ? <img src={card.user.avatar} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <span className="font-display font-bold text-xs text-zinc-300 truncate">{card.user.username}</span>
                    <span className={`ml-auto font-display font-bold text-xs tabular-nums ${ratingColor(card.ratings?.overall?.score100 || 0)}`}>
                      {card.ratings?.overall?.score100 || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Play Again */}
            <div className="flex justify-center pt-2">
              <button
                onClick={playAgain}
                className="px-8 py-3 rounded-xl font-display font-black text-sm uppercase tracking-wider bg-gradient-to-r from-[#ff3366] to-[#ff6699] text-white hover:shadow-[0_0_30px_rgba(255,51,102,0.4)] transition-all hover:scale-105"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
