import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDojoOverview } from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getProfilePath } from '../utils/profile';
import DojoActivityPanel from '../components/DojoActivityPanel';
import AdminVenueAccessTab from '../components/AdminVenueAccessTab';

const DEFAULT_DOJO_SLUG = 'london-pump-dojo';

function formatCheckinTime(value) {
  if (!value) return '--';
  const withZone = String(value).endsWith('Z') ? String(value) : `${value}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DojoPage() {
  const { user } = useAuth();
  const hasDojoAccess = !!user?.feature_access?.dojo_admin;
  const [tab, setTab] = useState('venue');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (!user || !hasDojoAccess) {
      setOverview(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getDojoOverview(DEFAULT_DOJO_SLUG);
      setOverview(data || null);
      setError('');
    } catch (err) {
      // Only show errors on initial load; suppress timeout errors during polling if we already have data
      if (!overview) {
        setError(err?.message || 'Failed to load dojo status');
      }
    } finally {
      setLoading(false);
    }
  }, [hasDojoAccess, user]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!user || !hasDojoAccess) return undefined;
    const id = window.setInterval(() => {
      loadOverview();
    }, 20000);
    return () => window.clearInterval(id);
  }, [hasDojoAccess, loadOverview, user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">Dojo Admin</h1>
          <p className="text-sm text-gray-400 mt-2">Login required.</p>
          <Link to="/login" className="inline-flex mt-4 btn-primary">Login</Link>
        </div>
      </div>
    );
  }

  if (!hasDojoAccess) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">Dojo Admin</h1>
          <p className="text-sm text-red-300 mt-2">Dojo Admin access has not been granted for your account.</p>
        </div>
      </div>
    );
  }

  const machines = Array.isArray(overview?.machines) ? overview.machines : [];
  const activeCount = Array.isArray(overview?.active_checkins) ? overview.active_checkins.length : 0;
  const subtitle = tab === 'venue-access'
    ? 'Venue subscriptions, day passes, discounts, and approved user controls'
    : 'Live machine check-ins and weekly activity';

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-lg sm:text-xl text-white">Dojo Admin</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {tab === 'venue' ? (
          <button
            type="button"
            onClick={loadOverview}
            className="px-3 py-1.5 rounded-lg border border-piu-border text-xs font-display font-bold text-gray-300 hover:text-white hover:border-piu-accent/60 transition-colors"
          >
            Refresh
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'venue', label: 'Pump Dojo Venue' },
          { key: 'venue-access', label: 'Venue Access' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3 py-2 rounded-xl text-xs font-display font-bold transition-colors ${
              tab === item.key
                ? 'bg-piu-accent text-white'
                : 'bg-piu-card/60 text-gray-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
      ) : null}

      {tab === 'venue' ? (
        <>
          <div className="bg-piu-card border border-piu-border rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-sm sm:text-base text-white">Machine Status</h2>
              <span className="text-[11px] text-gray-400">{activeCount} active player{activeCount === 1 ? '' : 's'}</span>
            </div>

            {loading && machines.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-5">Loading machine status...</p>
            ) : null}

            {!loading && machines.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-5">No machines found for this dojo.</p>
            ) : null}

            {machines.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {machines.map((machine) => {
                  const users = Array.isArray(machine.active_users) ? machine.active_users : [];
                  return (
                    <div key={machine.id} className="rounded-xl border border-piu-border/45 bg-piu-dark/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-display font-bold text-white truncate">{machine.name}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-display font-bold ${users.length > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-600/20 text-gray-400'}`}>
                          {users.length} active
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        {users.length === 0 ? (
                          <p className="text-[11px] text-gray-500">No one checked in.</p>
                        ) : (
                          users.map((u) => (
                            <div key={`${machine.id}-${u.user_id}`} className="flex items-center gap-2">
                              <Link to={getProfilePath(u.user_id, u.username)} className="shrink-0">
                                {u.avatar ? (
                                  <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border/50" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                                    {(u.username || '?')[0]?.toUpperCase()}
                                  </div>
                                )}
                              </Link>
                              <div className="min-w-0 flex-1">
                                <Link to={getProfilePath(u.user_id, u.username)} className="text-xs font-display font-bold hover:text-piu-accent truncate block">
                                  {u.username}
                                </Link>
                                <p className="text-[10px] text-gray-500">Since {formatCheckinTime(u.checked_in_at)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <DojoActivityPanel
            overview={overview}
            loading={loading}
            error={error}
            onRefresh={loadOverview}
          />
        </>
      ) : (
        <AdminVenueAccessTab />
      )}
    </div>
  );
}
