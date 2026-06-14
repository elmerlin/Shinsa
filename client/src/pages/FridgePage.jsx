import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addFridgeTabItem,
  getFridgeItems,
  getFridgeTab,
  reconcileFridgeTab,
  removeFridgeTabEntry,
  settleFridgeTab,
} from '../utils/api';

function pounds(pence) {
  return `£${(Math.round(Number(pence) || 0) / 100).toFixed(2)}`;
}

function formatWhen(raw) {
  if (!raw) return '';
  const norm = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(norm) ? norm : `${norm}Z`);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Dojo fridge tab — honor system for the mini fridge. Tap what you take,
 * settle the whole tab in one Square checkout (walk-ins use the piggy bank).
 * Mirrors the mobile app's Fridge screen against the same /api/fridge.
 */
export default function FridgePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [squareEnabled, setSquareEnabled] = useState(true);
  const [minSettle, setMinSettle] = useState(1000);
  const [tab, setTab] = useState({ entries: [], total_pence: 0, settling: false, history: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await getFridgeTab();
      setTab({
        entries: data.entries || [],
        total_pence: data.total_pence || 0,
        settling: !!data.settling,
        history: data.history || [],
      });
    } catch (err) {
      setError(err?.message || 'Failed to load your tab');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getFridgeItems();
        if (!cancelled) {
          setItems(data.items || []);
          setSquareEnabled(!!data.square_enabled);
          if (data.min_settle_pence) setMinSettle(data.min_settle_pence);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load fridge items');
      }
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Returning from Square (?payment=success) or any pending settle → verify.
  useEffect(() => {
    const fromSquare = searchParams.get('payment') === 'success';
    if (!fromSquare && !tab.settling) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await reconcileFridgeTab();
        if (cancelled) return;
        if (res.reconciled > 0) {
          setNotice('Tab settled — thank you! 🧊');
          await refresh();
        }
      } catch {}
      if (fromSquare && !cancelled) {
        searchParams.delete('payment');
        setSearchParams(searchParams, { replace: true });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('payment'), tab.settling]);

  const grab = async (itemId) => {
    setBusy(true);
    setError('');
    try {
      const data = await addFridgeTabItem(itemId);
      setTab((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(err?.message || 'Could not add to your tab');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entryId) => {
    try {
      const data = await removeFridgeTabEntry(entryId);
      setTab((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(err?.message || 'Could not remove that entry');
    }
  };

  const settle = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await settleFridgeTab();
      if (res.checkout_url) window.location.href = res.checkout_url;
    } catch (err) {
      setError(err?.message || 'Could not start the Square checkout');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div>
        <p className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-piu-accent">Dojo fridge</p>
        <h1 className="font-display text-2xl font-bold text-white">Grab it, tap it, settle later</h1>
        <p className="mt-1 text-sm text-gray-400">
          Honor system: tap what you take and it goes on your tab. Settle whenever you like — one
          Square checkout for the whole tab. Walk-ins: piggy bank on the fridge.
        </p>
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="card text-center text-sm text-gray-400">Loading the fridge…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => grab(item.id)}
                disabled={busy}
                className="card-hover flex flex-col items-center gap-1 py-4 text-center disabled:opacity-60"
              >
                <span className="text-3xl">{item.emoji || '🧊'}</span>
                <span className="text-xs font-bold text-gray-200">{item.name}</span>
                <span className="font-display text-sm font-bold text-piu-gold tabular-nums">{pounds(item.price_pence)}</span>
              </button>
            ))}
          </div>

          <div className="card space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold text-white">Your tab</h2>
              <span className="font-display text-2xl font-bold text-piu-gold tabular-nums">{pounds(tab.total_pence)}</span>
            </div>

            {tab.entries.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing on your tab — tap an item above when you grab one.</p>
            ) : (
              <ul className="space-y-2">
                {tab.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span className="text-lg">{e.emoji || '🧊'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-200">
                        {e.item_name}{e.qty > 1 ? ` ×${e.qty}` : ''}
                      </span>
                      <span className="block text-[11px] text-gray-500">{formatWhen(e.created_at)}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-gray-200">{pounds(e.price_pence * e.qty)}</span>
                    {e.settling_payment_id == null ? (
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        aria-label="Remove"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-piu-accent">settling…</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {tab.total_pence > 0 ? (
              tab.settling ? (
                <p className="text-xs text-gray-400">
                  Checkout in progress — finish paying in the Square tab, then refresh this page.
                </p>
              ) : tab.total_pence < minSettle ? (
                <p className="rounded-xl border border-piu-border bg-white/5 px-4 py-3 text-center text-sm font-semibold text-gray-300">
                  {pounds(minSettle)} minimum to settle — add {pounds(minSettle - tab.total_pence)} more.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={settle}
                  disabled={busy || !squareEnabled}
                  className="btn-primary w-full disabled:opacity-60"
                >
                  Settle {pounds(tab.total_pence)} with Square
                </button>
              )
            ) : null}
          </div>

          {tab.history.length > 0 ? (
            <div className="card space-y-2">
              <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Settled</p>
              {tab.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{formatWhen(h.paid_at || h.created_at)}</span>
                  <span className="font-bold tabular-nums text-gray-200">{pounds(h.amount_pence)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
