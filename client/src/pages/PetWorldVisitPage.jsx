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
import '../components/petWorld/petWorldCfUi.css';

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
  const hostName = world?.username || 'Unknown';
  const guestLine = visitorsOnline ? `${visitorsOnline} guest${visitorsOnline === 1 ? '' : 's'} around the village` : 'Quiet guest view';

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
        <div className="cf-pill fixed left-1/2 top-4 z-[90] -translate-x-1/2 text-sm font-semibold shadow-[0_14px_30px_rgba(40,20,0,0.35)]">
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
          readonlyLabel="Guest View"
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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 cf-top-bar" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 cf-bottom-bar" />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-2 px-2.5 py-1.5"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top))', maxHeight: 52 }}
      >
        <Link
          to="/pet/world"
          className="pointer-events-auto cf-btn cf-btn-brown flex h-9 w-9 shrink-0 items-center justify-center"
          style={{ borderRadius: '50%', padding: 0 }}
          aria-label="Back to your village"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <PetWorldHUD world={world} collapsed />
        </div>
        <span className="cf-pill cf-pill-accent pointer-events-none">
          <span className="cf-dot animate-pulse" style={{ backgroundColor: '#5eb85e', width: 6, height: 6 }} />
          <span className="max-w-[140px] truncate text-[9px] font-semibold">Guest in {hostName}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setVisitTab('overview');
            setActiveSheet((sheet) => (sheet === 'visit' ? null : 'visit'));
          }}
          className="pointer-events-auto cf-btn cf-btn-brown flex h-9 w-9 shrink-0 items-center justify-center"
          style={{ borderRadius: '50%', padding: 0 }}
          aria-label="Visit tools"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM10 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
          </svg>
        </button>
      </div>

      {!activeSheet && (
        <div className="cf-pill absolute bottom-4 left-3 z-40 text-[8px] animate-[fadeOut_4s_ease-in_forwards]" style={{ opacity: 0.7 }}>
          Wander and inspect
        </div>
      )}

      <div className="absolute bottom-4 right-3 z-40 flex items-center gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          type="button"
          onClick={() => {
            setVisitTab('overview');
            setActiveSheet((sheet) => (sheet === 'visit' ? null : 'visit'));
          }}
          className={`cf-btn ${activeSheet === 'visit' ? 'cf-btn-orange' : 'cf-btn-brown'} px-2 py-1 text-[9px] font-semibold`}
        >
          Guide
        </button>
        <button
          type="button"
          onClick={() => setShowTrades(true)}
          disabled={!canTrade}
          className="cf-btn cf-btn-blue px-2 py-1 text-[9px] font-semibold disabled:opacity-40 disabled:pointer-events-none"
        >
          Trade
        </button>
      </div>

      {activeSheet && (
        <div className="absolute inset-x-0 bottom-0 z-50 px-3 pb-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="cf-panel-dark mx-auto w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '2px solid rgba(139,94,43,0.2)' }}>
              <div>
                <div className="cf-text-label">
                  {activeSheet === 'inspect' ? 'Guest Inspect' : 'Guest Guide'}
                </div>
                <div className="cf-text cf-heading text-sm font-black">
                  {activeSheet === 'inspect'
                    ? selectedBuilding ? selectedBuilding.name : 'Village patch'
                    : visitTab === 'overview' ? `${hostName}'s village` : 'Host notes'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="cf-btn cf-btn-brown flex h-8 w-8 items-center justify-center text-sm"
                style={{ padding: 0 }}
                aria-label="Close panel"
              >
                &times;
              </button>
            </div>

            {activeSheet === 'inspect' ? (
              <div className="max-h-[24vh] overflow-y-auto p-3">
                {selectedBuilding ? (
                  <PetWorldBuildingInfo
                    building={selectedBuilding}
                    readonly
                    ownerName={hostName}
                    world={world}
                    onClose={() => {
                      setSelectedBuilding(null);
                      setActiveSheet(null);
                    }}
                  />
                ) : selectedTile ? (
                  <div className="cf-inset p-3">
                    <div className="flex items-center gap-2">
                      <span className="cf-pill" style={{ fontSize: 8, padding: '1px 8px' }}>
                        {selectedTile.tile?.t || 'ground'}
                      </span>
                      <div className="cf-text text-[13px] font-black">{selectedTile.x}, {selectedTile.y}</div>
                    </div>
                    <div className="cf-inset-light mt-2 px-3 py-2.5 text-[11px] leading-relaxed cf-text-muted">
                      {inspectedObstacle
                        ? 'Still part of the wild edge of the village. Guests can inspect, but only the host can clear it.'
                        : 'A settled patch inside the village layout. Guests can roam, inspect, and browse the scenery.'}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeSheet === 'visit' ? (
              <div className="max-h-[28vh] overflow-y-auto p-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    ['overview', 'Overview'],
                    ['host', 'Host'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVisitTab(id)}
                      className={`cf-btn ${visitTab === id ? 'cf-btn-orange' : 'cf-btn-ghost'}`}
                      style={{ padding: '5px 12px', fontSize: 11 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {visitTab === 'overview' ? (
                  <div className="space-y-3">
                    <div className="cf-inset-light px-3 py-2 text-[11px]" style={{ color: '#2a5a3a' }}>
                      Guest in {hostName}&apos;s village. {guestLine}.
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="cf-inset p-3">
                        <div className="cf-text-label">Population</div>
                        <div className="cf-text mt-1 text-lg font-black">{world.population}</div>
                      </div>
                      <div className="cf-inset p-3">
                        <div className="cf-text-label">Mood</div>
                        <div className="cf-text mt-1 text-lg font-black">{Math.round(world.happiness || 0)}</div>
                      </div>
                    </div>
                    <div className="cf-inset p-3 text-sm cf-text-muted">
                      {canTrade
                        ? 'You can send a trade offer from here if both villages keep a Market.'
                        : 'Build a Market in your own village to unlock guest trading.'}
                    </div>
                    <div className="cf-inset-light p-3 text-sm cf-text-muted">
                      This village now has visible life in the world itself: roaming villagers, water creatures, meadow animals, and visiting birds. Some wildlife only becomes huntable in the host&apos;s own view.
                    </div>
                  </div>
                ) : (
                  <div className="cf-inset p-3">
                    <div className="cf-text-label">Host village</div>
                    <div className="mt-2 space-y-2">
                      <div className="cf-inset px-3 py-2 text-sm cf-text">
                        {hostName} has welcomed {world.visit_count || 0} visit{world.visit_count === 1 ? '' : 's'} so far.
                      </div>
                      <div className="cf-inset px-3 py-2 text-sm cf-text">
                        {trades.length > 0
                          ? `You currently have ${trades.filter((trade) => trade.status === 'pending').length} pending trade${trades.filter((trade) => trade.status === 'pending').length === 1 ? '' : 's'} with this village.`
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
