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
import usePetWorldPresence from '../hooks/usePetWorldPresence';
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
  const [activeSheet, setActiveSheet] = useState(null);
  const [visitTab, setVisitTab] = useState('overview');
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

  /* Real-time co-presence via WebSocket (falls back to HTTP heartbeat) */
  const { visitors: wsVisitors, connected: wsConnected } = usePetWorldPresence(userId);

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
  const visitorsOnline = wsVisitors.length || (bundle?.visitors_online?.length ?? null);
  const inspectedObstacle = ['tree', 'rock', 'bush'].includes(selectedTile?.tile?.t);

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
      className={`fixed inset-0 z-50 overflow-hidden bg-[#050b12] text-white transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
      style={{
        overscrollBehavior: 'none',
        userSelect: 'none',
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(30,92,118,0.2),transparent_34%),linear-gradient(180deg,rgba(7,18,26,0.15),rgba(3,6,10,0.92))]" />
      {/* Toast */}
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
          {toast}
        </div>
      ) : null}

      <div className="absolute inset-0">
        <PetWorldCanvas
          world={world}
          buildings={buildings}
          selectedBuildingId={selectedBuilding?.id}
          selectedTile={selectedTile}
          readonly
          onSelectBuilding={(building) => {
            setSelectedBuilding(building);
            setSelectedTile(null);
            setActiveSheet('inspect');
          }}
          onSelectTile={(tile) => {
            setSelectedTile(tile);
            setSelectedBuilding(null);
            setActiveSheet('inspect');
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-48 bg-gradient-to-b from-[#03070d]/95 via-[#06101a]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-56 bg-gradient-to-t from-[#03070d] via-[#03070d]/72 to-transparent" />

      <div className="absolute inset-x-0 top-0 z-40 px-3 pb-3 pt-2" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <div className="flex items-start gap-2">
          <Link
            to="/pet/world"
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white"
            aria-label="Back to your village"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
          </Link>

          <div className="min-w-0 flex-1 rounded-[1.2rem] border border-white/10 bg-black/28 px-3 py-2.5 backdrop-blur-sm shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/55">
                  {activeSheet === 'inspect' ? 'Inspecting' : 'Visit mode'}
                </div>
                <div className="truncate text-sm font-black text-white">
                  Visiting {world.username || 'Unknown'}
                </div>
                <div className="mt-0.5 text-[11px] text-white/45">
                  Last active {timeAgo(world.last_tick_at)}
                  {world.visit_count != null ? ` · ${world.visit_count} visits` : ''}
                  {visitorsOnline ? ` · ${visitorsOnline} online` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setVisitTab('overview');
                    setActiveSheet((sheet) => (sheet === 'visit' ? null : 'visit'));
                  }}
                  className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white"
                  aria-label="Visit tools"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="mt-2">
              <PetWorldHUD world={world} />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-3 z-40 max-w-[14rem] rounded-full border border-white/10 bg-black/32 px-3 py-2 text-[10px] text-white/65 backdrop-blur-sm shadow-[0_12px_24px_rgba(0,0,0,0.2)]">
        {selectedBuilding
          ? 'Building selected. Open the details sheet to inspect it.'
          : selectedTile
            ? inspectedObstacle
              ? 'This tile is blocked. Inspect it for terrain details.'
              : 'Tile selected. Open the sheet to inspect this spot.'
            : 'Drag to pan, pinch to zoom, tap the village to inspect.'}
      </div>

      <div className="absolute bottom-4 right-3 z-40 flex items-center gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          type="button"
          onClick={() => {
            setVisitTab('overview');
            setActiveSheet((sheet) => (sheet === 'visit' ? null : 'visit'));
          }}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-3 text-xs font-semibold backdrop-blur-sm transition-all ${
            activeSheet === 'visit'
              ? 'border-cyan-300/25 bg-cyan-400/14 text-cyan-50'
              : 'border-white/10 bg-black/38 text-white/75 hover:bg-black/52 hover:text-white'
          }`}
        >
          Visit
        </button>
        <button
          type="button"
          onClick={() => setShowTrades(true)}
          disabled={!canTrade}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/38 px-4 py-3 text-xs font-semibold text-white/75 backdrop-blur-sm transition-all hover:bg-black/52 hover:text-white disabled:opacity-40 disabled:pointer-events-none"
        >
          Trade
        </button>
      </div>

      {activeSheet && (
        <div className="absolute inset-x-0 bottom-0 z-50 px-3 pb-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(9,15,22,0.97),rgba(6,10,15,0.96))] shadow-[0_-18px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  {activeSheet === 'inspect' ? 'Details' : 'Visit'}
                </div>
                <div className="text-sm font-black text-white">
                  {activeSheet === 'inspect'
                    ? selectedBuilding ? selectedBuilding.name : 'Selected tile'
                    : visitTab === 'overview' ? 'Visit Overview' : 'Host Notes'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white"
                aria-label="Close panel"
              >
                &times;
              </button>
            </div>

            {activeSheet === 'inspect' ? (
              <div className="max-h-[58vh] overflow-y-auto p-3">
                {selectedBuilding ? (
                  <PetWorldBuildingInfo
                    building={selectedBuilding}
                    readonly
                    ownerName={world.username || 'Unknown'}
                    onClose={() => {
                      setSelectedBuilding(null);
                      setActiveSheet(null);
                    }}
                  />
                ) : selectedTile ? (
                  <div className="rounded-[1.3rem] border border-white/7 bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Tile</div>
                    <div className="mt-1 text-xl font-black text-white">{selectedTile.x}, {selectedTile.y}</div>
                    <div className="mt-1 text-sm text-white/55 capitalize">{selectedTile.tile?.t || 'empty ground'}</div>
                    <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/60">
                      {inspectedObstacle
                        ? 'This tile is part of the village terrain. Only the owner can clear or build here.'
                        : 'This is part of the host village layout. Browse around to inspect buildings and terrain.'}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeSheet === 'visit' ? (
              <div className="max-h-[58vh] overflow-y-auto p-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    ['overview', 'Overview'],
                    ['host', 'Host'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVisitTab(id)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        visitTab === id
                          ? 'border-cyan-300/18 bg-cyan-400/14 text-cyan-50'
                          : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {visitTab === 'overview' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Population</div>
                        <div className="mt-1 text-lg font-black text-white">{world.population}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Mood</div>
                        <div className="mt-1 text-lg font-black text-white">{Math.round(world.happiness || 0)}</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/60">
                      {canTrade
                        ? 'You can send a trade offer from here if both villages have a Market.'
                        : 'Build a Market in your own village to unlock trading with other players.'}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Host village</div>
                    <div className="mt-2 space-y-2">
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white/65">
                        {world.username || 'This player'} has welcomed {world.visit_count || 0} visit{world.visit_count === 1 ? '' : 's'} so far.
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white/65">
                        {trades.length > 0
                          ? `You currently have ${trades.filter((trade) => trade.status === 'pending').length} pending trade${trades.filter((trade) => trade.status === 'pending').length === 1 ? '' : 's'}.`
                          : 'Send a trade offer if you want to exchange resources with this village.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

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
