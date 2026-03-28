import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import AvatarStack from './AvatarStack';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { FORMAT_ICONS, FORMAT_LABELS } from '../utils/tournamentConstants';

function formatCalendarDate(value) {
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

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getStatusVariant(phase) {
  if (phase === 'COMPLETED') return 'success';
  if (phase === 'SETUP') return 'warning';
  return 'secondary';
}

function getStatusLabel(phase) {
  if (phase === 'COMPLETED') return 'Completed';
  if (phase === 'SETUP') return 'Setup';
  return 'Active';
}

function getPrimaryFormatKey(tournament) {
  if (tournament?.primary_format) return tournament.primary_format;
  if (tournament?.config?.gauntlet_enabled) return 'gauntlet';
  return 'round_robin';
}

function getPrimaryFormatLabel(tournament) {
  const formatKey = getPrimaryFormatKey(tournament);
  return FORMAT_LABELS[formatKey] || 'Round Robin';
}

function getFormatSummary(tournament) {
  const primaryLabel = getPrimaryFormatLabel(tournament);
  const summary = String(tournament?.format_summary || '').trim();
  if (!summary || summary === primaryLabel) return '';
  return summary;
}

function getTournamentInitial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function MetaPill({ children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-white/8 bg-white/6 px-2.5 py-1 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

export default function TournamentShowcaseCard({ tournament, onDelete }) {
  const primaryFormatKey = getPrimaryFormatKey(tournament);
  const primaryFormatLabel = getPrimaryFormatLabel(tournament);
  const primaryFormatIcon = FORMAT_ICONS[primaryFormatKey] || '🏆';
  const formatSummary = getFormatSummary(tournament);
  const formattedDate = formatCalendarDate(tournament?.date);

  return (
    <Card className="group relative overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.18),transparent_36%),radial-gradient(circle_at_85%_15%,rgba(58,170,255,0.18),transparent_28%),rgba(7,10,18,0.88)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/15">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(event, tournament.id);
          }}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/8 bg-black/25 p-2 text-zinc-500 transition-colors hover:border-rose-400/30 hover:text-rose-300"
          title="Delete tournament"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <Link to={`/tournament/${tournament.id}`} className="block h-full">
        <CardContent className="relative flex h-full flex-col gap-5">
          <div className="flex items-start gap-4 pr-12">
            <div className="relative shrink-0">
              {tournament?.avatar ? (
                <img
                  src={getAvatarUrl(tournament.avatar)}
                  alt={tournament?.name || 'Tournament'}
                  className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.35)]"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-piu-accent/85 via-rose-500/70 to-sky-500/70 font-display text-2xl font-bold text-white ring-1 ring-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
                  {getTournamentInitial(tournament?.name)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="max-w-full">
                  <span aria-hidden="true">{primaryFormatIcon}</span>
                  <span className="truncate">{primaryFormatLabel}</span>
                </Badge>
                <Badge variant={getStatusVariant(tournament?.phase)}>{getStatusLabel(tournament?.phase)}</Badge>
              </div>

              <h3 className="text-lg font-display font-bold leading-tight text-white transition-colors group-hover:text-piu-accent">
                {tournament?.name || 'Untitled Tournament'}
              </h3>

              {formatSummary && (
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  {formatSummary}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MetaPill>{formattedDate || 'Date TBD'}</MetaPill>
            {tournament?.location ? <MetaPill>{tournament.location}</MetaPill> : null}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <AvatarStack
              items={tournament?.participant_preview || []}
              total={tournament?.participant_count || 0}
              size="md"
              emptyLabel="No players registered"
            />

            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Phase Track</div>
                <div className="font-display text-sm font-bold text-zinc-100">
                  {tournament?.phase_count > 1 ? `${tournament.phase_count} stages` : 'Single stage'}
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-zinc-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
