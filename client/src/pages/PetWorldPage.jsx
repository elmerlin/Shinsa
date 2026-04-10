import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getMyPetWorld,
  createPetWorld,
  buildPetWorldBuilding,
  demolishPetWorldBuilding,
  upgradePetWorldBuilding,
  assignPetWorldWorkers,
  expandPetWorld,
  clearPetWorldTile,
  getPetWorldTrades,
  acceptPetWorldTrade,
  declinePetWorldTrade,
  getPetWorldLeaderboard,
  getPetWorldEncounters,
  huntPetWorldEncounter,
  dismissPetWorldEncounter,
  getPetWorldVisitors,
  postPetWorldPresence,
} from '../utils/api';
import PetWorldHUD from '../components/petWorld/PetWorldHUD';
import PetWorldCanvas from '../components/petWorld/PetWorldCanvas';
import PetWorldBuildMenu from '../components/petWorld/PetWorldBuildMenu';
import PetWorldBuildingInfo from '../components/petWorld/PetWorldBuildingInfo';
import PetWorldCreateModal from '../components/petWorld/PetWorldCreateModal';
import PetWorldTradeModal from '../components/petWorld/PetWorldTradeModal';
import { playBuildSound, playClearSound, playExpandSound } from '../components/petWorld/petWorldAudio';

/* ─── Toast ─────────────────────────────────────────────────────── */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
      {message}
    </div>
  );
}

