import React from 'react';
import { getAvatarUrl } from '../AvatarPicker';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { FORMAT_DESCRIPTIONS, FORMAT_ICONS, FORMAT_LABELS } from '../../utils/tournamentConstants';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function MetaPill({ children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
      {children}
    </span>
  );
}

function getStatusTone(phase) {
  if (phase === 'COMPLETED') {
    return 'border-piu-gold/30 bg-piu-gold/12 text-piu-gold';
  }
  if (phase === 'SETUP') {
    return 'border-white/12 bg-white/[0.05] text-zinc-200';
  }
  return 'border-piu-accent/30 bg-piu-accent/14 text-rose-100';
}

function getPhaseTone(status) {
  if (status === 'COMPLETED') {
    return 'border-piu-gold/30 bg-piu-gold/10 text-piu-gold';
  }
  if (status === 'ACTIVE') {
    return 'border-piu-accent/35 bg-piu-accent/14 text-rose-100 shadow-[0_0_14px_rgba(255,51,102,0.25)]';
  }
  return 'border-white/10 bg-white/[0.03] text-zinc-400';
}

function formatRoundLevelLabel(roundLevel = {}, index = 0) {
  const roundNumber = parseInt(roundLevel.round, 10) || index + 1;
  const min = parseInt(roundLevel.min, 10) || 0;
  const max = parseInt(roundLevel.max, 10) || 0;
  if (min > 0 && max > 0) return `R${roundNumber} · Lv ${min}-${max}`;
  if (min > 0) return `R${roundNumber} · Lv ${min}+`;
  if (max > 0) return `R${roundNumber} · up to Lv ${max}`;
  return `R${roundNumber}`;
}

function getGauntletLevels(config = {}) {
  const start = parseInt(config.start_level ?? config.start_single_level, 10) || 19;
  const explicitFinal = parseInt(config.final_level, 10);
  const legacyFinalUpper = parseInt(config.final_single_level, 10);
  const explicitFinalMax = parseInt(config.final_level_max ?? config.final_single_level_max, 10);
  const final = Number.isFinite(explicitFinal)
    ? explicitFinal
    : Number.isFinite(legacyFinalUpper)
      ? Math.max(1, legacyFinalUpper - 1)
      : 24;
  const finalMax = Math.max(
    final,
    Number.isFinite(explicitFinalMax)
      ? explicitFinalMax
      : Number.isFinite(legacyFinalUpper)
        ? legacyFinalUpper
        : Math.min(final + 1, 28)
  );
  return { start, final, finalMax };
}

