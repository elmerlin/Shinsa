import React, { useCallback, useEffect, useState } from 'react';
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

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center px-4 py-10">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/12 border-t-white/70" />
      </div>
    );
  }

  const world = bundle?.world;
  const buildings = bundle?.buildings || [];
  const canTrade = !!myBundle?.world?.has_market;

  if (!world) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-6 text-center">
          <div className="text-2xl font-black text-white">World not found</div>
          <Link to="/pet/world" className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/80">
            Return to your world
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
          {toast}
        </div>
      ) : null}

      <div className="space-y-4">
        <PetWorldHUD
          world={world}
          title="Visit"
          subtitle={`${world.username}'s village`}
          actions={(
            <>
              <button type="button" onClick={() => setShowTrades(true)} disabled={!canTrade} className="rounded-full border border-emerald-300/18 bg-emerald-500/[0.12] px-4 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-45">
                Trade
              </button>
              <Link to="/pet/world" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white/80">
                My world
              </Link>
            </>
          )}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
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

          <div className="space-y-4">
            {selectedBuilding ? (
              <PetWorldBuildingInfo
                building={selectedBuilding}
                readonly
              />
            ) : (
              <div className="rounded-[1.3rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,12,18,0.94))] p-4 shadow-[0_14px_30px_rgba(0,0,0,0.24)]">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Village Snapshot</div>
                <div className="mt-2 text-lg font-black text-white">Last active</div>
                <div className="mt-1 text-sm text-white/55">{world.last_tick_at}</div>
              </div>
            )}
          </div>
        </div>

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
    </div>
  );
}
