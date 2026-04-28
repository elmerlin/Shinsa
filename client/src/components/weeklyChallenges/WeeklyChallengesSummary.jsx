import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getWeeklyChallengesHome } from '../../utils/api';
import WeeklyChallengePodiumStrip from './WeeklyChallengePodiumStrip';
import { getAvatarUrl } from '../AvatarPicker';

function getLevelBadgeTone(mode) {
  if (String(mode || '').trim() === 'Single')
    return 'border-rose-200/45 bg-gradient-to-br from-[#ff7a7a] via-[#d93d62] to-[#7a1730] shadow-[0_2px_8px_rgba(217,61,98,0.3)]';
  if (String(mode || '').trim() === 'Double')
    return 'border-emerald-200/45 bg-gradient-to-br from-[#4cf4aa] via-[#16b77f] to-[#0b5d48] shadow-[0_2px_8px_rgba(22,183,127,0.28)]';
  return 'border-sky-200/45 bg-gradient-to-br from-[#69c8ff] via-[#2b88de] to-[#12457c] shadow-[0_2px_8px_rgba(43,136,222,0.28)]';
}

function getModeShort(mode) {
  return mode === 'Single' ? 'S' : mode === 'Double' ? 'D' : 'C';
}

function formatDateRange(start, end) {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
  } catch {
    return '';
  }
}

function ScrollArrow({ direction, onClick, visible }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/60 shadow-lg backdrop-blur transition hover:bg-black/80 hover:text-white ${direction === 'left' ? 'left-0' : 'right-0'}`}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {direction === 'left'
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

function ChallengePreview({ chart }) {
  const top1 = chart.top3?.[0];
  const avatarUrl = top1?.avatar ? getAvatarUrl(top1.avatar, 'sm') : '';
  return (
    <div className="relative h-[112px] w-[150px] flex-shrink-0 snap-start overflow-hidden rounded-lg border border-piu-border/50 sm:h-[118px] sm:w-[168px] xl:h-[126px] xl:w-[184px]">
      {/* Full-bleed jacket background */}
      {chart.jacket_url_snapshot ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${chart.jacket_url_snapshot})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#152238] via-[#0f1a2d] to-[#090d18]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/15" />

      {/* Level badge — top right */}
      <span className={`absolute top-1 right-1 z-10 inline-flex items-center justify-center rounded-md border px-1 py-px font-display text-[9px] font-black leading-none tracking-[-0.04em] text-white ${getLevelBadgeTone(chart.mode)}`}>
        {getModeShort(chart.mode)}{chart.level}
      </span>

      {/* Content at bottom */}
      <div className="relative z-10 flex h-full flex-col justify-end p-2">
        {top1 && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[8px] text-piu-gold">🥇</span>
            {avatarUrl && (
              <img src={avatarUrl} alt="" className="h-[14px] w-[14px] shrink-0 rounded-full border border-white/20 object-cover" loading="lazy" decoding="async" />
            )}
            <span className="truncate text-[9px] font-display font-bold text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{top1.username}</span>
          </div>
        )}
        <p className="font-display text-[11px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-1">
          {chart.song_title_snapshot}
        </p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[9px] font-display text-white/40">{chart.participantCount || 0} played</span>
          {top1 && <span className="text-[9px] font-display font-bold text-white/60">{(top1.score || 0).toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
}

export default function WeeklyChallengesSummary() {
  const [data, setData] = useState(null);
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    getWeeklyChallengesHome().then(setData).catch(() => {});
  }, []);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScroll();
    el.addEventListener('scroll', updateScroll, { passive: true });
    const ro = new ResizeObserver(updateScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScroll); ro.disconnect(); };
  }, [updateScroll, data]);

  if (!data?.week) return null;

  const { week, awards, challengePreviews, participantCount, viewerSummary } = data;
  const overallAwards = (awards || []).filter(a => a.award_key === 'overall');
  const singlesFirst = (awards || []).find(a => a.award_key === 'singles' && a.rank === 1);
  const doublesFirst = (awards || []).find(a => a.award_key === 'doubles' && a.rank === 1);

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-bold text-white uppercase tracking-wide">
            Weekly Challenges
          </h2>
          <span className="text-[9px] text-white/30 font-display">
            {formatDateRange(week.starts_at_utc, week.ends_at_utc)}
          </span>
          {week.status === 'active' && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-display font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              LIVE
            </span>
          )}
        </div>
        <span className="text-[9px] text-white/30">{participantCount || 0} players</span>
      </div>

      {/* Content row: Podium + Singles/Doubles badges + Challenge previews */}
      <div className="flex items-start gap-2">
        {/* Left: Compact podium */}
        {overallAwards.length > 0 && (
          <div className="hidden w-[194px] shrink-0 sm:block xl:w-[208px]">
            <WeeklyChallengePodiumStrip awards={overallAwards} compact />
            {/* Singles & Doubles first place badges */}
            <div className="flex gap-1.5 mt-2">
              {singlesFirst && (
                <div className="flex items-center gap-1 px-1.5 py-1 rounded border border-rose-500/20 bg-rose-500/[0.06] flex-1 min-w-0">
                  <span className="text-[7px] font-display font-black text-rose-400">S</span>
                  <span className="truncate text-[8px] font-display font-bold text-white/60">
                    {singlesFirst.username_snapshot}
                  </span>
                </div>
              )}
              {doublesFirst && (
                <div className="flex items-center gap-1 px-1.5 py-1 rounded border border-emerald-500/20 bg-emerald-500/[0.06] flex-1 min-w-0">
                  <span className="text-[7px] font-display font-black text-emerald-400">D</span>
                  <span className="truncate text-[8px] font-display font-bold text-white/60">
                    {doublesFirst.username_snapshot}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Challenge previews scroll rail */}
        <div className="flex-1 min-w-0 relative">
          <ScrollArrow direction="left" onClick={() => scrollRef.current?.scrollBy({ left: -170, behavior: 'smooth' })} visible={canLeft} />
          <ScrollArrow direction="right" onClick={() => scrollRef.current?.scrollBy({ left: 170, behavior: 'smooth' })} visible={canRight} />
          <div
            ref={scrollRef}
            className="flex gap-1.5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 scrollbar-none"
            style={{ scrollbarWidth: 'none' }}
          >
            {(challengePreviews || []).map(chart => (
              <ChallengePreview key={chart.id} chart={chart} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: show podium below previews */}
      {overallAwards.length > 0 && (
        <div className="sm:hidden mt-2">
          <WeeklyChallengePodiumStrip awards={overallAwards} compact />
        </div>
      )}

      {/* Viewer summary */}
      {viewerSummary && (
        <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-piu-gold/[0.04] border border-piu-gold/15">
          <span className="text-[9px] font-display font-bold text-piu-gold/70">Your week</span>
          <span className="text-[10px] font-display font-bold text-white/70">
            {(viewerSummary.totalPoints || 0).toLocaleString()} pts
          </span>
          <span className="text-[9px] text-white/40">
            {viewerSummary.totalClears || 0} clears
          </span>
        </div>
      )}

      {/* CTA */}
      <Link
        to="/weekly-challenges"
        className="mt-2 flex items-center justify-center gap-1 px-3 py-2 rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-[11px] font-display font-bold text-white/60 hover:text-white"
      >
        View All Challenges
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
