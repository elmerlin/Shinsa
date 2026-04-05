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
    <span className="inline-flex items-center rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

function getStatusTone(phase) {
  if (phase === 'COMPLETED') {
    return 'border-piu-gold/25 bg-piu-gold/10 text-piu-gold';
  }
  if (phase === 'SETUP') {
    return 'border-white/10 bg-white/6 text-zinc-200';
  }
  return 'border-piu-accent/25 bg-piu-accent/12 text-rose-100';
}

function getPhaseTone(status) {
  if (status === 'COMPLETED') {
    return 'border-piu-gold/25 bg-piu-gold/10 text-piu-gold';
  }
  if (status === 'ACTIVE') {
    return 'border-piu-accent/25 bg-piu-accent/12 text-rose-100';
  }
  return 'border-white/10 bg-white/4 text-zinc-300';
}

function getPhaseStateMark(status) {
  if (status === 'COMPLETED') return '✓';
  if (status === 'ACTIVE') return '•';
  return null;
}

function formatRoundLevelLabel(roundLevel = {}, index = 0) {
  const roundNumber = parseInt(roundLevel.round, 10) || index + 1;
  const min = parseInt(roundLevel.min, 10) || 0;
  const max = parseInt(roundLevel.max, 10) || 0;
  if (min > 0 && max > 0) return `R${roundNumber} Lv ${min}-${max}`;
  if (min > 0) return `R${roundNumber} Lv ${min}+`;
  if (max > 0) return `R${roundNumber} up to Lv ${max}`;
  return `R${roundNumber}`;
}

