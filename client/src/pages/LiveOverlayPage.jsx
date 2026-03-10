import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import PiuChartJacket from '../components/PiuChartJacket';
import LiveEmote from '../components/LiveEmote';
import { openLiveSessionStream } from '../utils/api';
import { getLiveReactionPayload, tokenizeLiveMessage } from '../utils/liveEmotes';
import { parseGrade } from '../utils/grades';
import {
  getLiveOverlayAutoHide,
  normalizeLiveOverlayBrandMotion,
  getLiveOverlayFit,
  getLiveOverlayPreset,
  getLiveOverlayScene,
  getLiveOverlayTheme,
  normalizeLiveOverlayAnchor,
  normalizeLiveOverlayAutoHide,
  normalizeLiveOverlayFit,
  normalizeLiveOverlayGuides,
  normalizeLiveOverlayOpacity,
  normalizeLiveOverlayPreset,
  normalizeLiveOverlayScene,
  normalizeLiveOverlayTheme,
  normalizeLiveOverlayWidgets,
} from '../utils/liveOverlay';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

const GRADE_SORT = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
}

function formatPlayLabel(play) {
  if (!play) return 'Waiting for the next chart';
  return `${play.song_title || 'Unknown chart'} (${modeShort(play.mode)}${parseInt(play.level, 10) || '?'})`;
}

function getPlayGradeRank(grade) {
  const normalized = parseGrade(grade).normalized;
  const index = GRADE_SORT.indexOf(normalized);
  return index >= 0 ? index : -1;
}

function formatCountdownLabel(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `${seconds}s`;
}

function formatElapsedMinutesLabel(totalMinutes) {
  const minutes = Math.max(0, parseInt(totalMinutes, 10) || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) return `${hours}h ${remainder}m`;
  if (hours > 0) return `${hours}h`;
  return `${remainder}m`;
}

function formatRelativeSyncTime(timestamp) {
  if (!timestamp) return 'Awaiting sync';
  const parsed = Date.parse(`${timestamp}Z`);
  if (!Number.isFinite(parsed)) return 'Awaiting sync';
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'Synced just now';
  if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return remMinutes > 0 ? `Synced ${diffHours}h ${remMinutes}m ago` : `Synced ${diffHours}h ago`;
}

function parseTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  const withUtc = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = Date.parse(withUtc);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : NaN;
}

function getSessionDurationLabel(summary, live, nowMs = Date.now()) {
  const summaryMinutes = parseInt(summary?.sessionDurationMinutes, 10);
  if (Number.isFinite(summaryMinutes) && summaryMinutes > 0) {
    return summary?.sessionDurationLabel || formatElapsedMinutesLabel(summaryMinutes);
  }
  const startedAtMs = parseTimestamp(live?.started_at);
  if (!Number.isFinite(startedAtMs)) return '0m';
  return formatElapsedMinutesLabel(Math.max(0, Math.round((nowMs - startedAtMs) / 60000)));
}

function isRecent(timestampMs, nowMs, windowMs) {
  if (!Number.isFinite(timestampMs)) return false;
  return Math.max(0, nowMs - timestampMs) <= windowMs;
}

function shouldShowOverlay(mode, { play, vote, messages, nowMs }) {
  if (mode === 'off') return true;
  const voteActive = vote?.status === 'active';
  const playMs = parseTimestamp(play?.date_played || play?.created_at || play?.updated_at);
  const lastMessage = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;
  const messageMs = parseTimestamp(lastMessage?.created_at);

  if (mode === 'results') {
    return voteActive || isRecent(playMs, nowMs, 45000);
  }
  if (mode === 'chat') {
    return voteActive || isRecent(messageMs, nowMs, 25000);
  }
  return voteActive || isRecent(playMs, nowMs, 90000) || isRecent(messageMs, nowMs, 25000);
}

function getOverlayShellClass(anchorId) {
  switch (anchorId) {
    case 'bottom-left':
      return 'items-end justify-start p-5 md:p-7';
    case 'bottom-right':
      return 'items-end justify-end p-5 md:p-7';
    case 'top-left':
      return 'items-start justify-start p-5 md:p-7';
    case 'top-center':
      return 'items-start justify-center p-5 md:p-7';
    case 'top-right':
      return 'items-start justify-end p-5 md:p-7';
    default:
      return 'items-end justify-center p-5 md:p-7';
  }
}

function getOverlayPanelClass(fitId, presetId) {
  const preset = String(presetId || '').trim().toLowerCase();
  if (preset === 'marquee') {
    if (fitId === 'full') return 'w-[min(99vw,96rem)]';
    if (fitId === 'card') return 'w-[min(96vw,76rem)]';
    return 'w-[min(98vw,92rem)]';
  }
  if (fitId === 'full') return 'w-[min(96vw,72rem)]';
  if (fitId === 'phone') return 'w-[min(92vw,22rem)]';
  if (fitId === 'rail') return 'w-[min(92vw,24rem)]';
  if (fitId === 'card') return preset === 'compact' ? 'w-[min(94vw,52rem)]' : 'w-[min(92vw,34rem)]';
  return preset === 'mobile' ? 'w-[min(92vw,24rem)]' : 'w-[min(94vw,64rem)]';
}

