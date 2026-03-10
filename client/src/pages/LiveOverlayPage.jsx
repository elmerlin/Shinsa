import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import PiuChartJacket from '../components/PiuChartJacket';
import LiveEmote from '../components/LiveEmote';
import { openLiveSessionStream } from '../utils/api';
import { getLiveReactionPayload, tokenizeLiveMessage } from '../utils/liveEmotes';
import { parseGrade } from '../utils/grades';
import {
  getLiveOverlayAutoHide,
  getLiveOverlayFit,
  getLiveOverlayPreset,
  getLiveOverlayScene,
  getLiveOverlayTheme,
  normalizeLiveOverlayAnchor,
  normalizeLiveOverlayAutoHide,
  normalizeLiveOverlayFit,
  normalizeLiveOverlayGuides,
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

function OverlayPanel({ theme, className = '', children, style = {} }) {
  return (
    <div
      className={`rounded-[30px] border ${theme.panelClass || 'backdrop-blur-xl'} ${theme.chipClass} ${className}`.trim()}
      style={{
        background: theme.surface,
        boxShadow: theme.shadow ? `0 28px 70px ${theme.shadow}` : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function OverlayBadge({ theme, label, value, emphasis = 'accent' }) {
  const toneClass = emphasis === 'strong'
    ? theme.strongClass
    : emphasis === 'alt'
      ? theme.altClass
      : theme.accentClass;

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] opacity-75">{label}</p>
      <p className="mt-1 text-sm font-display font-black">{value}</p>
    </div>
  );
}

function OverlayMessage({ message, theme }) {
  const reaction = showBurstPayload(message);
  const segments = tokenizeLiveMessage(message?.message || '');

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${message?.is_system ? theme.faintClass : theme.chipClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-display font-bold text-white/90">
          {message?.is_system ? (message?.message_type || 'live').replace(/_/g, ' ') : (message?.username || 'Viewer')}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-white/35">
          {message?.is_system ? 'system' : 'chat'}
        </p>
      </div>
      {reaction?.kind === 'emote' ? (
        <div className="mt-2">
          <LiveEmote emote={reaction.emote} size="compact" />
        </div>
      ) : reaction?.kind === 'emoji' ? (
        <p className="mt-2 text-2xl leading-none">{reaction.emoji}</p>
      ) : segments.length > 0 ? (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/80">
          {segments.map((segment, idx) => (
            segment.type === 'emote'
              ? <LiveEmote key={`${segment.emote.token}-${idx}`} emote={segment.emote} size="inline" />
              : <span key={`seg-${idx}`} className="whitespace-pre-wrap">{segment.text}</span>
          ))}
        </p>
      ) : (
        <p className="mt-1 text-sm text-white/80 whitespace-pre-wrap break-words">{message?.message || ''}</p>
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
    <div className={`rounded-[26px] border p-3 ${theme.chipClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-white/50">Vote</p>
          <p className="mt-1 text-sm font-display font-black text-white">
            {vote.mode_filter} Lv.{vote.min_level}{vote.max_level !== vote.min_level ? `-${vote.max_level}` : ''}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${vote.status === 'active' ? theme.accentClass : theme.altClass}`}>
          {vote.status === 'active' ? formatCountdownLabel(remainingMs) : 'Locked'}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {(vote.options || []).slice(0, compact ? 2 : 3).map((option) => (
          <div key={option.id} className={`rounded-2xl border px-3 py-2 ${option.is_winner ? theme.strongClass : theme.faintClass}`}>
            <div className="flex items-center gap-3">
              <PiuChartJacket title={option.song_title} mode={option.mode} level={option.level} jacketUrl={option.jacket_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-bold text-white">{option.song_title}</p>
                <p className="text-[11px] text-white/55">{modeShort(option.mode)}{option.level}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-display font-black text-white">{option.vote_count || 0}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/35">votes</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {vote.status !== 'active' && winner ? (
        <p className="mt-3 text-xs text-white/70">Winner: {formatPlayLabel(winner)}</p>
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

function OverlayHeader({ live, theme, presetLabel, showBrand, showViewers, showSync }) {
  if (!showBrand && !showViewers && !showSync) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showBrand ? (
        <div className={`rounded-full border px-3 py-1.5 ${theme.accentClass}`}>
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.28em]">Shinsa Live</p>
        </div>
      ) : null}
      {live?.host?.username ? (
        <div className={`rounded-full border px-3 py-1.5 ${theme.faintClass}`}>
          <p className="text-[11px] font-display font-bold text-white">{live.host.username}</p>
          <p className="text-[10px] text-white/40">{presetLabel}</p>
        </div>
      ) : null}
      {showViewers ? (
        <div className={`rounded-full border px-3 py-1.5 ${theme.strongClass}`}>
          <p className="text-[10px] font-display font-bold uppercase tracking-wide">Watching</p>
          <p className="text-sm font-display font-black">{live?.viewer_count || 0}</p>
        </div>
      ) : null}
      {showSync ? (
        <div className={`rounded-full border px-3 py-1.5 ${theme.faintClass}`}>
          <p className="text-[10px] font-display font-bold uppercase tracking-wide">Sync</p>
          <p className="text-xs text-white/75">{formatRelativeSyncTime(live?.last_sync_at)}</p>
        </div>
      ) : null}
    </div>
  );
}

function getMarqueeItems({ play, latestRequest, latestChat, bestPlay, live, theme, widgetSet }) {
  const items = [];

  if (widgetSet.has('play')) {
    items.push(
      <div key="play" className={`flex min-w-[20rem] items-center gap-3 rounded-[24px] border px-4 py-3 ${theme.chipClass}`}>
        <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="sm" />
        <div className="min-w-0">
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-white/45">Latest Play</p>
          <p className="truncate text-sm font-display font-black text-white">{play?.song_title || 'Waiting for the next chart'}</p>
          <p className="text-[11px] text-white/65">
            {play ? `${modeShort(play.mode)}${play.level} • ${play.grade || '-'} • ${formatNumber(play.score)}` : 'Sync armed'}
          </p>
        </div>
      </div>
    );
  }

  if (widgetSet.has('latest_request')) {
    items.push(
      <div key="request" className={`min-w-[18rem] rounded-[24px] border px-4 py-3 ${theme.faintClass}`}>
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-white/45">Latest Request</p>
        <p className="mt-1 truncate text-sm font-display font-black text-white">
          {latestRequest ? `${latestRequest.song_title} (${modeShort(latestRequest.mode)}${latestRequest.level})` : 'No requests yet'}
        </p>
        <p className="text-[11px] text-white/65">
          {latestRequest ? `${latestRequest.username || 'Viewer'} • ${latestRequest.status || 'open'}` : 'Waiting for the first request'}
        </p>
      </div>
    );
  }

  if (widgetSet.has('chat')) {
    items.push(
      <div key="chat" className={`min-w-[18rem] rounded-[24px] border px-4 py-3 ${theme.faintClass}`}>
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-white/45">Last Chat</p>
        <p className="mt-1 truncate text-sm font-display font-black text-white">
          {latestChat?.username || 'Chat idle'}
        </p>
        <p className="text-[11px] text-white/65 truncate">
          {latestChat?.message || 'Waiting for the next viewer message'}
        </p>
      </div>
    );
  }

  if (widgetSet.has('status')) {
    items.push(
      <div key="status" className={`min-w-[16rem] rounded-[24px] border px-4 py-3 ${theme.altClass}`}>
        <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] opacity-80">Stream Status</p>
        <p className="mt-1 text-sm font-display font-black">
          {live?.status_text || 'No status set'}
        </p>
      </div>
    );
  }

  if (widgetSet.has('best')) {
    items.push(
      <div key="best" className={`flex min-w-[20rem] items-center gap-3 rounded-[24px] border px-4 py-3 ${theme.strongClass}`}>
        <PiuChartJacket title={bestPlay?.song_title} mode={bestPlay?.mode} level={bestPlay?.level} jacketUrl={bestPlay?.background_url} size="sm" />
        <div className="min-w-0">
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] opacity-80">Best Rated Score</p>
          <p className="truncate text-sm font-display font-black">
            {bestPlay?.song_title || 'No scores yet'}
          </p>
          <p className="text-[11px] opacity-85">
            {bestPlay ? `${bestPlay.grade || '-'} • ${formatNumber(bestPlay.score)} • ${modeShort(bestPlay.mode)}${bestPlay.level}` : 'Play a chart to set the pace'}
          </p>
        </div>
      </div>
    );
  }

  return items;
}

function MarqueeOverlay({ live, play, latestRequest, latestChat, bestPlay, theme, widgetSet, panelClassName = '' }) {
  const items = useMemo(
    () => getMarqueeItems({ play, latestRequest, latestChat, bestPlay, live, theme, widgetSet }),
    [bestPlay, latestChat, latestRequest, live, play, theme, widgetSet]
  );
  const shouldAnimate = items.length > 1;
  const trackItems = shouldAnimate ? [...items, ...items] : items;

  return (
    <OverlayPanel theme={theme} className={`${panelClassName} px-4 py-4 md:px-5 md:py-4`}>
      <style>{`
        @keyframes shinsa-live-marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
      <div className="space-y-3">
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="News ticker"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
        />
        <div className="overflow-hidden">
          <div
            className="flex w-max items-stretch gap-3"
            style={shouldAnimate ? { animation: 'shinsa-live-marquee 34s linear infinite' } : undefined}
          >
            {trackItems.map((item, index) => React.cloneElement(item, { key: `${item.key || 'item'}-${index}` }))}
          </div>
        </div>
      </div>
    </OverlayPanel>
  );
}

function CompactOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} className={`${panelClassName} px-4 py-4 md:px-5 md:py-5`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.9fr)] xl:items-start">
        <div className="space-y-3">
          <OverlayHeader
            live={live}
            theme={theme}
            presetLabel="Compact ticker"
            showBrand={widgetSet.has('brand')}
            showViewers={widgetSet.has('viewers')}
            showSync={widgetSet.has('sync')}
          />
          {widgetSet.has('play') ? (
            <div className={`rounded-[28px] border px-4 py-4 ${theme.chipClass}`}>
              <div className="flex items-center gap-4">
                <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-white/45">Latest Play</p>
                  <p className="mt-1 truncate text-xl font-display font-black text-white">{play?.song_title || 'Waiting for the next chart'}</p>
                  <p className="mt-1 text-sm text-white/65">
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

function ResultsOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} className={`${panelClassName} p-4 md:p-5`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Results card"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
        />

        {widgetSet.has('play') ? (
          <div className={`mt-4 rounded-[28px] border p-4 ${theme.insetClass || theme.faintClass}`}>
            <div className="flex items-center gap-4">
              <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-white/45">Last Result</p>
                <p className="mt-1 truncate text-2xl font-display font-black text-white">{play?.song_title || 'Waiting for the next chart'}</p>
                <p className="mt-1 text-sm text-white/65">{formatPlayLabel(play)}</p>
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

function ChatOverlay({ live, play, vote, messages, theme, widgetSet, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} className={`${panelClassName} p-4 md:p-5`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Chat rail"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
        />

        {widgetSet.has('play') && play ? (
          <div className={`mt-4 rounded-[26px] border p-3 ${theme.faintClass}`}>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-white/45">Latest Play</p>
            <div className="mt-2 flex items-center gap-3">
              <PiuChartJacket title={play.song_title} mode={play.mode} level={play.level} jacketUrl={play.background_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-black text-white">{play.song_title}</p>
                <p className="text-[11px] text-white/60">{modeShort(play.mode)}{play.level} • {play.grade || '-'}</p>
              </div>
            </div>
          </div>
        ) : null}

        {widgetSet.has('chat') ? (
          <div className="mt-4 space-y-2">
            {messages.length > 0 ? messages.map((message) => (
              <OverlayMessage key={message.id} message={message} theme={theme} />
            )) : (
              <div className={`rounded-2xl border px-3 py-4 text-sm ${theme.faintClass}`}>
                Chat is waiting for the next message.
              </div>
            )}
          </div>
        ) : null}

        {widgetSet.has('vote') && vote ? <div className="mt-4"><VoteCard vote={vote} theme={theme} compact /></div> : null}
    </OverlayPanel>
  );
}

function MobileOverlay({ live, play, vote, summary, requestCounts, theme, widgetSet, panelClassName = '' }) {
  return (
    <OverlayPanel theme={theme} className={`${panelClassName} p-4`}>
        <OverlayHeader
          live={live}
          theme={theme}
          presetLabel="Player mobile"
          showBrand={widgetSet.has('brand')}
          showViewers={widgetSet.has('viewers')}
          showSync={widgetSet.has('sync')}
        />

        {widgetSet.has('play') ? (
          <div className={`mt-4 rounded-[26px] border p-4 ${theme.insetClass || theme.faintClass}`}>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-white/45">Latest Play</p>
            <div className="mt-3 flex items-center gap-3">
              <PiuChartJacket title={play?.song_title} mode={play?.mode} level={play?.level} jacketUrl={play?.background_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-display font-black text-white">{play?.song_title || 'Waiting for the next chart'}</p>
                <p className="text-[11px] text-white/60">{play ? `${modeShort(play.mode)}${play.level}` : 'Sync armed'}</p>
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
    if (autoHide.id === 'off' && vote?.status !== 'active') return undefined;
    const interval = setInterval(() => setActivityNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [autoHide.id, vote?.status]);

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
    layout = <ResultsOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelClassName={panelClassName} />;
  } else if (preset.id === 'chat') {
    layout = <ChatOverlay live={live} play={play} vote={vote} messages={recentMessages} theme={theme} widgetSet={widgetSet} panelClassName={panelClassName} />;
  } else if (preset.id === 'mobile') {
    layout = <MobileOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelClassName={panelClassName} />;
  } else if (preset.id === 'marquee') {
    layout = <MarqueeOverlay live={live} play={play} latestRequest={latestRequest} latestChat={latestChat} bestPlay={bestPlay} theme={theme} widgetSet={widgetSet} panelClassName={panelClassName} />;
  } else {
    layout = <CompactOverlay live={live} play={play} vote={vote} summary={summary} requestCounts={requestCounts} theme={theme} widgetSet={widgetSet} panelClassName={panelClassName} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent text-white">
      {guidesEnabled ? <SafeZoneGuides /> : null}

      {widgetSet.has('reactions') && motionEnabled ? (
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
            <div key={entry.id} className="pointer-events-none absolute bottom-20 z-20 animate-float-up" style={{ left: `${entry.x}%` }}>
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
