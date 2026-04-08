/**
 * MiniPumpModal — Full-screen game modal/sheet
 * Manages game lifecycle, mute toggle, close, and persistence
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import useMiniPumpGame from './useMiniPumpGame';
import MiniPumpCanvas from './MiniPumpCanvas';
import { isMuted, setMuted as setAudioMuted } from './miniPumpAudio';
import SpritePet from '../../SpritePet';

export default function MiniPumpModal({ open, onClose, character, onComplete, stats, leaderboard }) {
  const game = useMiniPumpGame();
  const [muted, setMutedState] = useState(isMuted());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mode, setMode] = useState('idle');
  const completedRef = useRef(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) setReducedMotion(true);
    const handler = (e) => setReducedMotion(e.matches);
    mq?.addEventListener?.('change', handler);
    return () => mq?.removeEventListener?.('change', handler);
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      game.reset();
      completedRef.current = false;
      setMode('idle');
    } else {
      game.stopLoop();
    }
  }, [open, game]);

  useEffect(() => {
    if (!open) return undefined;
    const interval = setInterval(() => {
      setMode(game.getState().mode);
    }, 100);
    return () => clearInterval(interval);
  }, [game, open]);

  // Watch for round_end to trigger persistence
  useEffect(() => {
    const check = () => {
      const state = game.getState();
      if (state.mode === 'round_end' && !completedRef.current) {
        completedRef.current = true;
        onComplete?.({
          score: state.score,
          hits: state.hits,
          misses: state.misses,
          headBonks: state.headBonks,
          bestStreak: state.bestStreak,
          fastestCadenceMs: state.fastestCadenceMs,
        });
      }
    };
    const interval = setInterval(check, 300);
    return () => clearInterval(interval);
  }, [game, onComplete]);

  const handleStart = useCallback(() => {
    completedRef.current = false;
    if (game.getState().mode === 'round_end') {
      game.reset();
    }
    game.startGame();
  }, [game]);

  const handleShoot = useCallback((color) => {
    game.shoot(color);
  }, [game]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const handleClose = useCallback(() => {
    game.reset();
    game.stopLoop();
    onClose();
  }, [game, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#06080f]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/40 border-b border-white/[0.06] shrink-0">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="text-[11px] font-black tracking-widest text-white/60 uppercase">Mini-Pump</div>
        <button
          onClick={toggleMute}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L5.203 13H3.75A.75.75 0 013 12.25v-4.5A.75.75 0 013.75 7h1.453l3.533-3.796a.75.75 0 01.811-.142z" />
              <path d="M12.22 8.22a.75.75 0 011.06 0L14.5 9.44l1.22-1.22a.75.75 0 111.06 1.06L15.56 10.5l1.22 1.22a.75.75 0 11-1.06 1.06L14.5 11.56l-1.22 1.22a.75.75 0 11-1.06-1.06l1.22-1.22-1.22-1.22a.75.75 0 010-1.06z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10 3.75a.75.75 0 00-1.264-.546L5.203 7H3.75A.75.75 0 003 7.75v4.5c0 .414.336.75.75.75h1.453l3.533 3.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.06 5.5 5.5 0 010 7.78.75.75 0 001.06 1.06 7 7 0 000-9.9z" />
              <path d="M13.829 7.172a.75.75 0 00-1.06 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
            </svg>
          )}
        </button>
      </div>

      {/* Game canvas */}
      <div className="flex-1 min-h-0 relative">
        <MiniPumpCanvas
          game={game}
          character={character}
          onStart={handleStart}
          onShoot={handleShoot}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Bottom controls / leaderboard */}
      <GameButtons
        game={game}
        mode={mode}
        onShoot={handleShoot}
        onStart={handleStart}
        stats={stats}
        leaderboard={leaderboard}
      />
    </div>
  );
}

function GameButtons({ game, mode, onShoot, onStart, stats, leaderboard }) {
  if (mode === 'playing') {
    const buttons = [
      { color: 'red', label: 'A', bg: 'bg-red-500/20 border-red-500/40 active:bg-red-500/50', text: 'text-red-400' },
      { color: 'yellow', label: 'S', bg: 'bg-yellow-500/20 border-yellow-500/40 active:bg-yellow-500/50', text: 'text-yellow-400' },
      { color: 'blue', label: 'D', bg: 'bg-blue-500/20 border-blue-500/40 active:bg-blue-500/50', text: 'text-blue-400' },
    ];

    return (
      <div className="flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/60 border-t border-white/[0.04] shrink-0">
        {buttons.map(b => (
          <button
            key={b.color}
            onTouchStart={(e) => { e.preventDefault(); onShoot(b.color); }}
            onMouseDown={() => onShoot(b.color)}
            className={`flex-1 h-14 rounded-xl border-2 ${b.bg} ${b.text} font-black text-lg transition-transform active:scale-95 select-none touch-none`}
          >
            {b.label}
          </button>
        ))}
      </div>
    );
  }

  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : [];
  const personalBest = stats?.personalBest ?? 0;
  const roundsPlayed = stats?.roundsPlayed ?? 0;
  const buttonLabel = mode === 'round_end' ? 'Play Again' : 'Start Mini-Pump';

  return (
    <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
      <button
        onClick={onStart}
        className="w-full h-12 rounded-xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 font-black tracking-wide hover:bg-cyan-500/20 active:scale-[0.99] transition-all"
      >
        {buttonLabel}
      </button>

      <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-cyan-200/80">Community Board</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Best blob runs from other players and their pets</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Your best</div>
            <div className="text-sm font-black tabular-nums text-white">{personalBest}</div>
            <div className="text-[10px] text-gray-600">{roundsPlayed} rounds</div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {topEntries.length > 0 ? topEntries.map((entry) => (
            <div key={`${entry.user_id || entry.username}-${entry.rank}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${entry.is_me ? 'bg-cyan-400/[0.08]' : 'bg-black/20'}`}>
              <div className={`w-6 text-[10px] font-black tabular-nums ${entry.rank === 1 ? 'text-amber-300' : entry.rank === 2 ? 'text-slate-300' : 'text-orange-300'}`}>#{entry.rank}</div>
              <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1 py-0.5 shrink-0">
                <SpritePet
                  character={entry.character}
                  weightState={entry.weight_state || 'normal'}
                  mood={entry.mood || 'happy'}
                  hat={entry.equipped_hat || ''}
                  top={entry.equipped_top || ''}
                  hatColor={entry.hat_color || ''}
                  topColor={entry.top_color || ''}
                  size={24}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-white/90">
                  {entry.username}
                  {entry.nickname ? <span className="text-gray-500"> · {entry.nickname}</span> : null}
                </div>
                <div className="truncate text-[9px] text-gray-500">{entry.form || 'Companion'} · streak {entry.best_streak || 0}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] font-black tabular-nums text-cyan-200">{entry.personal_best}</div>
                <div className="text-[9px] text-gray-600 tabular-nums">{entry.fastest_cadence || 1000}ms</div>
              </div>
            </div>
          )) : (
            <div className="text-[10px] text-gray-500">Loading leaderboard...</div>
          )}
        </div>
      </div>
    </div>
  );
}
