import React, { useState, useEffect } from 'react';
import { getPlayerScoutingCard } from '../utils/api';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { getCountryFlag } from '../utils/countryFlags';

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
  if (attributeMode === 'absolute_capability') return 'Absolute capability scores';
  if (attributeMode === 'profile_relative') return 'Profile-relative attributes';
  return '';
}

function getScoreModeMeta(mode) {
  if (mode === 'shinsa_relative') return { shortLabel: 'Relative', longLabel: 'Shinsa-relative scores' };
  if (mode === 'absolute_capability') return { shortLabel: 'Absolute', longLabel: 'Absolute capability scores' };
  return { shortLabel: 'Scores', longLabel: getAttributeModeLabel(mode) };
}

function FormulaPill({ children, tone = 'cyan' }) {
  const toneClass = tone === 'amber'
    ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
    : tone === 'emerald'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100';
  return (
    <div className={cx('rounded-lg border px-3 py-2 font-mono text-[11px] sm:text-xs', toneClass)}>
      {children}
    </div>
  );
}

function ExplainerSection({ title, eyebrow, tone = 'cyan', children }) {
  const borderClass = tone === 'amber'
    ? 'border-amber-400/20'
    : tone === 'emerald'
      ? 'border-emerald-400/20'
      : 'border-cyan-400/20';
  return (
    <section className={cx('rounded-2xl border bg-black/20 p-4 sm:p-5', borderClass)}>
      <div className="mb-3">
        <div className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-zinc-500">
          {eyebrow}
        </div>
        <h4 className="mt-1 font-display text-base font-bold text-white sm:text-lg">
          {title}
        </h4>
      </div>
      <div className="space-y-3 text-sm text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function ScoutingScoreExplainerModal({ open, onClose, activeMode, cohortSize = 0 }) {
  if (!open) return null;

  const activeMeta = getScoreModeMeta(activeMode);
  const cohortText = cohortSize > 0 ? `${cohortSize} synced Shinsa users` : 'the current synced Shinsa cohort';

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#080d18] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-zinc-500">
                Scouting Score Explainer
              </div>
              <h3 className="mt-1 font-display text-lg font-bold text-white sm:text-xl">
                How these numbers are calculated
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                The card has two score lenses. The current view is <span className="font-bold text-zinc-200">{activeMeta.longLabel}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-5rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <ExplainerSection
              eyebrow="Default View"
              title="Relative scores compare you to the current Shinsa ceiling"
              tone="cyan"
            >
              <p>
                Each visible rail starts from your best chart results, grouped into <span className="font-semibold text-zinc-100">Speed</span>, <span className="font-semibold text-zinc-100">Stamina</span>, <span className="font-semibold text-zinc-100">Mobility</span>, and <span className="font-semibold text-zinc-100">Tech</span>.
              </p>
              <FormulaPill tone="cyan">
                rail score = 40% bucket ceiling match + 60% scope rating ceiling match
              </FormulaPill>
              <p>
                The bucket part keeps the skill shape of the card, while the scope-rating part keeps near-top all-round players from looking artificially low when different specialists own different bucket highs.
              </p>
              <FormulaPill tone="emerald">
                OVR / S / D = average of the four visible rails in that tab
              </FormulaPill>
              <p className="text-zinc-400">
                Right now that benchmark comes from {cohortText}, and it updates as stronger profiles appear.
              </p>
            </ExplainerSection>

            <ExplainerSection
              eyebrow="Optional View"
              title="Absolute scores compare you to the chart library itself"
              tone="amber"
            >
              <p>
                This mode ignores who the strongest Shinsa player is. Instead, it asks how fully you have demonstrated capability against the game’s own level-based rating ceiling.
              </p>
              <FormulaPill tone="amber">
                chart ratio = earned rating on a chart / max possible rating for that chart level
              </FormulaPill>
              <p>
                For each scope and attribute bucket, the model looks at representative charts per level, takes a top sample, reduces the score when the sample is still thin, and weights harder levels more heavily.
              </p>
              <FormulaPill tone="amber">
                level mastery = average of top sampled chart ratios, then softened by coverage
              </FormulaPill>
              <FormulaPill tone="emerald">
                harder levels count more, easier levels count less, then OVR / S / D still average the four visible rails
              </FormulaPill>
              <p className="text-zinc-400">
                So a 100 in Absolute means “you have essentially demonstrated full mastery against that chart pool,” not “you are just tied with the strongest Shinsa user.”
              </p>
            </ExplainerSection>

            <ExplainerSection
              eyebrow="When To Use Which"
              title="What each view is best at"
              tone="emerald"
            >
              <p>
                <span className="font-semibold text-zinc-100">Relative</span> is better for fast comparison between players on Shinsa right now.
              </p>
              <p>
                <span className="font-semibold text-zinc-100">Absolute</span> is better for seeing how complete a player’s demonstrated ability is against the wider rating system.
              </p>
              <p className="text-zinc-400">
                The same rules apply inside <span className="font-semibold text-zinc-200">Overall</span>, <span className="font-semibold text-zinc-200">Singles</span>, and <span className="font-semibold text-zinc-200">Doubles</span>. The tab changes the scope, and the toggle changes the scoring lens.
              </p>
            </ExplainerSection>
          </div>
        </div>
      </div>
    </div>
  );
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

function ScoreModePills({ active, onChange, modes = [] }) {
  if (!Array.isArray(modes) || modes.length <= 1) return null;
  return (
    <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
      {modes.map((mode) => {
        const meta = getScoreModeMeta(mode);
        const isActive = active === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={cx(
              'px-3 py-1 rounded-md font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-all',
              isActive
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]',
            )}
          >
            {meta.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

function CadenceMetric({ label, value, detail, accent = 'text-zinc-100' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
      <div className="text-[9px] font-display font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className={cx('mt-1 font-display text-lg font-bold leading-none tabular-nums', accent)}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-display text-zinc-500">
        {detail}
      </div>
    </div>
  );
}

function CadenceStrip({ cadence }) {
  if (!cadence || cadence.activeDays30 <= 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-3 sm:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-display font-black uppercase tracking-[0.18em] text-zinc-500">
            Cadence
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className={cx('font-display text-2xl sm:text-3xl font-bold leading-none tabular-nums', ratingColor(cadence.score100))}>
              {cadence.score100}
            </span>
            <span className="mb-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-300">
              {cadence.label}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-display">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-bold text-cyan-200">
            Freq {cadence.frequencyPercentile}
          </span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 font-bold text-emerald-200">
            Vol {cadence.volumePercentile}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CadenceMetric
          label="Days"
          value={cadence.activeDays30}
          detail={`${cadence.activeDaysPerWeek}/wk active`}
          accent="text-cyan-200"
        />
        <CadenceMetric
          label="Sessions"
          value={cadence.sessions30}
          detail={`${cadence.sessionsPerWeek}/wk`}
          accent="text-emerald-200"
        />
        <CadenceMetric
          label="Plays"
          value={cadence.plays30}
          detail={`${cadence.playsPerSession}/session`}
          accent="text-amber-200"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-display text-zinc-500">
        <span>frequency + volume blend</span>
        <span className="text-zinc-700">|</span>
        <span>last 30 days</span>
        <span className="text-zinc-700">|</span>
        <span>vs {cadence.cohortSize || '?'} Shinsa users</span>
      </div>
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
  const [activeScoreMode, setActiveScoreMode] = useState('shinsa_relative');
  const [showScoreExplainer, setShowScoreExplainer] = useState(false);

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

  useEffect(() => {
    const defaultMode = data?.scoring?.defaultMode || data?.coverage?.attributeMode || 'shinsa_relative';
    setActiveScoreMode(defaultMode);
  }, [data]);

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

  const { user, cadence, competitive, specialties } = data;
  const scoringModes = data.scoring?.modes || {};
  const availableScoreModes = data.scoring?.availableModes || [data.coverage?.attributeMode].filter(Boolean);
  const activeScoring = scoringModes[activeScoreMode]
    || scoringModes[data.scoring?.defaultMode]
    || { ratings: data.ratings, attributes: data.attributes, label: getAttributeModeLabel(data.coverage?.attributeMode) };
  const ratings = activeScoring.ratings || data.ratings;
  const attributes = activeScoring.attributes || data.attributes;
  const tint = SCOPE_TINT[activeScope];
  const scopeAttrs = attributes?.[activeScope] || { speed: 0, stamina: 0, mobility: 0, tech: 0 };
  const hasDoubles = ((scoringModes?.shinsa_relative?.ratings?.doubles?.raw || data.ratings?.doubles?.raw || 0) > 0);
  const attributeModeLabel = activeScoring.label || getAttributeModeLabel(activeScoreMode || data.coverage?.attributeMode);
  const nationalityFlag = user.nationality ? getCountryFlag(user.nationality, 'h-[11px] sm:h-[12px]') : null;

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
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {user.nationality && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] sm:text-[11px] text-zinc-300 font-display">
                  {nationalityFlag}
                  <span>{user.nationality}</span>
                </span>
              )}
              {user.skillTitle && (
                <span className="text-[11px] text-zinc-500 font-display">{user.skillTitle}</span>
              )}
            </div>
            {attributeModeLabel && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[9px] text-zinc-600 font-display uppercase tracking-[0.16em]">
                  {attributeModeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowScoreExplainer(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-cyan-400/15 hover:text-cyan-100"
                >
                  <span>How It Works</span>
                </button>
              </div>
            )}
          </div>

          {/* Rating cluster */}
          {ratings && <RatingCluster ratings={ratings} tint={tint} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ScopePills active={activeScope} onChange={setActiveScope} hasDoubles={hasDoubles} />
          <ScoreModePills active={activeScoreMode} onChange={setActiveScoreMode} modes={availableScoreModes} />
        </div>

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
      <ScoutingScoreExplainerModal
        open={showScoreExplainer}
        onClose={() => setShowScoreExplainer(false)}
        activeMode={activeScoreMode}
        cohortSize={data.benchmark?.cohortSize || 0}
      />
    </Card>
  );
}
