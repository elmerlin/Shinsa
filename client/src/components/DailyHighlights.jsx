import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { parseGrade } from '../utils/grades';
import { getAvatarUrl } from './AvatarPicker';
import { resolveChartJacketUrl } from './PiuChartJacket';
import YouTubeReplayModal from './YouTubeReplayModal';
import { getCountryFlag } from './PlayerRegistration';

// ── Shared helpers (mirrored from ScoreSnapshotCard) ────────────────────────

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

function getModeBadgeClasses(mode) {
  if (String(mode || '').trim() === 'Single')
    return 'border-red-300/60 bg-gradient-to-b from-red-500 to-red-800 text-white';
  if (String(mode || '').trim() === 'Double')
    return 'border-emerald-300/60 bg-gradient-to-b from-emerald-500 to-emerald-800 text-white';
  return 'border-sky-300/50 bg-gradient-to-b from-sky-500 to-sky-800 text-white';
}

function fmt(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

const RANK_BADGE_STYLES = [
  'from-piu-gold via-yellow-300 to-amber-600 text-black shadow-[0_0_18px_rgba(255,215,0,0.45)]',
  'from-gray-200 via-white to-gray-400 text-gray-800 shadow-[0_0_14px_rgba(200,200,220,0.35)]',
  'from-amber-600 via-orange-400 to-amber-800 text-white shadow-[0_0_14px_rgba(200,130,50,0.3)]',
  'from-cyan-400 via-sky-300 to-blue-500 text-white shadow-[0_0_10px_rgba(100,180,255,0.25)]',
  'from-violet-400 via-purple-300 to-indigo-500 text-white shadow-[0_0_10px_rgba(140,100,255,0.25)]',
];

// ── Entrance animation hook ─────────────────────────────────────────────────

function useStaggeredEntrance(count) {
  const [visible, setVisible] = useState([]);
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const delays = Array.from({ length: count }, (_, i) => i);
          delays.forEach((_, i) => {
            setTimeout(() => setVisible((prev) => {
              if (prev.includes(i)) return prev;
              return [...prev, i];
            }), 90 * i);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [count]);
  return { ref, visible };
}

// ── Rank badge ──────────────────────────────────────────────────────────────

function RankBadge({ rank }) {
  const style = RANK_BADGE_STYLES[rank - 1] || RANK_BADGE_STYLES[4];
  return (
    <span
      className={`absolute -top-1 -left-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br font-display text-[9px] font-black leading-none ${style}`}
    >
      {rank}
    </span>
  );
}

// ── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, accent }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <h3 className="font-display text-[11px] font-black tracking-[0.12em] uppercase text-white/90">
        {title}
      </h3>
      <div className={`ml-1 h-px flex-1 bg-gradient-to-r ${accent} to-transparent`} />
    </div>
  );
}

// ── YouTube play icon overlay ───────────────────────────────────────────────

function PlayOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600/90 shadow-[0_0_18px_rgba(255,0,0,0.4)] backdrop-blur-sm">
        <svg className="ml-0.5 h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

// ── Replay carousel card ────────────────────────────────────────────────────

