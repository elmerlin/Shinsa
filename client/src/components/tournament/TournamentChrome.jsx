import React from 'react';
import { getAvatarUrl } from '../AvatarPicker';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { FORMAT_DESCRIPTIONS, FORMAT_ICONS, FORMAT_LABELS, PHASE_STATUS_LABELS } from '../../utils/tournamentConstants';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function MetaPill({ children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-white/8 bg-white/6 px-2.5 py-1 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

function getStatusVariant(phase) {
  if (phase === 'COMPLETED') return 'success';
  if (phase === 'SETUP') return 'warning';
  return 'secondary';
}

function getPhaseTone(status) {
  if (status === 'COMPLETED') {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
  }
  if (status === 'ACTIVE') {
    return 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100';
  }
  return 'border-white/8 bg-white/5 text-zinc-400';
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
        'relative overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.18),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(58,170,255,0.18),transparent_28%),rgba(8,11,20,0.92)]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="absolute -left-20 top-12 h-40 w-40 rounded-full bg-piu-accent/12 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <CardContent className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="hidden shrink-0 sm:block">
              {tournament?.avatar ? (
                <img
                  src={getAvatarUrl(tournament.avatar)}
                  alt={title}
                  className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10 shadow-[0_14px_28px_rgba(0,0,0,0.32)]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/80 via-rose-500/65 to-sky-500/70 font-display text-2xl font-bold text-white ring-1 ring-white/10 shadow-[0_14px_28px_rgba(0,0,0,0.32)]">
                  {title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {live ? <Badge variant="secondary">Live</Badge> : null}
                <Badge variant={getStatusVariant(tournament?.phase)}>{statusLabel || tournament?.phase || 'Setup'}</Badge>
                {formattedDate ? <MetaPill>{formattedDate}</MetaPill> : null}
                {tournament?.location ? <MetaPill>{tournament.location}</MetaPill> : null}
              </div>

              <h1 className="mt-3 text-2xl font-display font-bold tracking-[0.02em] text-white sm:text-3xl">
                {title}
              </h1>

              {stats.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
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
          <div className="rounded-[1rem] border border-white/8 bg-black/18 p-3">
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
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {phases.map((phase, index) => (
        <React.Fragment key={phase.id || `${phase.format}-${index}`}>
          {index > 0 ? <span className="text-zinc-600">→</span> : null}
          <span
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display font-bold uppercase tracking-[0.14em]',
              getPhaseTone(phase.status)
            )}
          >
            <span aria-hidden="true">{FORMAT_ICONS[phase.format] || '•'}</span>
            <span>{phase.name || FORMAT_LABELS[phase.format] || phase.format}</span>
            <span className="text-[10px] opacity-70">
              {PHASE_STATUS_LABELS[phase.status] || phase.status}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export function TournamentTabs({ tabs = [], activeTab, onChange, className = '' }) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return (
    <Card className={cx('border-white/8 bg-zinc-950/55', className)}>
      <CardContent className="flex gap-2 overflow-x-auto p-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange?.(tab.key)}
            className={cx(
              'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 font-display text-xs font-bold uppercase tracking-[0.16em] transition-colors',
              activeTab === tab.key
                ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100'
                : 'border-white/8 bg-white/4 text-zinc-400 hover:border-white/14 hover:text-zinc-100'
            )}
          >
            {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
            <span>{tab.label}</span>
            {tab.status === 'COMPLETED' ? <span className="text-emerald-300">✓</span> : null}
            {tab.status === 'ACTIVE' ? <span className="text-cyan-200">•</span> : null}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

const CALLOUT_TONE_CLASSES = {
  default: 'border-cyan-400/18 bg-cyan-400/8',
  success: 'border-emerald-400/18 bg-emerald-400/8',
  warning: 'border-amber-400/20 bg-amber-400/8',
  gold: 'border-piu-gold/22 bg-piu-gold/8',
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
      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
          ) : null}
          <p className="mt-1 font-display text-lg font-bold text-white">{title}</p>
          {description ? <p className="mt-1 text-sm leading-relaxed text-zinc-300">{description}</p> : null}
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

export function TournamentPhaseRuleCard({ phase, className = '' }) {
  if (!phase) return null;

  const format = phase.format;
  const config = phase.config || {};
  const rules = [
    config.cards_per_draw ? `${config.cards_per_draw} cards drawn per match` : '',
    config.vetoes_per_player !== undefined ? `${config.vetoes_per_player} veto${config.vetoes_per_player !== 1 ? 'es' : ''} per player` : '',
    config.best_of ? `Best of ${config.best_of}` : '',
    config.rounds ? `${config.rounds} round${config.rounds > 1 ? 's' : ''}` : '',
    config.pool_count ? `${config.pool_count} pools` : '',
    config.duration_minutes ? `${config.duration_minutes} minute session` : '',
    format === 'gauntlet' ? `S${config.start_single_level || 19} to S${config.final_single_level || 24}` : '',
    format === 'b15' ? 'Best 15 rating-point scores' : '',
  ].filter(Boolean);

  return (
    <Card className={cx('border-white/8 bg-zinc-950/60', className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <span aria-hidden="true">{FORMAT_ICONS[format] || '•'}</span>
                <span>{phase.name || FORMAT_LABELS[format] || format}</span>
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              {FORMAT_DESCRIPTIONS[format] || 'Tournament format details'}
            </p>
          </div>
        </div>

        {rules.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {rules.map((rule) => (
              <MetaPill key={rule}>{rule}</MetaPill>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TournamentEmptyPanel({ title, description, icon = '🏁', className = '' }) {
  return (
    <Card className={cx('border-white/8 bg-zinc-950/55', className)}>
      <CardContent className="py-12 text-center">
        <span className="mb-3 block text-4xl" aria-hidden="true">{icon}</span>
        <p className="font-display text-lg font-bold text-white">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-400">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
