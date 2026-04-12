import React, { useMemo, useState } from 'react';
import './petWorldCfUi.css';

const RESOURCES = ['food', 'wood', 'stone', 'cloth', 'gold'];

const RES_ICONS = { food: '\uD83C\uDF3E', wood: '\uD83E\uDEB5', stone: '\uD83E\uDEA8', cloth: '\uD83E\uDDF5', gold: '\uD83E\uDE99' };

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
    pending:  'cf-pill cf-pill-warn',
    accepted: 'cf-pill cf-pill-happy',
    declined: 'cf-pill cf-pill-warn',
  };
  return (
    <span className={map[status] || map.pending} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
      {status}
    </span>
  );
}

function Stepper({ value, onChange, min = 1, max = 9999 }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="cf-btn cf-btn-brown" style={{ width: 28, height: 28, padding: 0, fontSize: 14 }}>&minus;</button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="cf-input w-14 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="cf-btn cf-btn-brown" style={{ width: 28, height: 28, padding: 0, fontSize: 14 }}>+</button>
    </div>
  );
}

function ResourceSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cf-select"
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
    <section className="cf-panel" style={{ padding: 16 }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏪</span>
          <div>
            <h2 className="cf-heading cf-text text-lg font-black">Trading Post</h2>
            {targetUser && <div className="cf-text-muted text-xs">with {targetUser.username}</div>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="cf-btn cf-btn-brown" style={{ width: 32, height: 32, padding: 0, fontSize: 16 }}>&times;</button>
      </div>

      {/* Create Offer */}
      {targetUser && !canOffer ? (
        <div className="cf-inset mb-4 flex items-center gap-3" style={{ padding: 16 }}>
          <span className="text-2xl">🛍️</span>
          <div className="cf-text-muted text-sm">Build a <span className="cf-text font-semibold">Market</span> to unlock trading.</div>
        </div>
      ) : targetUser && canOffer ? (
        <div className="cf-inset mb-4" style={{ padding: 12 }}>
          <div className="cf-text-label">Create Offer</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {/* You Send */}
            <div>
              <div className="cf-text-label mb-1.5" style={{ fontSize: 11 }}>You Send</div>
              <ResourceSelect value={offerResource} onChange={setOfferResource} />
              <div className="mt-2">
                <Stepper value={offerAmount} onChange={setOfferAmount} />
              </div>
            </div>
            {/* You Receive */}
            <div>
              <div className="cf-text-label mb-1.5" style={{ fontSize: 11 }}>You Receive</div>
              <ResourceSelect value={requestResource} onChange={setRequestResource} />
              <div className="mt-2">
                <Stepper value={requestAmount} onChange={setRequestAmount} />
              </div>
            </div>
          </div>
          {validationMsg && <div className="mt-2 text-xs font-medium" style={{ color: '#a83030' }}>{validationMsg}</div>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={offerAmount <= 0 || requestAmount <= 0}
            className="cf-btn cf-btn-green mt-3 w-full"
            style={{ padding: '8px 12px', fontSize: 12 }}
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
            className={`cf-btn ${tab === key ? 'cf-btn-orange' : 'cf-btn-ghost'}`}
            style={{ padding: '5px 12px', fontSize: 11 }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Trade list */}
      <div className="cf-scroll space-y-2 overflow-y-auto" style={{ maxHeight: '22rem' }}>
        {relevantTrades.length === 0 ? (
          <div className="cf-inset cf-text-muted p-5 text-center text-sm">
            No trades yet. Visit other worlds to send offers!
          </div>
        ) : relevantTrades.map((trade) => {
          const isIncoming = trade.to_user_id === currentUserId;
          const partner = isIncoming ? trade.from_username : trade.to_username;
          return (
            <div key={trade.id} className="cf-inset" style={{ padding: 12 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold cf-text">
                  <span style={{ fontSize: 12, color: isIncoming ? '#2c7eb0' : '#c48820' }}>{isIncoming ? '\u2190' : '\u2192'}</span>
                  <span className="cf-text-muted">{partner || 'Unknown'}</span>
                </div>
                <StatusBadge status={trade.status} />
              </div>
              <div className="cf-text mt-1.5 flex items-center gap-1.5 text-sm">
                <span>{resIcon(trade.offer_resource)} {trade.offer_amount} {trade.offer_resource}</span>
                <span className="cf-text-muted">\u2192</span>
                <span>{resIcon(trade.request_resource)} {trade.request_amount} {trade.request_resource}</span>
              </div>
              {trade.created_at && <div className="cf-text-muted mt-1 text-[10px]">{timeAgo(trade.created_at)}</div>}
              {trade.status === 'pending' && isIncoming ? (
                <div className="mt-2.5 flex gap-2">
                  <button type="button" onClick={() => onAccept?.(trade.id)} className="cf-btn cf-btn-green" style={{ padding: '5px 12px', fontSize: 11 }}>
                    Accept
                  </button>
                  <button type="button" onClick={() => onDecline?.(trade.id)} className="cf-btn cf-btn-red" style={{ padding: '5px 12px', fontSize: 11 }}>
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
