import { useState, useEffect } from 'react';
import TierChip from './TierChip';

const REASON_COLORS = {
  easy_tier: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  high_fail: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  skill_fit: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  unpassed: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  easiest: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  easiest_and_best_impact: 'bg-piu-accent/20 text-piu-accent border-piu-accent/40',
  best_impact: 'bg-piu-accent/20 text-piu-accent border-piu-accent/40',
  impact_ranked: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
};

function formatScore(score) {
  if (!score && score !== 0) return null;
  const n = parseInt(score, 10) || 0;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function LevelBadge({ mode, level }) {
  const isSingle = String(mode || '').toLowerCase().startsWith('s');
  const prefix = isSingle ? 'S' : 'D';
  return (
    <span className={`absolute top-1.5 left-1.5 inline-flex items-center justify-center rounded-md min-w-[28px] h-[18px] px-1 border text-white font-display font-black text-[10px] leading-none shadow-lg ${
      isSingle
        ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
        : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
    }`}>
      {prefix}{level}
    </span>
  );
}

function ScoreState({ rec, goal }) {
  if (goal === 'pumbility') {
    return (
      <div className="text-[10px] text-gray-400 font-body truncate">
        {rec.current_grade && (
          <span className="text-gray-300">{rec.current_grade}</span>
        )}
        {rec.score_needed != null && (
          <span className="ml-1">+{formatScore(rec.score_needed)} → {rec.next_grade}</span>
        )}
      </div>
    );
  }

  // Title goal
  if (rec.fail_score) {
    return (
      <span className="text-[10px] text-amber-400 font-body">
        Best fail {formatScore(rec.fail_score)}
      </span>
    );
  }
  if (rec.best_score) {
    return (
      <span className="text-[10px] text-gray-300 font-body">
        Best {formatScore(rec.best_score)} {rec.best_grade || ''}
      </span>
    );
  }
  return (
    <span className="text-[10px] text-gray-500 font-body">Unplayed</span>
  );
}

// ---------------------------------------------------------------------------
// Detail Modal — shown on card tap
// ---------------------------------------------------------------------------
function RecommendationDetailModal({ rec, goal, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const reasonColors = REASON_COLORS[rec.reason_type] || REASON_COLORS.unpassed;
  const jacketSrc = rec.jacket_url || rec.background_url || '';
  const isSingle = String(rec.mode || '').toLowerCase().startsWith('s');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-piu-border bg-piu-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Jacket header */}
        <div className="relative aspect-video bg-piu-dark overflow-hidden">
          {jacketSrc ? (
            <img
              src={jacketSrc}
              alt={rec.song_title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-piu-dark to-piu-bg">
              <span className="text-4xl font-display font-black text-gray-700">
                {(rec.song_title || '?')[0]}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          {/* Level badge */}
          <span className={`absolute top-2 left-2 inline-flex items-center justify-center rounded-md min-w-[32px] h-[22px] px-1.5 border text-white font-display font-black text-xs leading-none shadow-lg ${
            isSingle
              ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
              : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
          }`}>
            {isSingle ? 'S' : 'D'}{rec.level}
          </span>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* Song info overlaid at bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <p className="text-sm font-display font-bold text-white leading-tight">{rec.song_title}</p>
            {rec.artist && (
              <p className="text-xs text-gray-300 font-body mt-0.5">{rec.artist}</p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Reason + tier row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-display font-bold border leading-none ${reasonColors}`}>
              {rec.reason_label}
            </span>
            {rec.tier_name && rec.tier_name !== 'Unrated' && (
              <TierChip tierName={rec.tier_name} />
            )}
          </div>

          {/* Score details */}
          <div className="space-y-1">
            {goal === 'pumbility' ? (
              <>
                {rec.current_score != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Current</span>
                    <span className="text-gray-200 font-display font-bold">
                      {rec.current_score?.toLocaleString()} {rec.current_grade || ''}
                    </span>
                  </div>
                )}
                {rec.next_grade && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Target</span>
                    <span className="text-white font-display font-bold">{rec.next_grade}</span>
                  </div>
                )}
                {rec.score_needed != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Score needed</span>
                    <span className="text-amber-300 font-display font-bold">+{rec.score_needed?.toLocaleString()}</span>
                  </div>
                )}
                {rec.pumbility_gain != null && rec.pumbility_gain > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Pumbility gain</span>
                    <span className="text-piu-green font-display font-bold">+{rec.pumbility_gain}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {rec.fail_score ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Best fail</span>
                    <span className="text-amber-400 font-display font-bold">{rec.fail_score?.toLocaleString()}</span>
                  </div>
                ) : rec.best_score ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-body">Best score</span>
                    <span className="text-gray-200 font-display font-bold">
                      {rec.best_score?.toLocaleString()} {rec.best_grade || ''}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 font-body">No attempts yet</div>
                )}
              </>
            )}
          </div>

          {/* Reasoning */}
          {rec.reasoning && (
            <div className="rounded-lg bg-piu-dark/50 border border-piu-border/30 px-3 py-2">
              <p className="text-[11px] text-gray-300 font-body leading-relaxed">
                {rec.reasoning}
              </p>
            </div>
          )}

          {/* Skill tags */}
          {rec.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rec.skills.map((s) => (
                <span key={s} className="text-[10px] text-gray-400 bg-piu-dark/70 border border-piu-border/30 rounded-md px-2 py-0.5 font-body">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card (compact — tappable to open modal)
// ---------------------------------------------------------------------------
export default function RecommendationSongCard({ rec, goal, index, animKey }) {
  const [showDetail, setShowDetail] = useState(false);
  const reasonColors = REASON_COLORS[rec.reason_type] || REASON_COLORS.unpassed;
  const jacketSrc = rec.jacket_url || rec.background_url || '';

  return (
    <>
      <div
        className="group card-hover flex flex-col overflow-hidden animate-fade-in-up cursor-pointer"
        style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
        onClick={() => setShowDetail(true)}
      >
        {/* Jacket */}
        <div className="relative aspect-video bg-piu-dark overflow-hidden">
          {jacketSrc ? (
            <img
              src={jacketSrc}
              alt={rec.song_title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-piu-dark to-piu-bg">
              <span className="text-2xl font-display font-black text-gray-700">
                {(rec.song_title || '?')[0]}
              </span>
            </div>
          )}
          <LevelBadge mode={rec.mode} level={rec.level} />
          {goal === 'pumbility' && rec.pumbility_gain > 0 && (
            <span className="absolute top-1.5 right-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-display font-bold bg-black/60 text-piu-green border border-piu-green/30">
              +{rec.pumbility_gain}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 p-2 flex-1">
          <p className="text-xs font-display font-bold text-white leading-tight line-clamp-1" title={rec.song_title}>
            {rec.song_title}
          </p>
          <p className="text-[10px] text-gray-500 font-body leading-tight line-clamp-1">
            {rec.artist || '\u00A0'}
          </p>

          <div className="flex items-center gap-1 flex-wrap mt-auto">
            {rec.tier_name && rec.tier_name !== 'Unrated' && (
              <TierChip tierName={rec.tier_name} />
            )}
            <ScoreState rec={rec} goal={goal} />
          </div>

          {/* Reason chip */}
          <span className={`inline-flex items-center self-start px-1.5 py-0.5 rounded text-[9px] font-display font-bold border leading-none mt-0.5 ${reasonColors}`}>
            {rec.reason_label}
          </span>
        </div>
      </div>

      {showDetail && (
        <RecommendationDetailModal
          rec={rec}
          goal={goal}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
