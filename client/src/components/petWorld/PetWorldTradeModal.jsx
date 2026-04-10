import React, { useMemo, useState } from 'react';

const RESOURCES = ['food', 'wood', 'stone', 'cloth', 'gold'];

export default function PetWorldTradeModal({
  open,
  trades = [],
  targetUser,
  canOffer = false,
  onClose,
  onSubmitOffer,
  onAccept,
  onDecline,
}) {
  const [offerResource, setOfferResource] = useState('wood');
  const [offerAmount, setOfferAmount] = useState(10);
  const [requestResource, setRequestResource] = useState('stone');
  const [requestAmount, setRequestAmount] = useState(10);

  const relevantTrades = useMemo(() => {
    if (!targetUser) return trades;
    return trades.filter((trade) => trade.to_user_id === targetUser.user_id || trade.from_user_id === targetUser.user_id);
  }, [targetUser, trades]);

  if (!open) return null;

  return (
    <section className="rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(13,18,26,0.98),rgba(8,11,16,0.96))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Trading</div>
          <div className="mt-1 text-xl font-black text-white">
            {targetUser ? `Trade with ${targetUser.username}` : 'Village trades'}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-white/20 hover:text-white">
          Close
        </button>
      </div>

      {targetUser && canOffer ? (
        <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3">
          <div className="text-sm font-semibold text-white/85">Create offer</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select value={offerResource} onChange={(e) => setOfferResource(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1218] px-3 py-2 text-sm text-white">
              {RESOURCES.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
            </select>
            <input type="number" min="1" value={offerAmount} onChange={(e) => setOfferAmount(Number(e.target.value) || 1)} className="rounded-xl border border-white/10 bg-[#0b1218] px-3 py-2 text-sm text-white" />
            <select value={requestResource} onChange={(e) => setRequestResource(e.target.value)} className="rounded-xl border border-white/10 bg-[#0b1218] px-3 py-2 text-sm text-white">
              {RESOURCES.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
            </select>
            <input type="number" min="1" value={requestAmount} onChange={(e) => setRequestAmount(Number(e.target.value) || 1)} className="rounded-xl border border-white/10 bg-[#0b1218] px-3 py-2 text-sm text-white" />
          </div>
          <button
            type="button"
            onClick={() => onSubmitOffer?.({ offerResource, offerAmount, requestResource, requestAmount })}
            className="mt-3 rounded-xl border border-emerald-300/24 bg-emerald-500/[0.14] px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/[0.18]"
          >
            Send trade offer
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {relevantTrades.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-sm text-white/55">
            No trade offers yet.
          </div>
        ) : relevantTrades.map((trade) => (
          <div key={trade.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">
                {trade.from_username} offers {trade.offer_amount} {trade.offer_resource}
              </div>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
                {trade.status}
              </span>
            </div>
            <div className="mt-1 text-sm text-white/55">Wants {trade.request_amount} {trade.request_resource}</div>
            {trade.status === 'pending' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onAccept?.(trade.id)} className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.12] px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/[0.18]">
                  Accept
                </button>
                <button type="button" onClick={() => onDecline?.(trade.id)} className="rounded-xl border border-rose-400/20 bg-rose-500/[0.12] px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/[0.18]">
                  Decline
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