function getGauntletLevels(config = {}) {
  const start = parseInt(config.start_level ?? config.start_single_level, 10) || 19;
  const final = parseInt(config.final_level ?? config.final_single_level, 10) || 24;
  return { start, final };
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
        'relative overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.18),transparent_36%),radial-gradient(circle_at_82%_18%,rgba(255,199,92,0.14),transparent_28%),rgba(8,11,20,0.94)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>

      <CardContent className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="hidden shrink-0 sm:block">
              {tournament?.avatar ? (
                <img
                  src={getAvatarUrl(tournament.avatar)}
                  alt={title}
                  className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10 shadow-[0_8px_18px_rgba(0,0,0,0.24)]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/85 via-rose-500/70 to-piu-gold/75 font-display text-2xl font-bold text-white ring-1 ring-white/10 shadow-[0_8px_18px_rgba(0,0,0,0.24)]">
                  {title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {live ? (
                  <Badge variant="default" className="border-piu-accent/25 bg-piu-accent/12 text-rose-100">
                    Live
                  </Badge>
                ) : null}
                <Badge variant="default" className={getStatusTone(tournament?.phase)}>
                  {statusLabel || tournament?.phase || 'Setup'}
                </Badge>
                {formattedDate ? <MetaPill>{formattedDate}</MetaPill> : null}
                {tournament?.location ? <MetaPill>{tournament.location}</MetaPill> : null}
              </div>

              <h1 className="mt-2.5 text-2xl font-display font-bold tracking-[0.02em] text-white sm:text-3xl">
                {title}
              </h1>

              {stats.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {stats.map((stat, index) => (
                    <MetaPill key={`stat-${index}`}>{stat}</MetaPill>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        {flow ? (
          <div className="border-t border-white/8 pt-3">
            {flow}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TournamentPhaseTimeline({ phases = [] }) {
  if (!Array.isArray(phases) || phases.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[11px]">
      {phases.map((phase, index) => (
        <React.Fragment key={phase.id || `${phase.format}-${index}`}>
          {index > 0 ? <span className="px-0.5 text-zinc-600">→</span> : null}
          <span
            className={cx(
              'inline-flex items-center gap-1 sm:gap-1.5 rounded-full border px-2 py-0.5 sm:px-2.5 sm:py-1 font-display text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.12em]',
              getPhaseTone(phase.status)
            )}
          >
            <span aria-hidden="true">{FORMAT_ICONS[phase.format] || '•'}</span>
            <span>{phase.name || FORMAT_LABELS[phase.format] || phase.format}</span>
            {getPhaseStateMark(phase.status) ? <span className="text-[11px]">{getPhaseStateMark(phase.status)}</span> : null}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function TournamentTabs({ tabs = [], activeTab, onChange, className = '' }) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return (
    <div className={cx('flex flex-wrap gap-1 sm:gap-1.5 rounded-xl border border-white/10 bg-black/18 p-1 sm:p-1.5', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange?.(tab.key)}
          className={cx(
            'inline-flex items-center gap-1 sm:gap-2 rounded-full border px-2 py-1 sm:px-3 sm:py-1.5 font-display text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.14em] transition-colors',
            activeTab === tab.key
              ? 'border-piu-accent/30 bg-piu-accent/12 text-rose-100'
              : 'border-transparent bg-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5 hover:text-zinc-100'
          )}
        >
          {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
          <span>{tab.label}</span>
          {tab.status === 'COMPLETED' ? <span className="text-piu-gold">✓</span> : null}
          {tab.status === 'ACTIVE' ? <span className="text-piu-accent">•</span> : null}
        </button>
      ))}
    </div>
  );
}

const CALLOUT_TONE_CLASSES = {
  default: 'border-piu-accent/18 bg-[radial-gradient(circle_at_0%_50%,rgba(255,51,102,0.08),transparent_50%)]',
  success: 'border-emerald-400/18 bg-[radial-gradient(circle_at_0%_50%,rgba(52,211,153,0.07),transparent_50%)]',
  warning: 'border-white/10 bg-white/[0.03]',
  gold: 'border-piu-gold/22 bg-[radial-gradient(circle_at_0%_50%,rgba(255,215,0,0.07),transparent_50%)]',
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
      <CardContent className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
          ) : null}
          <p className="mt-1 font-display text-base font-bold text-white">{title}</p>
          {description ? <p className="mt-1 text-sm text-zinc-300">{description}</p> : null}
        </div>

        {(primaryAction || secondaryAction) ? (
          <div className="flex flex-wrap gap-2">
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
  const rules = [
    format !== 'gauntlet' && config.cards_per_draw ? `${config.cards_per_draw} cards drawn per match` : '',
    format !== 'gauntlet' && config.vetoes_per_player !== undefined ? `${config.vetoes_per_player} veto${config.vetoes_per_player !== 1 ? 'es' : ''} per player` : '',
    format !== 'gauntlet' && config.best_of ? `Best of ${config.best_of}` : '',
    config.rounds ? `${config.rounds} round${config.rounds > 1 ? 's' : ''}` : '',
    config.pool_count ? `${config.pool_count} pools` : '',
    config.duration_minutes ? `${config.duration_minutes} minute session` : '',
    format === 'gauntlet' ? `Lv ${gauntletLevels.start} to Lv ${gauntletLevels.final}` : '',
    format === 'gauntlet' ? 'Mixed singles/doubles card draw' : '',
    format === 'gauntlet' && gauntletBestOf === 3 ? '5 cards drawn, 1 veto each, best of 3' : '',
    format === 'gauntlet' && gauntletBestOf === 1 ? '1 song drawn per match' : '',
    format === 'b15' ? 'Best 15 rating-point scores' : '',
  ].filter(Boolean);

  // Contextual seeding blurb
  let seedingBlurb = null;
  if (format === 'gauntlet' && prevPhase) {
    seedingBlurb = `Seeded by ${prevPhase.name || FORMAT_LABELS[prevPhase.format]} standings \u2014 last place starts, winner stays on and fights upward.`;
  } else if (format === 'gauntlet') {
    seedingBlurb = 'Last place starts \u2014 winner stays on and climbs the ladder to the top.';
  }

  return (
    <Card className={cx('border-white/8 bg-zinc-950/55', className)}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="border-piu-accent/25 bg-piu-accent/10 text-rose-100">
                <span aria-hidden="true">{FORMAT_ICONS[format] || '\u2022'}</span>
                <span>{phase.name || FORMAT_LABELS[format] || format}</span>
              </Badge>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              {FORMAT_DESCRIPTIONS[format] || 'Tournament format details'}
            </p>
            {seedingBlurb && (
              <p className="mt-1 text-xs text-zinc-500 italic">{seedingBlurb}</p>
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
          <div className="space-y-2">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-zinc-500">
              Round Levels
            </p>
            <div className="flex flex-wrap gap-1.5">
              {roundLevels.map((roundLevel, index) => (
                <MetaPill key={`round-level-${roundLevel.round || index}`}>
                  {formatRoundLevelLabel(roundLevel, index)}
                </MetaPill>
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
    <Card className={cx('border-white/8 bg-zinc-950/55', className)}>
      <CardContent className="py-14 text-center">
        <span className="mb-3 block text-4xl opacity-60" aria-hidden="true">{icon}</span>
        <p className="font-display text-lg font-bold tracking-wide text-white">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-500">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
