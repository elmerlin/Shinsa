import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpritePet from '../../SpritePet';
import PetBattleCanvas from './PetBattleCanvas';
import usePetBattleGame, { ARCHETYPES, PET_UNIT_NAMES } from './usePetBattleGame';
import { isMuted, setMuted as setAudioMuted, startAudio, startMusic, stopMusic } from './petBattleAudio';

function formatCooldown(ms) {
  if (ms <= 0) return '';
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

function stagesClearedForDisplay(state) {
  if (!state) return 0;
  if (state.outcome === 'win') return state.stageReached || state.stage || 0;
  return Math.max(0, (state.stageReached || state.stage || 1) - 1);
}

function ControlButton({ label, name, cost, cooldown, disabled, accentClass, onClick }) {
  const cooldownPct = cooldown > 0 ? Math.min(1, cooldown.remaining / Math.max(1, cooldown.total)) : 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-45 ${accentClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
          <div className="truncate text-[12px] font-semibold text-white/90">{name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[12px] font-black text-amber-200">{cost}</div>
          <div className="text-[9px] text-white/45">aura</div>
        </div>
      </div>
      {cooldownPct > 0 && (
        <>
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="absolute left-0 bottom-0 h-1 bg-white/60 pointer-events-none" style={{ width: `${100 - cooldownPct * 100}%` }} />
          <div className="absolute right-2 top-2 text-[10px] font-semibold text-white/80 pointer-events-none">{formatCooldown(cooldown.remaining)}</div>
        </>
      )}
    </button>
  );
}

export default function PetBattleModal({ open, onClose, character, onComplete, stats, leaderboard }) {
  const game = usePetBattleGame();
  const [muted, setMutedState] = useState(isMuted());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mode, setMode] = useState('idle');
  const [uiState, setUiState] = useState(game.getState());
  const completedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      setReducedMotion(mq.matches);
      const handler = (event) => setReducedMotion(event.matches);
      mq.addEventListener?.('change', handler);
      return () => mq.removeEventListener?.('change', handler);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (open) {
      game.reset();
      completedRef.current = false;
      setMode('idle');
      setUiState(game.getState());
    } else {
      game.stopLoop();
      stopMusic();
    }
  }, [game, open]);

  useEffect(() => {
    if (!open) return undefined;
    const interval = setInterval(() => {
      const state = game.getState();
      setMode(state.mode);
      setUiState({ ...state, cooldowns: { ...state.cooldowns } });
    }, 100);
    return () => clearInterval(interval);
  }, [game, open]);

  useEffect(() => {
    if (!open || mode !== 'game_over') return undefined;
    const watcher = setInterval(() => {
      const state = game.getState();
      if (state.mode !== 'game_over') return;
      if (completedRef.current) return;
      completedRef.current = true;
      stopMusic();
      onComplete?.({
        score: state.score,
        stageReached: state.stageReached || state.stage,
        unitsSpawned: state.unitsSpawned,
        enemiesDefeated: state.enemiesDefeated,
        bossesDefeated: state.bossesDefeated,
      });
    }, 300);
    return () => clearInterval(watcher);
  }, [game, mode, onComplete, open]);

  const handleClose = useCallback(() => {
    game.stopLoop();
    game.reset();
    stopMusic();
    onClose?.();
  }, [game, onClose]);

  const handleStart = useCallback(() => {
    completedRef.current = false;
    startAudio();
    startMusic();
    game.startGame(character || 'dojocat');
    setUiState(game.getState());
  }, [character, game]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const names = useMemo(() => PET_UNIT_NAMES[character || 'dojocat'] || PET_UNIT_NAMES.dojocat, [character]);
  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : [];
  const isPlaying = mode === 'playing';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0d0e16]">
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
        <div className="text-[11px] font-black tracking-widest text-white/60 uppercase">Pet Battle</div>
        <button
          onClick={toggleMute}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <PetBattleCanvas game={game} character={character || 'dojocat'} reducedMotion={reducedMotion} />
      </div>

      {isPlaying ? (
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Aura Engine</div>
              <div className="text-sm font-black text-amber-200 tabular-nums">{Math.floor(uiState.aura || 0)} / {uiState.auraMax || 500}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/45">Income</div>
              <div className="text-[12px] font-semibold text-white/85">+{(14 + (uiState.auraLevel || 1) * 4)}/s</div>
            </div>
            <button
              onClick={() => game.upgradeAura()}
              disabled={(uiState.aura || 0) < Math.round(100 * (1.5 ** ((uiState.auraLevel || 1) - 1))) || (uiState.auraLevel || 1) >= 8}
              className="rounded-xl border border-amber-400/25 bg-amber-500/[0.12] px-3 py-2 text-[11px] font-semibold text-amber-100 disabled:opacity-40"
            >
              Upgrade
              <div className="text-[9px] text-amber-200/70">{Math.round(100 * (1.5 ** ((uiState.auraLevel || 1) - 1)))}</div>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <ControlButton
              label="1 / Q"
              name={names.meatshield}
              cost={ARCHETYPES.meatshield.cost}
              cooldown={{ remaining: uiState.cooldowns?.meatshield || 0, total: ARCHETYPES.meatshield.cooldownMs }}
              disabled={(uiState.aura || 0) < ARCHETYPES.meatshield.cost || (uiState.cooldowns?.meatshield || 0) > 0}
              accentClass="border-cyan-400/20 bg-cyan-500/[0.08]"
              onClick={() => game.spawnUnit('meatshield')}
            />
            <ControlButton
              label="2 / W"
              name={names.brawler}
              cost={ARCHETYPES.brawler.cost}
              cooldown={{ remaining: uiState.cooldowns?.brawler || 0, total: ARCHETYPES.brawler.cooldownMs }}
              disabled={(uiState.aura || 0) < ARCHETYPES.brawler.cost || (uiState.cooldowns?.brawler || 0) > 0}
              accentClass="border-rose-400/20 bg-rose-500/[0.08]"
              onClick={() => game.spawnUnit('brawler')}
            />
            <ControlButton
              label="3 / E"
              name={names.ranged}
              cost={ARCHETYPES.ranged.cost}
              cooldown={{ remaining: uiState.cooldowns?.ranged || 0, total: ARCHETYPES.ranged.cooldownMs }}
              disabled={(uiState.aura || 0) < ARCHETYPES.ranged.cost || (uiState.cooldowns?.ranged || 0) > 0}
              accentClass="border-emerald-400/20 bg-emerald-500/[0.08]"
              onClick={() => game.spawnUnit('ranged')}
            />
            <ControlButton
              label="4 / R"
              name={names.tank}
              cost={ARCHETYPES.tank.cost}
              cooldown={{ remaining: uiState.cooldowns?.tank || 0, total: ARCHETYPES.tank.cooldownMs }}
              disabled={(uiState.aura || 0) < ARCHETYPES.tank.cost || (uiState.cooldowns?.tank || 0) > 0}
              accentClass="border-amber-400/20 bg-amber-500/[0.08]"
              onClick={() => game.spawnUnit('tank')}
            />
          </div>
        </div>
      ) : (
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleStart}
            className="w-full h-12 rounded-xl border border-orange-400/30 bg-orange-500/15 text-orange-100 font-black tracking-wide hover:bg-orange-500/20 active:scale-[0.99] transition-all"
          >
            {mode === 'game_over' ? 'Play Again' : 'Start Pet Battle'}
          </button>

          <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black tracking-[0.2em] uppercase text-orange-200/80">Community Board</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Best castle runs from players and their pets</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500">Your best</div>
                <div className="text-sm font-black tabular-nums text-white">{stats?.highScore ?? 0}</div>
                <div className="text-[10px] text-gray-600">
                  Stage {stats?.bestStage ?? 0} · {stats?.totalRuns ?? 0} runs
                </div>
              </div>
            </div>

            {mode === 'game_over' && (
              <div className="mt-3 rounded-lg border border-orange-400/15 bg-orange-500/[0.06] px-3 py-2 text-[11px] text-orange-100/90">
                Cleared {stagesClearedForDisplay(uiState)} stage{stagesClearedForDisplay(uiState) === 1 ? '' : 's'} this run.
              </div>
            )}

            <div className="mt-3 space-y-2">
              {topEntries.length > 0 ? topEntries.map((entry) => (
                <div key={`${entry.user_id || entry.username}-${entry.rank}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${entry.is_me ? 'bg-orange-400/[0.08]' : 'bg-black/20'}`}>
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
                    <div className="truncate text-[9px] text-gray-500">Stage {entry.best_stage || 0} · {entry.bosses_defeated || 0} bosses</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-black tabular-nums text-orange-200">{entry.high_score || 0}</div>
                    <div className="text-[9px] text-gray-600 tabular-nums">{entry.total_enemies_defeated || 0} defeats</div>
                  </div>
                </div>
              )) : (
                <div className="text-[10px] text-gray-500">Loading leaderboard...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