export function formatTournamentDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function TournamentHero({
  tournament,
  statusLabel,
  live = false,
  stats = [],
  action = null,
  flow = null,
  className = '',
}) {
  const title = String(tournament?.name || 'Tournament').trim() || 'Tournament';
  const formattedDate = formatTournamentDate(tournament?.date);

  return (
    <Card
      className={cx(
        'relative isolate overflow-hidden border-white/10',
        'bg-[radial-gradient(circle_at_8%_-10%,rgba(255,51,102,0.32),transparent_44%),radial-gradient(circle_at_92%_-15%,rgba(255,199,92,0.18),transparent_38%),radial-gradient(circle_at_60%_115%,rgba(68,136,255,0.10),transparent_50%),linear-gradient(180deg,rgba(13,16,28,0.98),rgba(8,11,20,0.98))]',
        'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-screen" aria-hidden>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hero-grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-grid)" />
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-piu-accent/60 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-piu-accent/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-piu-gold/10 blur-3xl" aria-hidden />

      <CardContent className="relative flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="shrink-0">
              {tournament?.avatar ? (
                <div className="relative">
                  <img
                    src={getAvatarUrl(tournament.avatar)}
                    alt={title}
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-1 ring-white/15 shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                    loading="lazy"
                    decoding="async"
                  />
                  {live && (
                    <span className="absolute -bottom-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-piu-accent animate-ping opacity-60" />
                      <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-piu-accent ring-2 ring-piu-bg" />
                    </span>
                  )}
                </div>
              ) : (
                <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-piu-accent via-rose-500 to-piu-gold/85 font-display text-3xl sm:text-4xl font-bold text-white ring-1 ring-white/15 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
                  {title.charAt(0).toUpperCase()}
                  {live && (
                    <span className="absolute -bottom-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-piu-accent animate-ping opacity-60" />
                      <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-piu-accent ring-2 ring-piu-bg" />
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {live ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-piu-accent/40 bg-piu-accent/15 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-rose-100 shadow-[0_0_14px_rgba(255,51,102,0.3)]">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-piu-accent opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-piu-accent" />
                    </span>
                    Live
                  </span>
                ) : null}
                <Badge variant="default" className={getStatusTone(tournament?.phase)}>
                  {statusLabel || tournament?.phase || 'Setup'}
                </Badge>
                {formattedDate ? <MetaPill>{formattedDate}</MetaPill> : null}
                {tournament?.location ? <MetaPill>{tournament.location}</MetaPill> : null}
              </div>

              <h1 className="mt-3 font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.05] tracking-[-0.01em] text-white">
                {title}
              </h1>

              {stats.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {stats.map((stat, index) => (
                    <React.Fragment key={`stat-${index}`}>
                      {index > 0 ? <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-white/15" aria-hidden /> : null}
                      <span className="font-display font-semibold uppercase tracking-[0.1em] text-[11px] sm:text-[12px] text-zinc-300">
                        {stat}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {action ? <div className="shrink-0 self-start">{action}</div> : null}
        </div>

        {flow ? (
          <div className="relative -mx-1 sm:mx-0">
            <div className="absolute -top-2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" aria-hidden />
            <div className="pt-3 sm:pt-4">
              {flow}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TournamentPhaseTimeline({ phases = [] }) {
  if (!Array.isArray(phases) || phases.length === 0) return null;

  const currentIdx = phases.findIndex(p => p.status === 'ACTIVE');
  const completedCount = phases.filter(p => p.status === 'COMPLETED').length;
  const progress = phases.length > 0 ? (completedCount + (currentIdx >= 0 ? 0.5 : 0)) / phases.length : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-zinc-500">
          Tournament Path
        </p>
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.16em] text-zinc-500">
          {completedCount}/{phases.length} complete
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/8" aria-hidden />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-piu-accent/60 via-piu-accent/40 to-piu-gold/40 transition-all duration-500"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
          aria-hidden
        />

        <div className="relative flex flex-wrap items-center gap-1.5 sm:gap-2">
          {phases.map((phase, index) => {
            const status = phase.status;
            const isLast = index === phases.length - 1;
            return (
              <React.Fragment key={phase.id || `${phase.format}-${index}`}>
                <span
                  className={cx(
                    'relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 sm:px-3 sm:py-1.5 font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm transition-all',
                    getPhaseTone(status),
                  )}
                >
                  <span aria-hidden="true" className="text-[12px] leading-none">{FORMAT_ICONS[phase.format] || '•'}</span>
                  <span>{phase.name || FORMAT_LABELS[phase.format] || phase.format}</span>
                  {status === 'COMPLETED' ? (
                    <span className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-piu-gold/20 text-[10px] text-piu-gold">✓</span>
                  ) : null}
                  {status === 'ACTIVE' ? (
                    <span className="ml-0.5 relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-piu-accent opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-piu-accent" />
                    </span>
                  ) : null}
                </span>
                {!isLast ? (
                  <span className="text-zinc-600 select-none" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7h7m0 0L7 4m3 3l-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TournamentTabs({ tabs = [], activeTab, onChange, className = '' }) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return (
    <div
      className={cx(
        'relative -mx-3 px-3 sm:mx-0 sm:px-0',
        className,
      )}
    >
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-zinc-950/70 p-1.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange?.(tab.key)}
              className={cx(
                'relative inline-flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 font-display text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] transition-all duration-200 whitespace-nowrap',
                isActive
                  ? 'bg-gradient-to-b from-piu-accent/22 to-piu-accent/10 text-white shadow-[inset_0_0_0_1px_rgba(255,51,102,0.35),0_4px_12px_-2px_rgba(255,51,102,0.25)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]',
              )}
            >
              {tab.icon ? <span aria-hidden="true" className="text-base leading-none">{tab.icon}</span> : null}
              <span>{tab.label}</span>
              {tab.status === 'COMPLETED' ? (
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-piu-gold/20 text-[10px] text-piu-gold">✓</span>
              ) : null}
              {tab.status === 'ACTIVE' && !isActive ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-piu-accent opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-piu-accent" />
                </span>
              ) : null}
              {isActive ? (
                <span className="absolute -bottom-px left-1/2 h-px w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-piu-accent to-transparent" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CALLOUT_TONE_CLASSES = {
  default:
    'border-piu-accent/25 bg-[radial-gradient(circle_at_0%_50%,rgba(255,51,102,0.14),transparent_55%),linear-gradient(180deg,rgba(20,16,26,0.85),rgba(13,11,20,0.85))] shadow-[0_12px_30px_-8px_rgba(255,51,102,0.18)]',
  success:
    'border-emerald-400/25 bg-[radial-gradient(circle_at_0%_50%,rgba(52,211,153,0.12),transparent_55%),linear-gradient(180deg,rgba(15,22,18,0.85),rgba(11,18,14,0.85))]',
  warning: 'border-white/12 bg-white/[0.04]',
  gold:
    'border-piu-gold/30 bg-[radial-gradient(circle_at_0%_50%,rgba(255,215,0,0.14),transparent_55%),linear-gradient(180deg,rgba(22,18,12,0.85),rgba(16,14,8,0.85))] shadow-[0_12px_30px_-8px_rgba(255,215,0,0.18)]',
};

const CALLOUT_TONE_EYEBROW = {
  default: 'text-rose-200/80',
  success: 'text-emerald-300/85',
  warning: 'text-zinc-400',
  gold: 'text-piu-gold/85',
};

export function TournamentCallout({
  tone = 'default',
  eyebrow = '',
  title,
  description,
  primaryAction = null,
  secondaryAction = null,
  className = '',
}) {
  return (
    <Card className={cx(CALLOUT_TONE_CLASSES[tone] || CALLOUT_TONE_CLASSES.default, className)}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0 flex items-start gap-3">
          <span
            className={cx(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
              tone === 'gold'
                ? 'border-piu-gold/35 bg-piu-gold/15 text-piu-gold shadow-[0_0_16px_rgba(255,215,0,0.25)]'
                : tone === 'success'
                  ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.25)]'
                  : 'border-piu-accent/35 bg-piu-accent/15 text-rose-100 shadow-[0_0_16px_rgba(255,51,102,0.25)]',
            )}
            aria-hidden
          >
            {tone === 'gold' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.91 4.04 4.34.42-3.27 2.97.99 4.32L8 11.04l-3.97 2.21.99-4.32-3.27-2.97 4.34-.42L8 1.5z" fill="currentColor"/></svg>
            ) : tone === 'success' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v6m0 0L5 5.5m3 3l3-3M3.5 13.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )}
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <p className={cx('text-[10px] font-display font-bold uppercase tracking-[0.22em]', CALLOUT_TONE_EYEBROW[tone] || CALLOUT_TONE_EYEBROW.default)}>
                {eyebrow}
              </p>
            ) : null}
            <p className="mt-1 font-display text-base sm:text-lg font-bold tracking-tight text-white">{title}</p>
            {description ? <p className="mt-1 text-sm text-zinc-300/90">{description}</p> : null}
          </div>
        </div>

        {(primaryAction || secondaryAction) ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {secondaryAction}
            {primaryAction}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TournamentPhaseRuleCard({ phase, prevPhase, className = '' }) {
  if (!phase) return null;

  const format = phase.format;
  const config = phase.config || {};
  const roundLevels = Array.isArray(config.round_levels) ? config.round_levels : [];
  const gauntletLevels = getGauntletLevels(config);
  const gauntletBestOf = parseInt(config.best_of, 10) || 3;
  const gauntletFinalRange = gauntletLevels.finalMax !== gauntletLevels.final
    ? `Lv ${gauntletLevels.start} → Lv ${gauntletLevels.final}-${gauntletLevels.finalMax}`
    : `Lv ${gauntletLevels.start} → Lv ${gauntletLevels.final}`;
  const rules = [
    format !== 'gauntlet' && config.cards_per_draw ? `${config.cards_per_draw} cards drawn` : '',
    format !== 'gauntlet' && config.vetoes_per_player !== undefined ? `${config.vetoes_per_player} veto${config.vetoes_per_player !== 1 ? 'es' : ''}` : '',
    format !== 'gauntlet' && config.best_of ? `Best of ${config.best_of}` : '',
    config.rounds ? `${config.rounds} round${config.rounds > 1 ? 's' : ''}` : '',
    config.pool_count ? `${config.pool_count} pools` : '',
    config.duration_minutes ? `${config.duration_minutes} min` : '',
    format === 'gauntlet' ? gauntletFinalRange : '',
    format === 'gauntlet' ? 'Mixed singles/doubles' : '',
    format === 'gauntlet' && gauntletBestOf === 3 ? '5 cards · 1 veto · Bo3' : '',
    format === 'gauntlet' && gauntletBestOf === 1 ? '1 song per match' : '',
    format === 'b15' ? 'Best 15 rating scores' : '',
  ].filter(Boolean);

  let seedingBlurb = null;
  if (format === 'gauntlet' && prevPhase) {
    seedingBlurb = `Seeded by ${prevPhase.name || FORMAT_LABELS[prevPhase.format]} standings — last place starts, winner stays on and fights upward.`;
  } else if (format === 'gauntlet') {
    seedingBlurb = 'Last place starts — winner stays on and climbs the ladder to the top.';
  }

  return (
    <Card className={cx('relative overflow-hidden border-white/8 bg-gradient-to-br from-zinc-950/70 to-zinc-950/55', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-piu-accent/60 via-piu-accent/30 to-transparent" aria-hidden />
      <CardContent className="flex flex-col gap-3 p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-piu-accent/12 border border-piu-accent/25 text-base" aria-hidden>
            {FORMAT_ICONS[format] || '•'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-rose-200/70">
              Format Rules
            </p>
            <p className="mt-0.5 font-display text-base font-bold text-white">
              {phase.name || FORMAT_LABELS[format] || format}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
              {FORMAT_DESCRIPTIONS[format] || 'Tournament format details'}
            </p>
            {seedingBlurb && (
              <p className="mt-1 text-[12px] text-zinc-500 italic">{seedingBlurb}</p>
            )}
          </div>
        </div>

        {rules.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rules.map((rule) => (
              <MetaPill key={rule}>{rule}</MetaPill>
            ))}
          </div>
        ) : null}

        {format === 'round_robin' && roundLevels.length > 0 ? (
          <div className="space-y-2 border-t border-white/5 pt-3">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-zinc-500">
              Round Levels
            </p>
            <div className="flex flex-wrap gap-1.5">
              {roundLevels.map((roundLevel, index) => (
                <span
                  key={`round-level-${roundLevel.round || index}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-zinc-300"
                >
                  {formatRoundLevelLabel(roundLevel, index)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TournamentEmptyPanel({ title, description, icon = '\u{1F3C1}', className = '' }) {
  return (
    <Card className={cx('relative overflow-hidden border-white/8 bg-zinc-950/55', className)}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="empty-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#empty-grid)" />
        </svg>
      </div>
      <CardContent className="relative py-14 text-center sm:py-16">
        <span className="mb-3 block text-4xl opacity-50" aria-hidden="true">{icon}</span>
        <p className="font-display text-base sm:text-lg font-bold tracking-wide text-white">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-500 max-w-md mx-auto">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
