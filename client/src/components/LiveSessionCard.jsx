import React from 'react';
import { Link } from 'react-router-dom';
import SessionSummaryCard from './SessionSummaryCard';

function StatPill({ label, value }) {
  return (
    <div className="rounded-lg border border-rose-400/25 bg-black/20 px-3 py-2">
      <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-display font-bold text-rose-100">{value}</p>
    </div>
  );
}

function CompactStat({ label, value, accent = 'text-slate-100' }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.035] px-3 py-2.5">
      <p className="text-[9px] font-display font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-display font-black leading-none ${accent}`}>{value}</p>
    </div>
  );
}

export default function LiveSessionCard({ summary, className = '', title = 'Shinsa Live Recap', compact = false }) {
  if (!summary) return null;

  const streamHost = summary.streamUrl
    ? (() => {
        try {
          return new URL(summary.streamUrl).hostname.replace(/^www\./, '');
        } catch {
          return summary.streamUrl;
        }
      })()
    : '';
  const sessionTitleLabel = String(summary.sessionTitle || '').trim() || 'Shinsa Live';
  const participantRole = String(summary.participantRole || '').trim().toLowerCase();
  const hostLabel = summary.hostUsername
    ? (participantRole === 'cohost' ? `Co-Hosted by ${summary.hostUsername}` : `Hosted by ${summary.hostUsername}`)
    : 'Live session recap';
  const scheduleLabel = [
    summary.sessionDateLabel,
    summary.sessionTimeRange,
    summary.sessionDurationLabel,
  ].filter(Boolean).join(' • ');
  const machineLabel = String(summary.sessionMachineName || '').trim();
  const clearsLabel = summary.songCount
    ? `${summary.clearCount || 0}/${summary.songCount}`
    : `${summary.clearCount || 0}`;

  if (compact) {
    return (
      <div className={`rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(14,20,33,0.98),rgba(11,16,28,0.96))] p-3 text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${className}`.trim()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.22em] text-slate-400">{title}</p>
            <p className="mt-1 line-clamp-1 font-display text-lg font-black text-white">
              {sessionTitleLabel}
            </p>
            <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{hostLabel}</p>
          </div>
          <div className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.14em] text-slate-300">
            Live
          </div>
        </div>

        {scheduleLabel ? (
          <p className="mt-3 text-[11px] leading-5 text-slate-300">{scheduleLabel}</p>
        ) : null}
        {machineLabel ? (
          <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500">Machine: {machineLabel}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <CompactStat label="Songs" value={summary.songCount || 0} />
          <CompactStat label="Clears" value={clearsLabel} accent="text-emerald-200" />
          <CompactStat label="Perfects" value={`${parseInt(summary.perfectRate, 10) || 0}%`} accent="text-cyan-200" />
          <CompactStat label="Chat" value={summary.messageCount || 0} />
        </div>

        {summary.streamUrl ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-rose-400/80" />
            <span className="truncate">{streamHost || 'Live stream link'}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-rose-400/35 bg-gradient-to-br from-rose-500/18 via-orange-500/10 to-cyan-500/8 ${compact ? 'p-2.5' : 'p-3'} ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display font-black uppercase tracking-[0.28em] text-rose-300">{title}</p>
          <p className="text-xs text-rose-100/90 flex flex-wrap items-center gap-x-2 gap-y-1">
            {summary.sessionId ? (
              <Link
                to={`/live/${encodeURIComponent(summary.sessionId)}`}
                className="text-cyan-200 hover:text-white transition-colors font-display font-bold"
              >
                {sessionTitleLabel}
              </Link>
            ) : null}
            <span>
              {hostLabel}
            </span>
          </p>
          {summary.streamUrl ? (
            <a
              href={summary.streamUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-orange-200 hover:text-white transition-colors"
            >
              <span className="inline-flex w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {streamHost || 'Open stream'}
            </a>
          ) : null}
        </div>
        <div className={`grid grid-cols-3 gap-2 ${compact ? 'min-w-[0] w-full' : 'min-w-[320px] max-sm:min-w-full'}`}>
          <StatPill label="Peak Viewers" value={summary.viewerPeak || 0} />
          <StatPill label="Messages" value={summary.messageCount || 0} />
          <StatPill label="Interactions" value={summary.interactions || 0} />
        </div>
      </div>

      <SessionSummaryCard
        summary={summary}
        title="Live Session Summary"
        className="mt-3 mb-0 border-rose-400/25 from-rose-500/8 via-orange-500/8 to-transparent"
        compact={compact}
      />
    </div>
  );
}
