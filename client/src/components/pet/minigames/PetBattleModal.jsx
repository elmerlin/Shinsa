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

/* Sprite path for unit card thumbnails */
const SPRITE_TYPE_MAP = { meatshield: 'meatshield', brawler: 'brawler', ranged: 'ranged', tank: 'tank', flier: 'ranged' };
function unitSpriteUrl(character, unitType) {
  const mapped = SPRITE_TYPE_MAP[unitType] || unitType;
  return `/pet-battle/characters/${character}-${mapped}/rotations/south.png`;
}

/* ━━━ Unit Card ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function UnitCard({ unitKey, name, cost, shortcut, spriteUrl, isFlier, cooldown, disabled, onClick }) {
  const cooldownPct = cooldown.remaining > 0 ? Math.min(1, cooldown.remaining / Math.max(1, cooldown.total)) : 0;
  const onCooldown = cooldownPct > 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center rounded-lg border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm px-1 py-1.5 transition-all
        ${disabled ? 'opacity-40' : 'hover:bg-white/[0.08] hover:border-white/[0.14] active:scale-[0.96]'}`}
      style={{ minWidth: 0 }}
    >
      {/* Keyboard shortcut badge */}
      <span className="absolute -top-1 -left-0.5 rounded bg-white/[0.10] px-1 py-px text-[8px] font-bold tabular-nums text-white/50 leading-none">
        {shortcut}
      </span>

      {/* Sprite preview */}
      <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
        <img
          src={spriteUrl}
          alt={name}
          className="w-9 h-9 object-contain"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
        {isFlier && (
          <svg className="absolute -top-0.5 -right-0.5 w-3 h-3 text-fuchsia-300/80" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1l2 4 4.5.6-3.2 3.2.8 4.5L8 11.3 3.9 13.3l.8-4.5L1.5 5.6 6 5z" />
          </svg>
        )}
        {/* Cooldown overlay */}
        {onCooldown && (
          <>
            <div className="absolute inset-0 rounded bg-black/55" />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white/90 drop-shadow">
              {formatCooldown(cooldown.remaining)}
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-[2px] rounded-b bg-white/30 overflow-hidden">
              <div className="h-full bg-white/70 transition-[width] duration-100" style={{ width: `${100 - cooldownPct * 100}%` }} />
            </div>
          </>
        )}
      </div>

      {/* Cost */}
      <div className="mt-0.5 text-[10px] font-black tabular-nums text-amber-300/90 leading-tight">{cost}</div>

      {/* Name */}
      <div className="w-full truncate text-center text-[8px] text-white/45 leading-tight">{name}</div>
    </button>
  );
}

/* ━━━ Ability Card ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function AbilityCard({ cooldown, disabled, onClick }) {
  const cooldownPct = cooldown.remaining > 0 ? Math.min(1, cooldown.remaining / Math.max(1, cooldown.total)) : 0;
  const onCooldown = cooldownPct > 0;
  const ready = !disabled && !onCooldown;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center rounded-lg border px-1 py-1.5 transition-all
        ${ready ? 'border-sky-400/25 bg-sky-500/[0.12] hover:bg-sky-500/[0.20] hover:border-sky-400/40 active:scale-[0.96]' : 'border-white/[0.08] bg-white/[0.04] opacity-40'}`}
      style={{ minWidth: 0 }}
    >
      <span className="absolute -top-1 -left-0.5 rounded bg-white/[0.10] px-1 py-px text-[8px] font-bold tabular-nums text-white/50 leading-none">6</span>

      {/* Lightning bolt icon */}
      <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
        <svg className={`w-6 h-6 ${ready ? 'text-sky-300' : 'text-white/30'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2L4.5 12.6h5.3L8.2 22l8.8-11h-5.3L13 2z" />
        </svg>
        {onCooldown && (
          <>
            <div className="absolute inset-0 rounded bg-black/50" />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-white/90 drop-shadow">
              {formatCooldown(cooldown.remaining)}
            </div>
            <div className="absolute left-0 right-0 bottom-0 h-[2px] rounded-b bg-white/30 overflow-hidden">
              <div className="h-full bg-sky-400/70 transition-[width] duration-100" style={{ width: `${100 - cooldownPct * 100}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="mt-0.5 text-[10px] font-black text-sky-300/80 leading-tight">{onCooldown ? '' : 'RDY'}</div>
      <div className="w-full truncate text-center text-[8px] text-white/45 leading-tight">Burst</div>
    </button>
  );
}

