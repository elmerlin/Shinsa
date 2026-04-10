import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getVisitedPetWorld,
  getMyPetWorld,
  getPetWorldTrades,
  createPetWorldTrade,
  acceptPetWorldTrade,
  declinePetWorldTrade,
} from '../utils/api';
import PetWorldHUD from '../components/petWorld/PetWorldHUD';
import PetWorldCanvas from '../components/petWorld/PetWorldCanvas';
import PetWorldBuildingInfo from '../components/petWorld/PetWorldBuildingInfo';
import PetWorldTradeModal from '../components/petWorld/PetWorldTradeModal';

/* ─── Relative time helper ──────────────────────────────────────── */
function timeAgo(isoString) {
  if (!isoString) return 'Unknown';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function PetWorldVisitPage() {
  const { userId } = useParams();
  const [bundle, setBundle] = useState(null);
  const [myBundle, setMyBundle] = useState(null);
  const [trades, setTrades] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTrades, setShowTrades] = useState(false);
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

  const loadVisit = useCallback(async () => {
    setLoading(true);
    try {
      const [visitRes, ownRes, tradeRes] = await Promise.all([
        getVisitedPetWorld(userId),
        getMyPetWorld().catch(() => ({ world: null })),
        getPetWorldTrades().catch(() => ({ trades: [] })),
      ]);
      setBundle(visitRes);
      setMyBundle(ownRes);
      setTrades(tradeRes.trades || []);
    } catch (error) {
      showToast(error.message || 'Could not load world visit');
    } finally {
      setLoading(false);
    }
  }, [showToast, userId]);

  useEffect(() => {
    loadVisit();
    return () => window.clearTimeout(showToast._timer);
  }, [loadVisit, showToast]);

  const handleOfferTrade = async ({ offerResource, offerAmount, requestResource, requestAmount }) => {
    try {
      const response = await createPetWorldTrade({
        toUserId: bundle.world.user_id,
        offerResource,
        offerAmount,
        requestResource,
        requestAmount,
      });
      setTrades(response.trades || []);
      showToast('Trade offer sent');
    } catch (error) {
      showToast(error.message || 'Could not send trade offer');
    }
  };

  const handleAcceptTrade = async (tradeId) => {
    try {
      const response = await acceptPetWorldTrade(tradeId);
      setTrades(response.trades || []);
      showToast('Trade accepted');
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

  const world = bundle?.world;
  const buildings = bundle?.buildings || [];
  const canTrade = !!myBundle?.world?.has_market;

  /* ── World not found ─────────────────────────────────────────── */
  if (!world) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950"
        style={{
          padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        }}
      >
        <div className="text-center">
          <div className="text-2xl font-black text-white">World not found</div>
          <Link to="/pet/world" className="mt-4 inline-flex rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
            Return to your world
          </Link>
        </div>
      </div>
    );
  }

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
      {/* Toast */}
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
          {toast}
        </div>
      ) : null}

      {/* ── Top HUD bar ──────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-2 py-1.5" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
        {/* Back button */}
        <Link
          to="/pet/world"
          className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm px-2 py-1.5 text-[11px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">Back</span>
        </Link>

        {/* Visit banner */}
        <div className="flex-1 min-w-0">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg border border-white/[0.08] px-2.5 py-1.5 flex items-center gap-2 min-h-[36px]">
            <span className="text-[10px] font-semibold text-emerald-300/80 truncate">
              Visiting {world.username || 'Unknown'}'s world
            </span>
            <span className="w-px h-3 bg-white/10" />
            <span className="text-[9px] text-white/40 shrink-0">
              Last active: {timeAgo(world.last_tick_at)}
            </span>
            {world.visit_count != null && (
              <>
                <span className="w-px h-3 bg-white/10" />
                <span className="text-[9px] text-white/40 shrink-0">
                  {world.visit_count} visits
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowTrades(true)}
            disabled={!canTrade}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px] disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Trade"
          >
            🔄
          </button>
          <Link
            to="/pet/world"
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/[0.08] bg-black/50 backdrop-blur-sm text-white/50 hover:text-white/90 hover:bg-white/10 transition-colors text-[11px]"
            aria-label="My world"
          >
            🏠
          </Link>
        </div>
      </div>

      {/* ── Resource HUD (below banner) ──────────────────────────── */}
      <div className="absolute top-[52px] left-2 right-2 z-30" style={{ top: 'calc(max(6px, env(safe-area-inset-top)) + 42px)' }}>
        <PetWorldHUD world={world} />
      </div>

      {/* ── Canvas (full screen base layer) ──────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <PetWorldCanvas
          world={world}
          buildings={buildings}
          selectedBuildingId={selectedBuilding?.id}
          selectedTile={selectedTile}
          readonly
          onSelectBuilding={(building) => {
            setSelectedBuilding(building);
            setSelectedTile(null);
          }}
          onSelectTile={(tile) => {
            setSelectedTile(tile);
            setSelectedBuilding(null);
          }}
        />

        {/* Floating building info panel (readonly) */}
        {selectedBuilding && (
          <div className="absolute top-20 right-2 z-30 w-64 max-h-[calc(100%-10rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/75 backdrop-blur-md shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-wider text-white/40">Building</span>
                <button type="button" onClick={() => setSelectedBuilding(null)} className="text-white/40 hover:text-white text-xs">✕</button>
              </div>
              <PetWorldBuildingInfo
                building={selectedBuilding}
                readonly
              />
            </div>
          </div>
        )}

        {/* Floating tile info (readonly) */}
        {!selectedBuilding && selectedTile && (
          <div className="absolute top-20 right-2 z-30 w-56">
            <div className="rounded-xl border border-white/[0.08] bg-black/70 backdrop-blur-sm p-3 shadow-[0_14px_30px_rgba(0,0,0,0.3)]">
              <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">Tile</div>
              <div className="mt-1 text-sm font-black text-white">{selectedTile.x}, {selectedTile.y}</div>
              <div className="mt-0.5 text-[11px] capitalize text-white/50">{selectedTile.tile?.t || 'empty ground'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Trade modal ──────────────────────────────────────────── */}
      <PetWorldTradeModal
        open={showTrades}
        trades={trades}
        targetUser={world}
        canOffer={canTrade}
        onClose={() => setShowTrades(false)}
        onSubmitOffer={handleOfferTrade}
        onAccept={handleAcceptTrade}
        onDecline={handleDeclineTrade}
      />
    </div>
  );
}
