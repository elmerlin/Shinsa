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
    // Mobile D-pad
    return (
      <div className="px-4 py-3 bg-black/40 border-t border-white/[0.06]">
        <div className="flex flex-col items-center gap-1">
          <DpadButton dir="up" label="▲" game={game} />
          <div className="flex gap-8">
            <DpadButton dir="left" label="◀" game={game} />
            <DpadButton dir="right" label="▶" game={game} />
          </div>
          <DpadButton dir="down" label="▼" game={game} />
        </div>
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

  // Idle / game_over — start button + stats + leaderboard
  return (
    <div className="px-4 py-3 bg-black/40 border-t border-white/[0.06] max-h-[45vh] overflow-y-auto">
      <button
        onClick={onStart}
        className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold mb-3 transition-colors"
      >
        {mode === 'game_over' ? 'Play Again' : 'Start Game'}
      </button>

      {/* Personal stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <StatBox label="Best" value={stats.highScore || 0} />
          <StatBox label="Stage" value={stats.bestStage || 0} />
          <StatBox label="Combo" value={stats.longestCombo || 0} />
          <StatBox label="Runs" value={stats.totalRuns || 0} />
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Community Best</div>
          <div className="space-y-1">
            {leaderboard.slice(0, 5).map((entry) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] ${
                  entry.is_me ? 'bg-teal-900/30 border border-teal-500/20' : 'bg-white/[0.02]'
                }`}
              >
                <span className="w-5 text-gray-500 text-right">#{entry.rank}</span>
                <span className="w-6 h-6 flex-shrink-0">
                  <SpritePet
                    character={entry.character || 'dojocat'}
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
                </span>
                <span className="flex-1 truncate text-gray-300">
                  {entry.nickname || entry.username || 'Unknown'}
                </span>
                <span className="text-gray-500">Stg {entry.best_stage || 0}</span>
                <span className="text-white font-semibold tabular-nums">{entry.high_score || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DpadButton({ dir, label, game }) {
  return (
    <button
      onTouchStart={(e) => { e.preventDefault(); game.setTouchPadDir(dir); }}
      onTouchEnd={(e) => { e.preventDefault(); game.setTouchPadDir(null); }}
      onMouseDown={() => game.setTouchPadDir(dir)}
      onMouseUp={() => game.setTouchPadDir(null)}
      className="w-12 h-12 rounded-lg bg-white/[0.08] border border-white/[0.1] text-white/60 text-lg
                 active:bg-white/[0.15] active:scale-95 transition-all flex items-center justify-center select-none"
    >
      {label}
    </button>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-white/[0.03] rounded-md p-1.5 text-center">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs text-white font-semibold tabular-nums">{value}</div>
    </div>
  );
}
