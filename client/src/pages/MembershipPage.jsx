import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import {
  getMyMembership,
  getVenueAccessConfig,
  purchaseDayPass,
  purchaseSubscription,
  cancelVenueSubscription,
} from '../utils/api';
import { getCadenceCycleSuffix, getCadenceIntervalLabel, getMonthlyCadenceOptions } from '../utils/venueAccess';

const VENUE_SLUG = 'london-pump-dojo';

function formatCurrency(amount, currency = 'gbp') {
  const val = (amount || 0) / 100;
  const sym = currency === 'gbp' ? '\u00A3' : currency === 'usd' ? '$' : currency === 'eur' ? '\u20AC' : '';
  return `${sym}${val.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'T12:00:00Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const PLAN_TYPE_LABELS = {
  day_pass_weekday: 'Weekday Pass',
  day_pass_weekend: 'Weekend Pass',
  monthly: 'Monthly',
};

const STATUS_COLORS = {
  active: 'text-green-400',
  used: 'text-blue-400',
  expired: 'text-gray-500',
  cancelled: 'text-red-400',
  refunded: 'text-orange-400',
  past_due: 'text-yellow-400',
  succeeded: 'text-green-400',
  pending: 'text-yellow-400',
  failed: 'text-red-400',
};

export default function MembershipPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [paymentsConfigured, setPaymentsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('status');
  const [purchasing, setPurchasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayString());

  useEffect(() => {
    if (!user) return;
    // Check for payment return
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      setMessage('Payment successful! Your access has been activated.');
    } else if (paymentStatus === 'cancelled') {
      setError('Payment was cancelled.');
    }
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [membership, config] = await Promise.all([
        getMyMembership(VENUE_SLUG),
        getVenueAccessConfig(),
      ]);
      setData(membership);
      setPaymentsConfigured(!!config.payments_configured);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchaseDayPass(planId) {
    setPurchasing(true);
    setError('');
    try {
      const result = await purchaseDayPass(planId, selectedDate);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setMessage('Day pass purchased!');
        await loadData();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePurchaseSubscription(planId, cadenceKey) {
    setPurchasing(true);
    setError('');
    try {
      const result = await purchaseSubscription(planId, cadenceKey);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setMessage('Subscription started!');
        await loadData();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm('Cancel your monthly subscription? You will retain access until the end of your current billing period.')) return;
    setCancelling(true);
    try {
      await cancelVenueSubscription(data.subscription.id);
      setMessage('Subscription cancelled. Access continues until the end of the current billing period.');
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="text-center py-12">
          <h2 className="font-display font-bold text-xl text-white mb-2">Membership</h2>
          <p className="text-gray-400 mb-4">Log in to view your membership.</p>
          <Link to="/login" className="text-piu-accent hover:underline font-display">Log In</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="text-center text-gray-500 py-12">Loading membership...</div>
      </div>
    );
  }

  const hasAccess = data?.has_access;
  const accessType = data?.access_type;
  const dayPassPlans = (data?.plans || []).filter(p => p.plan_type.startsWith('day_pass_'));
  const monthlyPlans = (data?.plans || []).filter(p => p.plan_type === 'monthly');
  const tabs = ['status', 'passes', 'payments'];
  if (!data?.subscription && data?.approved) tabs.splice(1, 0, 'subscribe');

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold text-lg sm:text-xl text-white">Membership</h1>
        <Link to="/checkin" className="text-xs text-piu-accent hover:underline font-display">
          Back to Check In
        </Link>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4 text-xs text-red-400">{error}</div>}
      {message && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 mb-4 text-xs text-green-400">{message} <button onClick={() => setMessage('')} className="underline ml-1">dismiss</button></div>}

      {/* Access Status Card */}
      <div className={`rounded-2xl p-4 sm:p-5 mb-4 border ${hasAccess ? 'bg-gradient-to-br from-green-900/20 to-emerald-900/10 border-green-700/30' : 'bg-gradient-to-br from-yellow-900/20 to-orange-900/10 border-yellow-700/30'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-3 h-3 rounded-full ${hasAccess ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-yellow-400'}`} />
          <h2 className="font-display font-bold text-base sm:text-lg">
            {hasAccess
              ? accessType === 'monthly'
                ? 'Active Monthly Member'
                : accessType === 'day_pass'
                  ? 'Day Pass Active'
                  : 'Pump Dojo Member'
              : 'No Active Access'}
          </h2>
        </div>

        {data?.venue && (
          <div className="text-sm text-gray-400 mb-2">{data.venue.name}</div>
        )}

        {/* Active subscription details */}
        {data?.subscription && (
          <div className="bg-piu-dark/40 rounded-xl p-3 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">{data.subscription.plan_name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {data.subscription.subscription_cadence_label
                    ? `${data.subscription.subscription_cadence_label} billing`
                    : `${formatCurrency(data.subscription.price_amount, data.subscription.currency)}/month`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Current period</div>
                <div className="text-xs font-bold">
                  {formatDate(data.subscription.current_period_start)} — {formatDate(data.subscription.current_period_end)}
                </div>
              </div>
            </div>
            {data.subscription.status === 'past_due' && (
              <div className="mt-2 text-xs text-yellow-400 font-bold">Payment overdue — please update your payment method</div>
            )}
            <button onClick={handleCancelSubscription} disabled={cancelling}
              className="mt-3 px-3 py-1.5 text-xs font-display font-bold text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50">
              {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          </div>
        )}

        {/* Group-only member message */}
        {accessType === 'group_member' && !data?.subscription && (
          <div className="text-xs text-gray-400 mt-2">
            You have access through your Pump Dojo Member group membership. Consider subscribing for uninterrupted access.
          </div>
        )}

        {!hasAccess && !data?.approved && (
          <div className="text-xs text-gray-400 mt-2">
            You need to be approved by an admin before you can purchase access. Please contact the venue admin.
          </div>
        )}
      </div>

      {/* Discounts */}
      {data?.discounts?.length > 0 && (
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 mb-4">
          <div className="text-xs font-bold text-purple-300 mb-1">Your Active Discounts</div>
          {data.discounts.map(d => (
            <div key={d.id} className="text-xs text-purple-400">
              {d.discount_percent}% off {d.applies_to === 'all' ? 'everything' : d.applies_to === 'monthly' ? 'monthly subscriptions' : 'day passes'}
              {d.note && <span className="text-purple-500 ml-1">— {d.note}</span>}
              {d.expires_at && <span className="text-purple-600 ml-1">(expires {formatDate(d.expires_at)})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-piu-card rounded-xl p-3 text-center">
          <div className="text-lg font-bold font-display">{formatCurrency(data?.stats?.total_spent || 0)}</div>
          <div className="text-[10px] text-gray-400">Total Spent</div>
        </div>
        <div className="bg-piu-card rounded-xl p-3 text-center">
          <div className="text-lg font-bold font-display">{data?.stats?.payment_count || 0}</div>
          <div className="text-[10px] text-gray-400">Payments</div>
        </div>
        <div className="bg-piu-card rounded-xl p-3 text-center">
          <div className="text-lg font-bold font-display">{data?.stats?.total_day_passes || 0}</div>
          <div className="text-[10px] text-gray-400">Day Passes</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-piu-dark/50 p-1 rounded-xl mb-4">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-display font-bold rounded-lg transition-colors ${
              tab === t ? 'bg-piu-card text-white shadow' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {t === 'status' ? 'Status' : t === 'subscribe' ? 'Subscribe' : t === 'passes' ? 'Day Passes' : 'Payments'}
          </button>
        ))}
      </div>

      {/* ── Status Tab ─────────────────────────────────────────────────── */}
      {tab === 'status' && (
        <div className="space-y-4">
          {/* Current/Past Subscriptions */}
          <div>
            <h3 className="text-sm font-display font-bold text-gray-300 mb-2">Subscription History</h3>
            {!data?.subscription && (data?.past_subscriptions || []).length === 0 ? (
              <p className="text-gray-500 text-sm">No subscription history.</p>
            ) : (
              <div className="space-y-1.5">
                {data?.subscription && (
                  <div className="flex items-center gap-3 bg-piu-card/60 rounded-lg px-3 py-2.5 border border-green-700/20">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{data.subscription.plan_name}</div>
                      <div className="text-xs text-gray-400">
                        {data.subscription.subscription_cadence_label
                          ? `${data.subscription.subscription_cadence_label} • `
                          : ''}
                        {formatDate(data.subscription.current_period_start)} — {formatDate(data.subscription.current_period_end)}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-green-400">ACTIVE</span>
                  </div>
                )}
                {data?.past_subscriptions?.map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 bg-piu-card/30 rounded-lg px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-300">{sub.plan_name}</div>
                      <div className="text-xs text-gray-500">
                        {sub.subscription_cadence_label ? `${sub.subscription_cadence_label} • ` : ''}
                        {formatDate(sub.current_period_start)} — {formatDate(sub.current_period_end)}
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${STATUS_COLORS[sub.status] || 'text-gray-500'}`}>{sub.status.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buy a Day Pass (quick action) */}
          {data?.approved && !data?.subscription && dayPassPlans.length > 0 && (
            <div>
              <h3 className="text-sm font-display font-bold text-gray-300 mb-2">Buy a Day Pass</h3>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-gray-400">Date:</label>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  min={todayString()}
                  className="bg-piu-dark border border-gray-700 rounded-lg px-2 py-1 text-xs text-white" />
              </div>
              <div className="space-y-1.5">
                {dayPassPlans.map(plan => (
                  <button key={plan.id} onClick={() => handlePurchaseDayPass(plan.id)}
                    disabled={purchasing || !paymentsConfigured}
                    className="w-full flex items-center justify-between bg-piu-card/60 border border-piu-border/50 rounded-xl px-3 py-2.5 hover:border-piu-accent/50 transition-colors disabled:opacity-50">
                    <div className="text-left">
                      <div className="text-sm font-bold">{plan.name}</div>
                      <div className="text-xs text-gray-400">{PLAN_TYPE_LABELS[plan.plan_type]}</div>
                    </div>
                    <div className="text-right">
                      {plan.discount_percent > 0 ? (
                        <>
                          <span className="text-xs text-gray-500 line-through mr-1">{formatCurrency(plan.price_amount, plan.currency)}</span>
                          <span className="text-sm font-bold text-green-400">{formatCurrency(plan.discounted_amount, plan.currency)}</span>
                        </>
                      ) : (
                        <span className="text-sm font-bold">{formatCurrency(plan.price_amount, plan.currency)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {!paymentsConfigured && <p className="text-xs text-yellow-400 mt-2">Payment processing is not yet configured.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Subscribe Tab ──────────────────────────────────────────────── */}
      {tab === 'subscribe' && (
        <div className="space-y-4">
          <h3 className="text-sm font-display font-bold text-gray-300 mb-2">Monthly Membership Plans</h3>
          <p className="text-xs text-gray-400 mb-3">Subscribe for unlimited access every month. Your subscription will automatically renew.</p>

          {monthlyPlans.length === 0 ? (
            <p className="text-gray-500 text-sm">No monthly plans are currently available.</p>
          ) : (
            <div className="space-y-2">
              {monthlyPlans.map(plan => {
                const cadenceOptions = getMonthlyCadenceOptions(plan);
                return (
                  <div key={plan.id} className="bg-piu-card border border-piu-border rounded-xl p-4">
                    <div className="mb-3">
                      <h4 className="font-bold text-base">{plan.name}</h4>
                      <div className="text-xs text-gray-400">Unlimited venue access with recurring billing options.</div>
                    </div>
                    <div className="space-y-2">
                      {cadenceOptions.map(cadence => {
                        const displayAmount = cadence.discount_percent > 0 ? cadence.discounted_amount : cadence.price_amount;
                        return (
                          <button
                            key={`${plan.id}-${cadence.key}`}
                            onClick={() => handlePurchaseSubscription(plan.id, cadence.key)}
                            disabled={purchasing || !paymentsConfigured}
                            className="w-full flex items-center justify-between bg-piu-dark/60 border border-piu-border/50 rounded-xl px-3 py-3 hover:border-piu-accent/50 transition-colors disabled:opacity-50"
                          >
                            <div className="text-left">
                              <div className="font-bold text-sm">{cadence.label}</div>
                              <div className="text-xs text-gray-400">{getCadenceIntervalLabel(cadence)}</div>
                            </div>
                            <div className="text-right">
                              {cadence.discount_percent > 0 ? (
                                <>
                                  <div className="text-xs text-gray-500 line-through">{formatCurrency(cadence.price_amount, cadence.currency)}</div>
                                  <div className="text-lg font-bold text-green-400">
                                    {formatCurrency(displayAmount, cadence.currency)}
                                    <span className="text-xs text-gray-400">{getCadenceCycleSuffix(cadence)}</span>
                                  </div>
                                  <div className="text-[10px] text-green-400">{cadence.discount_percent}% discount applied</div>
                                </>
                              ) : (
                                <div className="text-lg font-bold">
                                  {formatCurrency(displayAmount, cadence.currency)}
                                  <span className="text-xs text-gray-400">{getCadenceCycleSuffix(cadence)}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!paymentsConfigured && monthlyPlans.length > 0 && (
            <p className="text-xs text-yellow-400">Payment processing is not yet configured. Contact the venue admin.</p>
          )}
        </div>
      )}

      {/* ── Day Passes Tab ─────────────────────────────────────────────── */}
      {tab === 'passes' && (
        <div className="space-y-4">
          <h3 className="text-sm font-display font-bold text-gray-300 mb-2">Day Pass History</h3>
          {(data?.day_passes || []).length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No day passes yet.</p>
          ) : (
            <div className="space-y-1">
              {data.day_passes.map(dp => {
                const isToday = dp.pass_date === todayString();
                const isFuture = dp.pass_date > todayString();
                return (
                  <div key={dp.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isToday ? 'bg-piu-card/60 border border-green-700/20' : 'bg-piu-card/30'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{dp.pass_date}</div>
                      <div className="text-xs text-gray-400">{dp.plan_name} — {formatCurrency(dp.price_amount, dp.currency)}</div>
                    </div>
                    <span className={`text-xs font-bold ${
                      isToday ? 'text-green-400' :
                      isFuture ? 'text-blue-400' :
                      STATUS_COLORS[dp.status] || 'text-gray-500'
                    }`}>
                      {isToday ? 'TODAY' : isFuture ? 'UPCOMING' : dp.status.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Payments Tab ───────────────────────────────────────────────── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <h3 className="text-sm font-display font-bold text-gray-300 mb-2">Payment History</h3>
          {(data?.payments || []).length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No payments recorded.</p>
          ) : (
            <div className="space-y-1">
              {data.payments.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-piu-card/30 rounded-lg px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs">{p.description || p.plan_name || p.payment_type}</div>
                    <div className="text-[10px] text-gray-500">{formatDate(p.created_at)}</div>
                  </div>
                  <span className="font-bold text-sm">{formatCurrency(p.amount, p.currency)}</span>
                  <span className={`text-xs font-bold ${STATUS_COLORS[p.status] || 'text-gray-500'}`}>
                    {p.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
