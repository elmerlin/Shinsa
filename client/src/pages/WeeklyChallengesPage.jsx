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
import WeeklyChallengeBonusChip from '../components/weeklyChallenges/WeeklyChallengeBonusChip';
import PlateBadge from '../components/ui/plate-badge';

const ScoreSnapshotModal = lazy(() => import('../components/ScoreSnapshotModal'));
const YouTubeReplayModal = lazy(() => import('../components/YouTubeReplayModal'));

// ── Filter chip ──────────────────────────────────────

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
        active
          ? 'bg-piu-dark text-white shadow-sm'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
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
    <div className="rounded-xl border border-piu-gold/20 bg-gradient-to-r from-piu-gold/[0.06] to-transparent px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-display font-bold text-piu-gold/60 uppercase tracking-wider">Your Week</span>
          {viewer.rank && (
            <span className="text-xs font-display font-bold text-white/40">
              #{viewer.rank}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-display font-bold text-white tabular-nums">
              {(viewer.totalPoints || 0).toLocaleString()}
              <span className="text-white/30 text-[10px] ml-0.5">pts</span>
            </span>
            <WeeklyChallengeBonusChip
              entry={{
                pg_bonus_points: viewer.pgBonusPoints,
                pg_bonus_count: viewer.pgBonusCount,
              }}
            />
          </div>
          <span className="text-xs font-display text-white/50 tabular-nums">
            {viewer.totalClears || 0} clears
          </span>
        </div>
      </div>
      {myAwards.length > 0 && (
        <div className="flex gap-2 mt-2">
          {myAwards.map(a => (
            <span key={`${a.award_key}-${a.rank}`} className="flex items-center gap-1 text-[10px] font-display font-bold text-white/50">
              <TrophyIcon rank={a.rank} className="text-xs" />
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
  // WC division: 'main' (Singles + Doubles) or 'coop' (parallel Co-Op WC).
  // Each division has its own pool + leaderboard on the server. Honour the
  // `?division=coop` query param so the dashboard tile can deep-link into
  // the Co-op tab.
  const [division, setDivision] = useState(
    searchParams.get('division') === 'coop' ? 'coop' : 'main',
  );

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
    if (division !== 'main') params.division = division;

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
  }, [weekKey, chartMode, leaderboardMode, skillFamily, division, navigate]);

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
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
            Weekly Challenges
          </h1>
          {week && (
            <p className="text-xs sm:text-sm text-white/40 mt-1">
              {formatWeekRange(week.starts_at_utc, week.ends_at_utc)}
              {week.status === 'active' && (
                <span className="ml-2 text-emerald-400 font-bold text-[10px] uppercase">Live</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/weekly-challenges/summary"
            className="flex items-center gap-1.5 rounded-md border border-piu-gold/25 bg-piu-gold/[0.06] px-2.5 py-1.5 text-[11px] font-display font-bold text-piu-gold/90 transition-colors hover:bg-piu-gold/[0.12]"
          >
            <span>🏆</span>
            <span className="hidden sm:inline">All-Time</span>
          </Link>
          <WeeklyChallengeWeekPicker
            weeks={weeks}
            loadingWeeks={weeksLoading}
            currentWeekKey={weekKey}
            currentWeek={week}
            onOpen={loadWeeks}
            onSelect={handleWeekSelect}
          />
        </div>
      </div>

      {loading && !weekData && (
        <div className="text-center py-16 text-zinc-500 text-sm">Loading challenges...</div>
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

          {/* Division switcher — Singles+Doubles vs Co-Op. Two parallel
              weekly challenges; each has its own pool, leaderboard, and
              podium. Sits above the podium so it's the first decision. */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setDivision('main')}
              className={`px-3.5 py-1.5 rounded-full font-display text-[11px] sm:text-xs font-black uppercase tracking-[0.12em] transition-colors ${
                division === 'main'
                  ? 'bg-piu-accent text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'bg-white/[0.04] text-white/55 border border-white/[0.06] hover:bg-white/[0.08]'
              }`}
            >
              Singles + Doubles
            </button>
            <button
              type="button"
              onClick={() => setDivision('coop')}
              className={`px-3.5 py-1.5 rounded-full font-display text-[11px] sm:text-xs font-black uppercase tracking-[0.12em] transition-colors ${
                division === 'coop'
                  ? 'bg-piu-accent text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'bg-white/[0.04] text-white/55 border border-white/[0.06] hover:bg-white/[0.08]'
              }`}
            >
              Co-Op
            </button>
          </div>

          {/* Podium strip */}
          {weekData.awards?.length > 0 && (
            <div className="mb-5">
              <h3 className="font-display text-[10px] sm:text-xs font-black tracking-[0.14em] uppercase text-white/40 mb-2.5">
                Weekly Podiums
              </h3>
              <WeeklyChallengePodiumStrip awards={weekData.awards} />
            </div>
          )}

          {/* Sticky filters — leaderboard mode scope */}
          <div className="sticky top-0 z-30 bg-[#0a0a10]/95 backdrop-blur-sm -mx-4 px-4 py-2.5 mb-4 border-b border-white/[0.04]">
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] font-display font-bold text-white/25 uppercase mr-1.5 tracking-wider">Board</span>
              <FilterChip label="Both" active={leaderboardMode === 'both'} onClick={() => setLeaderboardMode('both')} />
              <FilterChip label="Singles" active={leaderboardMode === 'single'} onClick={() => setLeaderboardMode('single')} />
              <FilterChip label="Doubles" active={leaderboardMode === 'double'} onClick={() => setLeaderboardMode('double')} />
            </div>
          </div>

          {/* Desktop: side-by-side layout */}
          <div className="lg:grid lg:grid-cols-[minmax(280px,360px)_1fr] lg:gap-8 lg:items-start">
            {/* Leaderboard column */}
            <div className="mb-6 lg:mb-0 lg:sticky lg:top-14">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-xs font-black tracking-[0.14em] uppercase text-white/40">
                  Leaderboard
                  {weekData.participantCount > 0 && (
                    <span className="ml-1.5 text-white/20 normal-case tracking-normal font-bold">
                      {weekData.participantCount} players
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                <FilterChip label="Everyone" active={skillFamily === 'all'} onClick={() => setSkillFamily('all')} />
                <FilterChip label="Intermediate" active={skillFamily === 'intermediate'} onClick={() => setSkillFamily('intermediate')} />
                <FilterChip label="Advanced" active={skillFamily === 'advanced'} onClick={() => setSkillFamily('advanced')} />
              </div>
              <WeeklyChallengeLeaderboard leaderboard={weekData.leaderboard} />
            </div>

            {/* Challenge list column */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xs font-black tracking-[0.14em] uppercase text-white/40">
                  Challenges
                  {week && (
                    <span className="ml-1.5 text-white/20 normal-case tracking-normal font-bold">
                      {division === 'coop'
                        ? '2-Player'
                        : `Lv.${week.challenge_min_level || 10}–${week.challenge_max_level}`}
                    </span>
                  )}
                </h3>
                {/* Singles/Doubles/Both is meaningless for Co-op (every
                    chart is CoOp) — hide it for that division. */}
                {division === 'main' ? (
                  <div className="flex gap-1 items-center">
                    <span className="text-[10px] font-display font-bold text-white/25 uppercase mr-1 tracking-wider">Charts</span>
                    <FilterChip label="Both" active={chartMode === 'both'} onClick={() => setChartMode('both')} />
                    <FilterChip label="S" active={chartMode === 'single'} onClick={() => setChartMode('single')} />
                    <FilterChip label="D" active={chartMode === 'double'} onClick={() => setChartMode('double')} />
                  </div>
                ) : null}
              </div>
              {levels.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-8">No challenges for this filter</p>
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
          </div>
        </>
      )}

      {/* Chart scores modal */}
      {selectedChart && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => { setSelectedChart(null); setChartScores(null); }}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0a1929] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-piu-border/40 bg-[#0a1929]/95 backdrop-blur-sm px-4 py-3">
              {selectedChart.jacket_url_snapshot && (
                <img src={selectedChart.jacket_url_snapshot} alt="" className="h-12 w-12 rounded-lg object-cover" loading="lazy" decoding="async" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-white truncate">{selectedChart.song_title_snapshot}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {selectedChart.mode} {selectedChart.level}
                  {chartScores ? ` \u2022 ${chartScores.scores.length} players` : ''}
                  {chartScores?.total_attempts > 0 ? ` \u2022 ${chartScores.total_attempts} attempts` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedChart(null); setChartScores(null); }} className="text-sm font-display font-bold text-zinc-400 hover:text-white transition-colors px-2 py-1">Close</button>
            </div>

            {chartScoresLoading && (
              <div className="py-10 text-center text-zinc-500 text-sm font-display">Loading...</div>
            )}
            {!chartScoresLoading && chartScores?.scores?.length === 0 && (
              <div className="py-10 text-center text-zinc-500 text-sm font-display">No scores yet</div>
            )}
            {!chartScoresLoading && chartScores?.scores?.length > 0 && (
              <div className="divide-y divide-piu-border/20">
                {chartScores.scores.map((entry, i) => {
                  const avatarUrl = entry.avatar ? getAvatarUrl(entry.avatar, 'sm') : '';
                  const flag = entry.nationality ? getCountryFlag(entry.nationality) : '';
                  const hasReplay = !!entry.replay_embed_url;
                  return (
                    <div key={entry.user_id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                      <span className={`w-6 shrink-0 text-center text-xs font-display font-black ${
                        i === 0 ? 'text-piu-gold' : i === 1 ? 'text-piu-silver' : i === 2 ? 'text-piu-bronze' : 'text-zinc-600'
                      }`}>{entry.rank}</span>
                      <Link to={getProfilePath(entry.user_id, entry.username)} className="shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full border border-white/10 object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-piu-dark flex items-center justify-center text-xs font-bold">{(entry.username || '?')[0]}</div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={getProfilePath(entry.user_id, entry.username)} className="text-sm font-display font-bold text-white hover:text-piu-accent truncate block">
                          {flag && <span className="mr-1">{flag}</span>}
                          {entry.username}
                        </Link>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {entry.skill_title ? `${entry.skill_title} \u2022 ` : ''}
                          {(entry.attempt_count || 0).toLocaleString()} attempt{entry.attempt_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
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
                            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedScore({
                          ...entry, song_title: chartScores.chart.song_title, mode: chartScores.chart.mode, level: chartScores.chart.level,
                          background_url: entry.background_url || chartScores.chart.jacket_url || '', _jacketUrl: entry.background_url || chartScores.chart.jacket_url || '',
                        })} className="text-right hover:opacity-80 transition-opacity" title="View score details">
                          <span className="text-sm font-display font-bold text-white tabular-nums">{(entry.score || 0).toLocaleString()}</span>
                          <div className="mt-0.5 flex items-center justify-end gap-1">
                            <p className="text-[10px] font-display text-zinc-500">{entry.grade}</p>
                            <PlateBadge plate={entry.plate} size="xs" />
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-display font-bold text-white/35 tabular-nums">
                              {(entry.rating_points || 0).toLocaleString()} pts
                            </span>
                            <WeeklyChallengeBonusChip entry={entry} />
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
