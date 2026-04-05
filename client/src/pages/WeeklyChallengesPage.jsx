import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getWeeklyChallengeWeek, getWeeklyChallengeWeeks, getWeeklyChallengeChartScores } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../utils/countryFlags';
import { buildReplayModalTitle } from '../utils/replayTitle';
import { getProfilePath } from '../utils/profile';
import WeeklyChallengePodiumStrip from '../components/weeklyChallenges/WeeklyChallengePodiumStrip';
import WeeklyChallengeLeaderboard from '../components/weeklyChallenges/WeeklyChallengeLeaderboard';
import WeeklyChallengeLevelRow from '../components/weeklyChallenges/WeeklyChallengeLevelRow';
import WeeklyChallengeWeekPicker, { formatWeekRange } from '../components/weeklyChallenges/WeeklyChallengeWeekPicker';
import { TrophyIcon } from '../components/weeklyChallenges/WeeklyChallengePodiumStrip';
import PlateBadge from '../components/ui/plate-badge';

const ScoreSnapshotModal = lazy(() => import('../components/ScoreSnapshotModal'));
const YouTubeReplayModal = lazy(() => import('../components/YouTubeReplayModal'));

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
  const canonicalizingWeekRef = useRef(false);

  const [weekKey, setWeekKey] = useState(searchParams.get('week') || 'current');
  const [weeks, setWeeks] = useState([]);
  const [weeksLoading, setWeeksLoading] = useState(false);
  const [weeksLoaded, setWeeksLoaded] = useState(false);
  const [weekData, setWeekData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [chartMode, setChartMode] = useState('both');
  const [leaderboardMode, setLeaderboardMode] = useState('both');
  const [skillFamily, setSkillFamily] = useState('all');

  // Chart scores modal
  const [selectedChart, setSelectedChart] = useState(null);
  const [chartScores, setChartScores] = useState(null);
  const [chartScoresLoading, setChartScoresLoading] = useState(false);
  const [selectedScore, setSelectedScore] = useState(null);
  const [selectedReplay, setSelectedReplay] = useState(null);

  const loadWeeks = useCallback(() => {
    if (weeksLoaded || weeksLoading) return;
    setWeeksLoading(true);
    getWeeklyChallengeWeeks()
      .then((data) => {
        setWeeks(Array.isArray(data) ? data : []);
        setWeeksLoaded(true);
      })
      .catch(() => {})
      .finally(() => setWeeksLoading(false));
  }, [weeksLoaded, weeksLoading]);

  // Load week data when filters change
  const loadWeek = useCallback(() => {
    setLoading(true);
    const params = {};
    if (chartMode !== 'both') params.chart_mode = chartMode;
    if (leaderboardMode !== 'both') params.leaderboard_mode = leaderboardMode;
    if (skillFamily !== 'all') params.skill_family = skillFamily;

    const requestedWeekKey = weekKey || 'current';
    getWeeklyChallengeWeek(requestedWeekKey, params)
      .then(data => {
        setWeekData(data);
        if (requestedWeekKey === 'current' && data.week?.week_key) {
          canonicalizingWeekRef.current = true;
          setWeekKey(data.week.week_key);
          navigate(`/weekly-challenges?week=${data.week.week_key}`, { replace: true });
        }
      })
      .catch(() => setWeekData(null))
      .finally(() => setLoading(false));
  }, [weekKey, chartMode, leaderboardMode, skillFamily, navigate]);

  useEffect(() => {
    if (canonicalizingWeekRef.current) {
      canonicalizingWeekRef.current = false;
      return;
    }
    loadWeek();
  }, [loadWeek]);

  const handleChartClick = useCallback((chart) => {
    setSelectedChart(chart);
    setChartScoresLoading(true);
    getWeeklyChallengeChartScores(chart.id)
      .then(data => setChartScores(data))
      .catch(() => setChartScores(null))
      .finally(() => setChartScoresLoading(false));
  }, []);

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
          loadingWeeks={weeksLoading}
          currentWeekKey={weekKey}
          currentWeek={week}
          onOpen={loadWeeks}
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

          {/* Sticky filters — leaderboard mode scope */}
          <div className="sticky top-0 z-30 bg-[#0a0a10]/95 backdrop-blur-sm -mx-4 px-4 py-2 mb-3 border-b border-white/[0.04]">
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[8px] font-display font-bold text-white/25 uppercase mr-1">Board</span>
              <FilterChip label="Both" active={leaderboardMode === 'both'} onClick={() => setLeaderboardMode('both')} />
              <FilterChip label="Singles" active={leaderboardMode === 'single'} onClick={() => setLeaderboardMode('single')} />
              <FilterChip label="Doubles" active={leaderboardMode === 'double'} onClick={() => setLeaderboardMode('double')} />
            </div>
          </div>

          {/* Leaderboard */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-[9px] font-black tracking-[0.14em] uppercase text-white/40">
                Leaderboard
                {weekData.participantCount > 0 && (
                  <span className="ml-1.5 text-white/20">({weekData.participantCount})</span>
                )}
              </h3>
              <div className="flex gap-1 items-center">
                <FilterChip label="Everyone" active={skillFamily === 'all'} onClick={() => setSkillFamily('all')} />
                <FilterChip label="Intermediate" active={skillFamily === 'intermediate'} onClick={() => setSkillFamily('intermediate')} />
                <FilterChip label="Advanced" active={skillFamily === 'advanced'} onClick={() => setSkillFamily('advanced')} />
              </div>
            </div>
            <WeeklyChallengeLeaderboard leaderboard={weekData.leaderboard} />
          </div>

          {/* Challenge list by level */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-[9px] font-black tracking-[0.14em] uppercase text-white/40">
                Challenges
                {week && (
                  <span className="ml-1.5 text-white/20">
                    Lv.{week.challenge_min_level || 10}–{week.challenge_max_level}
                  </span>
                )}
              </h3>
              <div className="flex gap-1 items-center">
                <span className="text-[8px] font-display font-bold text-white/25 uppercase mr-1">Charts</span>
                <FilterChip label="Both" active={chartMode === 'both'} onClick={() => setChartMode('both')} />
                <FilterChip label="Singles" active={chartMode === 'single'} onClick={() => setChartMode('single')} />
                <FilterChip label="Doubles" active={chartMode === 'double'} onClick={() => setChartMode('double')} />
              </div>
            </div>
            {levels.length === 0 && (
              <p className="text-center text-gray-500 text-[11px] py-6">No challenges for this filter</p>
            )}
            {levels.map(level => (
              <WeeklyChallengeLevelRow
                key={level}
                level={level}
                charts={groupedByLevel[level]}
                viewerBests={viewerBests}
                onChartClick={handleChartClick}
              />
            ))}
          </div>
        </>
      )}

      {/* Chart scores modal */}
      {selectedChart && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => { setSelectedChart(null); setChartScores(null); }}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0a1929] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-piu-border/40 bg-[#0a1929]/95 backdrop-blur-sm px-4 py-3">
              {selectedChart.jacket_url_snapshot && (
                <img src={selectedChart.jacket_url_snapshot} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" decoding="async" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-white truncate">{selectedChart.song_title_snapshot}</p>
                <p className="text-[10px] text-gray-400">
                  {selectedChart.mode} {selectedChart.level}
                  {chartScores ? ` \u2022 ${chartScores.scores.length} players` : ''}
                  {chartScores?.total_attempts > 0 ? ` \u2022 ${chartScores.total_attempts} attempts` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedChart(null); setChartScores(null); }} className="text-sm font-display font-bold text-gray-400 hover:text-white transition-colors">Close</button>
            </div>

            {chartScoresLoading && (
              <div className="py-8 text-center text-gray-500 text-xs font-display">Loading...</div>
            )}
            {!chartScoresLoading && chartScores?.scores?.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-xs font-display">No scores yet</div>
            )}
            {!chartScoresLoading && chartScores?.scores?.length > 0 && (
              <div className="divide-y divide-piu-border/20">
                {chartScores.scores.map((entry, i) => {
                  const avatarUrl = entry.avatar ? getAvatarUrl(entry.avatar, 'sm') : '';
                  const flag = entry.nationality ? getCountryFlag(entry.nationality) : '';
                  const hasReplay = !!entry.replay_embed_url;
                  return (
                    <div key={entry.user_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.02]">
                      <span className={`w-5 shrink-0 text-center text-[10px] font-display font-black ${
                        i === 0 ? 'text-piu-gold' : i === 1 ? 'text-piu-silver' : i === 2 ? 'text-piu-bronze' : 'text-gray-600'
                      }`}>{entry.rank}</span>
                      <Link to={getProfilePath(entry.user_id, entry.username)} className="shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full border border-white/10 object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-piu-dark flex items-center justify-center text-[10px] font-bold">{(entry.username || '?')[0]}</div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={getProfilePath(entry.user_id, entry.username)} className="text-[11px] font-display font-bold text-white hover:text-piu-accent truncate block">
                          {flag && <span className="mr-1">{flag}</span>}
                          {entry.username}
                        </Link>
                        <p className="text-[8px] text-gray-600 truncate">
                          {entry.skill_title ? `${entry.skill_title} \u2022 ` : ''}
                          {(entry.attempt_count || 0).toLocaleString()} attempt{entry.attempt_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasReplay && (
                          <button
                            type="button"
                            onClick={() => setSelectedReplay({
                              url: entry.replay_embed_url,
                              title: buildReplayModalTitle(entry),
                              playId: entry.play_id || '',
                              ownerId: entry.user_id || '',
                            })}
                            className="text-sky-400/70 hover:text-sky-300"
                            title="Watch replay"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedScore({
                          ...entry, song_title: chartScores.chart.song_title, mode: chartScores.chart.mode, level: chartScores.chart.level,
                          background_url: entry.background_url || chartScores.chart.jacket_url || '', _jacketUrl: entry.background_url || chartScores.chart.jacket_url || '',
                        })} className="text-right hover:opacity-80 transition-opacity" title="View score details">
                          <span className="text-[11px] font-display font-bold text-white">{(entry.score || 0).toLocaleString()}</span>
                          <div className="mt-0.5 flex items-center justify-end gap-1">
                            <p className="text-[9px] font-display text-gray-500">{entry.grade}</p>
                            <PlateBadge plate={entry.plate} size="xs" />
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedScore && (
        <Suspense fallback={null}>
          <ScoreSnapshotModal score={selectedScore} jacketUrl={selectedScore._jacketUrl || ''} modalLabel="WC Score" onClose={() => setSelectedScore(null)} playId={selectedScore.play_id} />
        </Suspense>
      )}
      {selectedReplay && (
        <Suspense fallback={null}>
          <YouTubeReplayModal
            url={selectedReplay.url}
            title={selectedReplay.title}
            onClose={() => setSelectedReplay(null)}
            commentThread={selectedReplay.playId ? {
              itemId: selectedReplay.playId,
              ownerId: selectedReplay.ownerId || '',
            } : null}
          />
        </Suspense>
      )}
    </div>
  );
}
