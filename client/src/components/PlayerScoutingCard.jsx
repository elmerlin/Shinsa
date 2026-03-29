import React, { useState, useEffect } from 'react';
import { getPlayerScoutingCard } from '../utils/api';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function cx(...classes) { return classes.filter(Boolean).join(' '); }

const SCOPE_LABELS = { overall: 'Overall', singles: 'Singles', doubles: 'Doubles' };
const BUCKET_META = {
  speed:    { label: 'Speed',    icon: '\u26A1' },
  stamina:  { label: 'Stamina',  icon: '\uD83D\uDD25' },
  mobility: { label: 'Mobility', icon: '\uD83C\uDF00' },
  tech:     { label: 'Tech',     icon: '\u2699\uFE0F' },
};

const SCOPE_TINT = {
  overall:  { bar: 'from-cyan-400 to-blue-500',  ring: 'ring-cyan-400/30',  accent: 'text-cyan-400',  bg: 'bg-cyan-400' },
  singles:  { bar: 'from-rose-400 to-pink-500',   ring: 'ring-rose-400/30',  accent: 'text-rose-400',  bg: 'bg-rose-400' },
  doubles:  { bar: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-400/30', accent: 'text-emerald-400', bg: 'bg-emerald-400' },
};

function ratingColor(v) {
  if (v >= 85) return 'text-amber-300';
  if (v >= 65) return 'text-cyan-300';
  if (v >= 40) return 'text-zinc-200';
  return 'text-zinc-400';
}

function barWidth(v) { return `${Math.max(0, Math.min(100, v))}%`; }

function getAttributeModeLabel(attributeMode) {
  if (attributeMode === 'shinsa_relative') return 'Shinsa-relative scores';
  if (attributeMode === 'profile_relative') return 'Profile-relative attributes';
  return '';
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function RatingCluster({ ratings, tint }) {
  const { overall, singles, doubles } = ratings;
  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <RatingBadge label="OVR" value={overall.score100} size="lg" tint={tint} />
      <RatingBadge label="S" value={singles.score100} size="sm" />
      <RatingBadge label="D" value={doubles.score100} size="sm" partial={doubles.partial} />
    </div>
  );
}

function RatingBadge({ label, value, size = 'sm', partial, tint }) {
  const isLg = size === 'lg';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cx(
        'font-display font-bold tracking-tight leading-none',
        isLg ? 'text-3xl sm:text-4xl' : 'text-lg sm:text-xl',
        ratingColor(value),
      )}>
        {value}
      </span>
      <span className={cx(
        'font-display font-bold uppercase tracking-[0.18em] leading-none',
        isLg ? 'text-[10px]' : 'text-[9px]',
        partial ? 'text-zinc-500' : 'text-zinc-400',
      )}>
        {label}{partial ? '*' : ''}
      </span>
    </div>
  );
}

function ScopePills({ active, onChange, hasDoubles }) {
  const scopes = ['overall', 'singles', 'doubles'];
  return (
    <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
      {scopes.map((scope) => {
        const isActive = active === scope;
        const disabled = scope === 'doubles' && !hasDoubles;
        return (
          <button
            key={scope}
            onClick={() => !disabled && onChange(scope)}
            disabled={disabled}
            className={cx(
              'px-3 py-1 rounded-md font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-all',
              isActive
                ? 'bg-white/10 text-white shadow-sm'
                : disabled
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]',
            )}
          >
            {SCOPE_LABELS[scope]}
          </button>
        );
      })}
    </div>
  );
}

function AttributeRail({ bucket, value, tint }) {
  const meta = BUCKET_META[bucket];
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[68px] sm:w-[76px] text-right font-display text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400 shrink-0">
        {meta.label}
      </span>
      <div className="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden relative">
        <div
          className={cx('h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out', tint.bar)}
          style={{ width: barWidth(value) }}
        />
      </div>
      <span className={cx('w-8 text-right font-display text-sm font-bold tabular-nums', ratingColor(value))}>
        {value}
      </span>
    </div>
  );
}

function SpecialtyChips({ specialties, competitive }) {
  const chips = [];

  if (competitive?.singleLevel) {
    chips.push({ key: 'slvl', label: `S${competitive.singleLevel}`, variant: 'danger' });
  }
  if (competitive?.doubleLevel) {
    chips.push({ key: 'dlvl', label: `D${competitive.doubleLevel}`, variant: 'success' });
  }

  for (const s of (specialties || [])) {
    const variant = s.key === 'mode' ? 'secondary'
      : s.key === 'tech' ? 'warning'
      : s.key === 'speed' ? 'danger'
      : s.key === 'stamina' ? 'success'
      : s.key === 'mobility' ? 'secondary'
      : 'default';
    chips.push({ key: s.key, label: s.label, variant });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.slice(0, 6).map((chip) => (
        <Badge key={chip.key} variant={chip.variant}>{chip.label}</Badge>
      ))}
    </div>
  );
}

