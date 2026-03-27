import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getWeeklyChallengeWeek, getWeeklyChallengeWeeks } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import WeeklyChallengePodiumStrip from '../components/weeklyChallenges/WeeklyChallengePodiumStrip';
import WeeklyChallengeLeaderboard from '../components/weeklyChallenges/WeeklyChallengeLeaderboard';
import WeeklyChallengeLevelRow from '../components/weeklyChallenges/WeeklyChallengeLevelRow';
import WeeklyChallengeWeekPicker, { formatWeekRange } from '../components/weeklyChallenges/WeeklyChallengeWeekPicker';
import { TrophyIcon } from '../components/weeklyChallenges/WeeklyChallengePodiumStrip';

// ── Filter chip ──────────────────────────────────────

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[10px] font-display font-bold transition-colors ${
        active ? 'bg-piu-dark text-white' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Viewer summary card ──────────────────────────────

function ViewerSummaryCard({ viewer, awards = [] }) {
  if (!viewer) return null;
  const myAwards = (awards || []).filter(a => a.user_id === viewer.userId);
  return (
    <div className="rounded-lg border border-piu-gold/20 bg-gradient-to-r from-piu-gold/[0.06] to-transparent px-3 py-2.5 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[9px] font-display font-bold text-piu-gold/60 uppercase tracking-wider">Your Week</span>
          {viewer.rank && (
            <span className="ml-2 text-[10px] font-display font-bold text-white/50">
              Rank #{viewer.rank}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-display font-bold text-white">
            {(viewer.totalPoints || 0).toLocaleString()}<span className="text-white/30 text-[9px] ml-0.5">pts</span>
          </span>
          <span className="text-[10px] font-display text-white/50">
            {viewer.totalClears || 0}<span className="ml-0.5">clears</span>
          </span>
        </div>
      </div>
      {myAwards.length > 0 && (
        <div className="flex gap-1.5 mt-1.5">
          {myAwards.map(a => (
            <span key={`${a.award_key}-${a.rank}`} className="flex items-center gap-0.5 text-[8px] font-display font-bold text-white/50">
              <TrophyIcon rank={a.rank} className="text-[10px]" />
              {a.award_label || a.award_key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────

export default function WeeklyChallengesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [weekKey, setWeekKey] = useState(searchParams.get('week') || 'current');
  const [weeks, setWeeks] = useState([]);
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [chartMode, setChartMode] = useState('both');
  const [leaderboardMode, setLeaderboardMode] = useState('both');
  const [skillFamily, setSkillFamily] = useState('all');

  // Load week list
  useEffect(() => {
    getWeeklyChallengeWeeks().then(setWeeks).catch(() => {});
  }, []);

  // Load week data when filters change
  const loadWeek = useCallback(() => {
    setLoading(true);
    const params = {};
    if (chartMode !== 'both') params.chart_mode = chartMode;
    if (leaderboardMode !== 'both') params.leaderboard_mode = leaderboardMode;
    if (skillFamily !== 'all') params.skill_family = skillFamily;

    getWeeklyChallengeWeek(weekKey, params)
      .then(data => {
        setWeekData(data);
        // Update weekKey if we got redirected from 'current'
        if (weekKey === 'current' && data.week?.week_key) {
          setWeekKey(data.week.week_key);
        }
      })
      .catch(() => setWeekData(null))
      .finally(() => setLoading(false));
  }, [weekKey, chartMode, leaderboardMode, skillFamily]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  const handleWeekSelect = (key) => {
    setWeekKey(key);
    navigate(`/weekly-challenges?week=${key}`, { replace: true });
  };

  const week = weekData?.week;
  const groupedByLevel = weekData?.groupedByLevel || {};
  const levels = Object.keys(groupedByLevel).map(Number).sort((a, b) => a - b);
  const viewerBests = weekData?.viewerSummary?.bests || {};

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="font-display text-lg font-black text-white uppercase tracking-wide">
            Weekly Challenges
          </h1>
          {week && (
            <p className="text-[10px] text-white/40 mt-0.5">
              {formatWeekRange(week.starts_at_utc, week.ends_at_utc)}
              {week.status === 'active' && (
                <span className="ml-1.5 text-emerald-400 font-bold">LIVE</span>
              )}
            </p>
          )}
        </div>
        <WeeklyChallengeWeekPicker
          weeks={weeks}
          currentWeekKey={weekKey}
          onSelect={handleWeekSelect}
        />
      </div>

      {loading && !weekData && (
        <div className="text-center py-12 text-gray-500 text-[11px]">Loading challenges...</div>
      )}

      {weekData && (
        <>
          {/* Viewer summary */}
          {user && weekData.viewerSummary && (
            <ViewerSummaryCard
              viewer={{ ...weekData.viewerSummary, userId: user.id }}
              awards={weekData.awards}
            />
          )}

          {/* Podium strip */}
          {weekData.awards?.length > 0 && (
            <div className="mb-4">
              <h3 className="font-display text-[9px] font-black tracking-[0.14em] uppercase text-white/40 mb-2">
                Weekly Podiums
              </h3>
              <WeeklyChallengePodiumStrip awards={weekData.awards} />
            </div>
          )}

          {/* Sticky filters */}
          <div className="sticky top-0 z-30 bg-[#0a0a10]/95 backdrop-blur-sm -mx-4 px-4 py-2 mb-3 border-b border-white/[0.04]">
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[8px] font-display font-bold text-white/25 uppercase mr-1">Charts</span>
              <FilterChip label="Both" active={chartMode === 'both'} onClick={() => setChartMode('both')} />
              <FilterChip label="Singles" active={chartMode === 'single'} onClick={() => setChartMode('single')} />
              <FilterChip label="Doubles" active={chartMode === 'double'} onClick={() => setChartMode('double')} />

              <span className="text-white/10 mx-1">|</span>

              <span className="text-[8px] font-display font-bold text-white/25 uppercase mr-1">Board</span>
              <FilterChip label="Both" active={leaderboardMode === 'both'} onClick={() => setLeaderboardMode('both')} />
              <FilterChip label="Singles" active={leaderboardMode === 'single'} onClick={() => setLeaderboardMode('single')} />
              <FilterChip label="Doubles" active={leaderboardMode === 'double'} onClick={() => setLeaderboardMode('double')} />

              <span className="text-white/10 mx-1">|</span>

              <span className="text-[8px] font-display font-bold text-white/25 uppercase mr-1">Skill</span>
              <FilterChip label="Everyone" active={skillFamily === 'all'} onClick={() => setSkillFamily('all')} />
              <FilterChip label="Intermediate" active={skillFamily === 'intermediate'} onClick={() => setSkillFamily('intermediate')} />
              <FilterChip label="Advanced" active={skillFamily === 'advanced'} onClick={() => setSkillFamily('advanced')} />
              <FilterChip label="Expert" active={skillFamily === 'expert'} onClick={() => setSkillFamily('expert')} />
            </div>
          </div>

          {/* Leaderboard */}
          <div className="mb-5">
            <h3 className="font-display text-[9px] font-black tracking-[0.14em] uppercase text-white/40 mb-2">
              Leaderboard
              {weekData.participantCount > 0 && (
                <span className="ml-1.5 text-white/20">({weekData.participantCount})</span>
              )}
            </h3>
            <WeeklyChallengeLeaderboard leaderboard={weekData.leaderboard} />
          </div>

          {/* Challenge list by level */}
          <div>
            <h3 className="font-display text-[9px] font-black tracking-[0.14em] uppercase text-white/40 mb-3">
              Challenges
              {week && (
                <span className="ml-1.5 text-white/20">
                  Lv.{week.challenge_min_level || 10}–{week.challenge_max_level}
                </span>
              )}
            </h3>
            {levels.length === 0 && (
              <p className="text-center text-gray-500 text-[11px] py-6">No challenges for this filter</p>
            )}
            {levels.map(level => (
              <WeeklyChallengeLevelRow
                key={level}
                level={level}
                charts={groupedByLevel[level]}
                viewerBests={viewerBests}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
