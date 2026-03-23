import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseGrade } from '../utils/grades';
import { getAvatarUrl } from './AvatarPicker';
import { resolveChartJacketUrl } from './PiuChartJacket';
import YouTubeReplayModal from './YouTubeReplayModal';
import ScoreSnapshotModal from './ScoreSnapshotModal';
import { getCountryFlag } from './PlayerRegistration';
import { buildScoreSnapshotLinkShare } from '../utils/directMessageShares';
import { buildReplayModalTitle } from '../utils/replayTitle';

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function getLevelBadgeTone(mode) {
  if (String(mode || '').trim() === 'Single')
    return 'border-rose-200/45 bg-gradient-to-br from-[#ff7a7a] via-[#d93d62] to-[#7a1730] shadow-[0_2px_8px_rgba(217,61,98,0.3)]';
  if (String(mode || '').trim() === 'Double')
    return 'border-emerald-200/45 bg-gradient-to-br from-[#4cf4aa] via-[#16b77f] to-[#0b5d48] shadow-[0_2px_8px_rgba(22,183,127,0.28)]';
  return 'border-sky-200/45 bg-gradient-to-br from-[#69c8ff] via-[#2b88de] to-[#12457c] shadow-[0_2px_8px_rgba(43,136,222,0.28)]';
}

function getModeShort(mode) {
  if (String(mode || '').trim() === 'Single') return 'S';
  if (String(mode || '').trim() === 'Double') return 'D';
  return 'C';
}

