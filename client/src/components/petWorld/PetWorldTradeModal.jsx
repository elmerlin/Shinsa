import React, { useMemo, useState } from 'react';

const RESOURCES = ['food', 'wood', 'stone', 'cloth', 'gold'];

const RES_ICONS = { food: '\uD83C\uDF3E', wood: '\uD83E\uDEB5', stone: '\uD83E\uDEA8', cloth: '\uD83E\uDDF5', gold: '\uD83E\uDE99' };
const RES_COLORS = { food: 'emerald', wood: 'orange', stone: 'slate', cloth: 'fuchsia', gold: 'yellow' };

function resIcon(r) { return RES_ICONS[r] || r; }

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }) {
  const map = {
    pending:  'border-amber-400/25 bg-amber-500/[0.12] text-amber-200',
    accepted: 'border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-200',
    declined: 'border-rose-400/25 bg-rose-500/[0.12] text-rose-200',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${map[status] || map.pending}`}>
      {status}
    </span>
  );
}

function Stepper({ value, onChange, min = 1, max = 9999 }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-bold text-white/60 hover:bg-white/[0.08]">&minus;</button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-14 rounded-lg border border-white/10 bg-[#0b1218] px-2 py-1.5 text-center text-sm text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-bold text-white/60 hover:bg-white/[0.08]">+</button>
    </div>
  );
}

function ResourceSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-white/10 bg-[#0b1218] px-3 py-2 text-sm text-white"
    >
      {RESOURCES.map((r) => (
        <option key={r} value={r}>{resIcon(r)} {r.charAt(0).toUpperCase() + r.slice(1)}</option>
      ))}
    </select>
  );
}

export default function PetWorldTradeModal({
  open,
  trades = [],
  targetUser,
  currentUserId,
  canOffer = false,
  playerResources = {},
  onClose,
  onSubmitOffer,
  onAccept,
  onDecline,
}) {
  const [offerResource, setOfferResource] = useState('wood');
  const [offerAmount, setOfferAmount] = useState(10);
  const [requestResource, setRequestResource] = useState('stone');
  const [requestAmount, setRequestAmount] = useState(10);
  const [tab, setTab] = useState('all');
  const [validationMsg, setValidationMsg] = useState('');

  const relevantTrades = useMemo(() => {
    let list = trades;
    if (targetUser) {
      list = list.filter((t) => t.to_user_id === targetUser.user_id || t.from_user_id === targetUser.user_id);
    }
    if (tab === 'pending') return list.filter((t) => t.status === 'pending');
    if (tab === 'completed') return list.filter((t) => t.status !== 'pending');
    return list;
  }, [targetUser, trades, tab]);

  if (!open) return null;

  function handleSubmit() {
    setValidationMsg('');
    if (offerAmount <= 0 || requestAmount <= 0) {
      setValidationMsg('Amounts must be greater than zero.');
      return;
    }
    if (offerResource === requestResource) {
      setValidationMsg('Choose different resources to trade.');
      return;
    }
    const available = playerResources[offerResource] || 0;
    if (offerAmount > available) {
      setValidationMsg(`You only have ${Math.floor(available)} ${offerResource}.`);
      return;
    }
    if (targetUser && targetUser.user_id === currentUserId) {
      setValidationMsg('You cannot trade with yourself.');
      return;
    }
    onSubmitOffer?.({ offerResource, offerAmount, requestResource, requestAmount });
  }

  return (
    <section className="rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(13,18,26,0.98),rgba(8,11,16,0.96))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏪</span>
          <div>
            <h2 className="text-lg font-black text-white">Trading Post</h2>
            {targetUser && <div className="text-xs text-white/50">with {targetUser.username}</div>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-base text-white/60 hover:border-white/20 hover:text-white">&times;</button>
      </div>

      {/* Create Offer */}
      {targetUser && !canOffer ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <span className="text-2xl">🛍️</span>
          <div className="text-sm text-white/55">Build a <span className="font-semibold text-white/80">Market</span> to unlock trading.</div>
        </div>
      ) : targetUser && canOffer ? (
        <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Create Offer</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {/* You Send */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">You Send</div>
              <ResourceSelect value={offerResource} onChange={setOfferResource} />
              <div className="mt-2">
                <Stepper value={offerAmount} onChange={setOfferAmount} />
              </div>
            </div>
            {/* You Receive */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">You Receive</div>
              <ResourceSelect value={requestResource} onChange={setRequestResource} />
              <div className="mt-2">
                <Stepper value={requestAmount} onChange={setRequestAmount} />
              </div>
            </div>
          </div>
          {validationMsg && <div className="mt-2 text-xs font-medium text-rose-300">{validationMsg}</div>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={offerAmount <= 0 || requestAmount <= 0}
            className="mt-3 w-full rounded-xl border border-emerald-300/24 bg-emerald-500/[0.14] px-3 py-2.5 text-xs font-bold text-emerald-100 transition-all hover:bg-emerald-500/[0.22] disabled:opacity-40"
          >
            Send Offer
          </button>
        </div>
      ) : null}

      {/* Tab filter */}
      <div className="mb-3 flex gap-1">
        {[['all', 'All'], ['pending', 'Pending'], ['completed', 'Completed']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
              tab === key
                ? 'bg-white/[0.1] text-white'
                : 'text-white/40 hover:bg-white/[0.05] hover:text-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Trade list */}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '22rem' }}>
        {relevantTrades.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center text-sm text-white/45">
            No trades yet. Visit other worlds to send offers!
          </div>
        ) : relevantTrades.map((trade) => {
          const isIncoming = trade.to_user_id === currentUserId;
          const partner = isIncoming ? trade.from_username : trade.to_username;
          return (
            <div key={trade.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className={`text-xs ${isIncoming ? 'text-sky-300' : 'text-amber-300'}`}>{isIncoming ? '\u2190' : '\u2192'}</span>
                  <span className="text-white/60">{partner || 'Unknown'}</span>
                </div>
                <StatusBadge status={trade.status} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-white/70">
                <span>{resIcon(trade.offer_resource)} {trade.offer_amount} {trade.offer_resource}</span>
                <span className="text-white/30">\u2192</span>
                <span>{resIcon(trade.request_resource)} {trade.request_amount} {trade.request_resource}</span>
              </div>
              {trade.created_at && <div className="mt-1 text-[10px] text-white/30">{timeAgo(trade.created_at)}</div>}
              {trade.status === 'pending' && isIncoming ? (
                <div className="mt-2.5 flex gap-2">
                  <button type="button" onClick={() => onAccept?.(trade.id)} className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.12] px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/[0.2]">
                    Accept
                  </button>
                  <button type="button" onClick={() => onDecline?.(trade.id)} className="rounded-lg border border-rose-400/20 bg-rose-500/[0.12] px-3 py-1.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/[0.2]">
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