function SafeZoneGuides() {
  const guides = [
    { label: 'Action safe', inset: '5%' },
    { label: 'Title safe', inset: '10%' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {guides.map((guide) => (
        <div
          key={guide.label}
          className="absolute rounded-[32px] border border-dashed border-white/22"
          style={{ inset: guide.inset }}
        >
          <span className="absolute left-4 top-3 rounded-full border border-white/20 bg-black/28 px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.24em] text-white/60">
            {guide.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function getRequestCounts(requests) {
  const counts = { open: 0, queued: 0, played: 0, skipped: 0 };
  for (const request of Array.isArray(requests) ? requests : []) {
    const status = String(request?.status || '').trim().toLowerCase();
    if (status === 'queued' || status === 'played' || status === 'skipped') {
      counts[status] += 1;
    } else {
      counts.open += 1;
    }
  }
  return counts;
}

function getRecentChatMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.message || message?.is_system)
    .slice(-5);
}

function getLatestViewerChatMessage(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const message = rows[index];
    if (!message?.message || message?.is_system) continue;
    return message;
  }
  return null;
}

function getLatestRequest(requests) {
  const rows = Array.isArray(requests) ? requests : [];
  let latest = null;
  let latestTimestamp = -Infinity;
  for (const request of rows) {
    const timestamp = Math.max(
      parseTimestamp(request?.created_at),
      parseTimestamp(request?.updated_at)
    );
    if (!Number.isFinite(timestamp) || timestamp < latestTimestamp) continue;
    latest = request;
    latestTimestamp = timestamp;
  }
  return latest;
}

function getBestRatedPlay(plays) {
  const rows = Array.isArray(plays) ? plays : [];
  if (rows.length === 0) return null;
  return rows.slice().sort((left, right) => {
    const gradeDelta = getPlayGradeRank(right?.grade) - getPlayGradeRank(left?.grade);
    if (gradeDelta !== 0) return gradeDelta;
    const scoreDelta = (parseInt(right?.score, 10) || 0) - (parseInt(left?.score, 10) || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return parseTimestamp(right?.date_played || right?.created_at || right?.updated_at)
      - parseTimestamp(left?.date_played || left?.created_at || left?.updated_at);
  })[0] || null;
}

function showBurstPayload(message) {
  if (message?.is_system) return null;
  return getLiveReactionPayload(message?.message);
}

function buildOverlayPanelSurfaceStyle(theme, opacity) {
  const normalizedOpacity = Math.max(0, Math.min(100, parseInt(opacity, 10) || 0)) / 100;
  const transparentTheme = theme?.id === 'transparent';
  const backgroundAlpha = (transparentTheme ? 0.52 : 0.94) * normalizedOpacity;
  const shadowAlpha = (transparentTheme ? 0.24 : 0.34) * normalizedOpacity;

  return {
    background: `rgba(14, 20, 31, ${backgroundAlpha.toFixed(3)})`,
    boxShadow: `0 ${transparentTheme ? 16 : 22}px ${transparentTheme ? 36 : 54}px rgba(0, 0, 0, ${shadowAlpha.toFixed(3)})`,
  };
}

function OverlayPanel({ theme, opacity = 100, className = '', children, style = {} }) {
  const transparentTheme = theme?.id === 'transparent';
  return (
    <div
      className={`border border-piu-border/60 text-white ${transparentTheme ? 'backdrop-blur-md' : 'backdrop-blur-xl'} ${className}`.trim()}
      style={{
        ...buildOverlayPanelSurfaceStyle(theme, opacity),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function OverlayBadge({ theme, label, value, emphasis = 'accent' }) {
  const toneClass = emphasis === 'strong'
    ? 'text-fuchsia-100'
    : emphasis === 'alt'
      ? 'text-amber-100'
      : 'text-cyan-100';

  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
      <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">
        {label}
      </span>
      <p className={`mt-2 text-sm font-display font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function OverlayMessage({ message, theme }) {
  const reaction = showBurstPayload(message);
  const segments = tokenizeLiveMessage(message?.message || '');

  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">
            {message?.is_system ? 'System' : (message?.username || 'Viewer')}
          </span>
        </div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
          {message?.is_system ? (message?.message_type || 'live').replace(/_/g, ' ') : 'chat'}
        </p>
      </div>
      {reaction?.kind === 'emote' ? (
        <div className="mt-2">
          <LiveEmote emote={reaction.emote} size="compact" />
        </div>
      ) : reaction?.kind === 'emoji' ? (
        <p className="mt-2 text-2xl leading-none">{reaction.emoji}</p>
      ) : segments.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-gray-200">
          {segments.map((segment, idx) => (
            segment.type === 'emote'
              ? <LiveEmote key={`${segment.emote.token}-${idx}`} emote={segment.emote} size="inline" />
              : <span key={`seg-${idx}`} className="whitespace-pre-wrap">{segment.text}</span>
          ))}
        </p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-200">{message?.message || ''}</p>
      )}
    </div>
  );
}

function VoteCard({ vote, theme, compact = false }) {
  const [nowMs, setNowMs] = useState(Date.now());
  const endsAtMs = vote?.ends_at ? Date.parse(`${vote.ends_at}Z`) : NaN;
  const remainingMs = Number.isFinite(endsAtMs) ? Math.max(0, endsAtMs - nowMs) : 0;
  const winner = Array.isArray(vote?.options) ? vote.options.find((option) => option.is_winner) : null;

  useEffect(() => {
    setNowMs(Date.now());
    if (vote?.status !== 'active') return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [vote?.id, vote?.status, vote?.ends_at]);

  if (!vote) return null;

  return (
    <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">Vote</span>
          <p className="mt-2 text-sm font-display font-semibold text-gray-100">
            {vote.mode_filter} Lv.{vote.min_level}{vote.max_level !== vote.min_level ? `-${vote.max_level}` : ''}
          </p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] ${
          vote.status === 'active'
            ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
            : 'border-piu-border/60 bg-piu-card/70 text-gray-300'
        }`}>
          {vote.status === 'active' ? formatCountdownLabel(remainingMs) : 'Locked'}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {(vote.options || []).slice(0, compact ? 2 : 3).map((option) => (
          <div key={option.id} className={`rounded-lg border px-3 py-2 ${
            option.is_winner
              ? 'border-fuchsia-400/25 bg-fuchsia-500/10'
              : 'border-piu-border/60 bg-piu-card/70'
          }`}>
            <div className="flex items-center gap-3">
              <PiuChartJacket title={option.song_title} mode={option.mode} level={option.level} jacketUrl={option.jacket_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-semibold text-gray-100">{option.song_title}</p>
                <p className="text-[11px] text-gray-400">{modeShort(option.mode)}{option.level}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-display font-semibold text-gray-100">{option.vote_count || 0}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">votes</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {vote.status !== 'active' && winner ? (
        <p className="mt-3 text-xs text-gray-300">Winner: {formatPlayLabel(winner)}</p>
      ) : null}
    </div>
  );
}

function ResultBadges({ play, requests, theme, compact = false, includeRequestBadges = true }) {
  if (!play) return null;

  const items = [
    { label: 'Score', value: formatNumber(play.score), emphasis: 'accent' },
    { label: 'Grade', value: play.grade || '-', emphasis: 'strong' },
  ];
  if (play.pumbility_gain > 0) items.push({ label: 'Pumbility', value: `+${play.pumbility_gain}`, emphasis: 'alt' });
  if (play.over_top100_rank > 0) items.push({ label: 'OVER', value: `Top 100 #${play.over_top100_rank}`, emphasis: 'alt' });
  if (includeRequestBadges && requests.queued > 0) items.push({ label: 'Queued', value: `${requests.queued}`, emphasis: 'accent' });
  if (includeRequestBadges && requests.open > 0) items.push({ label: 'Open req', value: `${requests.open}`, emphasis: 'strong' });

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {items.map((item) => (
        <OverlayBadge key={`${item.label}-${item.value}`} theme={theme} label={item.label} value={item.value} emphasis={item.emphasis} />
      ))}
    </div>
  );
}

function BrandChip({ animated = true }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-piu-border/60 bg-piu-card/70 px-3 py-2">
      <div className="relative z-[1] flex items-center gap-2.5">
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.28em] text-gray-200">Shinsa</span>
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.28em] text-cyan-100">Live</span>
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300"
          style={animated ? { animation: 'shinsa-live-brand-pulse 1.9s ease-in-out infinite' } : undefined}
        />
        <span
          className="inline-block text-[11px] text-amber-200"
          style={animated ? { animation: 'shinsa-live-brand-spin 2.6s linear infinite' } : undefined}
        >
          ✦
        </span>
      </div>
      {animated ? (
        <span
          className="pointer-events-none absolute inset-y-[5px] left-[-22%] w-8 bg-gradient-to-r from-transparent via-white/18 to-transparent"
          style={{ animation: 'shinsa-live-brand-sweep 2.8s linear infinite' }}
        />
      ) : null}
    </div>
  );
}

function OverlayHeader({ live, theme, presetLabel, showBrand, showViewers, showSync, brandMotionEnabled = true }) {
  if (!showBrand && !showViewers && !showSync) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showBrand ? (
        <BrandChip animated={brandMotionEnabled} />
      ) : null}
      {live?.host?.username ? (
        <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2">
          <p className="text-[11px] font-display font-semibold text-gray-100">{live.host.username}</p>
          <p className="text-[10px] text-gray-500">{presetLabel}</p>
        </div>
      ) : null}
      {showViewers ? (
        <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2">
          <p className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-400">Watching</p>
          <p className="text-sm font-display font-semibold text-gray-100">{live?.viewer_count || 0}</p>
        </div>
      ) : null}
      {showSync ? (
        <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2">
          <p className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-400">Sync</p>
          <p className="text-[11px] text-gray-300">{formatRelativeSyncTime(live?.last_sync_at)}</p>
        </div>
      ) : null}
    </div>
  );
}

function getMarqueeItems({ play, latestRequest, latestChat, bestPlay, live, summary, nowMs, widgetSet }) {
  const items = [];
  const stripClassName = 'flex min-w-[15rem] items-center gap-2 rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-2.5';
  const labelClassName = 'shrink-0 rounded-md border border-piu-border/60 bg-piu-card/70 px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300';
  const metaClassName = 'rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[11px] font-display font-semibold text-gray-200';
  const subTextClassName = 'text-[11px] text-gray-400';

  if (widgetSet.has('play')) {
    items.push(
      <div key="play" className={stripClassName}>
        <span className={labelClassName}>Latest Play</span>
        <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-display font-semibold text-gray-100">{play?.song_title || 'Waiting for the next chart'}</p>
          <p className={subTextClassName}>{play ? `${modeShort(play.mode)}${play.level}` : 'Sync armed'}</p>
        </div>
        <span className={metaClassName}>{play?.grade || '-'}</span>
        <span className="shrink-0 text-[11px] font-display font-semibold text-gray-300">{play ? formatNumber(play.score) : '-'}</span>
      </div>
    );
  }

  if (widgetSet.has('latest_request')) {
    items.push(
      <div key="request" className={stripClassName}>
        <span className={labelClassName}>Request</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-display font-semibold text-gray-100">
            {latestRequest ? `${latestRequest.song_title} (${modeShort(latestRequest.mode)}${latestRequest.level})` : 'No requests yet'}
          </p>
          <p className={`truncate ${subTextClassName}`}>
            {latestRequest ? `${latestRequest.username || 'Viewer'} • ${latestRequest.status || 'open'}` : 'Waiting for the first request'}
          </p>
        </div>
      </div>
    );
  }

  if (widgetSet.has('chat')) {
    items.push(
      <div key="chat" className={stripClassName}>
        <span className={labelClassName}>Chat</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-display font-semibold text-gray-100">
            {latestChat?.username || 'Chat idle'}
          </p>
          <p className={`truncate ${subTextClassName}`}>
            {latestChat?.message || 'Waiting for the next viewer message'}
          </p>
        </div>
      </div>
    );
  }

  if (widgetSet.has('status')) {
    items.push(
      <div key="status" className={stripClassName}>
        <span className={labelClassName}>Status</span>
        <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
          {live?.status_text || 'No status set'}
        </p>
      </div>
    );
  }

  if (widgetSet.has('time_played')) {
    items.push(
      <div key="time-played" className={stripClassName}>
        <span className={labelClassName}>Time</span>
        <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
          {getSessionDurationLabel(summary, live, nowMs)}
        </p>
      </div>
    );
  }

  if (widgetSet.has('songs_played')) {
    items.push(
      <div key="songs-played" className={stripClassName}>
        <span className={labelClassName}>Songs</span>
        <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
          {summary?.songCount ?? 0} played
        </p>
      </div>
    );
  }

  if (widgetSet.has('calories')) {
    items.push(
      <div key="calories" className={stripClassName}>
        <span className={labelClassName}>Calories</span>
        <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
          ~{formatNumber(summary?.estimatedKcal || 0)} kcal
        </p>
      </div>
    );
  }

  if (widgetSet.has('best')) {
    items.push(
      <div key="best" className={stripClassName}>
        <span className={labelClassName}>Best</span>
        <PiuChartJacket title={bestPlay?.song_title} mode={bestPlay?.mode} level={bestPlay?.level} jacketUrl={bestPlay?.background_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-display font-semibold text-gray-100">
            {bestPlay?.song_title || 'No scores yet'}
          </p>
          <p className={subTextClassName}>{bestPlay ? `${modeShort(bestPlay.mode)}${bestPlay.level}` : 'Play a chart to set the pace'}</p>
        </div>
        <span className={metaClassName}>{bestPlay?.grade || '-'}</span>
        <span className="shrink-0 text-[11px] font-display font-semibold text-gray-300">{bestPlay ? formatNumber(bestPlay.score) : '-'}</span>
      </div>
    );
  }

  return items;
}

function MarqueeOverlay({
  live,
  play,
  latestRequest,
  latestChat,
  bestPlay,
  summary,
  theme,
  widgetSet,
  nowMs,
  panelOpacity,
  brandMotionEnabled,
  panelClassName = '',
}) {
  const items = useMemo(
    () => getMarqueeItems({ play, latestRequest, latestChat, bestPlay, live, summary, nowMs, widgetSet }),
    [bestPlay, latestChat, latestRequest, live, nowMs, play, summary, widgetSet]
  );
  const shouldAnimate = items.length > 1;
  const trackItems = shouldAnimate ? [...items, ...items] : items;

  return (
    <OverlayPanel theme={theme} opacity={panelOpacity} className={`${panelClassName} rounded-xl px-3 py-3 md:px-4 md:py-3`}>
      <style>{`
        @keyframes shinsa-live-marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
      <div className="space-y-2.5">
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="News ticker"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
          brandMotionEnabled={brandMotionEnabled}
        />
        <div className="overflow-hidden">
          <div
            className="flex w-max items-stretch gap-2.5"
            style={shouldAnimate ? { animation: 'shinsa-live-marquee 34s linear infinite' } : undefined}
          >
            {trackItems.map((item, index) => React.cloneElement(item, { key: `${item.key || 'item'}-${index}` }))}
          </div>
        </div>
      </div>
    </OverlayPanel>
  );
}

function CompactOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelOpacity, brandMotionEnabled, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} opacity={panelOpacity} className={`${panelClassName} rounded-xl px-4 py-4 md:px-5 md:py-5`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.9fr)] xl:items-start">
        <div className="space-y-3">
          <OverlayHeader
            live={live}
            theme={theme}
            presetLabel="Compact ticker"
            showBrand={widgetSet.has('brand')}
            showViewers={widgetSet.has('viewers')}
            showSync={widgetSet.has('sync')}
            brandMotionEnabled={brandMotionEnabled}
          />
          {widgetSet.has('play') ? (
            <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-4 py-4">
              <div className="flex items-center gap-4">
                <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="md" />
                <div className="min-w-0 flex-1">
                  <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">Latest Play</span>
                  <p className="mt-2 truncate text-xl font-display font-semibold text-gray-100">{play?.song_title || 'Waiting for the next chart'}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {play ? `${modeShort(play.mode)}${play.level} • ${play.machine_name || 'Live floor'}` : 'Live sync will pin the next result here.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {widgetSet.has('summary') && summary ? (
            <div className="grid grid-cols-3 gap-2">
              <OverlayBadge theme={theme} label="Songs" value={summary.songCount || 0} />
              <OverlayBadge theme={theme} label="Clears" value={`${summary.clearCount || 0}/${summary.songCount || 0}`} emphasis="strong" />
              <OverlayBadge theme={theme} label="Avg Lv" value={summary.averageLevel || 0} emphasis="alt" />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 xl:min-w-[18rem]">
          {widgetSet.has('result') ? <ResultBadges play={play} requests={requestCounts} theme={theme} compact /> : null}
          {widgetSet.has('vote') && vote ? <VoteCard vote={vote} theme={theme} compact /> : null}
        </div>
      </div>
    </OverlayPanel>
  );
}

function ResultsOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelOpacity, brandMotionEnabled, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} opacity={panelOpacity} className={`${panelClassName} rounded-xl p-4 md:p-5`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Results card"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
          brandMotionEnabled={brandMotionEnabled}
        />

        {widgetSet.has('play') ? (
          <div className="mt-4 rounded-lg border border-piu-border/60 bg-piu-dark/60 p-4">
            <div className="flex items-center gap-4">
              <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="md" />
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">Last Result</span>
                <p className="mt-2 truncate text-2xl font-display font-semibold text-gray-100">{play?.song_title || 'Waiting for the next chart'}</p>
                <p className="mt-1 text-sm text-gray-400">{formatPlayLabel(play)}</p>
              </div>
            </div>
          </div>
        ) : null}

        {widgetSet.has('result') ? (
          <div className="mt-4">
            <ResultBadges
              play={play}
              requests={requestCounts}
              theme={theme}
              includeRequestBadges={!widgetSet.has('requests')}
            />
          </div>
        ) : null}

        {widgetSet.has('summary') && summary ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <OverlayBadge theme={theme} label="Songs" value={summary.songCount || 0} />
            <OverlayBadge theme={theme} label="Avg Score" value={formatNumber(summary.averageScore)} emphasis="strong" />
            <OverlayBadge theme={theme} label="Avg Lv" value={summary.averageLevel || 0} emphasis="alt" />
            <OverlayBadge theme={theme} label="View Peak" value={summary.viewerPeak || live?.viewer_peak || 0} />
          </div>
        ) : null}

        {widgetSet.has('requests') ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <OverlayBadge theme={theme} label="Open req" value={requestCounts.open} />
            <OverlayBadge theme={theme} label="Queued" value={requestCounts.queued} emphasis="strong" />
            <OverlayBadge theme={theme} label="Played" value={requestCounts.played} emphasis="alt" />
            <OverlayBadge theme={theme} label="Skipped" value={requestCounts.skipped} emphasis="strong" />
          </div>
        ) : null}

        {widgetSet.has('vote') && vote ? <div className="mt-4"><VoteCard vote={vote} theme={theme} compact /></div> : null}
    </OverlayPanel>
  );
}

function ChatOverlay({ live, play, vote, messages, theme, widgetSet, panelOpacity, brandMotionEnabled, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} opacity={panelOpacity} className={`${panelClassName} rounded-xl p-4 md:p-5`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Chat rail"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
          brandMotionEnabled={brandMotionEnabled}
        />

        {widgetSet.has('play') && play ? (
          <div className="mt-4 rounded-lg border border-piu-border/60 bg-piu-dark/60 p-3">
            <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">Latest Play</span>
            <div className="mt-2 flex items-center gap-3">
              <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-semibold text-gray-100">{play.song_title}</p>
                <p className="text-[11px] text-gray-400">{modeShort(play.mode)}{play.level} • {play.grade || '-'}</p>
              </div>
            </div>
          </div>
        ) : null}

        {widgetSet.has('chat') ? (
          <div className="mt-4 space-y-2">
            {messages.length > 0 ? messages.map((message) => (
              <OverlayMessage key={message.id} message={message} theme={theme} />
            )) : (
              <div className="rounded-lg border border-piu-border/60 bg-piu-dark/60 px-3 py-4 text-sm text-gray-300">
                Chat is waiting for the next message.
              </div>
            )}
          </div>
        ) : null}

        {widgetSet.has('vote') && vote ? <div className="mt-4"><VoteCard vote={vote} theme={theme} compact /></div> : null}
    </OverlayPanel>
  );
}

function MobileOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelOpacity, brandMotionEnabled, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} opacity={panelOpacity} className={`${panelClassName} rounded-xl p-4`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Player mobile"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
          brandMotionEnabled={brandMotionEnabled}
        />

        {widgetSet.has('play') ? (
          <div className="mt-4 rounded-lg border border-piu-border/60 bg-piu-dark/60 p-4">
            <span className="inline-flex rounded-md border border-piu-border/60 bg-piu-card/70 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-gray-300">Latest Play</span>
            <div className="mt-3 flex items-center gap-3">
              <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-display font-semibold text-gray-100">{play?.song_title || 'Waiting for the next chart'}</p>
                <p className="text-[11px] text-gray-400">{play ? `${modeShort(play.mode)}${play.level}` : 'Sync armed'}</p>
              </div>
            </div>
          </div>
        ) : null}

        {widgetSet.has('result') ? (
          <div className="mt-3">
            <ResultBadges
              play={play}
              requests={requestCounts}
              theme={theme}
              compact
              includeRequestBadges={!widgetSet.has('requests')}
            />
          </div>
        ) : null}

        {widgetSet.has('summary') && summary ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <OverlayBadge theme={theme} label="Songs" value={summary.songCount || 0} />
            <OverlayBadge theme={theme} label="Clears" value={`${summary.clearCount || 0}/${summary.songCount || 0}`} emphasis="strong" />
            <OverlayBadge theme={theme} label="Avg Score" value={formatNumber(summary.averageScore)} emphasis="alt" />
            <OverlayBadge theme={theme} label="Avg Lv" value={summary.averageLevel || 0} />
          </div>
        ) : null}

        {widgetSet.has('requests') ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <OverlayBadge theme={theme} label="Open req" value={requestCounts.open} />
            <OverlayBadge theme={theme} label="Queued" value={requestCounts.queued} emphasis="strong" />
            <OverlayBadge theme={theme} label="Played" value={requestCounts.played} emphasis="alt" />
            <OverlayBadge theme={theme} label="Skipped" value={requestCounts.skipped} />
          </div>
        ) : null}

        {widgetSet.has('vote') && vote ? <div className="mt-3"><VoteCard vote={vote} theme={theme} compact /></div> : null}
    </OverlayPanel>
  );
}

export default function LiveOverlayPage() {
  const { sessionId } = useParams();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const overlayToken = String(searchParams.get('token') || '').trim();
  const sceneId = normalizeLiveOverlayScene(searchParams.get('scene'));
  const presetId = normalizeLiveOverlayPreset(searchParams.get('preset'));
  const themeId = normalizeLiveOverlayTheme(searchParams.get('theme'));
  const fitId = normalizeLiveOverlayFit(searchParams.get('fit'));
  const anchorId = normalizeLiveOverlayAnchor(searchParams.get('anchor'));
  const autoHideId = normalizeLiveOverlayAutoHide(searchParams.get('autohide'));
  const guidesEnabled = normalizeLiveOverlayGuides(searchParams.get('guides'));
  const motionEnabled = searchParams.get('motion') !== '0';
  const brandMotionEnabled = normalizeLiveOverlayBrandMotion(searchParams.get('brandmotion'));
  const overlayOpacity = normalizeLiveOverlayOpacity(searchParams.get('opacity'));
  const widgetIds = normalizeLiveOverlayWidgets(searchParams.get('widgets'), presetId);
  const widgetSet = useMemo(() => new Set(widgetIds), [widgetIds]);
  const theme = getLiveOverlayTheme(themeId);
  const fit = getLiveOverlayFit(fitId);
  const autoHide = getLiveOverlayAutoHide(autoHideId);
  const preset = getLiveOverlayPreset(presetId);
  const scene = getLiveOverlayScene(sceneId);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [streamState, setStreamState] = useState('idle');
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [activityNowMs, setActivityNowMs] = useState(Date.now());
  const seenMessageIdsRef = useRef(new Set());
  const reactionIdRef = useRef(0);

  const live = snapshot?.session || null;
  const play = snapshot?.last_play || null;
  const summary = snapshot?.summary || null;
  const vote = snapshot?.active_vote || null;
  const plays = useMemo(() => (Array.isArray(snapshot?.plays) ? snapshot.plays : []), [snapshot?.plays]);
  const requests = useMemo(() => (Array.isArray(snapshot?.requests) ? snapshot.requests : []), [snapshot?.requests]);
  const requestCounts = useMemo(() => getRequestCounts(snapshot?.requests), [snapshot?.requests]);
  const recentMessages = useMemo(() => getRecentChatMessages(snapshot?.messages), [snapshot?.messages]);
  const latestRequest = useMemo(() => getLatestRequest(requests), [requests]);
  const latestChat = useMemo(() => getLatestViewerChatMessage(snapshot?.messages), [snapshot?.messages]);
  const bestPlay = useMemo(() => getBestRatedPlay(plays), [plays]);
  const shellClassName = useMemo(() => `flex min-h-screen w-full ${getOverlayShellClass(anchorId)}`, [anchorId]);
  const panelClassName = useMemo(() => getOverlayPanelClass(fit.id, preset.id), [fit.id, preset.id]);
  const reactionMotionVisible = motionEnabled && widgetSet.has('reactions');
  const overlayVisible = shouldShowOverlay(autoHide.id, {
    play,
    vote,
    messages: snapshot?.messages,
    nowMs: activityNowMs,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.getElementById('root');
    const elements = [
      document.documentElement,
      document.body,
      root,
    ].filter(Boolean);
    const previousStyles = elements.map((element) => ({
      element,
      background: element.style.background,
      backgroundColor: element.style.backgroundColor,
      backgroundImage: element.style.backgroundImage,
    }));

    for (const { element } of previousStyles) {
      element.style.background = 'transparent';
      element.style.backgroundColor = 'transparent';
      element.style.backgroundImage = 'none';
    }

    return () => {
      for (const previous of previousStyles) {
        previous.element.style.background = previous.background;
        previous.element.style.backgroundColor = previous.backgroundColor;
        previous.element.style.backgroundImage = previous.backgroundImage;
      }
    };
  }, []);

  const showFloatingReaction = (payload) => {
    if (!payload || !motionEnabled) return;
    const reaction = typeof payload === 'string'
      ? getLiveReactionPayload(payload) || { kind: 'emoji', emoji: payload }
      : payload;
    if (!reaction) return;

    const rid = reactionIdRef.current++;
    const x = 16 + Math.random() * 68;
    const burstId = reactionIdRef.current++;
    const particles = Array.from({ length: 7 }).map((_, idx) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 1.16) / 6) * idx;
      const distance = 28 + Math.random() * 30;
      return {
        id: `${burstId}-${idx}`,
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        size: `${8 + Math.round(Math.random() * 7)}px`,
      };
    });

    setFloatingReactions((prev) => [...prev, { id: rid, reaction, x }]);
    setReactionBursts((prev) => [...prev, { id: burstId, x, particles }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== rid));
    }, 1800);
    setTimeout(() => {
      setReactionBursts((prev) => prev.filter((item) => item.id !== burstId));
    }, 950);
  };

  useEffect(() => {
    if (autoHide.id === 'off' && vote?.status !== 'active' && !widgetSet.has('time_played')) return undefined;
    const interval = setInterval(() => setActivityNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [autoHide.id, vote?.status, widgetSet]);

  const applySnapshot = (nextSnapshot, { markMessagesSeen = false } = {}) => {
    const nextMessages = Array.isArray(nextSnapshot?.messages) ? nextSnapshot.messages : [];
    if (markMessagesSeen) {
      seenMessageIdsRef.current = new Set(nextMessages.map((message) => message.id));
    } else {
      const seen = seenMessageIdsRef.current;
      for (const message of nextMessages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        const payload = showBurstPayload(message);
        if (payload) showFloatingReaction(payload);
      }
    }
    setSnapshot(nextSnapshot);
  };

  useEffect(() => {
    if (!sessionId) {
      setError('Live session missing');
      setLoading(false);
      return undefined;
    }

    let closed = false;
    let source;

    try {
      setLoading(true);
      setStreamState('connecting');
      source = openLiveSessionStream(sessionId, overlayToken);
    } catch (err) {
      setError(err?.message || 'Failed to connect overlay');
      setStreamState('error');
      setLoading(false);
      return undefined;
    }

    const handleReady = () => {
      if (!closed) {
        setStreamState('live');
        setError('');
      }
    };

    const handleSnapshot = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (!payload?.snapshot) return;
        applySnapshot(payload.snapshot, { markMessagesSeen: payload?.reason === 'initial' });
        setLoading(false);
        setError('');
        if (!closed) setStreamState('live');
      } catch (err) {
        if (!closed) {
          setError(err?.message || 'Failed to read overlay snapshot');
          setLoading(false);
        }
      }
    };

    const handlePresence = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}');
        setSnapshot((prev) => {
          if (!prev?.session) return prev;
          return {
            ...prev,
            session: {
              ...prev.session,
              viewer_count: parseInt(payload?.viewer_count, 10) || 0,
              viewer_peak: parseInt(payload?.viewer_peak, 10) || 0,
            },
          };
        });
      } catch {
        // Ignore malformed presence events.
      }
    };

    const handleError = () => {
      if (!closed) {
        setStreamState('reconnecting');
        setLoading(false);
      }
    };

    source.addEventListener('ready', handleReady);
    source.addEventListener('snapshot', handleSnapshot);
    source.addEventListener('presence', handlePresence);
    source.onerror = handleError;

    return () => {
      closed = true;
      source?.close();
    };
  }, [overlayToken, sessionId]);

  let layout = null;
  if (preset.id === 'results') {
    layout = <ResultsOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelOpacity={overlayOpacity} brandMotionEnabled={brandMotionEnabled} panelClassName={panelClassName} />;
  } else if (preset.id === 'chat') {
    layout = <ChatOverlay live={live} play={play} vote={vote} messages={recentMessages} theme={theme} widgetSet={widgetSet} panelOpacity={overlayOpacity} brandMotionEnabled={brandMotionEnabled} panelClassName={panelClassName} />;
  } else if (preset.id === 'mobile') {
    layout = <MobileOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelOpacity={overlayOpacity} brandMotionEnabled={brandMotionEnabled} panelClassName={panelClassName} />;
  } else if (preset.id === 'marquee') {
    layout = <MarqueeOverlay live={live} play={play} latestRequest={latestRequest} latestChat={latestChat} bestPlay={bestPlay} summary={summary} theme={theme} widgetSet={widgetSet} nowMs={activityNowMs} panelOpacity={overlayOpacity} brandMotionEnabled={brandMotionEnabled} panelClassName={panelClassName} />;
  } else {
    layout = <CompactOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelOpacity={overlayOpacity} brandMotionEnabled={brandMotionEnabled} panelClassName={panelClassName} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-white">
      <style>{`
        @keyframes shinsa-live-brand-sweep {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(560%, 0, 0); opacity: 0; }
        }
        @keyframes shinsa-live-brand-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shinsa-live-brand-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.85); opacity: 1; }
        }
      `}</style>
      {guidesEnabled ? <SafeZoneGuides /> : null}

      {reactionMotionVisible ? (
        <>
          {reactionBursts.map((burst) => (
            <div key={burst.id} className="live-reaction-burst" style={{ left: `${burst.x}%` }}>
              {burst.particles.map((particle, idx) => (
                <span
                  key={particle.id}
                  className="live-reaction-burst__particle"
                  style={{
                    '--dx': particle.dx,
                    '--dy': particle.dy,
                    '--size': particle.size,
                    '--color': idx % 2 === 0 ? 'rgba(56, 189, 248, 0.92)' : 'rgba(244, 63, 94, 0.92)',
                  }}
                />
              ))}
            </div>
          ))}
          {floatingReactions.map((entry) => (
            <div
              key={entry.id}
              className={`pointer-events-none absolute z-20 animate-float-up ${preset.id === 'marquee' ? 'bottom-28' : 'bottom-20'}`}
              style={{ left: `${entry.x}%` }}
            >
              {entry.reaction.kind === 'emote' ? (
                <LiveEmote emote={entry.reaction.emote} size="reaction" />
              ) : (
                <div className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-3xl shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                  {entry.reaction.emoji}
                </div>
              )}
            </div>
          ))}
        </>
      ) : null}

      <div className="pointer-events-none relative z-10">
        <div
          className={`${shellClassName} transition-all duration-500 ${overlayVisible ? 'opacity-100' : 'opacity-0'}`}
          style={{
            transform: overlayVisible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 12px, 0)',
          }}
        >
          {layout}
        </div>
      </div>

      {!theme.hideFooterGradient ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-t from-black/18 to-transparent" />
      ) : null}

      {guidesEnabled ? (
        <div className="pointer-events-none absolute right-5 top-5 z-20">
          <div className={`rounded-full border px-3 py-1.5 ${theme.faintClass}`}>
            <p className="text-[10px] font-display font-bold uppercase tracking-wide">
              {scene?.label || 'Custom scene'} • {fit.label} • {autoHide.label}
            </p>
          </div>
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div className={`rounded-3xl border px-5 py-4 ${theme.chipClass}`} style={{ background: theme.surface }}>
            <p className="text-sm font-display font-black text-white">Connecting overlay...</p>
          </div>
        </div>
      ) : null}

      {error && !snapshot ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className={`max-w-md rounded-3xl border px-5 py-4 ${theme.strongClass}`} style={{ background: theme.surface }}>
            <p className="text-lg font-display font-black">Overlay unavailable</p>
            <p className="mt-2 text-sm leading-6 text-white/80">{error}</p>
            {!overlayToken ? (
              <p className="mt-2 text-xs text-white/60">
                This route needs a host session token when used as a browser source.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-white/55">
              <Link to="/live" className="pointer-events-auto underline underline-offset-4">Return to Shinsa Live</Link>
            </p>
          </div>
        </div>
      ) : null}

      {streamState === 'reconnecting' && snapshot ? (
        <div className="absolute left-5 top-5 z-20">
          <div className={`rounded-full border px-3 py-1.5 ${theme.altClass}`}>
            <p className="text-[10px] font-display font-bold uppercase tracking-wide">Reconnecting live stream</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
