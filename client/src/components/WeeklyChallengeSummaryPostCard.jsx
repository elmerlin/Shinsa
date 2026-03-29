import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import { getCountryFlag } from '../utils/countryFlags';
import PiuChartJacket from './PiuChartJacket';
import YouTubeReplayModal from './YouTubeReplayModal';

const PODIUM_COLORS = [
  { bg: 'from-amber-500/20 via-yellow-600/10 to-transparent', border: 'border-amber-500/40', icon: 'text-piu-gold', label: '1st', medal: '\uD83E\uDD47' },
  { bg: 'from-gray-300/15 via-gray-400/8 to-transparent', border: 'border-gray-400/30', icon: 'text-piu-silver', label: '2nd', medal: '\uD83E\uDD48' },
  { bg: 'from-orange-600/15 via-amber-700/8 to-transparent', border: 'border-amber-700/30', icon: 'text-piu-bronze', label: '3rd', medal: '\uD83E\uDD49' },
];

const AWARD_LABELS = {
  overall: 'Overall',
  singles: 'Singles',
  doubles: 'Doubles',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
};

const SUPERLATIVE_LABELS = {
  most_sss: { title: 'Most SSS', icon: '\u2B50', unit: '' },
  highest_clear_percentage: { title: 'Highest Clear %', icon: '\uD83D\uDCCA', unit: '%' },
  highest_clear_rating: { title: 'Highest Avg Rating', icon: '\uD83D\uDD25', unit: '' },
  biggest_improvements: { title: 'Biggest Improvements', icon: '\uD83D\uDE80', unit: '' },
};

const TOTAL_PAGES = 5;

