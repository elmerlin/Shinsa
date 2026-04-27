import React from 'react';
import PiuChartJacket from './PiuChartJacket';
import { getGradeColorClass, getGradeDisplayLabel } from '../utils/grades';
import WeeklyChallengeBonusChip from './weeklyChallenges/WeeklyChallengeBonusChip';

const MEDAL_EMOJI = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };
const MEDAL_COLORS = {
  1: { border: 'border-amber-500/40', bg: 'from-amber-500/20 via-yellow-600/10 to-transparent', text: 'text-piu-gold' },
  2: { border: 'border-gray-400/30', bg: 'from-gray-300/15 via-gray-400/8 to-transparent', text: 'text-piu-silver' },
  3: { border: 'border-amber-700/30', bg: 'from-orange-600/15 via-amber-700/8 to-transparent', text: 'text-piu-bronze' },
};

const AWARD_LABELS = {
  overall: 'Overall',
  singles: 'Singles',
  doubles: 'Doubles',
  advanced: 'Advanced',
  intermediate: 'Intermediate',
};

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-1 text-lg font-display font-black text-white tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

export default function WeeklyChallengePersonalCard({ personal, className = '', flush = false }) {
  if (!personal) return null;

  const {
    weekLabel,
    averageScore,
    highestRatedPlay,
    sssCount,
    totalClears,
    chartCount,
    rankings,
    averageRank,
    bracketComparison,
    podiums,
    skillFamily,
  } = personal;

  const hasPodiums = Array.isArray(podiums) && podiums.length > 0;
  const highestRatedPlayGrade = highestRatedPlay
    ? getGradeDisplayLabel(highestRatedPlay.grade, highestRatedPlay.score)
    : '';
  const highestRatedPlayGradeClass = highestRatedPlay
    ? getGradeColorClass(highestRatedPlay.grade, highestRatedPlay.score)
    : '';

  return (
    <div className={`overflow-hidden ${flush ? 'bg-piu-dark/50' : 'rounded-xl border border-piu-border/50 bg-piu-dark'} ${className}`}>
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <p className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-piu-accent/80">
          Weekly Challenge Recap
        </p>
        <p className="mt-1 text-sm font-display font-black text-white">{weekLabel}</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* Podiums */}
        {hasPodiums && (
          <div className="flex flex-wrap gap-2">
            {podiums.map((p) => {
              const medal = MEDAL_COLORS[p.rank] || MEDAL_COLORS[3];
              const label = AWARD_LABELS[p.awardKey] || p.awardLabel || p.awardKey;
              return (
                <div
                  key={`${p.awardKey}-${p.rank}`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border ${medal.border} bg-gradient-to-r ${medal.bg} px-2.5 py-1.5`}
                >
                  <span className="text-sm">{MEDAL_EMOJI[p.rank] || ''}</span>
                  <span className={`text-[11px] font-display font-bold ${medal.text}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Avg Score"
            value={(averageScore || 0).toLocaleString()}
          />
          <StatTile
            label="SSS / SSS+"
            value={sssCount || 0}
            sub={`of ${totalClears || 0} clears`}
          />
          <StatTile
            label="Charts Cleared"
            value={`${totalClears || 0}/${chartCount || 0}`}
          />
          <StatTile
            label="Avg Rank"
            value={averageRank > 0 ? `#${averageRank}` : '--'}
            sub={rankings?.overall ? `#${rankings.overall.rank} of ${rankings.overall.total}` : null}
          />
        </div>

        {/* Best Play */}
        {highestRatedPlay && highestRatedPlay.songTitle && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-white/40 mb-2">
              Highest Rated Play
            </p>
            <div className="flex items-center gap-3">
              <PiuChartJacket
                title={highestRatedPlay.songTitle}
                mode={highestRatedPlay.mode}
                level={highestRatedPlay.level}
                jacketUrl={highestRatedPlay.jacketUrl}
                size="wide"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-display font-black text-white">{highestRatedPlay.songTitle}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-white/60 tabular-nums">{(highestRatedPlay.score || 0).toLocaleString()}</span>
                  <span className={`font-display font-bold ${highestRatedPlayGradeClass}`}>{highestRatedPlayGrade}</span>
                  <span className="text-white/40">{(highestRatedPlay.ratingPoints || 0).toLocaleString()} RP</span>
                  <WeeklyChallengeBonusChip
                    entry={{
                      hasPgBonus: highestRatedPlay.hasPgBonus,
                      pgBonusPoints: highestRatedPlay.pgBonusPoints,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rankings Breakdown */}
        {(rankings?.singles || rankings?.doubles) && (
          <div className="flex flex-wrap gap-2">
            {rankings.singles && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/8 px-2.5 py-1 text-[11px]">
                <span className="font-display font-bold text-rose-200">Singles</span>
                <span className="text-white/60">#{rankings.singles.rank}</span>
                <span className="text-white/30">of {rankings.singles.total}</span>
              </div>
            )}
            {rankings.doubles && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/8 px-2.5 py-1 text-[11px]">
                <span className="font-display font-bold text-emerald-200">Doubles</span>
                <span className="text-white/60">#{rankings.doubles.rank}</span>
                <span className="text-white/30">of {rankings.doubles.total}</span>
              </div>
            )}
          </div>
        )}

        {/* Bracket Comparison */}
        {bracketComparison && (
          <div className="rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2.5">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-sky-200/70 mb-1.5">
              {bracketComparison.bracketName} Bracket
            </p>
            <div className="flex flex-wrap items-baseline gap-3 text-[11px]">
              <span className="text-white/60">
                Rank <span className="font-display font-black text-sky-200">#{bracketComparison.bracketRank}</span> of {bracketComparison.bracketParticipantCount}
              </span>
              <span className="text-white/40">
                Bracket avg score: <span className="font-display font-bold text-white/70 tabular-nums">{(bracketComparison.bracketAverageScore || 0).toLocaleString()}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
