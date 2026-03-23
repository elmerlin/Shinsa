import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getCheckinNotificationPreferences,
  getDojoOverview,
  getVenueAccessNotificationPreferences,
  updateCheckinNotificationPreferences,
  updateVenueAccessNotificationPreferences,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getProfilePath } from '../utils/profile';
import DojoActivityPanel from '../components/DojoActivityPanel';
import AdminVenueAccessTab from '../components/AdminVenueAccessTab';

const DEFAULT_DOJO_SLUG = 'london-pump-dojo';

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCheckinTime(value) {
  if (!value) return '--';
  const withZone = String(value).endsWith('Z') ? String(value) : `${value}Z`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createNotificationState(overrides = {}) {
  return {
    loading: false,
    saving: false,
    subscribed: false,
    ...overrides,
  };
}

export default function DojoPage() {
  const { user } = useAuth();
  const hasDojoAccess = !!user?.feature_access?.dojo_admin;
  const [tab, setTab] = useState('venue');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [selectedWeekStart, setSelectedWeekStart] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [venueNotifyPrefs, setVenueNotifyPrefs] = useState(createNotificationState({
    notify_checkins: false,
    notify_checkouts: false,
  }));
  const [venueAccessNotifyPrefs, setVenueAccessNotifyPrefs] = useState(createNotificationState({
    notify_subscription_events: false,
    notify_day_pass_purchases: false,
    notify_payments: false,
  }));
  const notificationsMenuRef = useRef(null);

  const loadOverview = useCallback(async () => {
    if (!user || !hasDojoAccess) {
      setOverview(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getDojoOverview(DEFAULT_DOJO_SLUG, {
        month: selectedMonth,
        week_start: selectedWeekStart || undefined,
      });
      setOverview(data || null);
      if (data?.selected_month && data.selected_month !== selectedMonth) {
        setSelectedMonth(data.selected_month);
      }
      if (data?.week?.start_day && data.week.start_day !== selectedWeekStart) {
        setSelectedWeekStart(data.week.start_day);
      }
      setError('');
    } catch (err) {
      if (!overview) {
        setError(err?.message || 'Failed to load dojo status');
      }
    } finally {
      setLoading(false);
    }
  }, [hasDojoAccess, selectedMonth, selectedWeekStart, user]);

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

  const loadNotificationPrefs = useCallback(async () => {
    if (!user || !hasDojoAccess) return;
    setNotificationsError('');
    setVenueNotifyPrefs((prev) => ({ ...prev, loading: true, saving: false }));
    setVenueAccessNotifyPrefs((prev) => ({ ...prev, loading: true, saving: false }));
    try {
      const [venuePrefs, venueAccessPrefs] = await Promise.all([
        getCheckinNotificationPreferences(DEFAULT_DOJO_SLUG),
        getVenueAccessNotificationPreferences(DEFAULT_DOJO_SLUG),
      ]);
      setVenueNotifyPrefs(createNotificationState({
        notify_checkins: !!venuePrefs?.notify_checkins,
        notify_checkouts: !!venuePrefs?.notify_checkouts,
        subscribed: !!venuePrefs?.subscribed,
      }));
      setVenueAccessNotifyPrefs(createNotificationState({
        notify_subscription_events: !!venueAccessPrefs?.notify_subscription_events,
        notify_day_pass_purchases: !!venueAccessPrefs?.notify_day_pass_purchases,
        notify_payments: !!venueAccessPrefs?.notify_payments,
        subscribed: !!venueAccessPrefs?.subscribed,
      }));
    } catch (err) {
      setVenueNotifyPrefs((prev) => ({ ...prev, loading: false, saving: false }));
      setVenueAccessNotifyPrefs((prev) => ({ ...prev, loading: false, saving: false }));
      setNotificationsError(err?.message || 'Failed to load dojo notification settings');
    }
  }, [hasDojoAccess, user]);

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    loadNotificationPrefs();

    const handleClickOutside = (event) => {
      if (notificationsMenuRef.current && !notificationsMenuRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen, loadNotificationPrefs]);

  const saveVenueNotifyPrefs = useCallback(async (nextPrefs) => {
    if (venueNotifyPrefs.loading || venueNotifyPrefs.saving) return;
    const previous = venueNotifyPrefs;
    const optimistic = createNotificationState({
      ...previous,
      saving: true,
      notify_checkins: !!nextPrefs.notify_checkins,
      notify_checkouts: !!nextPrefs.notify_checkouts,
      subscribed: !!(nextPrefs.notify_checkins || nextPrefs.notify_checkouts),
    });
    setNotificationsError('');
    setVenueNotifyPrefs(optimistic);

    try {
      const saved = await updateCheckinNotificationPreferences(DEFAULT_DOJO_SLUG, {
        notify_checkins: optimistic.notify_checkins,
        notify_checkouts: optimistic.notify_checkouts,
      });
      setVenueNotifyPrefs(createNotificationState({
        notify_checkins: !!saved?.notify_checkins,
        notify_checkouts: !!saved?.notify_checkouts,
        subscribed: !!saved?.subscribed,
      }));
    } catch (err) {
      setVenueNotifyPrefs(createNotificationState(previous));
      setNotificationsError(err?.message || 'Failed to update venue alerts');
    }
  }, [venueNotifyPrefs]);

  const saveVenueAccessNotifyPrefs = useCallback(async (nextPrefs) => {
    if (venueAccessNotifyPrefs.loading || venueAccessNotifyPrefs.saving) return;
    const previous = venueAccessNotifyPrefs;
    const optimistic = createNotificationState({
      ...previous,
      saving: true,
      notify_subscription_events: !!nextPrefs.notify_subscription_events,
      notify_day_pass_purchases: !!nextPrefs.notify_day_pass_purchases,
      notify_payments: !!nextPrefs.notify_payments,
      subscribed: !!(nextPrefs.notify_subscription_events || nextPrefs.notify_day_pass_purchases || nextPrefs.notify_payments),
    });
    setNotificationsError('');
    setVenueAccessNotifyPrefs(optimistic);

    try {
      const saved = await updateVenueAccessNotificationPreferences(DEFAULT_DOJO_SLUG, {
        notify_subscription_events: optimistic.notify_subscription_events,
        notify_day_pass_purchases: optimistic.notify_day_pass_purchases,
        notify_payments: optimistic.notify_payments,
      });
      setVenueAccessNotifyPrefs(createNotificationState({
        notify_subscription_events: !!saved?.notify_subscription_events,
        notify_day_pass_purchases: !!saved?.notify_day_pass_purchases,
        notify_payments: !!saved?.notify_payments,
        subscribed: !!saved?.subscribed,
      }));
    } catch (err) {
      setVenueAccessNotifyPrefs(createNotificationState(previous));
      setNotificationsError(err?.message || 'Failed to update venue access alerts');
    }
  }, [venueAccessNotifyPrefs]);

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
  const notificationsEnabled = !!(venueNotifyPrefs.subscribed || venueAccessNotifyPrefs.subscribed);
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

        <div className="flex items-center gap-2">
          {tab === 'venue' ? (
            <button
              type="button"
              onClick={loadOverview}
              className="px-3 py-1.5 rounded-lg border border-piu-border text-xs font-display font-bold text-gray-300 hover:text-white hover:border-piu-accent/60 transition-colors"
            >
              Refresh
            </button>
          ) : null}

          <div className="relative" ref={notificationsMenuRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-bold border transition-colors ${
                notificationsEnabled
                  ? 'bg-piu-dark border-emerald-400/40 text-gray-100'
                  : 'bg-piu-dark border-piu-border text-gray-300 hover:text-white'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>Notifications</span>
                {notificationsEnabled ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> : null}
              </span>
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-full mt-2 z-20 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl bg-piu-card border border-piu-border/60 p-3 shadow-2xl">
                <p className="text-[10px] font-display font-bold text-gray-400 uppercase tracking-wide">Dojo Alerts</p>
                <p className="text-[11px] text-gray-500 mt-1">Control which admin alerts land in your Shinsa notifications.</p>

                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-display font-bold text-white">Pump Dojo Venue</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveVenueNotifyPrefs({ notify_checkins: true, notify_checkouts: true })}
                          disabled={venueNotifyPrefs.loading || venueNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => saveVenueNotifyPrefs({ notify_checkins: false, notify_checkouts: false })}
                          disabled={venueNotifyPrefs.loading || venueNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { key: 'notify_checkins', label: 'Check-ins' },
                        { key: 'notify_checkouts', label: 'Check-outs' },
                      ].map((option) => {
                        const enabled = !!venueNotifyPrefs[option.key];
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => saveVenueNotifyPrefs({
                              notify_checkins: option.key === 'notify_checkins' ? !venueNotifyPrefs.notify_checkins : venueNotifyPrefs.notify_checkins,
                              notify_checkouts: option.key === 'notify_checkouts' ? !venueNotifyPrefs.notify_checkouts : venueNotifyPrefs.notify_checkouts,
                            })}
                            disabled={venueNotifyPrefs.loading || venueNotifyPrefs.saving}
                            className={`px-2 py-1 rounded-md text-[11px] font-display font-bold border transition-colors disabled:opacity-60 ${
                              enabled
                                ? 'bg-piu-dark border-emerald-400/50 text-emerald-300'
                                : 'bg-piu-dark border-piu-border text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {enabled ? <span className="text-emerald-400">✓</span> : null}
                              <span>{option.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-gray-500 mt-1.5">
                      {venueNotifyPrefs.loading && 'Loading venue alerts...'}
                      {!venueNotifyPrefs.loading && venueNotifyPrefs.saving && 'Saving venue alerts...'}
                      {!venueNotifyPrefs.loading && !venueNotifyPrefs.saving && venueNotifyPrefs.subscribed && 'You will get notified when users check in or out. Your own events are excluded.'}
                      {!venueNotifyPrefs.loading && !venueNotifyPrefs.saving && !venueNotifyPrefs.subscribed && 'Venue alerts are off.'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-piu-border/50 bg-piu-dark/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-display font-bold text-white">Venue Access</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveVenueAccessNotifyPrefs({
                            notify_subscription_events: true,
                            notify_day_pass_purchases: true,
                            notify_payments: true,
                          })}
                          disabled={venueAccessNotifyPrefs.loading || venueAccessNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => saveVenueAccessNotifyPrefs({
                            notify_subscription_events: false,
                            notify_day_pass_purchases: false,
                            notify_payments: false,
                          })}
                          disabled={venueAccessNotifyPrefs.loading || venueAccessNotifyPrefs.saving}
                          className="px-1.5 py-0.5 rounded bg-piu-dark text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-60"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { key: 'notify_subscription_events', label: 'Subscription Events' },
                        { key: 'notify_day_pass_purchases', label: 'Day Pass Purchases' },
                        { key: 'notify_payments', label: 'Payments Received' },
                      ].map((option) => {
                        const enabled = !!venueAccessNotifyPrefs[option.key];
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => saveVenueAccessNotifyPrefs({
                              notify_subscription_events: option.key === 'notify_subscription_events'
                                ? !venueAccessNotifyPrefs.notify_subscription_events
                                : venueAccessNotifyPrefs.notify_subscription_events,
                              notify_day_pass_purchases: option.key === 'notify_day_pass_purchases'
                                ? !venueAccessNotifyPrefs.notify_day_pass_purchases
                                : venueAccessNotifyPrefs.notify_day_pass_purchases,
                              notify_payments: option.key === 'notify_payments'
                                ? !venueAccessNotifyPrefs.notify_payments
                                : venueAccessNotifyPrefs.notify_payments,
                            })}
                            disabled={venueAccessNotifyPrefs.loading || venueAccessNotifyPrefs.saving}
                            className={`px-2 py-1 rounded-md text-[11px] font-display font-bold border transition-colors disabled:opacity-60 ${
                              enabled
                                ? 'bg-piu-dark border-emerald-400/50 text-emerald-300'
                                : 'bg-piu-dark border-piu-border text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {enabled ? <span className="text-emerald-400">✓</span> : null}
                              <span>{option.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-gray-500 mt-1.5">
                      {venueAccessNotifyPrefs.loading && 'Loading venue access alerts...'}
                      {!venueAccessNotifyPrefs.loading && venueAccessNotifyPrefs.saving && 'Saving venue access alerts...'}
                      {!venueAccessNotifyPrefs.loading && !venueAccessNotifyPrefs.saving && venueAccessNotifyPrefs.subscribed && 'You will get notified about subscription events, day pass purchases, and payments received.'}
                      {!venueAccessNotifyPrefs.loading && !venueAccessNotifyPrefs.saving && !venueAccessNotifyPrefs.subscribed && 'Venue access alerts are off.'}
                    </p>
                  </div>
                </div>

                {notificationsError ? (
                  <p className="text-[10px] text-red-400 mt-2">{notificationsError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
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
            onSelectMonth={setSelectedMonth}
            onSelectWeekStart={setSelectedWeekStart}
          />
        </>
      ) : (
        <AdminVenueAccessTab />
      )}
    </div>
  );
}