/* ─── Seasonal Events Banner ───────────────────────────────────── */
function SeasonalBanner({ events }) {
  if (!events || events.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 border-b border-amber-400/10 overflow-x-auto">
      {events.map((evt, i) => (
        <div key={evt.id || i} className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-amber-200/90">{evt.name || evt.title}</span>
          {evt.ends_at && (
            <span className="text-[9px] text-amber-300/50 ml-1">
              ends {new Date(evt.ends_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Encounter Modal ──────────────────────────────────────────── */
function EncounterModal({ encounter, onHunt, onDismiss, busy }) {
  if (!encounter) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-72 rounded-xl border border-white/[0.08] bg-slate-950/95 p-4 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
        <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">Encounter</div>
        <div className="mt-2 text-base font-black text-white">{encounter.name || 'Unknown creature'}</div>
        <p className="mt-1 text-[11px] text-white/60 leading-relaxed">
          {encounter.description || 'A creature has appeared near your village.'}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onHunt(encounter.id)}
            className="flex-1 rounded-lg border border-rose-400/20 bg-rose-500/[0.12] px-3 py-2 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/[0.22] transition-colors disabled:opacity-50"
          >
            Hunt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDismiss(encounter.id)}
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Visitor Log Panel ────────────────────────────────────────── */
function VisitorLogPanel({ visitors, open, onClose }) {
  if (!open) return null;
  return (
    <div className="absolute top-12 right-2 z-40 w-56 rounded-xl border border-white/[0.08] bg-black/80 backdrop-blur-md p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">Visitor Log</span>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(!visitors || visitors.length === 0) ? (
          <div className="text-[10px] text-white/30 py-2 text-center">No recent visitors</div>
        ) : (
          visitors.map((v, i) => (
            <Link
              key={v.user_id || i}
              to={`/pet/world/${v.user_id}`}
              className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/[0.06] transition-colors"
            >
              <span className="truncate">{v.username || 'Unknown'}</span>
              <span className="text-white/40 text-[9px] shrink-0 ml-1">
                {v.visited_at ? timeAgo(v.visited_at) : ''}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Relative time helper ──────────────────────────────────────── */
function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Tile Info (floating panel) ────────────────────────────────── */
function TileInfo({ selectedTile, onClear }) {
  if (!selectedTile) return null;
  const isObstacle = ['tree', 'rock', 'bush'].includes(selectedTile.tile?.t);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/70 backdrop-blur-sm p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">Selected Tile</div>
      <div className="mt-1 text-sm font-black text-white">
        {selectedTile.x}, {selectedTile.y}
      </div>
      <div className="mt-0.5 text-[11px] capitalize text-white/50">{selectedTile.tile?.t || 'empty ground'}</div>
      {isObstacle ? (
        <button
          type="button"
          onClick={() => onClear?.(selectedTile)}
          className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.12] px-2.5 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/[0.18]"
        >
          Clear obstacle
        </button>
      ) : null}
    </div>
  );
}

/* ─── Expand Button Row ─────────────────────────────────────────── */
function ExpandButtons({ onExpand }) {
  return (
    <div className="flex gap-1.5">
      {[
        ['n', 'N'],
        ['e', 'E'],
        ['s', 'S'],
        ['w', 'W'],
      ].map(([dir, label]) => (
        <button
          key={dir}
          type="button"
          onClick={() => onExpand(dir)}
          className="rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ─── Leaderboard floating panel ────────────────────────────────── */
function LeaderboardPanel({ leaderboard, open, onClose }) {
  if (!open) return null;
  return (
    <div className="absolute top-12 right-2 z-40 w-56 rounded-xl border border-white/[0.08] bg-black/80 backdrop-blur-md p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">Leaderboard</span>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {leaderboard.slice(0, 6).map((entry) => (
          <Link
            key={entry.user_id}
            to={`/pet/world/${entry.user_id}`}
            className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <span>#{entry.rank} {entry.username || 'Unknown'}</span>
            <span className="text-white/40 font-mono">{entry.population}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PetWorldPage - Full-screen game mode
   ═══════════════════════════════════════════════════════════════════ */

export default function PetWorldPage() {
  const [bundle, setBundle] = useState(null);
  const [trades, setTrades] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [encounterBusy, setEncounterBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBiome, setSelectedBiome] = useState('grasslands');
  const [buildDrawerOpen, setBuildDrawerOpen] = useState(false);
  const [pendingBuildType, setPendingBuildType] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showVisitors, setShowVisitors] = useState(false);
  const [toast, setToast] = useState('');
  const [entered, setEntered] = useState(false);
  const gameRef = useRef(null);

  /* Fade-in on mount */
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Disable context menu on game area */
  useEffect(() => {
    const el = gameRef.current;
    if (!el) return;
    const handler = (e) => e.preventDefault();
    el.addEventListener('contextmenu', handler);
    return () => el.removeEventListener('contextmenu', handler);
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [worldRes, tradeRes, leaderboardRes, encounterRes, visitorRes] = await Promise.all([
        getMyPetWorld(),
        getPetWorldTrades().catch(() => ({ trades: [] })),
        getPetWorldLeaderboard().catch(() => ({ leaderboard: [] })),
        getPetWorldEncounters().catch(() => ({ encounters: [] })),
        getPetWorldVisitors().catch(() => ({ visitors: [] })),
      ]);
      setBundle(worldRes);
      setTrades(tradeRes.trades || []);
      setLeaderboard(leaderboardRes.leaderboard || []);
      setEncounters(encounterRes.encounters || []);
      setVisitors(visitorRes.visitors || []);
    } catch (error) {
      showToast(error.message || 'Could not load Pet World');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
    return () => window.clearTimeout(showToast._timer);
  }, [loadAll, showToast]);

  /* Presence heartbeat: POST every 2 minutes */
  useEffect(() => {
    const userId = bundle?.world?.user_id;
    if (!userId) return;
    const tick = () => postPetWorldPresence(userId).catch(() => {});
    tick();
    const id = setInterval(tick, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [bundle?.world?.user_id]);

  const world = bundle?.world || null;
  const buildings = bundle?.buildings || [];
  const catalog = bundle?.building_catalog || [];
  const activeEvents = bundle?.active_events || [];

  const refreshAndSelectBuilding = useCallback((nextBundle, buildingId = null) => {
    setBundle(nextBundle);
    if (buildingId != null) {
      setSelectedBuilding((nextBundle.buildings || []).find((building) => building.id === buildingId) || null);
    } else {
      setSelectedBuilding(null);
    }
    setSelectedTile(null);
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const next = await createPetWorld(selectedBiome);
      setBundle(next);
      showToast('Village founded');
    } catch (error) {
      showToast(error.message || 'Could not create world');
    } finally {
      setCreating(false);
    }
  };

  const handlePlaceBuilding = async (x, y) => {
    if (!pendingBuildType) return;
    try {
      const next = await buildPetWorldBuilding({ type: pendingBuildType, x, y });
      playBuildSound();
      setBundle(next);
      setPendingBuildType('');
      setBuildDrawerOpen(false);
      setSelectedTile(null);
      showToast('Building placed');
    } catch (error) {
      showToast(error.message || 'Could not place building');
    }
  };

  const handleDemolish = async () => {
    if (!selectedBuilding) return;
    try {
      const next = await demolishPetWorldBuilding(selectedBuilding.id);
      setBundle(next);
      setSelectedBuilding(null);
      showToast('Building removed');
    } catch (error) {
      showToast(error.message || 'Could not demolish building');
    }
  };

  const handleUpgrade = async () => {
    if (!selectedBuilding) return;
    try {
      const next = await upgradePetWorldBuilding(selectedBuilding.id);
      playBuildSound();
      refreshAndSelectBuilding(next, selectedBuilding.id);
      showToast('Building upgraded');
    } catch (error) {
      showToast(error.message || 'Could not upgrade building');
    }
  };

  const handleSetWorkers = async (count) => {
    if (!selectedBuilding) return;
    try {
      const next = await assignPetWorldWorkers(selectedBuilding.id, count);
      refreshAndSelectBuilding(next, selectedBuilding.id);
      showToast('Workers updated');
    } catch (error) {
      showToast(error.message || 'Could not update workers');
    }
  };

  const handleExpand = async (direction) => {
    try {
      const next = await expandPetWorld(direction);
      playExpandSound();
      setBundle(next);
      showToast(`Expanded ${direction.toUpperCase()}`);
    } catch (error) {
      showToast(error.message || 'Could not expand world');
    }
  };

  const handleClearTile = async (tile) => {
    try {
      const next = await clearPetWorldTile(tile.x, tile.y);
      playClearSound();
      setBundle(next);
      setSelectedTile(null);
      showToast('Obstacle cleared');
    } catch (error) {
      showToast(error.message || 'Could not clear tile');
    }
  };

  const handleAcceptTrade = async (tradeId) => {
    try {
      const response = await acceptPetWorldTrade(tradeId);
      setTrades(response.trades || []);
      showToast('Trade accepted');
      loadAll();
    } catch (error) {
      showToast(error.message || 'Could not accept trade');
    }
  };

  const handleDeclineTrade = async (tradeId) => {
    try {
      const response = await declinePetWorldTrade(tradeId);
      setTrades(response.trades || []);
      showToast('Trade declined');
    } catch (error) {
      showToast(error.message || 'Could not decline trade');
    }
  };

  const handleHuntEncounter = async (encounterId) => {
    setEncounterBusy(true);
    try {
      await huntPetWorldEncounter(encounterId);
      setEncounters((prev) => prev.filter((e) => e.id !== encounterId));
      setActiveEncounter(null);
      showToast('Encounter hunted');
      loadAll();
    } catch (error) {
      showToast(error.message || 'Could not hunt encounter');
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleDismissEncounter = async (encounterId) => {
    setEncounterBusy(true);
    try {
      await dismissPetWorldEncounter(encounterId);
      setEncounters((prev) => prev.filter((e) => e.id !== encounterId));
      setActiveEncounter(null);
      showToast('Encounter dismissed');
    } catch (error) {
      showToast(error.message || 'Could not dismiss encounter');
    } finally {
      setEncounterBusy(false);
    }
  };

  const handleSelectBuilding = useCallback((building) => {
    setSelectedBuilding(building);
    setSelectedTile(null);
    setPendingBuildType('');
  }, []);

  const handleSelectTile = useCallback((tile) => {
    setSelectedTile(tile);
    setSelectedBuilding(null);
  }, []);

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
        style={{
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/12 border-t-emerald-400/70" />
      </div>
    );
  }

  /* ── Create-world modal (full-screen backdrop) ───────────────── */
  if (!world) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
        style={{
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <Link
          to="/pet"
          className="absolute top-3 left-3 z-50 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </Link>
        <PetWorldCreateModal
          open
          selectedBiome={selectedBiome}
          onSelectBiome={setSelectedBiome}
          onCreate={handleCreate}
          creating={creating}
        />
      </div>
    );
  }

  /* ── Full-screen game mode ───────────────────────────────────── */
  return (
    <div
      ref={gameRef}
      className={`fixed inset-0 z-50 bg-slate-950 flex flex-col transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
      style={{
        overscrollBehavior: 'none',
        userSelect: 'none',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      <Toast message={toast} />

      {/* ── Seasonal Events Banner ─────────────────────────────────── */}
      <SeasonalBanner events={activeEvents} />

      {/* ── Top HUD bar ──────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex flex-col" style={{ top: activeEvents.length > 0 ? '28px' : '0' }}>
        <div className="flex items-center gap-2 px-2 py-1.5" style={{ paddingTop: activeEvents.length > 0 ? '2px' : 'max(6px, env(safe-area-inset-top))' }}>
          {/* Back button */}
          <Link
            to="/pet"
            className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2 py-1.5 text-[11px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>

          {/* HUD resource bar */}
          <div className="flex-1 min-w-0">
            <PetWorldHUD world={world} />
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Encounters badge */}
            <button
              type="button"
              onClick={() => encounters.length > 0 && setActiveEncounter(encounters[0])}
              className="relative flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Encounters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
              {encounters.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white px-0.5">
                  {encounters.length}
                </span>
              )}
            </button>

            {/* Visitors */}
            <button
              type="button"
              onClick={() => { setShowVisitors((v) => !v); setShowLeaderboard(false); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Visitors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => { setShowLeaderboard((v) => !v); setShowVisitors(false); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Leaderboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.06a.75.75 0 011.06 0zM3 8a7 7 0 1114 0A7 7 0 013 8zm8 0a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowTrades(true)}
              className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
              aria-label="Trades"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Leaderboard floating panel */}
      <LeaderboardPanel leaderboard={leaderboard} open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      {/* Visitor log floating panel */}
      <VisitorLogPanel visitors={visitors} open={showVisitors} onClose={() => setShowVisitors(false)} />

      {/* ── Canvas (full screen base layer) ──────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <PetWorldCanvas
          world={world}
          buildings={buildings}
          selectedBuildingId={selectedBuilding?.id}
          selectedTile={selectedTile}
          pendingBuildType={pendingBuildType}
          onSelectBuilding={handleSelectBuilding}
          onSelectTile={handleSelectTile}
          onPlaceBuilding={handlePlaceBuilding}
        />

        {/* Floating building info panel (right side) */}
        {selectedBuilding && (
          <div className="absolute top-14 right-2 z-30 w-64 max-h-[calc(100%-8rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/75 backdrop-blur-md shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-wider text-white/40">Building</span>
                <button type="button" onClick={() => setSelectedBuilding(null)} className="text-white/40 hover:text-white text-xs">✕</button>
              </div>
              <PetWorldBuildingInfo
                building={selectedBuilding}
                world={world}
                onDemolish={handleDemolish}
                onUpgrade={handleUpgrade}
                onSetWorkers={handleSetWorkers}
              />
            </div>
          </div>
        )}

        {/* Floating tile info panel (right side) */}
        {!selectedBuilding && selectedTile && (
          <div className="absolute top-14 right-2 z-30 w-56">
            <TileInfo selectedTile={selectedTile} onClear={handleClearTile} />
          </div>
        )}

        {/* Expand buttons (bottom-left) */}
        <div className="absolute bottom-2 left-2 z-30">
          <ExpandButtons onExpand={handleExpand} />
        </div>
      </div>

      {/* ── Build drawer (bottom) ────────────────────────────────── */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${buildDrawerOpen ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drawer handle / collapsed bar */}
        <button
          type="button"
          onClick={() => setBuildDrawerOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-2 h-10 bg-black/70 backdrop-blur-md border-t border-white/[0.08] text-white/60 hover:text-white/90 transition-colors"
        >
          <span className={`text-xs transition-transform duration-200 ${buildDrawerOpen ? 'rotate-180' : ''}`}>▲</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider">{buildDrawerOpen ? 'Close' : 'Build'}</span>
        </button>

        {/* Drawer content */}
        <div className="bg-black/80 backdrop-blur-md max-h-[45vh] overflow-y-auto">
          <PetWorldBuildMenu
            open
            buildings={catalog}
            world={world}
            selectedType={pendingBuildType}
            onSelect={(type) => {
              setPendingBuildType(type);
              setSelectedBuilding(null);
              showToast('Tap a tile to place this building');
            }}
            onClose={() => setBuildDrawerOpen(false)}
          />
        </div>
      </div>

      {/* ── Trade modal ──────────────────────────────────────────── */}
      <PetWorldTradeModal
        open={showTrades}
        trades={trades}
        onClose={() => setShowTrades(false)}
        onAccept={handleAcceptTrade}
        onDecline={handleDeclineTrade}
      />

      {/* ── Encounter resolution modal ───────────────────────────── */}
      <EncounterModal
        encounter={activeEncounter}
        onHunt={handleHuntEncounter}
        onDismiss={handleDismissEncounter}
        busy={encounterBusy}
      />
    </div>
  );
}
