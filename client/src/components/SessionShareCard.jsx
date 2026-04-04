import React, { useEffect, useMemo, useRef, useState } from 'react';
import PiuChartJacket from './PiuChartJacket';
import ScoreSnapshotModal from './ScoreSnapshotModal';
import YouTubeReplayModal from './YouTubeReplayModal';
import { HourOfPowerLogo } from './HourOfPowerBrand';
import { parseGrade } from '../utils/grades';
import { buildScoreSnapshotLinkShare } from '../utils/directMessageShares';
import { buildReplayModalTitle } from '../utils/replayTitle';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatDecimal(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '0.0';
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

function getOverTop100Rank(value) {
  const rank = parseInt(value, 10) || 0;
  return rank > 0 && rank <= 100 ? rank : 0;
}

function getGradeColorClass(grade) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS')) return 'text-piu-gold';
  if (normalized.includes('S')) return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-piu-silver';
  if (normalized.includes('AA')) return 'text-piu-bronze';
  if (normalized === 'A+' || normalized === 'A') return 'text-amber-500';
  if (normalized === 'B') return 'text-gray-300';
  if (normalized === 'C') return 'text-gray-400';
  if (normalized === 'D' || normalized === 'F') return 'text-gray-500';
  return 'text-gray-300';
}

function Stat({ label, value, className = '', labelClassName = 'text-gray-500', valueClassName = 'text-gray-100' }) {
  return (
    <div className={`rounded-lg border border-piu-border/30 bg-piu-dark/45 px-2.5 py-2 ${className}`.trim()}>
      <p className={`text-[10px] font-display uppercase tracking-wide ${labelClassName}`}>{label}</p>
      <p className={`text-sm font-display font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function YouTubeBadgeIcon({ className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function SongJacketButton({ row, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group shrink-0 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400/80"
      title="View judgments"
    >
      <PiuChartJacket
        title={row?.song_title}
        mode={row?.mode}
        level={row?.level}
        jacketUrl={row?.jacket_url}
        size="sm"
        imageClassName="group-hover:scale-[1.04]"
      />
    </button>
  );
}

const PLATE_NAMES = { PG: 'PERFECT GAME', UG: 'ULTIMATE GAME', EG: 'EXTREME GAME', SG: 'SUPERB GAME', MG: 'MARVELOUS GAME', TG: 'TALENTED GAME', FG: 'FAIR GAME', RG: 'ROUGH GAME' };
const PLATE_COLORS = { PG: 'text-piu-gold', UG: 'text-yellow-400', EG: 'text-green-400', SG: 'text-blue-400', MG: 'text-sky-400', TG: 'text-purple-400', FG: 'text-gray-400', RG: 'text-red-400' };

function buildSessionRowChartPath(row) {
  const title = String(row?.song_title || '').trim();
  return title ? `/songs?q=${encodeURIComponent(title)}` : '/songs';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildSessionShareFileName(share) {
  const baseName = share?.shareType === 'hour_of_power' ? 'hour-of-power-recap' : 'session-share';
  const title = slugify(share?.sessionTitle || '');
  const date = slugify(share?.sessionDateLabel || '');
  return [baseName, title, date].filter(Boolean).join('-') + '.png';
}

function SessionShareExportStat({
  label,
  value,
  accentClassName = 'text-white',
  className = '',
}) {
  return (
    <div className={`rounded-[28px] border border-white/10 px-7 py-6 ${className}`.trim()}>
      <p className="text-[22px] font-display font-bold uppercase tracking-[0.18em] text-white/58">{label}</p>
      <p className={`mt-3 font-display text-[54px] font-black leading-none ${accentClassName}`.trim()}>{value}</p>
    </div>
  );
}

function SessionShareExportCard({ share, title }) {
  if (!share) return null;

  const isHopShare = share?.shareType === 'hour_of_power';
  const rows = Array.isArray(share?.rows) ? share.rows : [];
  const displayTitle = title === 'Session Share' && isHopShare ? 'Hour of Power Recap' : title;
  const summaryLabel = [share.sessionDateLabel, share.sessionTimeRange, share.sessionDurationLabel].filter(Boolean).join(' • ');

  return (
    <div className="w-[1080px] overflow-hidden rounded-[42px] border border-yellow-200/18 bg-[radial-gradient(circle_at_top,rgba(255,211,107,0.14),transparent_24%),linear-gradient(155deg,#0c1631_0%,#102845_38%,#13273a_68%,#161426_100%)] p-10 text-white shadow-[0_26px_80px_rgba(0,0,0,0.48)]">
      <div className="rounded-[34px] border border-white/8 bg-black/12 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-6">
          {isHopShare ? (
            <HourOfPowerLogo className="h-32 w-24 shrink-0 rounded-[28px]" imageClassName="p-2" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className={`text-[21px] font-display font-black uppercase tracking-[0.24em] ${isHopShare ? 'text-yellow-200' : 'text-cyan-200'}`}>{displayTitle}</p>
            <h2 className="mt-2 text-[44px] font-display font-black leading-[1.02] text-white">
              {share.sessionTitle || (isHopShare ? 'One Hour. Every Clear Counts.' : 'Shared Session')}
            </h2>
            {summaryLabel ? (
              <p className="mt-4 text-[26px] text-white/82">{summaryLabel}</p>
            ) : null}
            {share.sessionMachineName ? (
              <p className="mt-2 text-[28px] text-cyan-100/92">Machine: {share.sessionMachineName}</p>
            ) : null}
            {isHopShare && share.completed === false ? (
              <p className="mt-4 inline-flex rounded-full border border-amber-300/28 bg-amber-500/12 px-4 py-2 text-[19px] font-display font-bold text-amber-100">
                Attempt ended early and is not leaderboard eligible.
              </p>
            ) : null}
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-right">
            <p className="text-[18px] font-display font-bold uppercase tracking-[0.2em] text-white/55">Included</p>
            <p className="mt-2 font-display text-[42px] font-black leading-none text-white">{rows.length}</p>
            <p className="mt-1 text-[20px] text-white/65">{isHopShare ? 'clears on one image' : 'results on one image'}</p>
          </div>
        </div>

        {isHopShare ? (
          <div className="mt-8 grid grid-cols-4 gap-4">
            <SessionShareExportStat
              label="Total Points"
              value={formatNumber(share.totalRatingPoints)}
              accentClassName="text-yellow-50"
              className="border-yellow-200/22 bg-[linear-gradient(135deg,rgba(255,223,131,0.16),rgba(145,98,24,0.18))]"
            />
            <SessionShareExportStat label="Clears" value={formatNumber(share.countedClearCount || rows.length)} className="bg-[#111c34]/76" />
            <SessionShareExportStat label="Avg Pts/Clear" value={formatDecimal(share.averageRatingPoints)} accentClassName="text-emerald-100" className="bg-[#0f2433]/76" />
            <SessionShareExportStat label="Avg Level" value={formatDecimal(share.averageLevel)} accentClassName="text-cyan-100" className="bg-[#11324a]/76" />
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-[30px] border border-white/10 bg-[#0c1327]/80">
          <div className="flex items-center justify-between gap-4 border-b border-white/6 bg-black/14 px-7 py-5">
            <div>
              <p className="text-[18px] font-display font-black uppercase tracking-[0.28em] text-cyan-200/80">Results</p>
              <h3 className="mt-2 text-[34px] font-display font-black leading-none text-white">
                {isHopShare ? 'All Counted Clears' : 'Shared Results'}
              </h3>
            </div>
            <p className="text-[24px] text-white/52">{rows.length} songs</p>
          </div>

          <div className="border-b border-white/6 bg-white/[0.02] px-7 py-3">
            <div className="grid grid-cols-[56px_minmax(0,1.9fr)_190px_112px_118px] items-center gap-4 text-[18px] font-display font-bold uppercase tracking-[0.16em] text-white/42">
              <span>#</span>
              <span>Song</span>
              <span className="text-right">Score</span>
              <span className="text-right">Pts</span>
              <span className="text-right">Grade</span>
            </div>
          </div>

          <div className="px-5 py-3">
            {rows.map((row, index) => (
              <div
                key={`${row.song_title}-${row.mode}-${row.level}-${row.score}-${index}`}
                className="grid grid-cols-[56px_minmax(0,1.9fr)_190px_112px_118px] items-center gap-4 border-b border-white/[0.04] px-2 py-3 last:border-b-0"
              >
                <div className="text-[28px] font-display font-bold text-white/62">{index + 1}</div>
                <div className="min-w-0 flex items-center gap-4">
                  <PiuChartJacket
                    title={row?.song_title}
                    mode={row?.mode}
                    level={row?.level}
                    jacketUrl={row?.jacket_url}
                    size="wide"
                    withBadge
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-[30px] font-black leading-tight text-white" title={row.song_title}>
                      {row.song_title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[18px] text-white/52">
                      <span>{row.mode} {row.level}</span>
                      {getOverTop100Rank(row.over_top100_rank) > 0 ? (
                        <span className="rounded-full border border-yellow-300/30 bg-yellow-500/10 px-2.5 py-1 text-[16px] font-display font-black text-yellow-100">
                          TOP #{getOverTop100Rank(row.over_top100_rank)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-[30px] tracking-[-0.03em] text-white/92">{formatNumber(row.score)}</div>
                <div className="text-right font-display text-[32px] font-black text-emerald-200">{formatNumber(row.rating_points)}</div>
                <div className={`text-right font-display text-[32px] font-black ${getGradeColorClass(row.grade)}`}>{row.grade || '-'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 text-[20px] text-white/46">
          <p>Shared from Shinsa</p>
          <p>Hour of Power recap image</p>
        </div>
      </div>
    </div>
  );
}

export default function SessionShareCard({
  share,
  className = '',
  title = 'Session Share',
  actions = null,
  compact = false,
  flush = false,
  showImageShareControl = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [activeRow, setActiveRow] = useState(null);
  const [selectedReplay, setSelectedReplay] = useState(null);
  const [shareImageStatus, setShareImageStatus] = useState('');
  const [sharingImage, setSharingImage] = useState(false);
  const captureRef = useRef(null);
  const exportRef = useRef(null);

  const rows = Array.isArray(share?.rows) ? share.rows : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / 10));
  const isHopShare = share?.shareType === 'hour_of_power';
  const displayTitle = title === 'Session Share' && isHopShare ? 'Hour of Power Recap' : title;
  const activeRowDmShare = useMemo(() => {
    if (!activeRow) return null;
    return buildScoreSnapshotLinkShare({
      kind: 'score_snapshot',
      score: activeRow,
      path: buildSessionRowChartPath(activeRow),
      chartPath: buildSessionRowChartPath(activeRow),
      jacketUrl: activeRow.jacket_url,
    });
  }, [activeRow]);

  useEffect(() => {
    if (!expanded) setPage(1);
  }, [expanded]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!shareImageStatus || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setShareImageStatus(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [shareImageStatus]);

  const startIndex = compact ? 0 : (expanded ? (page - 1) * 10 : 0);
  const visibleRows = useMemo(() => {
    if (compact) return rows.slice(0, 3);
    if (expanded) return rows.slice(startIndex, startIndex + 10);
    return rows.slice(0, 5);
  }, [compact, expanded, rows, startIndex]);
  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const imageShareEnabled = !!showImageShareControl && !compact;

  if (!share) return null;

  const handleShareImage = async () => {
    const targetNode = exportRef.current || captureRef.current;
    if (!targetNode || sharingImage) return;
    setSharingImage(true);
    try {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });

      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(targetNode, {
        backgroundColor: isHopShare ? '#0b1324' : '#071326',
        pixelRatio: 2,
        cacheBust: true,
      });
      const blob = await fetch(dataUrl).then((response) => response.blob());
      const fileName = buildSessionShareFileName(share);
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      const canShareFiles = shareSupported
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: displayTitle,
          text: isHopShare ? 'Hour of Power recap from Shinsa' : 'Session recap from Shinsa',
        });
        setShareImageStatus('shared');
        return;
      }

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
      setShareImageStatus('downloaded');
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      setShareImageStatus('error');
    } finally {
      setSharingImage(false);
    }
  };

  const shareImageLabel = sharingImage
    ? 'Preparing image'
    : shareImageStatus === 'shared'
      ? 'Image shared'
      : shareImageStatus === 'downloaded'
        ? 'Image downloaded'
        : shareImageStatus === 'error'
          ? 'Try again'
          : (shareSupported ? 'Share image' : 'Download image');

  const rankHeaderClass = 'text-left py-1 pl-1.5 pr-0.5 font-display font-bold w-5 sm:px-2';
  const songHeaderClass = 'text-left py-1 pl-1 pr-0.5 font-display font-bold sm:px-2';
  const scoreHeaderClass = 'w-[82px] py-1 pl-0.5 pr-1.5 text-right font-display font-bold sm:w-[104px] sm:px-2';
  const ratingHeaderClass = 'w-[50px] py-1 pl-0.5 pr-1.5 text-right font-display font-bold sm:w-[68px] sm:px-2';
  const gradeHeaderClass = 'w-[42px] py-1 pl-0.5 pr-2.5 text-right font-display font-bold sm:w-[56px] sm:px-1';
  const rankCellClass = 'py-1.5 pl-1.5 pr-0.5 text-gray-400 font-mono align-top sm:px-2';
  const songCellClass = 'min-w-0 py-1.5 pl-1 pr-0.5 sm:px-2';
  const scoreCellClass = 'py-1.5 pl-0 pr-1.5 text-right whitespace-nowrap sm:px-2';
  const ratingCellClass = 'py-1.5 pl-0 pr-1.5 text-right whitespace-nowrap sm:px-2';
  const gradeCellClass = 'py-1.5 pl-0 pr-2.5 text-right whitespace-nowrap sm:px-1';
  const wrapperClass = flush
    ? `${isHopShare ? 'bg-[linear-gradient(135deg,rgba(18,25,56,0.5),rgba(11,57,73,0.4)_48%,rgba(24,18,42,0.5))]' : 'bg-gradient-to-br from-cyan-500/8 via-emerald-500/5 to-transparent'} ${compact ? 'p-2.5' : 'p-3'}`
    : isHopShare
      ? `rounded-xl border border-yellow-300/30 bg-[linear-gradient(135deg,rgba(18,25,56,0.98),rgba(11,57,73,0.92)_48%,rgba(24,18,42,0.98))] ${compact ? 'p-2.5' : 'p-3'} shadow-[0_10px_30px_rgba(0,0,0,0.3)]`
      : `rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 via-emerald-500/10 to-transparent ${compact ? 'p-2.5' : 'p-3'}`;

  return (
    <>
      <div ref={captureRef} className={`${wrapperClass} ${className}`.trim()}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              {isHopShare ? (
                <HourOfPowerLogo className="h-16 w-12 shrink-0 rounded-xl" imageClassName="p-1" />
              ) : null}
              <div className="min-w-0">
                <p className={`text-[10px] font-display font-bold uppercase tracking-wider ${isHopShare ? 'text-yellow-200' : 'text-cyan-300'}`}>{displayTitle}</p>
                <p className="text-xs text-gray-200">
                  {share.sessionDateLabel}
                  {share.sessionTimeRange ? ` • ${share.sessionTimeRange}` : ''}
                  {share.sessionDurationLabel ? ` • ${share.sessionDurationLabel}` : ''}
                </p>
                {share.sessionMachineName ? (
                  <p className={`mt-0.5 text-[11px] ${isHopShare ? 'text-cyan-100/90' : 'text-cyan-300/90'}`}>Machine: {share.sessionMachineName}</p>
                ) : null}
                {isHopShare && share.completed === false ? (
                  <p className="mt-1 text-[11px] text-amber-200">Attempt ended early and is not leaderboard eligible.</p>
                ) : null}
              </div>
            </div>
          </div>
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </div>

        {isHopShare ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Total Points"
                value={(
                  <span className="inline-flex items-center rounded-md border border-yellow-200/25 bg-black/20 px-2.5 py-1 font-display font-black text-yellow-50 shadow-[inset_0_1px_0_rgba(255,244,191,0.08)]">
                    {formatNumber(share.totalRatingPoints)}
                  </span>
                )}
                className="border-yellow-300/35 bg-[linear-gradient(135deg,rgba(255,219,94,0.16),rgba(125,88,28,0.18))] shadow-[inset_0_1px_0_rgba(255,244,191,0.12)]"
                labelClassName="text-yellow-100/80"
                valueClassName="text-yellow-50"
              />
              <Stat label="Clears" value={share.countedClearCount || rows.length} className="border-cyan-300/20 bg-cyan-500/10" labelClassName="text-cyan-100/75" valueClassName="text-white" />
              <Stat label="Avg Pts/Clear" value={formatDecimal(share.averageRatingPoints)} className="border-emerald-300/20 bg-emerald-500/10" labelClassName="text-emerald-100/75" valueClassName="text-emerald-50" />
              <Stat label="Avg Level" value={formatDecimal(share.averageLevel)} className="border-sky-300/20 bg-sky-500/10" labelClassName="text-sky-100/75" valueClassName="text-sky-50" />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <Stat label="Songs" value={share.songCount || rows.length} />
              <Stat label="Clears" value={`${share.clearCount || 0} (${share.clearRate || 0}%)`} />
              <Stat label="Avg Score" value={formatNumber(share.averageScore)} />
              <Stat label="Perfects" value={`${share.perfectRate || 0}%`} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="px-2 py-1 rounded border border-cyan-400/35 bg-cyan-500/15 text-cyan-200 font-display font-bold">Mode: {share.filterMode || 'Both'}</span>
              <span className="px-2 py-1 rounded border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 font-display font-bold">Min grade: {share.minGradeLabel || 'Pass'}</span>
              <span className="px-2 py-1 rounded border border-piu-border/50 bg-piu-dark/50 text-gray-300 font-display font-bold">{share.levelRangeLabel || 'Any level'}</span>
            </div>
          </>
        )}

        <div className="mt-3 rounded-lg border border-piu-border/40 bg-piu-dark/35 overflow-hidden">
          <div className="px-3 py-2 border-b border-piu-border/30 bg-piu-dark/40 flex items-center justify-between">
            <p className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide">
              {isHopShare ? 'Hour of Power Results' : 'Selected Results'}
            </p>
            <p className="text-[10px] text-gray-500">{compact ? `${Math.min(3, rows.length)} of ${rows.length}` : (expanded ? `Page ${page}/${totalPages}` : `${Math.min(5, rows.length)} of ${rows.length}`)}</p>
          </div>

          {visibleRows.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">
              {isHopShare ? 'No counted clears were recorded for this attempt.' : 'No songs matched this filter.'}
            </p>
          ) : (
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-[10px] text-gray-500 border-b border-piu-border/25">
                  <th className={rankHeaderClass}>#</th>
                  <th className={songHeaderClass}>Song</th>
                  <th className={scoreHeaderClass}>Score</th>
                  {isHopShare ? <th className={ratingHeaderClass}>Pts</th> : null}
                  <th className={gradeHeaderClass}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const number = expanded ? (startIndex + idx + 1) : idx + 1;
                  return (
                    <tr key={`${row.song_title}-${row.mode}-${row.level}-${row.score}-${idx}`} className="border-b border-piu-border/20 last:border-0">
                      <td className={rankCellClass}>{number}</td>
                      <td className={songCellClass}>
                        <div className="flex items-start gap-1.5">
                          <SongJacketButton row={row} onClick={() => setActiveRow(row)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start">
                              <p
                                className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-gray-200 font-display font-bold leading-tight"
                                title={row.song_title}
                              >
                                {row.song_title}
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {getOverTop100Rank(row.over_top100_rank) > 0 ? (
                                <span className="inline-flex items-center rounded border border-yellow-300/60 bg-yellow-500/15 px-1.5 py-0.5 text-[11px] leading-none text-yellow-100 font-display font-black tracking-wide">
                                  TOP #{getOverTop100Rank(row.over_top100_rank)}
                                </span>
                              ) : null}
                              {row.weekly_challenge_week_key ? (
                                <a href={`/weekly-challenges?week=${row.weekly_challenge_week_key}`} className="inline-flex items-center rounded border border-purple-500/25 bg-purple-500/15 px-1.5 py-0.5 text-[9px] leading-none text-purple-300 font-display font-black hover:bg-purple-500/25 transition-colors">
                                  WC
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={scoreCellClass}>
                        <div className="flex items-center justify-end gap-px">
                          {row.replay_embed_url ? (
                            <button
                              type="button"
                              className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-sky-400/35 bg-sky-500/10 transition-colors hover:bg-sky-500/20"
                              title="Open replay clip"
                              onClick={() => setSelectedReplay({
                                url: row.replay_embed_url,
                                title: buildReplayModalTitle(row),
                                playId: row.play_id || row.id || '',
                                ownerId: row.user_id || '',
                              })}
                            >
                              <YouTubeBadgeIcon className="h-2.5 w-2.5 text-sky-300" />
                            </button>
                          ) : null}
                          <span className="font-mono text-[11px] text-gray-200 sm:text-xs">{formatNumber(row.score)}</span>
                        </div>
                      </td>
                      {isHopShare ? (
                        <td className={ratingCellClass}>
                          <span className="font-display font-bold text-emerald-200">{formatNumber(row.rating_points)}</span>
                        </td>
                      ) : null}
                      <td className={gradeCellClass}>
                        <button
                          type="button"
                          onClick={() => setActiveRow(row)}
                          className={`text-[11px] font-display font-bold hover:underline sm:text-xs ${getGradeColorClass(row.grade)}`}
                          title="View judgments"
                        >
                          {row.grade || '-'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!compact && rows.length > 5 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="px-2.5 py-1 rounded border border-cyan-400/35 text-cyan-300 hover:bg-cyan-400/10 text-[10px] font-display font-bold"
            >
              {expanded ? 'Show Top 5' : isHopShare ? 'Show All Clears' : 'Show More'}
            </button>
            {expanded && totalPages > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-piu-border/60 text-[10px] text-gray-300 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-[10px] text-gray-500">{page}/{totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-piu-border/60 text-[10px] text-gray-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-gray-500">Tap jackets or grades to view judgments.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-gray-500">{compact ? 'Tap jackets or grades for details.' : 'Tap jackets or grades to view judgments.'}</p>
        )}
      </div>
      {imageShareEnabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleShareImage}
            disabled={sharingImage}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-cyan-300/28 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-display font-bold text-cyan-100 transition-colors hover:border-cyan-300/40 hover:bg-cyan-500/16 hover:text-white disabled:cursor-wait disabled:opacity-70"
            aria-label={shareImageLabel}
            title={shareImageLabel}
          >
            {sharingImage ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4 animate-spin">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.121-2.121M8.757 8.757 6.636 6.636m11.728 0-2.121 2.121M8.757 15.243l-2.121 2.121" />
              </svg>
            ) : shareImageStatus === 'shared' || shareImageStatus === 'downloaded' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v1.125A2.625 2.625 0 0 0 5.625 20.25h12.75A2.625 2.625 0 0 0 21 17.625V16.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3.75" />
              </svg>
            )}
            <span>{shareImageLabel}</span>
          </button>
        </div>
      ) : null}
      {imageShareEnabled ? (
        <div className="pointer-events-none fixed left-[-20000px] top-0 z-[-1] opacity-100">
          <div ref={exportRef}>
            <SessionShareExportCard share={share} title={title} />
          </div>
        </div>
      ) : null}

      <ScoreSnapshotModal
        score={activeRow}
        jacketUrl={activeRow?.jacket_url || ''}
        chartLink={activeRow ? buildSessionRowChartPath(activeRow) : ''}
        directMessageLinkShare={activeRowDmShare}
        modalLabel={isHopShare ? 'Session result' : 'Shared result'}
        onClose={() => setActiveRow(null)}
        playId={activeRow?.play_id}
      />
      {selectedReplay ? (
        <YouTubeReplayModal
          url={selectedReplay.url}
          title={selectedReplay.title}
          onClose={() => setSelectedReplay(null)}
          commentThread={selectedReplay.playId ? {
            itemId: selectedReplay.playId,
            ownerId: selectedReplay.ownerId || '',
          } : null}
        />
      ) : null}
    </>
  );
}