/* ━━━ Upgrade Chip ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function UpgradeChip({ icon, label, level, cost, maxed, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] transition-all whitespace-nowrap
        ${disabled ? 'opacity-40' : 'hover:bg-white/[0.10] hover:border-white/[0.15] active:scale-[0.97]'}`}
    >
      <span className="text-[10px]">{icon}</span>
      <span className="text-white/60 font-medium">{label}<span className="text-white/35 ml-0.5">L{level}</span></span>
      <span className="font-black tabular-nums text-amber-300/80">{maxed ? 'MAX' : cost}</span>
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
  const [lbExpanded, setLbExpanded] = useState(false);
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

  const charKey = character || 'dojocat';
  const names = useMemo(() => PET_UNIT_NAMES[charKey] || PET_UNIT_NAMES.dojocat, [charKey]);
  const variants = useMemo(() => PET_UNIT_VARIANTS[charKey] || PET_UNIT_VARIANTS.dojocat, [charKey]);
  const topEntries = Array.isArray(leaderboard) ? leaderboard.slice(0, 5) : [];
  const isPlaying = mode === 'playing';
  const isTransitioning = mode === 'countdown' || mode === 'stage_clear';
  const tempoBoostPct = Math.round((1 - (uiState.cooldownMultiplier || 1)) * 100);

  const upgradeCards = [
    { key: 'income', icon: '\u2B06', level: uiState.upgrades?.income || 0 },
    { key: 'reservoir', icon: '\u2B06', level: uiState.upgrades?.reservoir || 0 },
    { key: 'tempo', icon: '\u2B06', level: uiState.upgrades?.tempo || 0 },
  ];

  const unitCards = [
    { key: 'meatshield', shortcut: '1' },
    { key: 'brawler', shortcut: '2' },
    { key: 'ranged', shortcut: '3' },
    { key: 'flier', shortcut: '4' },
    { key: 'tank', shortcut: '5' },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#0d0e16] select-none" style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'none' }} onContextMenu={(e) => e.preventDefault()}>
      {/* Header bar */}
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
          {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
        <PetBattleCanvas game={game} character={charKey} reducedMotion={reducedMotion} world={selectedWorld} />
      </div>

      {/* ━━━ Playing panel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isPlaying ? (
        <div className="bg-black/70 backdrop-blur-sm border-t border-white/[0.06] shrink-0 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* ── Status bar + upgrades row ── */}
          <div className="flex flex-wrap items-center gap-1 mb-1">
            {/* Aura readout */}
            <div className="flex items-center gap-1 rounded-md border border-amber-400/15 bg-amber-500/[0.06] px-1.5 py-0.5">
              <span className="text-[11px] font-black tabular-nums text-amber-200">{Math.floor(uiState.aura || 0)}<span className="text-amber-200/40">/{uiState.auraMax || 520}</span></span>
              <span className="text-[9px] text-amber-300/50 tabular-nums">+{uiState.auraRate || 14}/s</span>
            </div>

            {/* Upgrade chips */}
            {upgradeCards.map((card) => {
              const track = UPGRADE_TRACKS[card.key];
              const level = card.level;
              const cost = track ? Math.round(track.baseCost * (track.growth ** level)) : 999;
              const maxed = level >= (track?.maxLevel || 0);
              const cantAfford = (uiState.aura || 0) < cost;
              return (
                <UpgradeChip
                  key={card.key}
                  icon={card.icon}
                  label={track?.label || card.key}
                  level={level}
                  cost={maxed ? 'MAX' : cost}
                  maxed={maxed}
                  disabled={cantAfford || maxed}
                  onClick={() => handleUpgrade(card.key)}
                />
              );
            })}

            {/* Stage / wave pill */}
            <div className="ml-auto rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/50 font-medium whitespace-nowrap tabular-nums">
              {uiState.stage > 10 ? 'Surv' : 'Stg'} {uiState.stage || 1}<span className="text-white/25 mx-0.5">{'\u00B7'}</span>W{uiState.wave || 1}
            </div>
          </div>

          {/* ── Unit strip ── */}
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {unitCards.map((card) => {
              const arch = ARCHETYPES[card.key];
              const cdRemaining = uiState.cooldowns?.[card.key] || 0;
              const cdTotal = Math.round((arch?.cooldownMs || 0) * (uiState.cooldownMultiplier || 1));
              const cantAfford = (uiState.aura || 0) < (arch?.cost || 0);
              return (
                <UnitCard
                  key={card.key}
                  unitKey={card.key}
                  name={names[card.key] || arch?.label}
                  cost={arch?.cost}
                  shortcut={card.shortcut}
                  spriteUrl={unitSpriteUrl(charKey, card.key)}
                  isFlier={card.key === 'flier'}
                  cooldown={{ remaining: cdRemaining, total: cdTotal }}
                  disabled={cantAfford || cdRemaining > 0}
                  onClick={() => handleSpawn(card.key)}
                />
              );
            })}
            <AbilityCard
              cooldown={{ remaining: uiState.abilityCooldownMs || 0, total: PET_ABILITY.cooldownMs }}
              disabled={(uiState.abilityCooldownMs || 0) > 0}
              onClick={handleAbility}
            />
          </div>
        </div>
      ) : isTransitioning ? (
        /* ━━━ Transition panel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
        /* ━━━ Idle / game-over panel ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        <div className="bg-black/70 border-t border-white/[0.06] shrink-0 px-3 py-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="mb-3">
            <div className="text-[10px] font-black tracking-[0.2em] uppercase text-white/40 mb-1.5">Choose World</div>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(WORLD_THEMES).map(([key, theme]) => {
                const selected = selectedWorld === key;
                const accent = { fire: 'border-orange-400 bg-orange-500/20 text-orange-200', water: 'border-blue-400 bg-blue-500/20 text-blue-200', rock: 'border-stone-400 bg-stone-500/20 text-stone-200', ice: 'border-cyan-300 bg-cyan-400/20 text-cyan-100', grassland: 'border-emerald-400 bg-emerald-500/20 text-emerald-200' }[key] || 'border-white/20 bg-white/10 text-white';
                const idle = { fire: 'border-orange-400/15 bg-orange-500/[0.06] text-orange-300/60', water: 'border-blue-400/15 bg-blue-500/[0.06] text-blue-300/60', rock: 'border-stone-400/15 bg-stone-500/[0.06] text-stone-300/60', ice: 'border-cyan-300/15 bg-cyan-400/[0.06] text-cyan-200/60', grassland: 'border-emerald-400/15 bg-emerald-500/[0.06] text-emerald-300/60' }[key] || 'border-white/10 bg-white/[0.03] text-white/50';
                const icon = { fire: '\uD83D\uDD25', water: '\uD83C\uDF0A', rock: '\uD83E\uDEA8', ice: '\u2744\uFE0F', grassland: '\uD83C\uDF3F' }[key] || '\uD83C\uDF0D';
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
                  Stage {stats?.bestStage ?? 0} {'\u00B7'} {stats?.totalRuns ?? 0} runs
                </div>
              </div>
            </div>

            {mode === 'game_over' && (
              <div className="mx-3 mt-3 rounded-lg border border-orange-400/15 bg-orange-500/[0.06] px-3 py-2 text-[11px] text-orange-100/90">
                Cleared {stagesClearedForDisplay(uiState)} stage{stagesClearedForDisplay(uiState) === 1 ? '' : 's'} this run.
              </div>
            )}

            <div className="mt-2 space-y-1.5 px-3 pb-2">
              {(lbExpanded ? topEntries : topEntries.slice(0, 3)).map((entry) => (
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
                  </div>
                </div>
              ))}
              {topEntries.length > 3 && (
                <button onClick={() => setLbExpanded(!lbExpanded)} className="w-full py-1 text-[10px] font-bold text-white/40 hover:text-white/60 transition-colors">
                  {lbExpanded ? 'Show less' : `See all ${topEntries.length} players ▾`}
                </button>
              )}
              {topEntries.length === 0 && <div className="text-[10px] text-gray-500 px-1">Loading leaderboard...</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
