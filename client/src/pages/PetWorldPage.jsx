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
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBiome, setSelectedBiome] = useState('grasslands');
  const [buildDrawerOpen, setBuildDrawerOpen] = useState(false);
  const [pendingBuildType, setPendingBuildType] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
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
      const [worldRes, tradeRes, leaderboardRes] = await Promise.all([
        getMyPetWorld(),
        getPetWorldTrades().catch(() => ({ trades: [] })),
        getPetWorldLeaderboard().catch(() => ({ leaderboard: [] })),
      ]);
      setBundle(worldRes);
      setTrades(tradeRes.trades || []);
      setLeaderboard(leaderboardRes.leaderboard || []);
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

  const world = bundle?.world || null;
  const buildings = bundle?.buildings || [];
  const catalog = bundle?.building_catalog || [];

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

      {/* ── Top HUD bar ──────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-2 py-1.5" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
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
          <button
            type="button"
            onClick={() => setShowLeaderboard((v) => !v)}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
            aria-label="Leaderboard"
          >
            🏆
          </button>
          <button
            type="button"
            onClick={() => setShowTrades(true)}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
            aria-label="Trades"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Leaderboard floating panel */}
      <LeaderboardPanel leaderboard={leaderboard} open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

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
    </div>
  );
}