function fmt(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function buildChartLink(item, chartKeyMap) {
  const norm = (item.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const exactKey = `${norm}|${item.mode}|${item.level}`;
  const chartId = chartKeyMap?.[exactKey] || chartKeyMap?.[norm];
  return chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(item.song_title || '')}`;
}

const RANK_STYLES = [
  'from-piu-gold via-yellow-300 to-amber-600 text-black shadow-[0_0_12px_rgba(255,215,0,0.4)]',
  'from-gray-200 via-white to-gray-400 text-gray-800 shadow-[0_0_10px_rgba(200,200,220,0.3)]',
  'from-amber-600 via-orange-400 to-amber-800 text-white shadow-[0_0_10px_rgba(200,130,50,0.25)]',
  'from-cyan-400 via-sky-300 to-blue-500 text-white shadow-[0_0_8px_rgba(100,180,255,0.2)]',
  'from-violet-400 via-purple-300 to-indigo-500 text-white shadow-[0_0_8px_rgba(140,100,255,0.2)]',
];

// ── Shared sub-components ───────────────────────────────────────────────────

function useStaggeredEntrance(count) {
  const [visible, setVisible] = useState([]);
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          Array.from({ length: count }, (_, i) => i).forEach((_, i) => {
            setTimeout(() => setVisible((prev) => (prev.includes(i) ? prev : [...prev, i])), 70 * i);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [count]);
  return { ref, visible };
}

function RankBadge({ rank }) {
  const style = RANK_STYLES[rank - 1] || RANK_STYLES[4];
  return (
    <span className={`absolute top-1 left-1 z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br font-display text-[9px] font-black leading-none ${style}`}>
      {rank}
    </span>
  );
}

function LevelBadge({ mode, level }) {
  if (!level || level <= 0) return null;
  return (
    <span className={`absolute top-1 right-1 z-10 inline-flex items-center justify-center rounded-md border px-1 py-px font-display text-[9px] font-black leading-none tracking-[-0.04em] text-white ${getLevelBadgeTone(mode)}`}>
      {getModeShort(mode)}{level}
    </span>
  );
}

function PlayerRow({ avatarUrl, username, nationality }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-[18px] w-[18px] shrink-0 rounded-full border border-white/25 object-cover shadow-sm" />
      ) : null}
      <span className="min-w-0 truncate text-[11px] font-display font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
        {nationality ? <>{getCountryFlag(nationality, 'h-[11px] inline-block')} </> : null}{username}
      </span>
    </div>
  );
}

function SectionLabel({ icon, title, accent }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-xs leading-none">{icon}</span>
      <h3 className="font-display text-[10px] font-black tracking-[0.14em] uppercase text-white/80">{title}</h3>
      <div className={`ml-0.5 h-px flex-1 bg-gradient-to-r ${accent} to-transparent`} />
    </div>
  );
}

function PlayOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/90 shadow-[0_0_14px_rgba(255,0,0,0.35)]">
        <svg className="ml-0.5 h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </div>
    </div>
  );
}

function ScrollArrow({ direction, onClick, visible }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-black/60 text-white/60 shadow-lg backdrop-blur transition hover:bg-black/80 hover:text-white ${direction === 'left' ? 'left-0.5' : 'right-0.5'}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {direction === 'left'
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

function ScrollRail({ children }) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [update]);
  return (
    <div className="relative">
      <ScrollArrow direction="left" onClick={() => scrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })} visible={canLeft} />
      <ScrollArrow direction="right" onClick={() => scrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })} visible={canRight} />
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {children}
      </div>
    </div>
  );
}

// Card dimensions — uniform 4:3 aspect ratio
const CARD_W = 'w-[140px]';
const CARD_H = 'h-[105px]';

// ── Replay card ─────────────────────────────────────────────────────────────

function ReplayCard({ play, rank, jacketLookup, onReplayClick, visible }) {
  const jacket = resolveChartJacketUrl({ title: play.song_title, mode: play.mode, level: play.level, jacketLookup, backgroundUrl: play.background_url });
  const score = parseInt(play.score, 10) || 0;
  const rankInfo = getRank(score);
  const grade = parseGrade(play.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const avatarUrl = play.avatar ? getAvatarUrl(play.avatar) : '';

  return (
    <button
      type="button"
      onClick={() => onReplayClick(play.replay_embed_url, buildReplayModalTitle(play))}
      className={`group relative flex-shrink-0 snap-start ${CARD_W} ${CARD_H} overflow-hidden rounded-lg border border-piu-border/50 text-left transition-all duration-400 ease-out hover:border-sky-400/35 hover:shadow-[0_4px_16px_rgba(56,189,248,0.1)] ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      <RankBadge rank={rank} />
      <LevelBadge mode={play.mode} level={play.level} />

      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#152238] via-[#0f1a2d] to-[#090d18]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/15" />

      <PlayOverlay />

      <div className="relative z-10 flex h-full flex-col justify-end p-2">
        <PlayerRow avatarUrl={avatarUrl} username={play.username} nationality={play.nationality} />
        <p className="mt-0.5 font-display text-[11px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-1">
          {play.song_title}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-display text-sm font-black text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{fmt(score)}</span>
          <span className={`font-display text-xs font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${getGradeColor(gradeDisplay, score)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>{gradeDisplay}</span>
        </div>
      </div>

      {/* Replay pill */}
      <div className="absolute top-[22px] right-1 z-10 flex items-center gap-px rounded-full bg-red-600/85 px-1.5 py-[2px] text-[7px] font-display font-bold text-white shadow backdrop-blur-sm">
        <svg className="h-[9px] w-[9px]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
        <span className="ml-px">Replay</span>
      </div>
    </button>
  );
}

// ── Upscore card ────────────────────────────────────────────────────────────

function UpscoreCard({ item, rank, jacketLookup, chartKeyMap, visible, onScoreClick }) {
  const jacket = resolveChartJacketUrl({ title: item.song_title, mode: item.mode, level: item.level, jacketLookup, backgroundUrl: item.background_url });
  const newScore = parseInt(item.new_score ?? item.score, 10) || 0;
  const oldScore = parseInt(item.old_score, 10) || 0;
  const delta = newScore - oldScore;
  const rankInfo = getRank(newScore);
  const grade = parseGrade(item.new_grade || item.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const avatarUrl = item.avatar ? getAvatarUrl(item.avatar) : '';
  const chartLink = buildChartLink(item, chartKeyMap);

  return (
    <button
      type="button"
      onClick={() => onScoreClick({
        ...item,
        _jacketUrl: jacket,
        _chartLink: chartLink,
        _dmLinkShare: buildScoreSnapshotLinkShare({
          kind: 'upscore',
          sourceId: item.upscore_id,
          username: item.username,
          avatar: avatarUrl,
          score: item,
          path: `/upscore/${item.upscore_id}`,
          chartPath: chartLink,
        }),
      })}
      className={`group relative flex-shrink-0 snap-start ${CARD_W} ${CARD_H} overflow-hidden rounded-lg border border-piu-border/50 text-left transition-all duration-400 ease-out hover:border-piu-green/35 hover:shadow-[0_4px_16px_rgba(51,255,102,0.08)] ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      <RankBadge rank={rank} />
      <LevelBadge mode={item.mode} level={item.level} />

      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1f12] via-[#0a1a0e] to-[#060d08]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/15" />

      <div className="relative z-10 flex h-full flex-col justify-end p-2">
        <PlayerRow avatarUrl={avatarUrl} username={item.username} nationality={item.nationality} />
        <p className="mt-0.5 font-display text-[11px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-1">
          {item.song_title}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-display text-sm font-black text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{fmt(newScore)}</span>
          <span className={`font-display text-xs font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${getGradeColor(gradeDisplay, newScore)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>{gradeDisplay}</span>
        </div>
        <div className="mt-px flex items-center justify-between">
          <span className="text-[9px] text-gray-200/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{fmt(oldScore)}</span>
          <span className={`font-mono text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] ${delta > 0 ? 'text-piu-green' : delta < 0 ? 'text-rose-300' : 'text-gray-400'}`}>
            {delta > 0 ? '+' : ''}{delta.toLocaleString()}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Clear card ──────────────────────────────────────────────────────────────

function ClearCard({ item, rank, jacketLookup, chartKeyMap, visible, onScoreClick }) {
  const jacket = resolveChartJacketUrl({ title: item.song_title, mode: item.mode, level: item.level, jacketLookup, backgroundUrl: item.background_url });
  const score = parseInt(item.score, 10) || 0;
  const rankInfo = getRank(score);
  const grade = parseGrade(item.grade, rankInfo.label);
  const gradeDisplay = grade.display || rankInfo.label;
  const avatarUrl = item.avatar ? getAvatarUrl(item.avatar) : '';
  const chartLink = buildChartLink(item, chartKeyMap);

  return (
    <button
      type="button"
      onClick={() => onScoreClick({
        ...item,
        _jacketUrl: jacket,
        _chartLink: chartLink,
        _dmLinkShare: buildScoreSnapshotLinkShare({
          kind: 'clear',
          sourceId: item.clear_id,
          username: item.username,
          avatar: avatarUrl,
          score: item,
          path: `/clear/${item.clear_id}`,
          chartPath: chartLink,
        }),
      })}
      className={`group relative flex-shrink-0 snap-start ${CARD_W} ${CARD_H} overflow-hidden rounded-lg border border-piu-border/50 text-left transition-all duration-400 ease-out hover:border-sky-400/35 hover:shadow-[0_4px_16px_rgba(56,189,248,0.08)] ${visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      <RankBadge rank={rank} />
      <LevelBadge mode={item.mode} level={item.level} />

      {jacket ? (
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${jacket})` }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d1525] via-[#0a1020] to-[#06090f]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/15" />

      <div className="relative z-10 flex h-full flex-col justify-end p-2">
        <PlayerRow avatarUrl={avatarUrl} username={item.username} nationality={item.nationality} />
        <p className="mt-0.5 font-display text-[11px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] line-clamp-1">
          {item.song_title}
        </p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-display text-sm font-black text-white leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{fmt(score)}</span>
          <span className={`font-display text-xs font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] ${getGradeColor(gradeDisplay, score)} ${grade.isBroken ? 'grade-broken' : ''}`} data-grade={gradeDisplay}>{gradeDisplay}</span>
        </div>
      </div>
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function DailyHighlights({ data, jacketLookup = {}, chartKeyMap = {} }) {
  const [replayModal, setReplayModal] = useState(null);
  const [selectedScore, setSelectedScore] = useState(null);

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
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="font-display text-sm font-bold tracking-wider text-piu-accent">TODAY&apos;S HIGHLIGHTS</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-piu-accent/30 to-transparent" />
      </div>

      {hasReplays && (
        <div ref={replayAnim.ref} className="mb-3">
          <SectionLabel icon="🎬" title="Top Replays" accent="from-red-500/30" />
          <ScrollRail>
            {topReplays.map((play, i) => (
              <ReplayCard key={play.id || i} play={play} rank={i + 1} jacketLookup={jacketLookup} onReplayClick={(url, title) => setReplayModal({ url, title })} visible={replayAnim.visible.includes(i)} />
            ))}
          </ScrollRail>
        </div>
      )}

      {hasUpscores && (
        <div ref={upscoreAnim.ref} className="mb-3">
          <SectionLabel icon="📈" title="Best Upscores" accent="from-piu-green/30" />
          <ScrollRail>
            {topUpscores.map((item, i) => (
              <UpscoreCard key={`${item.upscore_id}-${i}`} item={item} rank={i + 1} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} visible={upscoreAnim.visible.includes(i)} onScoreClick={setSelectedScore} />
            ))}
          </ScrollRail>
        </div>
      )}

      {hasClears && (
        <div ref={clearAnim.ref}>
          <SectionLabel icon="🎯" title="Best New Clears" accent="from-sky-400/30" />
          <ScrollRail>
            {topClears.map((item, i) => (
              <ClearCard key={`${item.clear_id}-${i}`} item={item} rank={i + 1} jacketLookup={jacketLookup} chartKeyMap={chartKeyMap} visible={clearAnim.visible.includes(i)} onScoreClick={setSelectedScore} />
            ))}
          </ScrollRail>
        </div>
      )}

      {replayModal && (
        <YouTubeReplayModal url={replayModal.url} title={replayModal.title} onClose={() => setReplayModal(null)} />
      )}

      {selectedScore && (
        <ScoreSnapshotModal
          score={selectedScore}
          jacketUrl={selectedScore._jacketUrl || ''}
          chartLink={selectedScore._chartLink || ''}
          directMessageLinkShare={selectedScore._dmLinkShare || null}
          modalLabel="Score details"
          onClose={() => setSelectedScore(null)}
        />
      )}
    </div>
  );
}