function ReplayCard({ play, rank, jacketLookup, onReplayClick, visible }) {
  const jacket = resolveChartJacketUrl({
    title: play.song_title,
    mode: play.mode,
    level: play.level,
    jacketLookup,
    backgroundUrl: play.background_url,
  });
  const score = parseInt(play.score, 10) || 0;
  const rankInfo = getRank(score);
  const grade = parseGrade(play.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const avatarUrl = play.avatar ? getAvatarUrl(play.avatar) : '';

  return (
    <button
      type="button"
      onClick={() => onReplayClick(play.replay_embed_url, `${play.song_title} — ${play.username}`)}
      className={`group relative flex-shrink-0 w-[200px] sm:w-[220px] overflow-hidden rounded-xl border border-piu-border/60 transition-all duration-500 ease-out hover:border-sky-400/40 hover:shadow-[0_6px_24px_rgba(56,189,248,0.12)] ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <RankBadge rank={rank} />

      {/* Jacket background */}
      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#152238] via-[#0f1a2d] to-[#090d18]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

      <PlayOverlay />

      {/* Content */}
      <div className="relative z-10 flex h-[110px] flex-col justify-end p-2.5">
        <p className="font-display text-[11px] font-black leading-tight text-white line-clamp-1">
          {play.song_title}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-4 w-4 rounded-full border border-white/20 object-cover" />
          ) : null}
          <span className="text-[9px] text-gray-300 font-display font-bold truncate">
            {play.nationality ? `${getCountryFlag(play.nationality)} ` : ''}{play.username}
          </span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-base font-black text-white leading-none">{fmt(score)}</span>
            <span className={`font-display text-sm font-black leading-none ${getGradeColor(gradeDisplay, score)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>
              {gradeDisplay}
            </span>
          </div>
          {play.level > 0 && (
            <span className={`inline-flex h-5.5 min-w-[24px] items-center justify-center rounded-full border px-1 font-display text-[10px] font-black ${getModeBadgeClasses(play.mode)}`}>
              {play.level}
            </span>
          )}
        </div>
      </div>

      {/* Replay badge */}
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-full bg-red-600/80 px-1.5 py-0.5 text-[8px] font-display font-bold text-white shadow-lg backdrop-blur-sm">
        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
        Replay
      </div>
    </button>
  );
}

// ── Carousel scroll arrows ──────────────────────────────────────────────────

function ScrollArrow({ direction, onClick, visible }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-piu-dark/80 text-white/70 shadow-lg backdrop-blur-sm transition-all hover:bg-piu-dark hover:text-white ${direction === 'left' ? 'left-1' : 'right-1'}`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {direction === 'left' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        )}
      </svg>
    </button>
  );
}

// ── Upscore highlight card ──────────────────────────────────────────────────

function UpscoreCard({ item, rank, jacketLookup, visible }) {
  const jacket = resolveChartJacketUrl({
    title: item.song_title,
    mode: item.mode,
    level: item.level,
    jacketLookup,
    backgroundUrl: item.background_url,
  });
  const newScore = parseInt(item.new_score ?? item.score, 10) || 0;
  const oldScore = parseInt(item.old_score, 10) || 0;
  const delta = newScore - oldScore;
  const rankInfo = getRank(newScore);
  const grade = parseGrade(item.new_grade || item.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const oldGrade = parseGrade(item.old_grade, getRank(oldScore).label);
  const avatarUrl = item.avatar ? getAvatarUrl(item.avatar) : '';

  return (
    <Link
      to={`/upscore/${item.upscore_id}`}
      className={`group relative flex-shrink-0 w-[150px] overflow-hidden rounded-xl border border-piu-border/50 transition-all duration-500 ease-out hover:border-piu-green/40 hover:shadow-[0_4px_20px_rgba(51,255,102,0.1)] ${rank === 1 ? 'ring-1 ring-piu-gold/20' : ''} ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <RankBadge rank={rank} />

      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f12] via-[#0a1a0e] to-[#060d08]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/60 to-black/25" />

      <div className="relative z-10 flex h-[132px] flex-col justify-end p-2">
        {/* Player row */}
        <div className="flex items-center gap-1 mb-1">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-4 w-4 rounded-full border border-white/15 object-cover" />
          ) : null}
          <span className="text-[9px] text-gray-300 font-display font-bold truncate">
            {item.nationality ? `${getCountryFlag(item.nationality)} ` : ''}{item.username}
          </span>
        </div>

        {/* Song title */}
        <p className="font-display text-[10px] font-black leading-tight text-white line-clamp-1 mb-1.5">
          {item.song_title}
        </p>

        {/* Score + grade */}
        <div className="flex items-baseline justify-between gap-1">
          <span className="font-display text-sm font-black text-white leading-none">{fmt(newScore)}</span>
          <span className={`font-display text-xs font-black leading-none ${getGradeColor(gradeDisplay, newScore)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>
            {gradeDisplay}
          </span>
        </div>

        {/* Delta row */}
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[8px] text-gray-400">
            {fmt(oldScore)} {oldGrade.display}
          </span>
          <span className={`font-mono text-[10px] font-bold ${delta > 0 ? 'text-piu-green' : delta < 0 ? 'text-rose-300' : 'text-gray-400'}`}>
            {delta > 0 ? '+' : ''}{delta.toLocaleString()}
          </span>
        </div>

        {/* Level badge */}
        {item.level > 0 && (
          <div className="absolute top-1.5 right-1.5">
            <span className={`inline-flex h-5.5 min-w-[24px] items-center justify-center rounded-full border px-1 font-display text-[10px] font-black ${getModeBadgeClasses(item.mode)}`}>
              {item.level}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── New clear highlight card ────────────────────────────────────────────────

function ClearCard({ item, rank, jacketLookup, visible }) {
  const jacket = resolveChartJacketUrl({
    title: item.song_title,
    mode: item.mode,
    level: item.level,
    jacketLookup,
    backgroundUrl: item.background_url,
  });
  const score = parseInt(item.score, 10) || 0;
  const rankInfo = getRank(score);
  const grade = parseGrade(item.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const avatarUrl = item.avatar ? getAvatarUrl(item.avatar) : '';

  return (
    <Link
      to={`/clear/${item.clear_id}`}
      className={`group relative flex-shrink-0 w-[150px] overflow-hidden rounded-xl border border-piu-border/50 transition-all duration-500 ease-out hover:border-sky-400/40 hover:shadow-[0_4px_20px_rgba(56,189,248,0.1)] ${rank === 1 ? 'ring-1 ring-piu-gold/20' : ''} ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <RankBadge rank={rank} />

      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1525] via-[#0a1020] to-[#06090f]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/60 to-black/25" />

      <div className="relative z-10 flex h-[132px] flex-col justify-end p-2">
        {/* Player row */}
        <div className="flex items-center gap-1 mb-1">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-4 w-4 rounded-full border border-white/15 object-cover" />
          ) : null}
          <span className="text-[9px] text-gray-300 font-display font-bold truncate">
            {item.nationality ? `${getCountryFlag(item.nationality)} ` : ''}{item.username}
          </span>
        </div>

        {/* Song title */}
        <p className="font-display text-[10px] font-black leading-tight text-white line-clamp-1 mb-1.5">
          {item.song_title}
        </p>

        {/* Score + grade */}
        <div className="flex items-baseline justify-between gap-1">
          <span className="font-display text-sm font-black text-white leading-none">{fmt(score)}</span>
          <span className={`font-display text-xs font-black leading-none ${getGradeColor(gradeDisplay, score)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>
            {gradeDisplay}
          </span>
        </div>

        {/* Plate */}
        {item.plate && (
          <p className="mt-0.5 text-[8px] font-display font-bold tracking-[0.1em] text-emerald-300/80">
            {item.plate}
          </p>
        )}

        {/* Level badge */}
        {item.level > 0 && (
          <div className="absolute top-1.5 right-1.5">
            <span className={`inline-flex h-5.5 min-w-[24px] items-center justify-center rounded-full border px-1 font-display text-[10px] font-black ${getModeBadgeClasses(item.mode)}`}>
              {item.level}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Horizontal scroll rail ──────────────────────────────────────────────────

function ScrollRail({ children, className = '' }) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [updateArrows]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 180, behavior: 'smooth' });
  };

  return (
    <div className={`relative ${className}`}>
      <ScrollArrow direction="left" onClick={() => scroll(-1)} visible={canLeft} />
      <ScrollArrow direction="right" onClick={() => scroll(1)} visible={canRight} />
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1.5 scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function DailyHighlights({ data, jacketLookup = {} }) {
  const [replayModal, setReplayModal] = useState(null);

  const topReplays = data?.topReplays || [];
  const topUpscores = data?.topUpscores || [];
  const topClears = data?.topClears || [];

  const hasReplays = topReplays.length > 0;
  const hasUpscores = topUpscores.length > 0;
  const hasClears = topClears.length > 0;

  const replayAnim = useStaggeredEntrance(topReplays.length);
  const upscoreAnim = useStaggeredEntrance(topUpscores.length);
  const clearAnim = useStaggeredEntrance(topClears.length);

  if (!hasReplays && !hasUpscores && !hasClears) return null;

  return (
    <div className="mb-6">
      {/* Section title */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-display text-sm font-bold tracking-wider text-piu-accent">
          TODAY&apos;S HIGHLIGHTS
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-piu-accent/40 to-transparent" />
      </div>

      {/* Top Replay Plays carousel */}
      {hasReplays && (
        <div ref={replayAnim.ref} className="mb-3.5">
          <SectionHeader
            icon="🎬"
            title="Top Plays"
            accent="from-red-500/40"
          />
          <ScrollRail>
            {topReplays.map((play, i) => (
              <ReplayCard
                key={play.id || i}
                play={play}
                rank={i + 1}
                jacketLookup={jacketLookup}
                onReplayClick={(url, title) => setReplayModal({ url, title })}
                visible={replayAnim.visible.includes(i)}
              />
            ))}
          </ScrollRail>
        </div>
      )}

      {/* Best Upscores */}
      {hasUpscores && (
        <div ref={upscoreAnim.ref} className="mb-3.5">
          <SectionHeader
            icon="📈"
            title="Best Upscores"
            accent="from-piu-green/40"
          />
          <ScrollRail>
            {topUpscores.map((item, i) => (
              <UpscoreCard
                key={`${item.upscore_id}-${item.song_title}-${i}`}
                item={item}
                rank={i + 1}
                jacketLookup={jacketLookup}
                visible={upscoreAnim.visible.includes(i)}
              />
            ))}
          </ScrollRail>
        </div>
      )}

      {/* Best New Clears */}
      {hasClears && (
        <div ref={clearAnim.ref} className="mb-2">
          <SectionHeader
            icon="🎯"
            title="Best New Clears"
            accent="from-sky-400/40"
          />
          <ScrollRail>
            {topClears.map((item, i) => (
              <ClearCard
                key={`${item.clear_id}-${item.song_title}-${i}`}
                item={item}
                rank={i + 1}
                jacketLookup={jacketLookup}
                visible={clearAnim.visible.includes(i)}
              />
            ))}
          </ScrollRail>
        </div>
      )}

      {/* YouTube Replay Modal */}
      {replayModal && (
        <YouTubeReplayModal
          url={replayModal.url}
          title={replayModal.title}
          onClose={() => setReplayModal(null)}
        />
      )}
    </div>
  );
}
