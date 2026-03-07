import React from 'react';
import { Link } from 'react-router-dom';
import PiuChartJacket from './PiuChartJacket';
import { getCountryFlag } from './PlayerRegistration';

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
}

function formatSessionAge(startedAt) {
  if (!startedAt) return 'Just started';
  const value = Date.parse(`${startedAt}Z`);
  if (!Number.isFinite(value)) return 'Live now';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (elapsedMinutes < 1) return 'Just started';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m live`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m live` : `${hours}h live`;
}

function getStreamHost(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export default function LiveDirectoryCard({ item, className = '', compact = false }) {
  if (!item?.session) return null;

  const session = item.session;
  const host = session.host || {};
  const lastPlay = item.last_play || null;
  const requestCounts = item.request_counts || { open: 0, queued: 0, played: 0, skipped: 0 };
  const activeVote = item.active_vote || null;
  const streamHost = getStreamHost(session.stream_url);

  return (
    <Link
      to={session.live_url || `/live/${session.id}`}
      className={`group block overflow-hidden rounded-[28px] border border-rose-400/18 bg-[radial-gradient(circle_at_top_left,rgba(251,113,133,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#0d1322,#09101b)] p-4 shadow-[0_18px_44px_rgba(3,7,18,0.42)] transition-all hover:-translate-y-0.5 hover:border-cyan-300/30 hover:shadow-[0_24px_52px_rgba(14,165,233,0.16)] ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.24em] text-emerald-200">
              Live now
            </span>
            {item.is_following ? (
              <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-cyan-200">
                Following
              </span>
            ) : null}
            {streamHost ? (
              <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-rose-100">
                {streamHost}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 truncate font-display text-xl font-black text-white transition-colors group-hover:text-cyan-100">
            {session.title || `${host.username || 'Player'} live`}
          </h3>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-piu-border bg-piu-dark text-sm font-display font-bold text-white">
              {host.avatar ? (
                <img src={host.avatar} alt={host.username || 'Host'} className="h-full w-full object-cover" />
              ) : (
                <span>{String(host.username || 'P').trim().charAt(0).toUpperCase() || 'P'}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-display font-bold text-white">
                {host.nationality ? <span className="mr-1">{getCountryFlag(host.nationality)}</span> : null}
                {host.username || 'Player'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                {host.skill_title ? (
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 font-display font-bold uppercase tracking-wide text-cyan-200">
                    {host.skill_title}
                  </span>
                ) : null}
                <span>{formatSessionAge(session.started_at)}</span>
                <span>Peak {session.viewer_peak || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-piu-border/70 bg-black/15 px-3 py-2 text-right">
          <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Watching</p>
          <p className="text-xl font-display font-black text-cyan-200">{session.viewer_count || 0}</p>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? 'md:grid-cols-[1fr]' : 'md:grid-cols-[minmax(0,1fr)_220px]'}`}>
        <div className="rounded-2xl border border-piu-border/80 bg-black/15 p-3">
          <p className="text-[10px] font-display uppercase tracking-[0.22em] text-gray-500">Now Playing</p>
          {lastPlay ? (
            <div className="mt-2 flex items-center gap-3">
              <PiuChartJacket title={lastPlay.song_title} mode={lastPlay.mode} level={lastPlay.level} jacketUrl={lastPlay.background_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-bold text-white">{lastPlay.song_title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                  <span>{modeShort(lastPlay.mode)}{lastPlay.level}</span>
                  <span className="font-display font-bold text-cyan-200">{lastPlay.grade || '-'}</span>
                  <span>{(parseInt(lastPlay.score, 10) || 0).toLocaleString()}</span>
                  {lastPlay.pumbility_gain > 0 ? (
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 font-display font-bold text-emerald-200">
                      +{lastPlay.pumbility_gain} p
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Waiting for the first chart to land.</p>
          )}
        </div>

        {!compact ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-piu-border/80 bg-black/15 p-3">
              <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Requests</p>
              <p className="mt-2 text-lg font-display font-black text-white">{requestCounts.open || 0}</p>
              <p className="text-[11px] text-gray-400">open • {requestCounts.queued || 0} queued</p>
            </div>
            <div className="rounded-2xl border border-piu-border/80 bg-black/15 p-3">
              <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Vote</p>
              {activeVote ? (
                <>
                  <p className="mt-2 text-sm font-display font-black text-white">
                    {activeVote.mode_filter} Lv.{activeVote.min_level}{activeVote.max_level !== activeVote.min_level ? `-${activeVote.max_level}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {activeVote.status === 'active' ? `${activeVote.total_votes || 0} ballots live` : 'Vote locked'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-lg font-display font-black text-white">Idle</p>
                  <p className="text-[11px] text-gray-400">No vote running</p>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
