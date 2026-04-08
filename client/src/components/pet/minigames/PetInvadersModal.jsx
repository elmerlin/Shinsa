/**
 * PetInvadersModal — Full-screen game modal/sheet
 * Manages game lifecycle, mute toggle, close, and persistence
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePetInvadersGame from './usePetInvadersGame';
import PetInvadersCanvas from './PetInvadersCanvas';
import { isMuted, setMuted as setAudioMuted, stopMusic } from './petInvadersAudio';
import SpritePet from '../../SpritePet';

export default function PetInvadersModal({ open, onClose, character, onComplete, stats, leaderboard }) {
  const game = usePetInvadersGame();
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
      stopMusic();
    }
  }, [open, game]);

  useEffect(() => {
    if (!open) return undefined;
    const interval = setInterval(() => {
      setMode(game.getState().mode);
    }, 100);
    return () => clearInterval(interval);
  }, [game, open]);

  // Watch for game_over to trigger persistence
  useEffect(() => {
    const check = () => {
      const state = game.getState();
      if (state.mode === 'game_over' && !completedRef.current) {
        completedRef.current = true;
        onComplete?.({
          score: state.score,
          kills: state.kills,
          bossesDefeated: state.bossesDefeated,
          bestWave: state.bestWave || state.wave,
        });
      }
    };
    const interval = setInterval(check, 300);
    return () => clearInterval(interval);
  }, [game, onComplete]);

  const handleStart = useCallback(() => {
    completedRef.current = false;
    if (game.getState().mode === 'game_over') {
      game.reset();
    }
    game.startGame(character);
  }, [game, character]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const handleClose = useCallback(() => {
    game.reset();
    game.stopLoop();
    stopMusic();
    onClose();
  }, [game, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#020408]">
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
        <div className="text-[11px] font-black tracking-widest text-white/60 uppercase">Pet Invaders</div>
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
        <PetInvadersCanvas
          game={game}
          character={character}
          onStart={handleStart}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* Bottom controls / leaderboard */}
      <GameControls game={game} mode={mode} onStart={handleStart} stats={stats} leaderboard={leaderboard} />
    </div>
  );
}

// ─── Touch control bar ──────────────────────────────
function GameControls({ game, mode, onStart, stats, leaderboard }) {
  if (mode === 'playing' || mode === 'wave_clear' || mode === 'boss_warning') {
    const handleLeft = () => game.setTouchDir(-1);
    const handleRight = () => game.setTouchDir(1);

    return (
      <div className="flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/60 border-t border-white/[0.04] shrink-0">
        <button
          onTouchStart={(e) => { e.preventDefault(); handleLeft(); }}
          onMouseDown={() => handleLeft()}
          className="flex-1 h-14 rounded-xl border-2 bg-cyan-500/20 border-cyan-500/40 active:bg-cyan-500/50 text-cyan-400 font-black text-lg transition-transform active:scale-95 select-none touch-none flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onTouchStart={(e) => { e.preventDefault(); game.setMoveDir(0); }}
          onMouseDown={() => game.setMoveDir(0)}
          className="w-14 h-14 rounded-xl border-2 bg-white/10 border-white/20 active:bg-white/20 text-white/60 font-black text-xs transition-transform active:scale-95 select-none touch-none flex items-center justify-center"
        >
          STOP
        </button>
        <button
          onTouchStart={(e) => { e.preventDefault(); handleRight(); }}
          onMouseDown={() => handleRight()}
          className="flex-1 h-14 rounded-xl border-2 bg-cyan-500/20 border-cyan-500/40 active:bg-cyan-500/50 text-cyan-400 font-black text-lg transition-transform active:scale-95 select-none touch-none flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    );
  }

  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : [];
  const highScore = stats?.highScore ?? 0;
  const bestWave = stats?.bestWave ?? 0;
  const totalRuns = stats?.totalRuns ?? 0;
  const buttonLabel = mode === 'game_over' ? 'Play Again' : 'Start Pet Invaders';

  return (
    <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
      <button
        onClick={onStart}
        className="w-full h-12 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 font-black tracking-wide hover:bg-emerald-500/20 active:scale-[0.99] transition-all"
      >
        {buttonLabel}
      </button>

      <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-200/80">Community Board</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Top invasion runs from players and their pets</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Your best</div>
            <div className="text-sm font-black tabular-nums text-white">{highScore}</div>
            <div className="text-[10px] text-gray-600">Wave {bestWave} · {totalRuns} runs</div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {topEntries.length > 0 ? topEntries.map((entry) => (
            <div key={`${entry.user_id || entry.username}-${entry.rank}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${entry.is_me ? 'bg-emerald-400/[0.08]' : 'bg-black/20'}`}>
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
                <div className="truncate text-[9px] text-gray-500">{entry.form?.label || 'Companion'} · wave {entry.best_wave || 0}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] font-black tabular-nums text-emerald-200">{entry.high_score}</div>
                <div className="text-[9px] text-gray-600 tabular-nums">{entry.total_kills || 0} kills</div>
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
