import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getMyVenueAccess,
  getVenueAccessPlans,
  purchaseDayPass,
  purchaseSubscription,
  cancelVenueSubscription,
  getVenueAccessConfig,
} from '../utils/api';

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
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const PLAN_TYPE_LABELS = {
  day_pass_weekday: 'Weekday Day Pass',
  day_pass_weekend: 'Weekend Day Pass',
  monthly: 'Monthly Membership',
};

export default function VenueAccessPanel({ venueSlug = 'london-pump-dojo' }) {
  const [access, setAccess] = useState(null);
  const [plans, setPlans] = useState([]);
  const [approved, setApproved] = useState(false);
  const [paymentsConfigured, setPaymentsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAccess();
  }, [venueSlug]);

  async function loadAccess() {
    setLoading(true);
    setError('');
    try {
      const [accessData, plansData, config] = await Promise.all([
        getMyVenueAccess(venueSlug),
        getVenueAccessPlans(venueSlug),
        getVenueAccessConfig(),
      ]);
      setAccess(accessData);
      setPlans(plansData.plans || []);
      setApproved(!!plansData.approved);
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
        setMessage('Day pass purchased');
        await loadAccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePurchaseSubscription(planId) {
    setPurchasing(true);
    setError('');
    try {
      const result = await purchaseSubscription(planId);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setMessage('Subscription started');
        await loadAccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm('Cancel your monthly subscription? You will retain access until the end of the current billing period.')) return;
    setCancelling(true);
    try {
      await cancelVenueSubscription(access.subscription.id);
      setMessage('Subscription cancelled');
      await loadAccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return null;

  const hasAccess = access?.has_access;
  const accessType = access?.access_type;

  // Separate plan types
  const dayPassPlans = plans.filter(p => p.plan_type.startsWith('day_pass_'));
  const monthlyPlans = plans.filter(p => p.plan_type === 'monthly');

  return (
    <div className="bg-piu-card border border-piu-border rounded-2xl p-4 sm:p-5">
      <h3 className="font-display font-bold text-sm sm:text-base text-white mb-3">Venue Access</h3>

      {error && <div className="bg-red-900/40 text-red-300 px-3 py-2 rounded-lg text-xs mb-3">{error}</div>}
      {message && <div className="bg-green-900/40 text-green-300 px-3 py-2 rounded-lg text-xs mb-3">{message}</div>}

      {/* Current access status */}
      <div className={`rounded-xl p-3 mb-3 border ${hasAccess ? 'bg-green-900/20 border-green-700/30' : 'bg-yellow-900/20 border-yellow-700/30'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${hasAccess ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-sm font-bold font-display">
            {hasAccess
              ? accessType === 'monthly'
                ? 'Monthly Member'
                : 'Day Pass Active'
              : 'No Active Access'}
          </span>
        </div>
        {hasAccess && access.subscription && (
          <div className="text-xs text-gray-400 mt-1">
            {access.subscription.plan_name} — valid until {formatDate(access.subscription.current_period_end)}
            <button onClick={handleCancelSubscription} disabled={cancelling}
              className="ml-2 text-red-400 hover:text-red-300 underline">
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        )}
        {!hasAccess && !approved && (
          <p className="text-xs text-gray-400 mt-1">
            You need to be approved by an admin before you can purchase access. Please contact the venue admin.
          </p>
        )}
      </div>

      {/* Active discounts */}
      {access?.discounts?.length > 0 && (
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 mb-3">
          <div className="text-xs font-bold text-purple-300">
            You have a discount: {access.discounts[0].discount_percent}% off
            {access.discounts[0].applies_to !== 'all' && ` (${access.discounts[0].applies_to === 'monthly' ? 'monthly only' : 'day passes only'})`}
            {access.discounts[0].note && <span className="text-purple-400 ml-1">— {access.discounts[0].note}</span>}
          </div>
        </div>
      )}

      {/* Upcoming day passes */}
      {access?.day_passes?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 font-bold mb-1">Your Day Passes</div>
          <div className="space-y-1">
            {access.day_passes.map(dp => (
              <div key={dp.id} className="flex items-center gap-2 text-xs bg-piu-dark/40 rounded-lg px-3 py-1.5">
                <span className="font-bold">{dp.pass_date}</span>
                <span className="text-gray-400">{dp.plan_name}</span>
                <span className={`ml-auto font-bold ${dp.status === 'used' ? 'text-blue-400' : 'text-green-400'}`}>{dp.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchase options — only shown if approved and not already subscribed */}
      {approved && !access?.subscription && (
        <div className="space-y-3">
          {/* Day Pass Purchase */}
          {dayPassPlans.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 font-bold mb-2">Buy a Day Pass</div>
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
                    className="w-full flex items-center justify-between bg-piu-dark/60 border border-piu-border/50 rounded-xl px-3 py-2.5 hover:border-piu-accent/50 transition-colors disabled:opacity-50">
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
            </div>
          )}

          {/* Monthly Subscription */}
          {monthlyPlans.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 font-bold mb-2">Monthly Membership</div>
              <div className="space-y-1.5">
                {monthlyPlans.map(plan => (
                  <button key={plan.id} onClick={() => handlePurchaseSubscription(plan.id)}
                    disabled={purchasing || !paymentsConfigured}
                    className="w-full flex items-center justify-between bg-piu-dark/60 border border-piu-border/50 rounded-xl px-3 py-2.5 hover:border-piu-accent/50 transition-colors disabled:opacity-50">
                    <div className="text-left">
                      <div className="text-sm font-bold">{plan.name}</div>
                      <div className="text-xs text-gray-400">Unlimited access / month</div>
                    </div>
                    <div className="text-right">
                      {plan.discount_percent > 0 ? (
                        <>
                          <span className="text-xs text-gray-500 line-through mr-1">{formatCurrency(plan.price_amount, plan.currency)}</span>
                          <span className="text-sm font-bold text-green-400">{formatCurrency(plan.discounted_amount, plan.currency)}</span>
                          <div className="text-[10px] text-green-400">{plan.discount_percent}% off</div>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-bold">{formatCurrency(plan.price_amount, plan.currency)}</span>
                          <div className="text-[10px] text-gray-500">/month</div>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!paymentsConfigured && (dayPassPlans.length > 0 || monthlyPlans.length > 0) && (
            <p className="text-xs text-yellow-400">Payment processing is not yet configured. Contact the venue admin.</p>
          )}
        </div>
      )}

      {/* Link to full membership page */}
      <div className="mt-3 text-center">
        <Link to="/membership" className="text-xs text-piu-accent hover:underline font-display font-bold">
          View Full Membership Dashboard
        </Link>
      </div>
    </div>
  );
}
