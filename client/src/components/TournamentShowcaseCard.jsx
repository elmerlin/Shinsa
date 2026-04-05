import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export default function TournamentShowcaseCard({ tournament, onDelete }) {
  const navigate = useNavigate();
  const primaryFormatKey = getPrimaryFormatKey(tournament);
  const primaryFormatIcon = FORMAT_ICONS[primaryFormatKey] || '\u{1F3C6}';
  const formatSummary = getFormatSummary(tournament);
  const formattedDate = formatCalendarDate(tournament?.date);
  const participantCount = tournament?.participant_count || 0;

  return (
    <Card className="group relative overflow-hidden border-white/10 bg-[rgba(7,10,18,0.88)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-white/15">
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
        <CardContent className="relative flex h-full flex-col gap-3 p-4">
          {/* Row 1: Avatar + title block + arrow */}
          <div className="flex items-center gap-3 pr-8">
            <div className="relative shrink-0">
              {tournament?.avatar ? (
                <img
                  src={getAvatarUrl(tournament.avatar)}
                  alt={tournament?.name || 'Tournament'}
                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-piu-accent/85 via-rose-500/70 to-sky-500/70 font-display text-xl font-bold text-white ring-1 ring-white/10">
                  {getTournamentInitial(tournament?.name)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-base font-bold leading-tight text-white transition-colors group-hover:text-piu-accent">
                {tournament?.name || 'Untitled Tournament'}
              </h3>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span>{primaryFormatIcon}</span>
                <span className="truncate uppercase tracking-[0.12em]">
                  {formatSummary || FORMAT_LABELS[primaryFormatKey] || 'Round Robin'}
                </span>
                {formattedDate && (
                  <>
                    <span className="text-zinc-700">&middot;</span>
                    <span className="shrink-0">{formattedDate}</span>
                  </>
                )}
              </div>
            </div>

            <Badge variant={getStatusVariant(tournament?.phase)} className="shrink-0">
              {getStatusLabel(tournament?.phase)}
            </Badge>
          </div>

          {/* Row 2: Participants + stages */}
          <div className="flex items-center justify-between gap-3">
            <AvatarStack
              items={tournament?.participant_preview || []}
              total={participantCount}
              size="sm"
              emptyLabel="No players"
            />

            <div className="flex items-center gap-2">
              {tournament?.phase_count > 1 && (
                <span className="text-[11px] text-zinc-500">
                  {tournament.phase_count} stages
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/tournament/${tournament.id}/poster`); }}
                className="flex h-7 items-center gap-1.5 rounded-full border border-piu-accent/15 bg-piu-accent/6 px-2.5 text-[10px] font-display font-bold uppercase tracking-[0.1em] text-rose-200/70 transition-all hover:border-piu-accent/30 hover:bg-piu-accent/12 hover:text-rose-100"
                title="View poster"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Poster
              </button>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 bg-white/4 text-zinc-400 transition-all duration-200 group-hover:translate-x-0.5 group-hover:border-white/12 group-hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
