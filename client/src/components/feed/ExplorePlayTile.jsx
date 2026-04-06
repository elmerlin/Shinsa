import React from 'react';
import { parseGrade, getScoreRankInfo } from '../../utils/grades';
import { buildReplayModalTitle } from '../../utils/replayTitle';
import PlateBadge from '../ui/plate-badge';
import { getAvatarUrl } from '../AvatarPicker';

function formatScore(score) {
  const n = parseInt(score, 10) || 0;
  return n.toLocaleString('en-GB');
}

function getModeShort(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single') return 'S';
  if (m === 'double') return 'D';
  if (m === 'coop') return 'Co-op';
  return m.slice(0, 1).toUpperCase();
}

function getModeBadgeColor(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'single') return 'from-red-500/90 to-red-700/90 border-red-400/40';
  if (m === 'double') return 'from-emerald-500/90 to-emerald-700/90 border-emerald-400/40';
  return 'from-sky-500/90 to-sky-700/90 border-sky-400/40';
}

function getGradeColor(grade, score) {
  const parsed = parseGrade(grade);
  const display = parsed.display || grade || '';
  const info = getScoreRankInfo(score);
  if (info && info.color) return info.color;
  return 'text-gray-400';
}

const TIER_CLASSES = {
  hero: 'col-span-2 row-span-2',
  standard: 'col-span-1 row-span-1',
};

export default function ExplorePlayTile({ play, jacketUrl, onClick, onReplayClick, staggerIndex, featureVariant }) {
  const tier = play.highlight_tier || 'standard';
  const hasReplay = !!(play.replay_embed_url || play.replay_video_id);
  const gradeColor = getGradeColor(play.grade, play.score);
  const parsed = parseGrade(play.grade);
  const gradeDisplay = parsed.display || play.grade || '';
  const isBroken = parsed.isBroken;

  let gridClass = TIER_CLASSES[tier] || TIER_CLASSES.standard;
  if (tier === 'feature') {
    gridClass = featureVariant === 'tall' ? 'col-span-1 row-span-2' : 'col-span-2 row-span-1';
  }

  const handleReplayClick = (e) => {
    e.stopPropagation();
    if (onReplayClick) {
      onReplayClick({
        url: play.replay_embed_url,
        title: buildReplayModalTitle(play),
        playId: play.play_id,
        ownerId: play.user_id,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        explore-tile group relative overflow-hidden rounded-xl
        border border-white/[0.08] text-left cursor-pointer
        transition-all duration-300 ease-out
        hover:border-sky-400/25 hover:shadow-[0_4px_20px_rgba(56,189,248,0.1)]
        active:scale-[0.98]
        ${gridClass}
      `}
      style={{
        animationDelay: `${Math.min(staggerIndex * 50, 600)}ms`,
        contentVisibility: 'auto',
        containIntrinsicSize: tier === 'hero' ? '320px 320px' : tier === 'feature' ? '320px 160px' : '160px 160px',
      }}
    >
      {/* Jacket background */}
      {jacketUrl ? (
        <img
          src={jacketUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a3a] via-[#121228] to-[#0a0a1a]" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5" />

      {/* Hero shimmer accent */}
      {tier === 'hero' && (
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-piu-accent/60 to-transparent" />
        </div>
      )}

      {/* Level badge — top left */}
      <span
        className={`absolute top-2 left-2 z-10 inline-flex items-center rounded-md border px-1.5 py-0.5
          text-[10px] font-display font-black tracking-wider text-white
          bg-gradient-to-b ${getModeBadgeColor(play.mode)}
          shadow-[0_1px_4px_rgba(0,0,0,0.5)]`}
      >
        {getModeShort(play.mode)}{play.level}
      </span>

      {/* Replay indicator — top right */}
      {hasReplay && (
        <button
          type="button"
          onClick={handleReplayClick}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md
            bg-black/60 border border-white/10 px-1.5 py-0.5
            text-[10px] font-display font-bold text-white/80
            hover:text-white hover:bg-black/80 hover:border-piu-accent/30
            transition-all duration-200 explore-replay-beacon"
          aria-label="Watch replay"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          <span className="hidden sm:inline">Replay</span>
        </button>
      )}

      {/* Content overlay */}
      <div className="relative z-10 flex h-full flex-col justify-end p-2.5">
        {/* --- HERO content --- */}
        {tier === 'hero' && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <img
                src={getAvatarUrl(play.avatar)}
                alt=""
                className="h-5 w-5 rounded-full border border-white/20 object-cover"
                loading="lazy"
              />
              <span className="text-[11px] font-display font-bold text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">
                {play.username}
              </span>
            </div>
            <p className="font-display text-sm font-black text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] line-clamp-1 mb-1">
              {play.song_title}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {formatScore(play.score)}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {play.plate && <PlateBadge plate={play.plate} size="xs" />}
                <span
                  className={`font-display text-base font-black ${gradeColor} ${isBroken ? 'grade-broken' : ''}`}
                  data-grade={gradeDisplay}
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                >
                  {gradeDisplay}
                </span>
              </div>
            </div>
            {/* Compact judgment summary */}
            {play.perfect != null && (
              <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono text-white/60">
                <span className="text-sky-300">{play.perfect}P</span>
                <span className="text-emerald-300">{play.great}Gr</span>
                <span className="text-yellow-300">{play.good}Go</span>
                <span className="text-rose-300">{play.bad}B</span>
                <span className="text-red-400">{play.miss}M</span>
              </div>
            )}
          </>
        )}

        {/* --- FEATURE content --- */}
        {tier === 'feature' && (
          <>
            <div className="flex items-center gap-1 mb-0.5">
              <img
                src={getAvatarUrl(play.avatar)}
                alt=""
                className="h-4 w-4 rounded-full border border-white/20 object-cover"
                loading="lazy"
              />
              <span className="text-[10px] font-display font-bold text-white/80 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {play.username}
              </span>
            </div>
            <p className="font-display text-xs font-bold text-white drop-shadow line-clamp-1 mb-0.5">
              {play.song_title}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-white drop-shadow">
                {formatScore(play.score)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {play.plate && <PlateBadge plate={play.plate} size="xs" />}
                <span
                  className={`font-display text-xs font-black ${gradeColor} ${isBroken ? 'grade-broken' : ''}`}
                  data-grade={gradeDisplay}
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                >
                  {gradeDisplay}
                </span>
              </div>
            </div>
          </>
        )}

        {/* --- STANDARD content --- */}
        {tier === 'standard' && (
          <div className="flex items-baseline justify-between gap-1">
            <span className="font-mono text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
              {formatScore(play.score)}
            </span>
            <span
              className={`font-display text-xs font-black shrink-0 ${gradeColor} ${isBroken ? 'grade-broken' : ''}`}
              data-grade={gradeDisplay}
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
            >
              {gradeDisplay}
            </span>
          </div>
        )}
      </div>

      {/* Comment count badge */}
      {play.comment_count > 0 && tier !== 'standard' && (
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 text-[9px] font-mono text-white/50">
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {play.comment_count}
        </div>
      )}
    </button>
  );
}