function PodiumRow({ entry, rank }) {
  const style = PODIUM_COLORS[rank - 1] || PODIUM_COLORS[2];
  const avatarUrl = entry.avatar ? getAvatarUrl(entry.avatar, 'sm') : null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border ${style.border} bg-gradient-to-r ${style.bg} px-2.5 py-1.5 min-w-0`}>
      <span className={`${style.icon} text-sm shrink-0`}>{style.medal}</span>
      {avatarUrl && (
        <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-white/20 object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-display font-bold text-white">
          {entry.nationality && (
            <>{getCountryFlag(entry.nationality, 'h-[11px] inline-block mr-0.5')} </>
          )}
          {entry.username}
        </span>
      </div>
      <span className="shrink-0 text-[10px] font-display font-bold text-white/60">
        {(entry.points || 0).toLocaleString()}
      </span>
    </div>
  );
}

function PodiumSection({ title, entries }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-display font-bold mb-1.5">{title}</h4>
      <div className="space-y-1">
        {entries.map((e, i) => <PodiumRow key={e.user_id || i} entry={e} rank={e.rank || i + 1} />)}
      </div>
    </div>
  );
}

function SuperlativeTile({ rewardKey, entries }) {
  const config = SUPERLATIVE_LABELS[rewardKey] || { title: rewardKey, icon: '\uD83C\uDFC6', unit: '' };
  if (!entries || entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-dark/50 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{config.icon}</span>
        <h4 className="text-[10px] uppercase tracking-wider text-gray-400 font-display font-bold">{config.title}</h4>
      </div>
      <div className="space-y-1.5">
        {entries.map((e, i) => {
          const style = PODIUM_COLORS[i] || PODIUM_COLORS[2];
          const avatarUrl = e.avatar ? getAvatarUrl(e.avatar, 'sm') : null;
          let displayValue = '';
          if (rewardKey === 'highest_clear_percentage') {
            displayValue = `${e.value}%`;
          } else if (rewardKey === 'biggest_improvements') {
            displayValue = `+${(e.value || 0).toLocaleString()}`;
          } else {
            displayValue = (e.value || 0).toLocaleString();
          }

          return (
            <div key={e.user_id || i} className="flex items-center gap-2">
              <span className={`${style.icon} text-xs shrink-0`}>{style.medal}</span>
              {avatarUrl && (
                <img src={avatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full border border-white/20 object-cover" loading="lazy" />
              )}
              <span className="truncate text-[11px] text-white flex-1">
                {e.nationality && <>{getCountryFlag(e.nationality, 'h-[10px] inline-block mr-0.5')} </>}
                {e.username}
              </span>
              <span className="shrink-0 text-[10px] font-display font-bold text-piu-gold">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplayHighlightRow({ highlight, onPlay }) {
  const avatarUrl = highlight.avatar ? getAvatarUrl(highlight.avatar, 'sm') : null;
  const hasReplay = highlight.replay_embed_url || highlight.replay_video_id;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-piu-border/50 bg-piu-dark/50 px-2.5 py-2">
      <PiuChartJacket
        url={highlight.jacket_url}
        mode={highlight.mode}
        level={highlight.level}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-display font-bold text-white">{highlight.song_title}</p>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full border border-white/20 object-cover" loading="lazy" />
          )}
          <span className="truncate">{highlight.username}</span>
          <span className="text-gray-600">\u2022</span>
          <span className="text-white/80">{(highlight.score || 0).toLocaleString()}</span>
          <span className="text-piu-gold font-bold">{highlight.grade}</span>
        </div>
        <p className="text-[9px] text-gray-500 mt-0.5">{highlight.highlight_reason}</p>
      </div>
      {hasReplay && (
        <button
          onClick={() => onPlay(highlight)}
          className="shrink-0 w-7 h-7 rounded-full bg-red-600/80 hover:bg-red-500 flex items-center justify-center transition-colors"
          title="Play replay"
        >
          <svg className="w-3 h-3 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page components
// ---------------------------------------------------------------------------

function PageHero({ summary }) {
  const podium = summary.topOverallPodium || [];
  return (
    <div className="space-y-3">
      <div className="text-center">
        <span className="text-2xl">{'\uD83C\uDFC6'}</span>
        <h3 className="font-display font-bold text-base text-white mt-1">{summary.weekLabel}</h3>
        <p className="text-xs text-gray-400 mt-0.5">Weekly Challenge Recap</p>
      </div>

      <div className="flex justify-center gap-4 text-center">
        <div>
          <p className="text-lg font-display font-bold text-piu-gold">{summary.participantCount}</p>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Players</p>
        </div>
        <div>
          <p className="text-lg font-display font-bold text-white">{summary.totalClears}</p>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Clears</p>
        </div>
        <div>
          <p className="text-lg font-display font-bold text-white">{summary.chartCount}</p>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider">Charts</p>
        </div>
      </div>

      {podium.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-display font-bold mb-1.5 text-center">Top Overall</h4>
          <div className="space-y-1">
            {podium.map((e, i) => <PodiumRow key={e.user_id || i} entry={e} rank={e.rank || i + 1} />)}
          </div>
        </div>
      )}

      {summary.nextWeek && (
        <Link
          to="/weekly-challenges"
          className="block text-center text-xs font-display font-bold text-piu-gold hover:text-amber-300 transition-colors mt-2"
        >
          New weekly is live \u2192
        </Link>
      )}
    </div>
  );
}

function PagePodiums({ summary }) {
  const { awards } = summary;
  if (!awards) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-display font-bold text-sm text-white text-center">Podiums</h3>
      <PodiumSection title={AWARD_LABELS.overall} entries={awards.overall} />
      <div className="grid grid-cols-2 gap-2">
        <PodiumSection title={AWARD_LABELS.singles} entries={awards.singles} />
        <PodiumSection title={AWARD_LABELS.doubles} entries={awards.doubles} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PodiumSection title={AWARD_LABELS.advanced} entries={awards.advanced} />
        <PodiumSection title={AWARD_LABELS.intermediate} entries={awards.intermediate} />
      </div>
    </div>
  );
}

function PageRewards({ summary }) {
  const { superlatives } = summary;
  if (!superlatives) return null;

  const keys = ['most_sss', 'highest_clear_percentage', 'highest_clear_rating', 'biggest_improvements'];
  const hasAny = keys.some(k => superlatives[k]?.length > 0);
  if (!hasAny) return <p className="text-xs text-gray-500 text-center py-4">No superlative awards this week.</p>;

  return (
    <div className="space-y-3">
      <h3 className="font-display font-bold text-sm text-white text-center">Awards</h3>
      <div className="grid grid-cols-2 gap-2">
        {keys.map(k => (
          <SuperlativeTile key={k} rewardKey={k} entries={superlatives[k]} />
        ))}
      </div>
    </div>
  );
}

function PageReplays({ summary, onPlay }) {
  const highlights = summary.replayHighlights || [];
  if (highlights.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-4">No replays this week.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display font-bold text-sm text-white text-center">Replay Highlights</h3>
      <div className="space-y-1.5">
        {highlights.map((h, i) => (
          <ReplayHighlightRow key={h.user_id + h.song_title + i} highlight={h} onPlay={onPlay} />
        ))}
      </div>
    </div>
  );
}

function PageNextWeek({ summary }) {
  const { nextWeek } = summary;
  if (!nextWeek) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-gray-500">Next week's challenge hasn't started yet.</p>
        <Link
          to="/weekly-challenges"
          className="inline-block mt-2 text-xs font-display font-bold text-piu-gold hover:text-amber-300 transition-colors"
        >
          Check Weekly Challenges \u2192
        </Link>
      </div>
    );
  }

  const charts = nextWeek.previewCharts || [];

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="font-display font-bold text-sm text-white">{nextWeek.weekLabel}</h3>
        <p className="text-xs text-gray-400 mt-0.5">New weekly challenge</p>
      </div>

      {charts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {charts.map((c, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <PiuChartJacket url={c.jacket_url} mode={c.mode} level={c.level} size="sm" />
              <p className="text-[9px] text-gray-400 truncate max-w-full text-center">{c.song_title}</p>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/weekly-challenges"
        className="block text-center rounded-lg bg-gradient-to-r from-piu-gold to-amber-600 text-piu-dark font-display font-bold text-xs py-2 px-4 hover:from-amber-400 hover:to-amber-500 transition-all"
      >
        Jump into the new weekly
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WeeklyChallengeSummaryPostCard({ summary, className = '', flush = false }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedReplay, setSelectedReplay] = useState(null);
  const [touchStart, setTouchStart] = useState(null);

  const goTo = useCallback((page) => {
    setCurrentPage(Math.max(0, Math.min(TOTAL_PAGES - 1, page)));
  }, []);

  const handleTouchStart = useCallback((e) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goTo(currentPage + (diff > 0 ? 1 : -1));
    }
    setTouchStart(null);
  }, [touchStart, currentPage, goTo]);

  const handlePlayReplay = useCallback((highlight) => {
    const url = highlight.replay_embed_url || (highlight.replay_video_id
      ? `https://www.youtube.com/embed/${highlight.replay_video_id}${highlight.replay_start_seconds ? `?start=${highlight.replay_start_seconds}` : ''}`
      : '');
    if (url) {
      setSelectedReplay({
        url,
        title: `${highlight.song_title} ${highlight.mode} Lv.${highlight.level}`,
      });
    }
  }, []);

  if (!summary) return null;

  const pages = [
    <PageHero key="hero" summary={summary} />,
    <PagePodiums key="podiums" summary={summary} />,
    <PageRewards key="rewards" summary={summary} />,
    <PageReplays key="replays" summary={summary} onPlay={handlePlayReplay} />,
    <PageNextWeek key="next" summary={summary} />,
  ];

  return (
    <>
      <div
        className={`overflow-hidden ${flush ? '' : 'rounded-xl border border-piu-border/50 bg-gradient-to-b from-piu-dark via-piu-darker to-piu-dark'} ${className}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="p-4 min-h-[200px]">
          {pages[currentPage]}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-3 pb-3 px-4">
          <button
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage === 0}
            className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === currentPage ? 'bg-piu-gold w-3' : 'bg-gray-600 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage === TOTAL_PAGES - 1}
            className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      {selectedReplay && (
        <YouTubeReplayModal
          url={selectedReplay.url}
          title={selectedReplay.title}
          onClose={() => setSelectedReplay(null)}
        />
      )}
    </>
  );
}
