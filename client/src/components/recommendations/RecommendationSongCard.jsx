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

function PumbilityGain({ rec }) {
  if (!rec.pumbility_gain) return null;
  return (
    <span className="text-[10px] font-display font-bold text-piu-green">
      +{rec.pumbility_gain}
    </span>
  );
}

export default function RecommendationSongCard({ rec, goal, index, animKey }) {
  const reasonColors = REASON_COLORS[rec.reason_type] || REASON_COLORS.unpassed;
  const jacketSrc = rec.jacket_url || rec.background_url || '';

  return (
    <div
      className="group card-hover flex flex-col overflow-hidden animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
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

        {/* Personalized reasoning */}
        {rec.reasoning && (
          <p className="text-[9px] text-gray-500 font-body leading-snug mt-0.5 line-clamp-2">
            {rec.reasoning}
          </p>
        )}

        {/* Skill tags */}
        {rec.skills?.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {rec.skills.slice(0, 3).map((s) => (
              <span key={s} className="text-[8px] text-gray-500 bg-gray-800 rounded px-1 py-px font-body">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
