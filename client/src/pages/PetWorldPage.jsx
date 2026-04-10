import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
      {message}
    </div>
  );
}

function TileInfo({ selectedTile, onClear }) {
  if (!selectedTile) return null;
  const isObstacle = ['tree', 'rock', 'bush'].includes(selectedTile.tile?.t);
  return (
    <div className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Selected Tile</div>
      <div className="mt-2 text-lg font-black text-white">
        {selectedTile.x}, {selectedTile.y}
      </div>
      <div className="mt-1 text-sm capitalize text-white/55">{selectedTile.tile?.t || 'empty ground'}</div>
      {isObstacle ? (
        <button
          type="button"
          onClick={() => onClear?.(selectedTile)}
          className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.12] px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/[0.18]"
        >
          Clear obstacle
        </button>
      ) : null}
    </div>
  );
}

export default function PetWorldPage() {
  const [bundle, setBundle] = useState(null);
  const [trades, setTrades] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBiome, setSelectedBiome] = useState('grasslands');
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [pendingBuildType, setPendingBuildType] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [showTrades, setShowTrades] = useState(false);
  const [toast, setToast] = useState('');

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

  const actionButtons = useMemo(() => (
    <>
      <button type="button" onClick={() => setBuildMenuOpen((open) => !open)} className="rounded-full border border-emerald-300/18 bg-emerald-500/[0.12] px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/[0.18]">
        {buildMenuOpen ? 'Hide build menu' : 'Build'}
      </button>
      <button type="button" onClick={() => setShowTrades(true)} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/20 hover:text-white">
        Trades
      </button>
      <Link to="/pet" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/20 hover:text-white">
        Back to pet
      </Link>
    </>
  ), [buildMenuOpen]);

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
      setBuildMenuOpen(false);
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

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center px-4 py-10">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/12 border-t-white/70" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Toast message={toast} />

      {!world ? (
        <PetWorldCreateModal
          open
          selectedBiome={selectedBiome}
          onSelectBiome={setSelectedBiome}
          onCreate={handleCreate}
          creating={creating}
        />
      ) : (
        <div className="space-y-4">
          <PetWorldHUD
            world={world}
            title="Pet World"
            subtitle={`${world.username || 'My'} village · ${world.biome}`}
            actions={actionButtons}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
            <div className="space-y-4">
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

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['n', 'Expand North'],
                  ['e', 'Expand East'],
                  ['s', 'Expand South'],
                  ['w', 'Expand West'],
                ].map(([dir, label]) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => handleExpand(dir)}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left text-sm font-semibold text-white/80 transition-all hover:border-white/16 hover:bg-white/[0.06]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <PetWorldBuildMenu
                open={buildMenuOpen}
                buildings={catalog}
                world={world}
                selectedType={pendingBuildType}
                onSelect={(type) => {
                  setPendingBuildType(type);
                  setSelectedBuilding(null);
                  showToast('Tap a tile to place this building');
                }}
                onClose={() => setBuildMenuOpen(false)}
              />
            </div>

            <div className="space-y-4">
              {selectedBuilding ? (
                <PetWorldBuildingInfo
                  building={selectedBuilding}
                  world={world}
                  onDemolish={handleDemolish}
                  onUpgrade={handleUpgrade}
                  onSetWorkers={handleSetWorkers}
                />
              ) : (
                <TileInfo selectedTile={selectedTile} onClear={handleClearTile} />
              )}

              <section className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Leaderboard</div>
                <div className="mt-3 space-y-2">
                  {leaderboard.slice(0, 6).map((entry) => (
                    <Link
                      key={entry.user_id}
                      to={`/pet/world/${entry.user_id}`}
                      className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/80 transition-all hover:border-white/14 hover:bg-white/[0.05]"
                    >
                      <span>#{entry.rank} {entry.username || 'Unknown'}</span>
                      <span className="text-white/50">{entry.population} pop</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <PetWorldTradeModal
            open={showTrades}
            trades={trades}
            onClose={() => setShowTrades(false)}
            onAccept={handleAcceptTrade}
            onDecline={handleDeclineTrade}
          />
        </div>
      )}
    </div>
  );
}
