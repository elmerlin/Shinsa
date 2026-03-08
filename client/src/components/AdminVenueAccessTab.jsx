import React, { useEffect, useRef, useState } from 'react';
import { getAvatarUrl } from './AvatarPicker';
import {
  getAdminVenueAccessOverview,
  getAdminVenueMemberDetail,
  getAdminVenueAccessPlans,
  createAdminVenueAccessPlan,
  updateAdminVenueAccessPlan,
  adminGrantDayPass,
  adminGrantSubscription,
  adminRevokeAccess,
  getAdminVenueDiscounts,
  adminGrantDiscount,
  adminRevokeDiscount,
  getAdminApprovedUsers,
  adminApproveUser,
  adminRemoveApprovedUser,
  searchUsers,
} from '../utils/api';
import { buildMonthlyCadenceDraft, getMonthlyCadenceOptions } from '../utils/venueAccess';

const VENUE_SLUG = 'london-pump-dojo';

function formatCurrency(amount, currency = 'gbp') {
  const val = (amount || 0) / 100;
  const sym = currency === 'gbp' ? '\u00A3' : currency === 'usd' ? '$' : currency === 'eur' ? '\u20AC' : '';
  return `${sym}${val.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr);
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + 'Z');
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(monthKey, offset) {
  const raw = String(monthKey || '').trim();
  const [year, month] = raw.split('-').map((part) => parseInt(part, 10));
  const next = new Date(Date.UTC(year, (month || 1) - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatAverageVisits(value) {
  const num = Number(value || 0);
  if (num === 0) return '0';
  return num >= 10 ? num.toFixed(0) : num.toFixed(1);
}

const PLAN_TYPE_LABELS = {
  day_pass_weekday: 'Day Pass (Weekday)',
  day_pass_weekend: 'Day Pass (Weekend)',
  monthly: 'Monthly Subscription',
};

function buildEmptyPlanForm() {
  return {
    plan_type: 'day_pass_weekday',
    name: '',
    price_amount: '',
    currency: 'gbp',
    square_plan_variation_id: '',
    monthly_cadences: [buildMonthlyCadenceDraft({ label: 'Monthly', months: 1 }, 'gbp')],
  };
}

export default function AdminVenueAccessTab() {
  const [subTab, setSubTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [overviewPanel, setOverviewPanel] = useState('');
  const [selectedSubscriberId, setSelectedSubscriberId] = useState('');
  const [subscriberDetail, setSubscriberDetail] = useState(null);
  const [subscriberDetailLoading, setSubscriberDetailLoading] = useState(false);
  const monthStripRef = useRef(null);

  // Plans state
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(buildEmptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);

  // Approved users state
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [approveSearchQuery, setApproveSearchQuery] = useState('');
  const [approveSearchResults, setApproveSearchResults] = useState([]);
  const [approveNote, setApproveNote] = useState('');
  const approveSearchRef = useRef(null);

  // Discounts state
  const [discounts, setDiscounts] = useState([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountForm, setDiscountForm] = useState({ user_id: '', discount_percent: 10, applies_to: 'all', note: '' });
  const [discountSearchQuery, setDiscountSearchQuery] = useState('');
  const [discountSearchResults, setDiscountSearchResults] = useState([]);
  const discountSearchRef = useRef(null);

  // Grant access state
  const [grantType, setGrantType] = useState('day_pass');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantSearchQuery, setGrantSearchQuery] = useState('');
  const [grantSearchResults, setGrantSearchResults] = useState([]);
  const [grantPassDate, setGrantPassDate] = useState('');
  const [grantMonths, setGrantMonths] = useState(1);
  const [grantSaving, setGrantSaving] = useState(false);
  const grantSearchRef = useRef(null);

  useEffect(() => {
    loadOverview();
  }, [selectedMonth]);

  useEffect(() => {
    if (subTab === 'approved') loadApprovedUsers();
    if (subTab === 'discounts') loadDiscounts();
    if (subTab === 'plans') loadPlans();
  }, [subTab]);

  useEffect(() => {
    if (!monthStripRef.current) return;
    const target = monthStripRef.current.querySelector(`[data-month-key="${selectedMonth}"]`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [overview, selectedMonth]);

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminVenueAccessOverview(VENUE_SLUG, selectedMonth);
      setOverview(data);
      setPlans(data.plans || []);
    } catch (err) {
      setError(err.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }

  async function loadPlans() {
    try {
      const data = await getAdminVenueAccessPlans(VENUE_SLUG);
      setPlans(data.plans || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadApprovedUsers() {
    setApprovedLoading(true);
    try {
      const data = await getAdminApprovedUsers(VENUE_SLUG);
      setApprovedUsers(data.approved_users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setApprovedLoading(false);
    }
  }

  async function loadDiscounts() {
    setDiscountsLoading(true);
    try {
      const data = await getAdminVenueDiscounts(VENUE_SLUG);
      setDiscounts(data.discounts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setDiscountsLoading(false);
    }
  }

  // User search helper (shared logic)
  function useUserSearch(query, setResults, ref) {
    useEffect(() => {
      const q = query.trim();
      if (q.length < 2) { setResults([]); return; }
      let cancelled = false;
      const timer = setTimeout(async () => {
        try {
          const data = await searchUsers(q);
          if (!cancelled) setResults(Array.isArray(data) ? data : data?.users || []);
        } catch { if (!cancelled) setResults([]); }
      }, 300);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [query]);
  }

  useUserSearch(approveSearchQuery, setApproveSearchResults, approveSearchRef);
  useUserSearch(discountSearchQuery, setDiscountSearchResults, discountSearchRef);
  useUserSearch(grantSearchQuery, setGrantSearchResults, grantSearchRef);

  // ── Plan management ───────────────────────────────────────────────────
  async function handleSavePlan(e) {
    e.preventDefault();
    setPlanSaving(true);
    setMessage('');
    try {
      let payload;
      if (planForm.plan_type === 'monthly') {
        const monthlyCadences = (planForm.monthly_cadences || [])
          .map((cadence, index) => {
            const priceInPence = Math.round(parseFloat(cadence.price_amount) * 100);
            if (isNaN(priceInPence) || priceInPence < 0) {
              throw new Error(`Invalid price for cadence #${index + 1}`);
            }
            const months = Math.max(1, parseInt(cadence.months, 10) || 0);
            const label = String(cadence.label || '').trim() || (months === 1 ? 'Monthly' : `${months} months`);
            return {
              key: String(cadence.key || '').trim(),
              label,
              months,
              price_amount: priceInPence,
              currency: planForm.currency,
              square_plan_variation_id: String(cadence.square_plan_variation_id || '').trim(),
            };
          })
          .filter((cadence) => cadence.label && cadence.price_amount >= 0);
        if (monthlyCadences.length === 0) throw new Error('Add at least one monthly billing option');
        payload = {
          name: planForm.name,
          price_amount: monthlyCadences[0].price_amount,
          currency: planForm.currency,
          square_plan_variation_id: monthlyCadences[0].square_plan_variation_id || undefined,
          monthly_cadences: monthlyCadences,
        };
      } else {
        const priceInPence = Math.round(parseFloat(planForm.price_amount) * 100);
        if (isNaN(priceInPence) || priceInPence < 0) throw new Error('Invalid price');
        payload = {
          name: planForm.name,
          price_amount: priceInPence,
          currency: planForm.currency,
          square_plan_variation_id: planForm.square_plan_variation_id || undefined,
        };
      }

      if (editingPlanId) {
        await updateAdminVenueAccessPlan(editingPlanId, payload);
        setMessage('Plan updated');
      } else {
        await createAdminVenueAccessPlan({
          venue_id: overview?.venue?.id,
          plan_type: planForm.plan_type,
          ...payload,
        });
        setMessage('Plan created');
      }
      setPlanForm(buildEmptyPlanForm());
      setEditingPlanId(null);
      await loadPlans();
    } catch (err) {
      setError(err.message);
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleTogglePlan(plan) {
    try {
      await updateAdminVenueAccessPlan(plan.id, { active: !plan.active });
      await loadPlans();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditPlan(plan) {
    const monthlyCadences = getMonthlyCadenceOptions(plan).map((cadence) =>
      buildMonthlyCadenceDraft(cadence, cadence.currency || plan.currency || 'gbp'),
    );
    setEditingPlanId(plan.id);
    setPlanForm({
      plan_type: plan.plan_type,
      name: plan.name,
      price_amount: (plan.price_amount / 100).toFixed(2),
      currency: plan.currency,
      square_plan_variation_id: plan.square_plan_variation_id || '',
      monthly_cadences: monthlyCadences.length > 0
        ? monthlyCadences
        : [buildMonthlyCadenceDraft({ label: 'Monthly', months: 1 }, plan.currency || 'gbp')],
    });
  }

  // ── Approved user management ─────────────────────────────────────────
  async function handleApproveUser(user) {
    try {
      await adminApproveUser({ user_id: user.id, venue_id: overview?.venue?.id, note: approveNote.trim() || undefined });
      setMessage(`${user.username} approved`);
      setApproveSearchQuery('');
      setApproveNote('');
      await loadApprovedUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemoveApproval(userId) {
    if (!confirm('Remove this user from the approved list?')) return;
    try {
      await adminRemoveApprovedUser(overview?.venue?.id, userId);
      setMessage('User removed from approved list');
      await loadApprovedUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Discount management ──────────────────────────────────────────────
  async function handleGrantDiscount() {
    if (!discountForm.user_id) { setError('Select a user first'); return; }
    try {
      await adminGrantDiscount({
        user_id: discountForm.user_id,
        venue_id: overview?.venue?.id,
        discount_percent: discountForm.discount_percent,
        applies_to: discountForm.applies_to,
        note: discountForm.note.trim() || undefined,
      });
      setMessage('Discount granted');
      setDiscountForm({ user_id: '', discount_percent: 10, applies_to: 'all', note: '' });
      setDiscountSearchQuery('');
      await loadDiscounts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevokeDiscount(discountId) {
    try {
      await adminRevokeDiscount(discountId);
      setMessage('Discount revoked');
      await loadDiscounts();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Grant access ─────────────────────────────────────────────────────
  async function handleGrantAccess() {
    if (!grantUserId) { setError('Select a user first'); return; }
    setGrantSaving(true);
    try {
      const dayPassPlans = plans.filter(p => p.plan_type.startsWith('day_pass_') && p.active);
      const monthlyPlans = plans.filter(p => p.plan_type === 'monthly' && p.active);

      if (grantType === 'day_pass') {
        if (!grantPassDate) { setError('Select a date'); setGrantSaving(false); return; }
        const plan = dayPassPlans[0];
        if (!plan) { setError('No day pass plan configured'); setGrantSaving(false); return; }
        await adminGrantDayPass({
          user_id: grantUserId,
          venue_id: overview?.venue?.id,
          plan_id: plan.id,
          pass_date: grantPassDate,
        });
        setMessage('Day pass granted');
      } else {
        const plan = monthlyPlans[0];
        if (!plan) { setError('No monthly plan configured'); setGrantSaving(false); return; }
        await adminGrantSubscription({
          user_id: grantUserId,
          venue_id: overview?.venue?.id,
          plan_id: plan.id,
          period_months: grantMonths,
        });
        setMessage('Subscription granted');
      }
      setGrantUserId('');
      setGrantSearchQuery('');
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setGrantSaving(false);
    }
  }

  async function handleRevoke(type, id) {
    if (!confirm(`Revoke this ${type === 'day_pass' ? 'day pass' : 'subscription'}?`)) return;
    try {
      await adminRevokeAccess(type, id);
      setMessage('Access revoked');
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectSubscriber(userId) {
    setSelectedSubscriberId(String(userId));
    setSubscriberDetailLoading(true);
    setSubscriberDetail(null);
    try {
      const data = await getAdminVenueMemberDetail(VENUE_SLUG, userId);
      setSubscriberDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load subscriber history');
    } finally {
      setSubscriberDetailLoading(false);
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-400">Loading venue access data...</div>;

  const subTabs = ['overview', 'plans', 'approved', 'discounts', 'grant', 'payments'];
  const selectedMonthLabel = overview?.selected_month_label || 'Selected month';
  const isCurrentMonth = selectedMonth === currentMonthKey();
  const groupedDayPasses = Object.entries(
    (overview?.day_passes || []).reduce((acc, pass) => {
      const key = pass.pass_date || 'Unknown date';
      if (!acc[key]) acc[key] = [];
      acc[key].push(pass);
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-900/40 text-red-300 px-4 py-2 rounded-lg text-sm">{error} <button onClick={() => setError('')} className="ml-2 underline">dismiss</button></div>}
      {message && <div className="bg-green-900/40 text-green-300 px-4 py-2 rounded-lg text-sm">{message} <button onClick={() => setMessage('')} className="ml-2 underline">dismiss</button></div>}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              subTab === t ? 'bg-piu-accent text-white' : 'bg-piu-card/60 text-gray-400 hover:text-white'
            }`}>
            {t === 'overview' ? 'Overview' : t === 'plans' ? 'Pricing' : t === 'approved' ? 'Approved Users' : t === 'discounts' ? 'Discounts' : t === 'grant' ? 'Grant Access' : 'Payments'}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {subTab === 'overview' && overview && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">{overview.venue?.name} — Access Overview</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400">Select a month to drill into venue access activity.</p>
              <span className="text-xs text-gray-500">{selectedMonthLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonthKey(prev, -1))}
                className="rounded-lg border border-piu-border/60 bg-piu-card/50 px-3 py-2 text-xs font-display font-bold text-gray-200 hover:border-piu-accent/50 hover:text-white"
              >
                Older
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth((prev) => (prev === currentMonthKey() ? prev : shiftMonthKey(prev, 1)))}
                disabled={isCurrentMonth}
                className="rounded-lg border border-piu-border/60 bg-piu-card/50 px-3 py-2 text-xs font-display font-bold text-gray-200 hover:border-piu-accent/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Newer
              </button>
              <span className="text-[11px] text-gray-500">Scroll the month strip or move one month at a time.</span>
            </div>
            <div ref={monthStripRef} className="flex gap-3 overflow-x-auto pb-2">
              {(overview.month_cards || []).map((monthCard) => (
                <button
                  key={monthCard.month_key}
                  type="button"
                  onClick={() => setSelectedMonth(monthCard.month_key)}
                  data-month-key={monthCard.month_key}
                  className={`min-w-[180px] shrink-0 rounded-2xl border p-3 text-left transition-colors ${
                    monthCard.selected
                      ? 'border-piu-accent bg-piu-accent/10'
                      : 'border-piu-border/50 bg-piu-card/50 hover:border-piu-accent/45'
                  }`}
                >
                  <div className="flex h-full min-h-[156px] flex-col">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">{monthCard.month_label}</div>
                    <div className="mt-2 text-lg font-display font-bold text-white">{formatCurrency(monthCard.revenue)}</div>
                    <div className="mt-auto space-y-1 text-[11px] text-gray-400">
                      <div>{monthCard.subscription_count} subs</div>
                      <div>{monthCard.day_pass_count} day passes</div>
                      <div>{monthCard.payment_count} payments</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: `${selectedMonthLabel} Revenue`, value: formatCurrency(overview.stats?.selected_month_revenue) },
              { label: `${selectedMonthLabel} Payments`, value: overview.stats?.selected_month_payments || 0 },
            ].map((s) => (
              <div key={s.label} className="bg-piu-card rounded-lg p-3 text-center">
                <div className="text-2xl font-bold font-display">{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOverviewPanel((prev) => (prev === 'day_passes' ? '' : 'day_passes'))}
              className={`rounded-lg p-3 text-center transition-colors ${
                overviewPanel === 'day_passes'
                  ? 'bg-piu-accent/10 ring-1 ring-piu-accent'
                  : 'bg-piu-card hover:bg-piu-card/80'
              }`}
            >
              <div className="text-2xl font-bold font-display">{overview.stats?.selected_month_day_passes || 0}</div>
              <div className="text-xs text-gray-400">{selectedMonthLabel} Day Passes</div>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setOverviewPanel((prev) => (prev === 'active_subscribers' ? '' : 'active_subscribers'))}
              className={`rounded-lg p-3 text-center transition-colors ${
                overviewPanel === 'active_subscribers'
                  ? 'bg-piu-accent/10 ring-1 ring-piu-accent'
                  : 'bg-piu-card hover:bg-piu-card/80'
              }`}
            >
              <div className="text-2xl font-bold font-display">{overview.stats?.active_subscriptions || 0}</div>
              <div className="text-xs text-gray-400">Active Subscribers</div>
            </button>
            <div className="bg-piu-card rounded-lg p-3 text-center">
              <div className="text-2xl font-bold font-display">{formatCurrency(overview.stats?.total_revenue)}</div>
              <div className="text-xs text-gray-400">Total Revenue</div>
            </div>
          </div>

          {overviewPanel === 'day_passes' && (
            <div className="rounded-2xl border border-piu-border/50 bg-piu-card/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-display font-bold text-gray-200">
                  {selectedMonthLabel} Day Passes ({overview.day_passes?.length || 0})
                </h4>
                <span className="text-xs text-gray-500">Each entry shows the day pass date and the purchase/grant timestamp.</span>
              </div>
              {groupedDayPasses.length === 0 ? (
                <p className="text-gray-500 text-sm">No day passes recorded in this month.</p>
              ) : (
                <div className="space-y-4">
                  {groupedDayPasses.map(([passDate, passes]) => (
                    <div key={passDate} className="space-y-2">
                      <div className="text-xs font-display font-bold uppercase tracking-wide text-piu-accent">
                        {formatDate(passDate)}
                      </div>
                      <div className="space-y-1">
                        {passes.map((dp) => (
                          <div key={dp.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-piu-card/60 px-3 py-2 text-sm">
                            <img src={getAvatarUrl(dp.avatar)} alt="" className="h-7 w-7 rounded-full" />
                            <span className="min-w-0 font-bold text-white">{dp.username}</span>
                            <span className="text-xs text-gray-400">{dp.plan_name}</span>
                            <span className="text-xs text-gray-500">Logged {formatDateTime(dp.created_at)}</span>
                            <span className={`ml-auto text-xs font-bold ${dp.status === 'used' ? 'text-blue-400' : 'text-green-400'}`}>
                              {dp.status.toUpperCase()}
                            </span>
                            <button onClick={() => handleRevoke('day_pass', dp.id)} className="text-xs text-red-400 hover:text-red-300">Revoke</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {overviewPanel === 'active_subscribers' && (
            <div className="rounded-2xl border border-piu-border/50 bg-piu-card/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-display font-bold text-gray-200">
                  Active Subscribers ({overview.active_subscribers?.length || 0})
                </h4>
                <span className="text-xs text-gray-500">Click a subscriber to inspect subscription history, venue usage, and lifetime value.</span>
              </div>
              {overview.active_subscribers?.length === 0 ? (
                <p className="text-gray-500 text-sm">There are no active subscribers right now.</p>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    {overview.active_subscribers.map((sub) => (
                      <div
                        key={sub.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          selectedSubscriberId === String(sub.user_id)
                            ? 'bg-piu-accent/10 ring-1 ring-piu-accent'
                            : 'bg-piu-card/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectSubscriber(sub.user_id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <img src={getAvatarUrl(sub.avatar)} alt="" className="h-8 w-8 rounded-full" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold text-white">{sub.username}</div>
                            <div className="truncate text-xs text-gray-400">
                              {sub.subscription_cadence_label || sub.plan_name}
                              {sub.current_period_end ? ` • renews ${formatDate(sub.current_period_end)}` : ''}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke('subscription', sub.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-piu-border/40 bg-piu-dark/50 p-4">
                    {!selectedSubscriberId ? (
                      <p className="text-sm text-gray-500">Select a subscriber from the list to see their history.</p>
                    ) : subscriberDetailLoading ? (
                      <p className="text-sm text-gray-400">Loading subscriber history...</p>
                    ) : !subscriberDetail ? (
                      <p className="text-sm text-gray-500">Subscriber details unavailable.</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <img src={getAvatarUrl(subscriberDetail.member?.avatar)} alt="" className="h-12 w-12 rounded-full" />
                          <div>
                            <div className="text-lg font-display font-bold text-white">{subscriberDetail.member?.username}</div>
                            <div className="text-xs text-gray-400">
                              Started {formatDate(subscriberDetail.member?.first_subscribed_at)}
                              {subscriberDetail.member?.active_subscription?.subscription_cadence_label
                                ? ` • ${subscriberDetail.member.active_subscription.subscription_cadence_label}`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            {
                              label: 'Subscribed Since',
                              value: formatDate(subscriberDetail.member?.first_subscribed_at),
                            },
                            {
                              label: 'Months Subscribed',
                              value: subscriberDetail.member?.total_subscribed_months || 0,
                            },
                            {
                              label: 'Avg Visits / Week',
                              value: formatAverageVisits(subscriberDetail.member?.average_visits_per_week),
                            },
                            {
                              label: 'Total Money Spent',
                              value: formatCurrency(
                                subscriberDetail.member?.total_spent,
                                subscriberDetail.payments?.[0]?.currency || 'gbp',
                              ),
                            },
                          ].map((item) => (
                            <div key={item.label} className="rounded-lg bg-piu-card/60 p-3 text-center">
                              <div className="text-xl font-display font-bold text-white">{item.value}</div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500">{item.label}</div>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                          <div className="space-y-2">
                            <h5 className="text-xs font-display font-bold uppercase tracking-wide text-gray-400">Subscription History</h5>
                            {subscriberDetail.subscriptions?.length === 0 ? (
                              <p className="text-sm text-gray-500">No subscriptions recorded.</p>
                            ) : (
                              <div className="space-y-1">
                                {subscriberDetail.subscriptions.map((sub) => (
                                  <div key={sub.id} className="rounded-lg bg-piu-card/60 px-3 py-2 text-sm">
                                    <div className="font-bold text-white">{sub.subscription_cadence_label || sub.plan_name}</div>
                                    <div className="text-xs text-gray-400">
                                      {formatDate(sub.created_at)}
                                      {sub.current_period_end ? ` → ${formatDate(sub.current_period_end)}` : ''}
                                    </div>
                                    <div className="text-xs text-gray-500">{sub.status}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <h5 className="text-xs font-display font-bold uppercase tracking-wide text-gray-400">Payments</h5>
                            {subscriberDetail.payments?.length === 0 ? (
                              <p className="text-sm text-gray-500">No payments recorded.</p>
                            ) : (
                              <div className="space-y-1">
                                {subscriberDetail.payments.slice(0, 10).map((payment) => (
                                  <div key={payment.id} className="rounded-lg bg-piu-card/60 px-3 py-2 text-sm">
                                    <div className="font-bold text-white">
                                      {formatCurrency(payment.amount, payment.currency)}
                                    </div>
                                    <div className="text-xs text-gray-400">{payment.description || payment.payment_type}</div>
                                    <div className="text-xs text-gray-500">{formatDateTime(payment.created_at)}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <h5 className="text-xs font-display font-bold uppercase tracking-wide text-gray-400">Venue Visits</h5>
                            {subscriberDetail.checkins?.length === 0 ? (
                              <p className="text-sm text-gray-500">No venue check-ins recorded.</p>
                            ) : (
                              <div className="space-y-1">
                                {subscriberDetail.checkins.slice(0, 12).map((checkin) => (
                                  <div key={checkin.id} className="rounded-lg bg-piu-card/60 px-3 py-2 text-sm">
                                    <div className="font-bold text-white">{checkin.machine_name || 'Venue access'}</div>
                                    <div className="text-xs text-gray-400">{formatDateTime(checkin.checked_in_at)}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Payments */}
          <div>
            <h4 className="text-sm font-display font-bold text-gray-300 mb-2">{selectedMonthLabel} Payments</h4>
            {overview.payments?.length === 0 ? (
              <p className="text-gray-500 text-sm">No payments recorded in this month.</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {overview.payments?.slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-piu-card/50 rounded-lg px-3 py-2 text-sm">
                    <img src={getAvatarUrl(p.avatar)} alt="" className="w-6 h-6 rounded-full" />
                    <span className="font-bold min-w-0 truncate text-xs">{p.username}</span>
                    <span className="text-gray-400 text-xs">{p.description || p.payment_type}</span>
                    <span className="ml-auto font-bold text-xs">{formatCurrency(p.amount, p.currency)}</span>
                    <span className={`text-xs ${p.status === 'succeeded' ? 'text-green-400' : p.status === 'pending' ? 'text-yellow-400' : 'text-red-400'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pricing Plans ────────────────────────────────────────────────── */}
      {subTab === 'plans' && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">Pricing Plans</h3>

          <form onSubmit={handleSavePlan} className="bg-piu-card rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-300">{editingPlanId ? 'Edit Plan' : 'Create New Plan'}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Plan Type</label>
                <select value={planForm.plan_type} onChange={e => setPlanForm(f => ({ ...f, plan_type: e.target.value }))}
                  disabled={!!editingPlanId}
                  className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="day_pass_weekday">Day Pass (Weekday)</option>
                  <option value="day_pass_weekend">Day Pass (Weekend)</option>
                  <option value="monthly">Monthly Subscription</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Name</label>
                <input value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard Day Pass" required
                  className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              {planForm.plan_type !== 'monthly' && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Price ({planForm.currency.toUpperCase()})</label>
                    <input type="number" step="0.01" min="0" value={planForm.price_amount}
                      onChange={e => setPlanForm(f => ({ ...f, price_amount: e.target.value }))}
                      placeholder="5.00" required
                      className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Square Plan Variation ID (optional)</label>
                    <input value={planForm.square_plan_variation_id} onChange={e => setPlanForm(f => ({ ...f, square_plan_variation_id: e.target.value }))}
                      placeholder="price_..."
                      className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                </>
              )}
            </div>
            {planForm.plan_type === 'monthly' && (
              <div className="space-y-3 rounded-xl border border-piu-border/50 bg-piu-dark/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-200">Billing options</div>
                    <div className="text-xs text-gray-500">Add one Square subscription variation per billing cadence.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlanForm(f => ({
                      ...f,
                      monthly_cadences: [...(f.monthly_cadences || []), buildMonthlyCadenceDraft({}, f.currency)],
                    }))}
                    className="px-3 py-1.5 rounded-lg bg-piu-accent/20 text-piu-accent text-xs font-bold"
                  >
                    Add cadence
                  </button>
                </div>
                <div className="space-y-3">
                  {(planForm.monthly_cadences || []).map((cadence, index) => (
                    <div key={`cadence-${index}`} className="rounded-xl border border-piu-border/40 bg-piu-card/40 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-gray-300">Cadence #{index + 1}</div>
                        {(planForm.monthly_cadences || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPlanForm(f => ({
                              ...f,
                              monthly_cadences: f.monthly_cadences.filter((_, rowIndex) => rowIndex !== index),
                            }))}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Label</label>
                          <input
                            value={cadence.label}
                            onChange={e => setPlanForm(f => ({
                              ...f,
                              monthly_cadences: f.monthly_cadences.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row),
                            }))}
                            placeholder="Monthly"
                            className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Months per billing cycle</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={cadence.months}
                            onChange={e => setPlanForm(f => ({
                              ...f,
                              monthly_cadences: f.monthly_cadences.map((row, rowIndex) => rowIndex === index ? { ...row, months: e.target.value } : row),
                            }))}
                            className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Price ({planForm.currency.toUpperCase()})</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cadence.price_amount}
                            onChange={e => setPlanForm(f => ({
                              ...f,
                              monthly_cadences: f.monthly_cadences.map((row, rowIndex) => rowIndex === index ? { ...row, price_amount: e.target.value } : row),
                            }))}
                            placeholder="110.00"
                            className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Square Plan Variation ID</label>
                          <input
                            value={cadence.square_plan_variation_id}
                            onChange={e => setPlanForm(f => ({
                              ...f,
                              monthly_cadences: f.monthly_cadences.map((row, rowIndex) => rowIndex === index ? { ...row, square_plan_variation_id: e.target.value } : row),
                            }))}
                            placeholder="..."
                            className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={planSaving}
                className="px-4 py-2 bg-piu-accent text-white rounded-lg text-sm font-bold hover:bg-piu-accent/80 disabled:opacity-50">
                {planSaving ? 'Saving...' : editingPlanId ? 'Update Plan' : 'Create Plan'}
              </button>
              {editingPlanId && (
                <button type="button" onClick={() => { setEditingPlanId(null); setPlanForm(buildEmptyPlanForm()); }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm">Cancel</button>
              )}
            </div>
          </form>

          <div className="space-y-2">
            {plans.map(plan => {
              const cadenceOptions = plan.plan_type === 'monthly' ? getMonthlyCadenceOptions(plan) : [];
              return (
              <div key={plan.id} className={`flex items-center gap-3 bg-piu-card/50 rounded-lg px-4 py-3 ${!plan.active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{plan.name}</div>
                  <div className="text-xs text-gray-400">{PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type}</div>
                  {cadenceOptions.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-1 truncate">
                      {cadenceOptions.map((cadence) => `${cadence.label} ${formatCurrency(cadence.price_amount, cadence.currency)}`).join(' • ')}
                    </div>
                  )}
                </div>
                <span className="font-bold text-lg">{formatCurrency(plan.price_amount, plan.currency)}</span>
                <button onClick={() => startEditPlan(plan)} className="text-blue-400 text-xs hover:text-blue-300">Edit</button>
                <button onClick={() => handleTogglePlan(plan)} className={`text-xs ${plan.active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}>
                  {plan.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            )})}
            {plans.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No plans configured yet. Create one above.</p>}
          </div>
        </div>
      )}

      {/* ── Approved Users (Whitelist) ───────────────────────────────────── */}
      {subTab === 'approved' && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">Approved Users</h3>
          <p className="text-xs text-gray-400">Users must be approved before they can purchase day passes or subscriptions.</p>

          {/* Add user */}
          <div className="bg-piu-card rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-300">Approve a User</h4>
            <div className="relative" ref={approveSearchRef}>
              <input value={approveSearchQuery} onChange={e => setApproveSearchQuery(e.target.value)}
                placeholder="Search for a user..."
                className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              {approveSearchResults.length > 0 && approveSearchQuery.length >= 2 && (
                <div className="absolute z-10 w-full mt-1 bg-piu-dark border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                  {approveSearchResults.slice(0, 8).map(u => (
                    <button key={u.id} onClick={() => handleApproveUser(u)}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-piu-card/50 text-left text-sm">
                      <img src={getAvatarUrl(u.avatar)} alt="" className="w-6 h-6 rounded-full" />
                      <span>{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input value={approveNote} onChange={e => setApproveNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          {/* List */}
          {approvedLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : (
            <div className="space-y-1">
              {approvedUsers.map(u => (
                <div key={u.user_id} className="flex items-center gap-3 bg-piu-card/50 rounded-lg px-3 py-2 text-sm">
                  <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full" />
                  <span className="font-bold">{u.username}</span>
                  {u.note && <span className="text-gray-500 text-xs truncate">— {u.note}</span>}
                  <span className="text-gray-500 text-xs ml-auto">{formatDate(u.created_at)}</span>
                  <span className="text-gray-500 text-xs">by {u.approved_by_username}</span>
                  <button onClick={() => handleRemoveApproval(u.user_id)} className="text-red-400 text-xs hover:text-red-300">Remove</button>
                </div>
              ))}
              {approvedUsers.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No approved users yet.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Discounts ────────────────────────────────────────────────────── */}
      {subTab === 'discounts' && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">User Discounts</h3>

          <div className="bg-piu-card rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-300">Grant a Discount</h4>
            <div className="relative" ref={discountSearchRef}>
              <input value={discountSearchQuery} onChange={e => { setDiscountSearchQuery(e.target.value); setDiscountForm(f => ({ ...f, user_id: '' })); }}
                placeholder="Search for a user..."
                className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              {discountSearchResults.length > 0 && discountSearchQuery.length >= 2 && !discountForm.user_id && (
                <div className="absolute z-10 w-full mt-1 bg-piu-dark border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                  {discountSearchResults.slice(0, 8).map(u => (
                    <button key={u.id} onClick={() => { setDiscountForm(f => ({ ...f, user_id: u.id })); setDiscountSearchQuery(u.username); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-piu-card/50 text-left text-sm">
                      <img src={getAvatarUrl(u.avatar)} alt="" className="w-6 h-6 rounded-full" />
                      <span>{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Discount %</label>
                <select value={discountForm.discount_percent} onChange={e => setDiscountForm(f => ({ ...f, discount_percent: parseInt(e.target.value) }))}
                  className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value={10}>10%</option>
                  <option value={20}>20%</option>
                  <option value={50}>50%</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Applies to</label>
                <select value={discountForm.applies_to} onChange={e => setDiscountForm(f => ({ ...f, applies_to: e.target.value }))}
                  className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="all">All</option>
                  <option value="monthly">Monthly only</option>
                  <option value="day_pass">Day passes only</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Note</label>
                <input value={discountForm.note} onChange={e => setDiscountForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional"
                  className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <button onClick={handleGrantDiscount} disabled={!discountForm.user_id}
              className="px-4 py-2 bg-piu-accent text-white rounded-lg text-sm font-bold hover:bg-piu-accent/80 disabled:opacity-50">
              Grant Discount
            </button>
          </div>

          {discountsLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : (
            <div className="space-y-1">
              {discounts.map(d => (
                <div key={d.id} className={`flex items-center gap-3 bg-piu-card/50 rounded-lg px-3 py-2 text-sm ${!d.active ? 'opacity-50' : ''}`}>
                  <img src={getAvatarUrl(d.avatar)} alt="" className="w-7 h-7 rounded-full" />
                  <span className="font-bold">{d.username}</span>
                  <span className="text-green-400 font-bold">{d.discount_percent}% off</span>
                  <span className="text-gray-400 text-xs">{d.applies_to === 'all' ? 'Everything' : d.applies_to === 'monthly' ? 'Monthly' : 'Day passes'}</span>
                  {d.note && <span className="text-gray-500 text-xs truncate">— {d.note}</span>}
                  {d.active ? (
                    <button onClick={() => handleRevokeDiscount(d.id)} className="ml-auto text-red-400 text-xs hover:text-red-300">Revoke</button>
                  ) : (
                    <span className="ml-auto text-gray-500 text-xs">Revoked</span>
                  )}
                </div>
              ))}
              {discounts.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No discounts granted yet.</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Grant Access ─────────────────────────────────────────────────── */}
      {subTab === 'grant' && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">Grant Access Manually</h3>
          <p className="text-xs text-gray-400">Manually grant a day pass or subscription to a user (no payment required).</p>

          <div className="bg-piu-card rounded-lg p-4 space-y-3">
            <div className="flex gap-3">
              <button onClick={() => setGrantType('day_pass')}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold ${grantType === 'day_pass' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400'}`}>
                Day Pass
              </button>
              <button onClick={() => setGrantType('subscription')}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold ${grantType === 'subscription' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400'}`}>
                Subscription
              </button>
            </div>

            <div className="relative" ref={grantSearchRef}>
              <input value={grantSearchQuery} onChange={e => { setGrantSearchQuery(e.target.value); setGrantUserId(''); }}
                placeholder="Search for a user..."
                className="w-full bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              {grantSearchResults.length > 0 && grantSearchQuery.length >= 2 && !grantUserId && (
                <div className="absolute z-10 w-full mt-1 bg-piu-dark border border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                  {grantSearchResults.slice(0, 8).map(u => (
                    <button key={u.id} onClick={() => { setGrantUserId(u.id); setGrantSearchQuery(u.username); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-piu-card/50 text-left text-sm">
                      <img src={getAvatarUrl(u.avatar)} alt="" className="w-6 h-6 rounded-full" />
                      <span>{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {grantType === 'day_pass' && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Date</label>
                <input type="date" value={grantPassDate} onChange={e => setGrantPassDate(e.target.value)}
                  className="bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            )}

            {grantType === 'subscription' && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Duration (months)</label>
                <select value={grantMonths} onChange={e => setGrantMonths(parseInt(e.target.value))}
                  className="bg-piu-dark border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
            )}

            <button onClick={handleGrantAccess} disabled={grantSaving || !grantUserId}
              className="px-4 py-2 bg-piu-accent text-white rounded-lg text-sm font-bold hover:bg-piu-accent/80 disabled:opacity-50">
              {grantSaving ? 'Granting...' : `Grant ${grantType === 'day_pass' ? 'Day Pass' : 'Subscription'}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Payments ─────────────────────────────────────────────────────── */}
      {subTab === 'payments' && (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-bold">Payment History</h3>
          {overview?.payments?.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No payments recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {overview?.payments?.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-piu-card/50 rounded-lg px-3 py-2 text-sm">
                  <img src={getAvatarUrl(p.avatar)} alt="" className="w-6 h-6 rounded-full" />
                  <span className="font-bold text-xs min-w-0 truncate">{p.username}</span>
                  <span className="text-gray-400 text-xs flex-1 min-w-0 truncate">{p.description || p.payment_type}</span>
                  <span className="font-bold text-xs">{formatCurrency(p.amount, p.currency)}</span>
                  <span className={`text-xs font-bold ${p.status === 'succeeded' ? 'text-green-400' : p.status === 'pending' ? 'text-yellow-400' : p.status === 'refunded' ? 'text-blue-400' : 'text-red-400'}`}>
                    {p.status.toUpperCase()}
                  </span>
                  <span className="text-gray-500 text-xs">{formatDate(p.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
