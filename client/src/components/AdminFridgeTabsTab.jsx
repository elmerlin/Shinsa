import React, { useCallback, useEffect, useState } from 'react';
import { getAvatarUrl } from './AvatarPicker';
import { getAdminFridgeTabs } from '../utils/api';

function formatCurrency(pence) {
  return `£${((pence || 0) / 100).toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr);
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Whole days since a timestamp; '' when unparseable. */
function daysOpen(dateStr) {
  if (!dateStr) return '';
  const raw = String(dateStr);
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

export default function AdminFridgeTabsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminFridgeTabs());
    } catch (err) {
      setError(err?.message || 'Failed to load fridge tabs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = data?.tabs || [];
  const summary = data?.summary;
  const minSettlePence = data?.min_settle_pence || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-display font-bold text-white">Open Fridge Tabs</h2>
          <p className="text-[11px] text-gray-500">Who has drinks on the slate right now, biggest first.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Owed', value: formatCurrency(summary?.total_owed_pence) },
          { label: 'Open tabs', value: summary?.open_tab_count ?? 0 },
          { label: 'Drinks out', value: summary?.item_count ?? 0 },
          { label: 'Mid-checkout', value: formatCurrency(summary?.settling_pence) },
        ].map((metric) => (
          <div key={metric.label} className="rounded-lg border border-piu-border/50 bg-piu-card/40 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-gray-500 font-display font-bold">{metric.label}</p>
            <p className="text-lg font-mono font-bold text-white leading-tight">{metric.value}</p>
          </div>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tabs.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">
          Nothing on the slate — every tab is settled. 🎉
        </p>
      ) : (
        <div className="space-y-2">
          {tabs.map((tab) => {
            const isOpen = expanded === tab.user_id;
            const age = daysOpen(tab.oldest_entry_at);
            // They can't settle below the minimum, so don't chase them for it.
            const belowMinimum = minSettlePence > 0 && tab.total_pence < minSettlePence;
            const avatar = String(tab.avatar || '').trim();
            const avatarSrc = avatar
              ? (avatar.startsWith('data:') || avatar.startsWith('http') ? avatar : getAvatarUrl(avatar))
              : '';

            return (
              <div key={tab.user_id} className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : tab.user_id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-piu-dark/25 transition-colors"
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border/40 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs shrink-0">
                      {(tab.username || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-[13px] text-gray-100 truncate">{tab.username}</p>
                    <p className="text-[11px] text-gray-500">
                      {tab.item_count} drink{tab.item_count === 1 ? '' : 's'}{age ? ` · oldest ${age}` : ''}
                    </p>
                    {tab.settling || belowMinimum ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tab.settling ? (
                          <span className="rounded border border-piu-accent/40 bg-piu-accent/10 px-1.5 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-piu-accent">
                            Checking out {formatCurrency(tab.settling_pence)}
                          </span>
                        ) : null}
                        {belowMinimum ? (
                          <span className="rounded border border-piu-border/60 bg-piu-dark/50 px-1.5 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide text-gray-400">
                            Under {formatCurrency(minSettlePence)} min
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-piu-gold text-[15px]">{formatCurrency(tab.total_pence)}</p>
                    <p className="text-[10px] text-gray-500">{isOpen ? 'Hide' : 'Details'}</p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-piu-border/40 px-3 py-2 space-y-1">
                    {tab.entries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 text-[12px]">
                        <span>{entry.emoji || '🥤'}</span>
                        <span className="flex-1 min-w-0 truncate text-gray-300">
                          {entry.item_name}{entry.qty > 1 ? ` ×${entry.qty}` : ''}
                        </span>
                        {entry.settling ? (
                          <span className="text-[9px] font-display font-bold uppercase text-piu-accent">locked</span>
                        ) : null}
                        <span className="text-[10px] text-gray-500">{formatDate(entry.created_at)}</span>
                        <span className="font-mono text-gray-300">{formatCurrency(entry.line_pence)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2">
        <h3 className="text-sm font-display font-bold text-white">Recently Settled</h3>
        <p className="text-[11px] text-gray-500 mb-2">Last 10 completed Square payments.</p>
        {(data?.recent_settlements?.length || 0) === 0 ? (
          <p className="text-xs text-gray-500">No settled payments yet.</p>
        ) : (
          <div className="space-y-1">
            {data.recent_settlements.map((row) => (
              <div key={row.id} className="flex items-center gap-2 text-[12px] border-b border-piu-border/25 last:border-b-0 py-1.5">
                <span className="flex-1 min-w-0 truncate text-gray-300 font-display font-bold">{row.username}</span>
                <span className="text-[10px] text-gray-500">{formatDate(row.paid_at)}</span>
                <span className="font-mono font-bold text-gray-200">{formatCurrency(row.amount_pence)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
