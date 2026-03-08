import React from 'react';
import SessionSummaryCard from './SessionSummaryCard';

function StatPill({ label, value }) {
  return (
    <div className="rounded-lg border border-rose-400/25 bg-black/20 px-3 py-2">
      <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-display font-bold text-rose-100">{value}</p>
    </div>
  );
}

export default function LiveSessionCard({ summary, className = '', title = 'Shinsa Live Recap' }) {
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

  return (
    <div className={`rounded-2xl border border-rose-400/35 bg-gradient-to-br from-rose-500/18 via-orange-500/10 to-cyan-500/8 p-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display font-black uppercase tracking-[0.28em] text-rose-300">{title}</p>
          <p className="text-xs text-rose-100/90">
            {summary.hostUsername ? `Hosted by ${summary.hostUsername}` : 'Live session recap'}
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
        <div className="grid grid-cols-3 gap-2 min-w-[320px] max-sm:min-w-full">
          <StatPill label="Peak Viewers" value={summary.viewerPeak || 0} />
          <StatPill label="Viewers End" value={summary.viewerCount || 0} />
          <StatPill label="Messages" value={summary.messageCount || 0} />
        </div>
      </div>

      <SessionSummaryCard
        summary={summary}
        title="Live Session Summary"
        className="mt-3 mb-0 border-rose-400/25 from-rose-500/8 via-orange-500/8 to-transparent"
      />
    </div>
  );
}