function CadenceStrip({ cadence }) {
  if (!cadence || cadence.activeDays30 <= 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] font-display text-zinc-400">
      <span className="flex items-center gap-1">
        <span className="font-bold text-zinc-200">Cadence {cadence.score100}</span>
      </span>
      <span className="text-zinc-600">|</span>
      <span>{cadence.activeDays30} active days / 30</span>
      <span className="text-zinc-600">|</span>
      <span>{cadence.sessionsPerWeekApprox} sessions/week</span>
      <span className="text-zinc-600">|</span>
      <span className="text-zinc-500 italic">vs Shinsa users</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton
// ────────────────────────────────────────────────────────────────────────────
function ScoutingCardSkeleton() {
  const shimmer = 'animate-pulse rounded bg-white/[0.06]';
  return (
    <Card>
      <CardContent className="space-y-5">
        {/* Hero */}
        <div className="flex items-center gap-4">
          <div className={cx(shimmer, 'w-16 h-16 rounded-lg shrink-0')} />
          <div className="flex-1 space-y-2">
            <div className={cx(shimmer, 'h-5 w-32')} />
            <div className={cx(shimmer, 'h-3 w-20')} />
          </div>
          <div className="flex gap-3">
            <div className={cx(shimmer, 'w-10 h-12')} />
            <div className={cx(shimmer, 'w-8 h-10')} />
            <div className={cx(shimmer, 'w-8 h-10')} />
          </div>
        </div>
        {/* Pills */}
        <div className={cx(shimmer, 'h-8 w-56')} />
        {/* Rails */}
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className={cx(shimmer, 'w-[68px] h-3')} />
              <div className={cx(shimmer, 'flex-1 h-2.5')} />
              <div className={cx(shimmer, 'w-8 h-4')} />
            </div>
          ))}
        </div>
        {/* Chips */}
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => <div key={i} className={cx(shimmer, 'w-20 h-6 rounded-full')} />)}
        </div>
        {/* Cadence */}
        <div className={cx(shimmer, 'h-4 w-64')} />
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-3">
        <div className="text-3xl opacity-40">&#127918;</div>
        <p className="font-display font-bold text-zinc-300 text-sm">No Scouting Card Yet</p>
        <p className="text-zinc-500 text-xs max-w-xs">
          Sync PIUGAME to generate your scouting card.
        </p>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────
export default function PlayerScoutingCard({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeScope, setActiveScope] = useState('overall');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPlayerScoutingCard(userId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <ScoutingCardSkeleton />;
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-zinc-400">Failed to load scouting card</span>
          <button
            onClick={() => { setLoading(true); setError(null); getPlayerScoutingCard(userId).then(setData).catch(setError).finally(() => setLoading(false)); }}
            className="text-xs font-display font-bold text-piu-accent hover:underline"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }
  if (!data || !data.coverage?.hasPiuData) return <EmptyState />;

  const { user, ratings, attributes, cadence, competitive, specialties, signature } = data;
  const tint = SCOPE_TINT[activeScope];
  const scopeAttrs = attributes?.[activeScope] || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const hasDoubles = (ratings?.doubles?.raw || 0) > 0;
  const attributeModeLabel = getAttributeModeLabel(data.coverage?.attributeMode);

  // Mode-based border tint
  const borderTint = competitive?.dominantMode === 'Single'
    ? 'border-rose-500/15'
    : competitive?.dominantMode === 'Double'
      ? 'border-emerald-500/15'
      : 'border-cyan-500/15';

  return (
    <Card className={cx('relative overflow-hidden', borderTint)}>
      {/* Foil accent — top-left angular highlight */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

      <CardContent className="relative space-y-4">
        {/* ── Hero row ── */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Avatar */}
          <div className={cx('w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 shrink-0 bg-zinc-800',
            competitive?.dominantMode === 'Single' ? 'border-rose-500/30'
            : competitive?.dominantMode === 'Double' ? 'border-emerald-500/30'
            : 'border-cyan-500/30',
          )}>
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-display font-bold text-xl text-zinc-500">
                {(user.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-base sm:text-lg text-white truncate leading-tight">
              {user.username}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {user.nationality && (
                <span className="text-[11px] text-zinc-400 font-display">{user.nationality}</span>
              )}
              {user.skillTitle && (
                <span className="text-[11px] text-zinc-500 font-display">{user.skillTitle}</span>
              )}
            </div>
            {attributeModeLabel && (
              <span className="text-[9px] text-zinc-600 font-display uppercase tracking-[0.16em]">
                {attributeModeLabel}
              </span>
            )}
          </div>

          {/* Rating cluster */}
          {ratings && <RatingCluster ratings={ratings} tint={tint} />}
        </div>

        {/* ── Scope toggle ── */}
        <ScopePills active={activeScope} onChange={setActiveScope} hasDoubles={hasDoubles} />

        {/* ── Attribute rails ── */}
        <div className="space-y-2">
          {['speed', 'stamina', 'mobility', 'tech'].map((bucket) => (
            <AttributeRail
              key={bucket}
              bucket={bucket}
              value={scopeAttrs[bucket] || 0}
              tint={tint}
            />
          ))}
        </div>

        {/* ── Specialty chips + competitive levels ── */}
        <SpecialtyChips specialties={specialties} competitive={competitive} />

        {/* ── Cadence footer ── */}
        <CadenceStrip cadence={cadence} />

        {/* Partial benchmark note */}
        {activeScope === 'doubles' && data.coverage?.doublesBenchmarkPartial && (
          <p className="text-[10px] text-zinc-600 font-display italic">
            * Doubles benchmark is partial — limited reference data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
