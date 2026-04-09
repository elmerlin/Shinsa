import React, { useState, useRef, useEffect, useCallback } from 'react';
import usePacItUpGame from './usePacItUpGame';
import PacItUpCanvas from './PacItUpCanvas';
import { isMuted, setMuted as setAudioMuted, stopAll } from './pacItUpAudio';
import SpritePet from '../../SpritePet';

export default function PacItUpModal({ open, onClose, character, onComplete, stats, leaderboard }) {
  const game = usePacItUpGame();
  const [muted, setMutedState] = useState(isMuted());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mode, setMode] = useState('idle');
  const completedRef = useRef(false);

  // Detect reduced motion
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      setReducedMotion(mq.matches);
      const handler = (e) => setReducedMotion(e.matches);
      mq.addEventListener?.('change', handler);
      return () => mq.removeEventListener?.('change', handler);
    }
  }, []);

  // Reset on open
  useEffect(() => {
    if (open) {
      game.reset();
      setMode('idle');
      completedRef.current = false;
    } else {
      game.stopLoop();
      stopAll();
    }
  }, [open, game]);

  // Poll mode every 100ms
  useEffect(() => {
    if (!open) return;
    const poll = setInterval(() => {
      const s = game.getState();
      setMode(s.mode);
    }, 100);
    return () => clearInterval(poll);
  }, [open, game]);

  // Trigger completion once on game_over
  useEffect(() => {
    if (mode !== 'game_over' || completedRef.current) return;
    const check = setInterval(() => {
      const s = game.getState();
      if (s.mode === 'game_over' && !completedRef.current) {
        completedRef.current = true;
        clearInterval(check);
        onComplete?.({
          score: s.score,
          stageReached: s.stage,
          longestCombo: s.longestCombo,
          stompsCollected: s.stompsCollected,
          ghostsEaten: s.ghostsEaten,
          livesRemaining: s.lives,
        });
      }
    }, 300);
    return () => clearInterval(check);
  }, [mode, game, onComplete]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const handleClose = useCallback(() => {
    game.stopLoop();
    game.reset();
    stopAll();
    onClose?.();
  }, [game, onClose]);

  const handleStart = useCallback(() => {
    completedRef.current = false;
    game.startGame(character);
  }, [game, character]);

  if (!open) return null;

  const isPlaying = mode === 'playing' || mode === 'countdown' || mode === 'life_lost' || mode === 'stage_clear';
  const isCoarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a0a14]">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/40 border-b border-white/[0.06]">
        <button onClick={handleClose} className="text-gray-400 hover:text-white text-xs flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Back
        </button>
        <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Pac It Up!</div>
        <button onClick={toggleMute} className="text-gray-400 hover:text-white text-xs">
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 min-h-0 relative">
        <PacItUpCanvas game={game} character={character || 'dojocat'} reducedMotion={reducedMotion} />
      </div>

      {/* ── Bottom controls ── */}
      <GameControls
        mode={mode}
        isPlaying={isPlaying}
        isCoarse={isCoarse}
        game={game}
        onStart={handleStart}
        stats={stats}
        leaderboard={leaderboard}
        character={character}
      />
    </div>
  );
}

// ─── Bottom controls component ───────────────────────────────────

function GameControls({ mode, isPlaying, isCoarse, game, onStart, stats, leaderboard, character }) {
  if (isPlaying && isCoarse) {
    return (
      <div className="px-4 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] bg-black/50 border-t border-white/[0.06]">
        <div className="mx-auto grid w-[232px] grid-cols-3 gap-3">
          <div />
          <DpadButton dir="up" label="up" game={game} />
          <div />
          <DpadButton dir="left" label="left" game={game} />
          <DpadButton dir="down" label="down" game={game} />
          <DpadButton dir="right" label="right" game={game} />
        </div>
        <div className="mt-2 text-center text-[10px] text-gray-500">Hold to steer</div>
      </div>
    );
  }

  if (isPlaying && !isCoarse) {
    return (
      <div className="px-4 py-2 bg-black/40 border-t border-white/[0.06]">
        <div className="text-center text-[10px] text-gray-500">Arrow keys / WASD or swipe</div>
      </div>
    );
  }

  return (
    <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
      <button
        onClick={onStart}
        className="w-full h-12 rounded-xl border border-teal-400/30 bg-teal-500/15 text-teal-100 font-black tracking-wide hover:bg-teal-500/20 active:scale-[0.99] transition-all"
      >
        {mode === 'game_over' ? 'Play Again' : 'Start Pac It Up'}
      </button>

      {(stats || (leaderboard && leaderboard.length > 0)) && (
        <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black tracking-[0.2em] uppercase text-teal-200/80">Community Board</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Best maze runs from players and their pets</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Your best</div>
              <div className="text-sm font-black tabular-nums text-white">{stats?.highScore ?? 0}</div>
              <div className="text-[10px] text-gray-600">Stage {stats?.bestStage ?? 0} · {stats?.totalRuns ?? 0} runs</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {Array.isArray(leaderboard) && leaderboard.length > 0 ? leaderboard.slice(0, 5).map((entry) => (
              <div key={`${entry.user_id || entry.username}-${entry.rank}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${entry.is_me ? 'bg-teal-400/[0.08]' : 'bg-black/20'}`}>
                <div className={`w-6 text-[10px] font-black tabular-nums ${entry.rank === 1 ? 'text-amber-300' : entry.rank === 2 ? 'text-slate-300' : 'text-orange-300'}`}>#{entry.rank}</div>
                <div className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1 py-0.5 shrink-0">
                  <SpritePet
                    character={entry.character || character || 'dojocat'}
                    size={24}
                    form={entry.form}
                    equippedHat={entry.equipped_hat}
                    equippedTop={entry.equipped_top}
                    hatColor={entry.hat_color}
                    topColor={entry.top_color}
                    weightState={entry.weight_state}
                    mood={entry.mood}
                    inline
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-white/90">
                    {entry.nickname || entry.username || 'Unknown'}
                  </div>
                  <div className="truncate text-[9px] text-gray-500">Stage {entry.best_stage || 0} · combo {entry.longest_combo || 0}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12px] font-black tabular-nums text-teal-200">{entry.high_score || 0}</div>
                  <div className="text-[9px] text-gray-600 tabular-nums">{entry.ghosts_eaten || 0} ghosts</div>
                </div>
              </div>
            )) : (
              <div className="text-[10px] text-gray-500">Loading leaderboard...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DpadButton({ dir, label, game }) {
  const stop = useCallback((e) => {
    e?.preventDefault?.();
    game.setTouchPadDir(null);
  }, [game]);

  const start = useCallback((e) => {
    e?.preventDefault?.();
    game.setTouchPadDir(dir);
  }, [dir, game]);

  const icons = {
    up: 'M10 4.5l5.5 6h-3.5v5h-4v-5H4.5l5.5-6z',
    down: 'M10 15.5l-5.5-6H8v-5h4v5h3.5l-5.5 6z',
    left: 'M4.5 10l6-5.5v3.5h5v4h-5v3.5L4.5 10z',
    right: 'M15.5 10l-6 5.5v-3.5h-5v-4h5V4.5l6 5.5z',
  };

  return (
    <button
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={start}
      onTouchEnd={stop}
      onTouchCancel={stop}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      className="h-16 w-16 rounded-2xl border-2 bg-teal-500/18 border-teal-400/35 active:bg-teal-500/35 active:scale-95 transition-all flex items-center justify-center select-none touch-none shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8 text-teal-100">
        <path d={icons[label]} />
      </svg>
    </button>
  );
}
