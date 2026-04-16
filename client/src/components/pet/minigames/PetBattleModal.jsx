import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpritePet from '../../SpritePet';
import PetBattleCanvas from './PetBattleCanvas';
import usePetBattleGame, {
  ARCHETYPES,
  PET_ABILITY,
  PET_UNIT_NAMES,
  PET_UNIT_VARIANTS,
  UPGRADE_TRACKS,
} from './usePetBattleGame';
import { WORLD_THEMES } from './petBattleSprites';
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

function ActionButton({ label, name, tag, value, valueLabel, note, cooldown, disabled, accentClass, onClick }) {
  const cooldownPct = cooldown?.remaining > 0 ? Math.min(1, cooldown.remaining / Math.max(1, cooldown.total)) : 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-45 ${accentClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
            <span className="text-white/45">{label}</span>
            {tag ? <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-black tracking-[0.16em] text-white/65">{tag}</span> : null}
          </div>
          <div className="truncate text-[12px] font-semibold text-white/90">{name}</div>
          {note ? <div className="truncate text-[9px] text-white/45">{note}</div> : null}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[12px] font-black text-amber-200">{value}</div>
          <div className="text-[9px] text-white/45">{valueLabel}</div>
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

function UpgradeButton({ label, stat, level, cost, disabled, accentClass, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-40 ${accentClass}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold text-white/90">{stat}</div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-white/55">
        <span>Lv {level}</span>
        <span className="font-black text-amber-200">{cost} aura</span>
      </div>
    </button>
  );
}

export default function PetBattleModal({ open, onClose, character, onComplete, stats, leaderboard }) {
  const game = usePetBattleGame();
  const [muted, setMutedState] = useState(isMuted());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mode, setMode] = useState('idle');
  const [selectedWorld, setSelectedWorld] = useState('grassland');
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
      setUiState({ ...state, cooldowns: { ...state.cooldowns }, upgrades: { ...state.upgrades } });
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

  const syncUiState = useCallback(() => {
    const state = game.getState();
    setMode(state.mode);
    setUiState({ ...state, cooldowns: { ...state.cooldowns }, upgrades: { ...state.upgrades } });
  }, [game]);

  const handleSpawn = useCallback((typeKey) => {
    game.spawnUnit(typeKey);
    syncUiState();
  }, [game, syncUiState]);

  const handleUpgrade = useCallback((trackKey) => {
    game.upgradeTrack(trackKey);
    syncUiState();
  }, [game, syncUiState]);

  const handleAbility = useCallback(() => {
    game.useAbility();
    syncUiState();
  }, [game, syncUiState]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const names = useMemo(() => PET_UNIT_NAMES[character || 'dojocat'] || PET_UNIT_NAMES.dojocat, [character]);
  const variants = useMemo(() => PET_UNIT_VARIANTS[character || 'dojocat'] || PET_UNIT_VARIANTS.dojocat, [character]);
  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : [];
  const isPlaying = mode === 'playing';
  const isTransitioning = mode === 'countdown' || mode === 'stage_clear';
  const tempoBoostPct = Math.round((1 - (uiState.cooldownMultiplier || 1)) * 100);
  const upgradeCards = [
    {
      key: 'income',
      accentClass: 'border-amber-400/20 bg-amber-500/[0.08]',
      stat: `+${uiState.auraRate || 14}/s`,
      level: uiState.upgrades?.income || 0,
    },
    {
      key: 'reservoir',
      accentClass: 'border-cyan-400/20 bg-cyan-500/[0.08]',
      stat: `${uiState.auraMax || 520} max`,
      level: uiState.upgrades?.reservoir || 0,
    },
    {
      key: 'tempo',
      accentClass: 'border-emerald-400/20 bg-emerald-500/[0.08]',
      stat: `${tempoBoostPct}% faster`,
      level: uiState.upgrades?.tempo || 0,
    },
  ];
  const unitCards = [
    {
      key: 'meatshield',
      label: '1 / Q',
      tag: 'GROUND',
      accentClass: 'border-cyan-400/20 bg-cyan-500/[0.08]',
      note: variants.meatshield?.battleNote || 'Cheap blocker',
    },
    {
      key: 'brawler',
      label: '2 / W',
      tag: 'GROUND',
      accentClass: 'border-rose-400/20 bg-rose-500/[0.08]',
      note: variants.brawler?.battleNote || 'Melee burst',
    },
    {
      key: 'ranged',
      label: '3 / E',
      tag: 'ANTI-AIR',
      accentClass: 'border-emerald-400/20 bg-emerald-500/[0.08]',
      note: variants.ranged?.battleNote || 'Targets air first',
    },
    {
      key: 'flier',
      label: '4 / R',
      tag: 'AIR',
      accentClass: 'border-fuchsia-400/20 bg-fuchsia-500/[0.08]',
      note: variants.flier?.battleNote || 'Bypasses ground',
    },
    {
      key: 'tank',
      label: '5 / T',
      tag: 'GROUND',
      accentClass: 'border-amber-400/20 bg-amber-500/[0.08]',
      note: variants.tank?.battleNote || 'Heavy splash',
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#0d0e16] select-none" style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }} onContextMenu={(e) => e.preventDefault()}>
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
        <PetBattleCanvas game={game} character={character || 'dojocat'} reducedMotion={reducedMotion} world={selectedWorld} />
      </div>

      {isPlaying ? (
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Aura Engine</div>
              <div className="text-sm font-black text-amber-200 tabular-nums">{Math.floor(uiState.aura || 0)} / {uiState.auraMax || 520}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/45">{uiState.stage > 10 ? 'Survival' : 'Castle Run'}</div>
              <div className="text-[12px] font-semibold text-white/85">Stage {uiState.stage || 1} · Wave {uiState.wave || 1}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/45">Flow</div>
              <div className="text-[12px] font-semibold text-white/85">+{uiState.auraRate || 14}/s</div>
              <div className="text-[9px] text-white/40">{tempoBoostPct}% faster cooldowns</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {upgradeCards.map((card) => {
              const track = UPGRADE_TRACKS[card.key];
              const level = card.level;
              const cost = track ? Math.round(track.baseCost * (track.growth ** level)) : 999;
              const disabled = (uiState.aura || 0) < cost || level >= (track?.maxLevel || 0);
              return (
                <UpgradeButton
                  key={card.key}
                  label={track?.label || card.key}
                  stat={card.stat}
                  level={level}
                  cost={level >= (track?.maxLevel || 0) ? 'MAX' : cost}
                  disabled={disabled}
                  accentClass={card.accentClass}
                  onClick={() => handleUpgrade(card.key)}
                />
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {unitCards.map((card) => (
              <ActionButton
                key={card.key}
                label={card.label}
                name={names[card.key] || ARCHETYPES[card.key]?.label}
                tag={card.tag}
                value={ARCHETYPES[card.key]?.cost}
                valueLabel="aura"
                note={card.note}
                cooldown={{ remaining: uiState.cooldowns?.[card.key] || 0, total: Math.round((ARCHETYPES[card.key]?.cooldownMs || 0) * (uiState.cooldownMultiplier || 1)) }}
                disabled={(uiState.aura || 0) < (ARCHETYPES[card.key]?.cost || 0) || (uiState.cooldowns?.[card.key] || 0) > 0}
                accentClass={card.accentClass}
                onClick={() => handleSpawn(card.key)}
              />
            ))}
            <ActionButton
              label="6 / Y"
              name={PET_ABILITY.label}
              tag="SKILL"
              value={(uiState.abilityCooldownMs || 0) > 0 ? formatCooldown(uiState.abilityCooldownMs || 0) : 'Ready'}
              valueLabel={(uiState.abilityCooldownMs || 0) > 0 ? 'cooldown' : 'burst'}
              note={PET_ABILITY.description}
              cooldown={{ remaining: uiState.abilityCooldownMs || 0, total: PET_ABILITY.cooldownMs }}
              disabled={(uiState.abilityCooldownMs || 0) > 0}
              accentClass="border-sky-400/20 bg-sky-500/[0.08]"
              onClick={handleAbility}
            />
          </div>
        </div>
      ) : isTransitioning ? (
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="w-full rounded-xl border border-orange-400/18 bg-orange-500/[0.08] px-4 py-3 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-200/75">
              {mode === 'stage_clear' ? 'Stage Clear' : 'Battle Starting'}
            </div>
            <div className="mt-1 text-sm font-semibold text-orange-50">
              {mode === 'stage_clear' ? 'Preparing the next round...' : 'Get ready...'}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="mb-3">
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-white/40 mb-1.5">Choose World</div>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(WORLD_THEMES).map(([key, theme]) => {
                const selected = selectedWorld === key;
                const accent = { fire: 'border-orange-400 bg-orange-500/20 text-orange-200', water: 'border-blue-400 bg-blue-500/20 text-blue-200', rock: 'border-stone-400 bg-stone-500/20 text-stone-200', ice: 'border-cyan-300 bg-cyan-400/20 text-cyan-100', grassland: 'border-emerald-400 bg-emerald-500/20 text-emerald-200' }[key] || 'border-white/20 bg-white/10 text-white';
                const idle = { fire: 'border-orange-400/15 bg-orange-500/[0.06] text-orange-300/60', water: 'border-blue-400/15 bg-blue-500/[0.06] text-blue-300/60', rock: 'border-stone-400/15 bg-stone-500/[0.06] text-stone-300/60', ice: 'border-cyan-300/15 bg-cyan-400/[0.06] text-cyan-200/60', grassland: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300/60' }[key] || 'border-white/10 bg-white/[0.03] text-white/50';
                const icon = { fire: '🔥', water: '🌊', rock: '🪨', ice: '❄️', grassland: '🌿' }[key] || '🌍';
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedWorld(key)}
                    className={`rounded-lg border px-1 py-1.5 text-center transition-all ${selected ? accent : idle} ${selected ? 'ring-1 ring-white/20 scale-[1.04]' : 'hover:scale-[1.02]'}`}
                  >
                    <div className="text-[14px] leading-none">{icon}</div>
                    <div className="text-[8px] font-bold uppercase tracking-wider mt-0.5">{theme.name.replace(' World', '')}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleStart}
            className="w-full h-12 rounded-xl border border-orange-400/30 bg-orange-500/15 text-orange-100 font-black tracking-wide hover:bg-orange-500/20 active:scale-[0.99] transition-all"
          >
            {mode === 'game_over' ? 'Play Again' : 'Start Pet Battle'}
          </button>

          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.03]">
            <div className="flex items-center justify-between p-3">
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
              <div className="mx-3 mt-3 rounded-lg border border-orange-400/15 bg-orange-500/[0.06] px-3 py-2 text-[11px] text-orange-100/90">
                Cleared {stagesClearedForDisplay(uiState)} stage{stagesClearedForDisplay(uiState) === 1 ? '' : 's'} this run.
              </div>
            )}

            <div className="mt-3 max-h-[min(32svh,19rem)] space-y-2 overflow-y-auto px-3 pb-3 pr-2">
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
