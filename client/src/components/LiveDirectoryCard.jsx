import React from 'react';
import { Link } from 'react-router-dom';
import { HourOfPowerLogo } from './HourOfPowerBrand';
import PiuChartJacket from './PiuChartJacket';
import { getCountryFlag } from './PlayerRegistration';
import { parseGrade } from '../utils/grades';

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

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = parseGrade(grade).normalized;
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

function getHopPhaseLabel(hop) {
  const phase = String(hop?.phase || '').trim().toLowerCase();
  if (phase === 'warmup') return 'Warmup';
  if (phase === 'power') return 'Hour Live';
  if (phase === 'finished') return 'Time Up';
  return 'HoP';
}

export default function LiveDirectoryCard({ item, className = '', compact = false }) {
  if (!item?.session) return null;

  const session = item.session;
  const host = session.host || {};
  const hop = item.hop || null;
  const isHopSession = session.session_type === 'hop';
  const lastPlay = item.last_play || null;
  const requestCounts = item.request_counts || { open: 0, queued: 0, played: 0, skipped: 0 };
  const activeVote = item.active_vote || null;
  const streamHost = getStreamHost(session.stream_url);
  const lastPlayScore = parseInt(lastPlay?.score, 10) || 0;
  const parsedLastPlayGrade = parseGrade(lastPlay?.grade, lastPlayScore > 0 ? getRank(lastPlayScore).label : '');
  const displayLastPlayGrade = parsedLastPlayGrade.display || (lastPlayScore > 0 ? getRank(lastPlayScore).label : '-');
  const cardClass = compact
    ? 'border-piu-border/60 bg-piu-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:border-piu-accent/25 hover:shadow-[0_8px_20px_rgba(0,0,0,0.22)]'
    : 'border-piu-border/60 bg-piu-card/95 shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:border-piu-accent/25 hover:shadow-[0_8px_20px_rgba(0,0,0,0.22)]';
  const followingBadgeClass = 'border-piu-border/60 bg-piu-dark/70 text-gray-200';
  const streamHostBadgeClass = 'border-yellow-400/20 bg-yellow-500/8 text-yellow-100';
  const hoverTitleClass = 'group-hover:text-white';
  const viewerPanelClass = 'bg-piu-dark/60';
  const viewerValueClass = 'text-white';
  const surfaceClass = 'bg-piu-dark/60';
  const skillBadgeClass = 'border-yellow-400/20 bg-yellow-500/8 text-yellow-100';
  const gradeClass = `${getGradeColor(displayLastPlayGrade, lastPlayScore)} ${parsedLastPlayGrade.isBroken ? 'grade-broken' : ''}`.trim();
  const outerRadiusClass = 'rounded-xl';
  const avatarRadiusClass = 'rounded-xl';
  const panelRadiusClass = 'rounded-xl';

  return (
    <Link
      to={session.live_url || `/live/${session.id}`}
      className={`group block overflow-hidden border p-3 transition-all hover:-translate-y-0.5 ${outerRadiusClass} ${cardClass} ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            {isHopSession ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/25 bg-yellow-500/8 px-1.5 py-0.5 text-[9px] font-display font-bold uppercase tracking-[0.2em] text-yellow-100">
                <HourOfPowerLogo className="h-4 w-3 rounded-sm" imageClassName="p-0" />
                HoP
              </span>
            ) : null}
            {item.is_following ? (
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide ${followingBadgeClass}`}>
                Following
              </span>
            ) : null}
            {streamHost ? (
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-display font-bold uppercase tracking-wide ${streamHostBadgeClass}`}>
                {streamHost}
              </span>
            ) : null}
          </div>
          <h3 className={`mt-1.5 truncate font-display text-[15px] font-black leading-tight text-white transition-colors ${hoverTitleClass}`}>
            {session.title || `${host.username || 'Player'} live`}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-display font-black leading-none ${viewerValueClass}`}>{session.viewer_count || 0}</p>
          <p className="mt-0.5 text-[9px] font-display uppercase tracking-wide text-gray-500">watching</p>
        </div>
      </div>

      <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-piu-border bg-piu-dark text-xs font-display font-bold text-white ${avatarRadiusClass}`}>
          {host.avatar ? (
            <img src={host.avatar} alt={host.username || 'Host'} className="h-full w-full object-cover" />
          ) : (
            <span>{String(host.username || 'P').trim().charAt(0).toUpperCase() || 'P'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-display font-bold text-white">
            {host.nationality ? <span className="mr-1">{getCountryFlag(host.nationality)}</span> : null}
            {host.username || 'Player'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
            {host.skill_title ? (
              <span className={`rounded-full border px-1.5 py-px font-display font-bold uppercase tracking-wide ${skillBadgeClass}`}>
                {host.skill_title}
              </span>
            ) : null}
            <span>{formatSessionAge(session.started_at)}</span>
          </div>
        </div>
      </div>

      <div className={`mt-2.5 ${panelRadiusClass} border border-piu-border/80 p-2.5 ${surfaceClass}`}>
        {lastPlay ? (
          <div className="flex items-center gap-2.5">
            <PiuChartJacket title={lastPlay.song_title} mode={lastPlay.mode} level={lastPlay.level} jacketUrl={lastPlay.background_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-display font-bold text-white">{lastPlay.song_title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
                <span>{modeShort(lastPlay.mode)}{lastPlay.level}</span>
                <span className={`font-display font-bold ${gradeClass}`} data-grade={displayLastPlayGrade}>
                  {displayLastPlayGrade}
                </span>
                <span>{lastPlayScore.toLocaleString()}</span>
                {isHopSession && lastPlay?.hop_rating_points_earned > 0 ? (
                  <span className="font-display font-bold text-emerald-300">
                    +{lastPlay.hop_rating_points_earned}
                  </span>
                ) : null}
                {lastPlay.pumbility_gain > 0 ? (
                  <span className="font-display font-bold text-emerald-300">+{lastPlay.pumbility_gain}p</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">Waiting for the first chart...</p>
        )}
      </div>

      {!compact ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-gray-400">
          {isHopSession ? (
            <>
              <span><span className="font-display font-bold text-white">{hop?.total_rating_points || 0}</span> HoP pts</span>
              <span>{hop?.counted_clear_count || 0} clears</span>
              <span className="font-display font-bold text-gray-300">{getHopPhaseLabel(hop)}</span>
            </>
          ) : (
            <>
              {(requestCounts.open || 0) > 0 || (requestCounts.queued || 0) > 0 ? (
                <span><span className="font-display font-bold text-white">{requestCounts.open || 0}</span> requests{requestCounts.queued > 0 ? ` • ${requestCounts.queued} queued` : ''}</span>
              ) : null}
              {activeVote ? (
                <span className="font-display font-bold text-gray-300">
                  Vote: {activeVote.mode_filter} Lv.{activeVote.min_level}–{activeVote.max_level}
                  {activeVote.status === 'active' ? ` (${activeVote.total_votes || 0})` : ' locked'}
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Link>
  );
}
