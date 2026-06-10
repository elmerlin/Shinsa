import React, { useState, useEffect, useMemo } from 'react';
import HeartRateStrip, { HrZoneBar } from './HeartRateStrip';
import { hrZoneColor } from '../utils/heartRate';
import PiuChartJacket from './PiuChartJacket';
import ScoreSnapshotModal from './ScoreSnapshotModal';
import { getChartKeyMap, lookupPlay , getLiveSession } from '../utils/api';
import { buildScoreSnapshotLinkShare } from '../utils/directMessageShares';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getOverTop100Rank(value) {
  const rank = parseInt(value, 10) || 0;
  return rank > 0 && rank <= 100 ? rank : 0;
}

function getGradeColorClass(grade) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS')) return 'text-piu-gold';
  if (normalized.includes('S')) return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-piu-silver';
  if (normalized.includes('AA')) return 'text-piu-bronze';
  if (normalized === 'A+' || normalized === 'A') return 'text-amber-500';
  if (normalized === 'B') return 'text-gray-300';
  if (normalized === 'C') return 'text-gray-400';
  if (normalized === 'D' || normalized === 'F') return 'text-gray-500';
  return 'text-gray-300';
}

function Stat({ label, value, subvalue = '' }) {
  return (
    <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2.5 py-2">
      <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">{label}</p>
      <p className="text-sm font-display font-bold text-gray-100">{value}</p>
      {subvalue ? <p className="text-[10px] text-gray-500 mt-0.5">{subvalue}</p> : null}
    </div>
  );
}

function SongJacket({ row }) {
  const jacketUrl = row?.jacket_url || row?._jacketUrl || '';

  return (
    <PiuChartJacket
      title={row?.song_title}
      mode={row?.mode}
      level={row?._level ?? row?.level}
      jacketUrl={jacketUrl}
      size="xs"
    />
  );
}

function SongTable({ title, rows, type, onRowClick }) {
  const list = Array.isArray(rows) ? rows : [];
  const emptyLabel = type === 'score'
    ? 'No scored songs in this session.'
    : 'No rated songs in this session.';
  const rankHeaderClass = 'text-left py-1 pl-2 pr-1 font-display font-bold w-6 sm:px-2';
  const songHeaderClass = 'text-left py-1 pl-1.5 pr-1 font-display font-bold sm:px-2';
  const valueHeaderClass = 'text-right py-1 pl-1 pr-2.5 font-display font-bold sm:px-2';
  const gradeHeaderClass = 'text-right py-1 pl-1 pr-4 font-display font-bold sm:px-2';
  const rankCellClass = 'py-1.5 pl-2 pr-1 text-gray-400 font-mono align-top sm:px-2';
  const songCellClass = 'py-1.5 pl-1.5 pr-1 sm:px-2';
  const valueCellClass = 'py-1.5 pl-1 pr-2.5 text-right font-mono whitespace-nowrap sm:px-2';
  const gradeCellClass = 'py-1.5 pl-1 pr-4 text-right font-display font-bold whitespace-nowrap sm:px-2';

  return (
    <div className="rounded-lg border border-piu-border/40 bg-piu-dark/35 overflow-hidden">
      <div className="px-3 py-2 border-b border-piu-border/30 bg-piu-dark/40">
        <p className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide">{title}</p>
      </div>
      {list.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-500">{emptyLabel}</p>
      ) : (
        <table className="w-full text-xs table-auto">
          <thead>
            <tr className="text-[10px] text-gray-500 border-b border-piu-border/25">
              <th className={rankHeaderClass}>#</th>
              <th className={songHeaderClass}>Song</th>
              {type === 'score' ? (
                <>
                  <th className={valueHeaderClass}>Score</th>
                  <th className={gradeHeaderClass}>Grade</th>
                </>
              ) : (
                <>
                  <th className={valueHeaderClass}>Rating</th>
                  <th className={gradeHeaderClass}>Grade</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((row, idx) => {
              const rowScore = row?._score ?? row?.score;
              const rowGrade = row?._grade ?? row?.grade;
              const rowRating = row?._rating ?? row?.rating;
              const overRank = getOverTop100Rank(row?._over_top100_rank ?? row?.over_top100_rank);
              return (
                <tr
                  key={`${type}-${idx}-${row.song_title}-${row.mode}-${row.level}`}
                  className={`border-b border-piu-border/20 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-white/[0.03] transition-colors' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <td className={rankCellClass}>{idx + 1}</td>
                  <td className={songCellClass}>
                    <div className="flex items-start gap-2">
                      <SongJacket row={row} />
                      <div className="min-w-0">
                        <p className="text-gray-200 font-display font-bold whitespace-normal break-words leading-tight">{row.song_title}</p>
                        {overRank > 0 && (
                          <p className="mt-1">
                            <span className="inline-flex items-center rounded border border-yellow-300/60 bg-yellow-500/15 px-1.5 py-0.5 text-[11px] leading-none text-yellow-100 font-display font-black tracking-wide">
                              TOP #{overRank}
                            </span>
                          </p>
                        )}
                        {row.weekly_challenge_week_key ? (
                          <p className={overRank > 0 ? 'mt-0.5' : 'mt-1'}>
                            <a href={`/weekly-challenges?week=${row.weekly_challenge_week_key}`} className="inline-flex items-center rounded border border-purple-500/25 bg-purple-500/15 px-1.5 py-0.5 text-[9px] leading-none text-purple-300 font-display font-black hover:bg-purple-500/25 transition-colors">
                              WC
                            </a>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {type === 'score' ? (
                    <>
                      <td className={`${valueCellClass} text-gray-200`}>{formatNumber(rowScore)}</td>
                      <td className={`${gradeCellClass} ${getGradeColorClass(rowGrade)}`}>{rowGrade}</td>
                    </>
                  ) : (
                    <>
                      <td className={`${valueCellClass} text-cyan-300`}>{formatNumber(rowRating)}</td>
                      <td className={`${gradeCellClass} ${getGradeColorClass(rowGrade)}`}>
                        {rowGrade || '-'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ♥ Heart rate slide for the session recap: stats, session curve over the
// player's personal zone bands, time-in-zone, highest-HR song, and per-level
// intensity with S/D separated (D23 ≠ S23).
function SessionHrSection({ hr }) {
  if (!hr) return null;
  const mins = Math.round((Number(hr.duration_s) || 0) / 60);
  const perLevel = Array.isArray(hr.per_level) ? hr.per_level : [];
  return (
    <div className="rounded-xl border border-red-400/20 bg-black/20 p-2.5 space-y-2.5">
      <p className="text-[11px] font-display font-bold uppercase tracking-wide text-red-300">♥ Heart rate</p>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg bg-white/[0.04] py-1.5">
          <p className="font-display text-base font-bold text-red-400 tabular-nums">{hr.hr_avg || '—'}</p>
          <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500">Avg BPM</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] py-1.5">
          <p className="font-display text-base font-bold tabular-nums" style={{ color: hrZoneColor(hr.hr_peak, hr.max_hr) }}>{hr.hr_peak || '—'}</p>
          <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500">Peak BPM</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] py-1.5">
          <p className="font-display text-base font-bold text-white tabular-nums">{mins > 0 ? `${mins}m` : '—'}</p>
          <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500">Song time</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] py-1.5">
          <p className="font-display text-base font-bold text-white tabular-nums">{hr.play_count || 0}</p>
          <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500">Plays</p>
        </div>
      </div>
      <HeartRateStrip avg={hr.hr_avg} peak={hr.hr_peak} series={hr.series} durationS={hr.duration_s} maxHr={hr.max_hr} />
      <HrZoneBar zoneSeconds={hr.zone_seconds || {}} maxHr={hr.max_hr} />
      {hr.peak_song ? (
        <p className="text-[11px] text-gray-400">
          Highest HR: <span className="font-bold text-red-400">{hr.peak_song.hr_peak} BPM</span> on {hr.peak_song.song_title}{' '}
          ({String(hr.peak_song.mode || '').startsWith('D') ? 'D' : 'S'}{hr.peak_song.level})
        </p>
      ) : null}
      {perLevel.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] font-display font-bold uppercase tracking-wide text-gray-500">Avg HR by level</p>
          {perLevel.map((g) => (
            <div key={g.key} className="flex items-center gap-2">
              <span className={`w-9 text-[11px] font-bold tabular-nums ${g.mode === 'D' ? 'text-emerald-300' : 'text-rose-300'}`}>{g.key}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((g.hr_avg / Math.max(1, hr.max_hr)) * 100))}%`,
                    backgroundColor: hrZoneColor(g.hr_avg, hr.max_hr),
                  }}
                />
              </div>
              <span className="w-8 text-right text-[11px] font-bold tabular-nums text-gray-200">{g.hr_avg}</span>
              <span className="w-11 text-right text-[10px] tabular-nums text-gray-500">pk {g.hr_peak}</span>
              <span className="w-7 text-right text-[10px] tabular-nums text-gray-600">×{g.plays}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function SessionSummaryCard({
  summary,
  className = '',
  title = 'Session Summary',
  actions = null,
  compact = false,
  flush = false,
  postUserId = '',
}) {
  const [topPlaysExpanded, setTopPlaysExpanded] = useState(false);
  const [selectedScore, setSelectedScore] = useState(null);
  const [chartKeyMap, setChartKeyMap] = useState(null);
  // Session heart rate: new posts carry summary.hr in the marker; older posts
  // fetch the fresh summary by sessionId once Top Plays is expanded.
  const [freshHr, setFreshHr] = useState(null);
  const hr = summary?.hr || freshHr;
  useEffect(() => {
    if (!topPlaysExpanded || hr || !summary?.sessionId) return;
    let cancelled = false;
    getLiveSession(String(summary.sessionId))
      .then((res) => { if (!cancelled && res?.summary?.hr) setFreshHr(res.summary.hr); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topPlaysExpanded, summary?.sessionId]);

  useEffect(() => {
    getChartKeyMap().then(setChartKeyMap).catch(() => {});
  }, []);

  const handleRowClick = useMemo(() => {
    if (!chartKeyMap) return null;
    return async (row) => {
      const norm = (row.song_title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const level = row._level ?? row.level;
      const score = row._score ?? row.score;
      const exactKey = `${norm}|${row.mode}|${level}`;
      const chartId = chartKeyMap[exactKey] || chartKeyMap[norm];
      const chartLink = chartId ? `/songs/chart/${chartId}` : `/songs?q=${encodeURIComponent(row.song_title || '')}`;
      const jacketUrl = row.jacket_url || row._jacketUrl || '';

      // Try to fetch full play data from server for enrichment
      let enriched = null;
      const userId = row.user_id || postUserId || '';
      if (userId && row.song_title && score > 0) {
        try {
          enriched = await lookupPlay({
            song_title: row.song_title,
            mode: row.mode,
            level,
            score,
            user_id: userId,
          });
        } catch {}
      }

      const base = enriched || row;
      const scoreObj = {
        ...base,
        song_title: base.song_title || row.song_title,
        score: base.score ?? score,
        new_score: base.score ?? score,
        grade: base.grade || row._grade || row.grade || '',
        new_grade: base.grade || row._grade || row.grade || '',
        mode: base.mode || row.mode,
        level: base.level ?? level,
        replay_embed_url: base.replay_embed_url || row.replay_embed_url || '',
        replay_video_id: base.replay_video_id || row.replay_video_id || '',
        machine_name: base.machine_name || row.machine_name || summary?.sessionMachineName || '',
        date_played: base.played_at_utc || base.date_played || row.date_played || summary?.sessionDateLabel || '',
        user_id: base.user_id || userId,
        username: base.username || '',
        _jacketUrl: base.background_url || jacketUrl,
        _chartLink: chartLink,
        _playId: base.id || row.play_id || 0,
      };
      scoreObj._linkShare = buildScoreSnapshotLinkShare({
        kind: 'score_snapshot',
        score: scoreObj,
        path: chartLink,
        chartPath: chartLink,
        jacketUrl: scoreObj._jacketUrl,
        replayUrl: scoreObj.replay_embed_url || '',
      });
      setSelectedScore(scoreObj);
    };
  }, [chartKeyMap, summary, postUserId]);

  if (!summary) return null;
  return (
    <>
    <div className={`${flush ? 'bg-gradient-to-br from-emerald-500/8 via-cyan-500/5 to-transparent' : 'rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-transparent'} ${compact ? 'p-2.5' : 'p-3'} ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-display font-bold uppercase tracking-wider text-emerald-300">{title}</p>
          <p className="text-xs text-gray-300">
            {summary.sessionDateLabel}
            {summary.sessionTimeRange ? ` • ${summary.sessionTimeRange}` : ''}
            {summary.sessionDurationLabel ? ` • ${summary.sessionDurationLabel}` : ''}
          </p>
          {summary.sessionMachineName ? (
            <p className="text-[11px] text-cyan-300/90 mt-0.5">Machine: {summary.sessionMachineName}</p>
          ) : null}
          {summary.sessionShoeLabel ? (
            <p className="text-[11px] text-emerald-300/90 mt-0.5">Shoe: {summary.sessionShoeLabel}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {(summary.trainingLoad || 0) > 0 ? (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2">
            <p className="text-[9px] text-amber-400/70 font-display uppercase tracking-wide">Training Load</p>
            <p className="text-sm font-display font-bold text-amber-300 tabular-nums">{formatNumber(summary.trainingLoad)}</p>
          </div>
        ) : null}
        <Stat label="Songs" value={summary.songCount} />
        <Stat label="Clears" value={`${summary.clearCount} (${summary.clearRate}%)`} />
        <Stat label="Steps" value={formatNumber(summary.totalSteps)} />
        <Stat label="Estimated Calories" value={`~${formatNumber(summary.estimatedKcal)} kcal`} />
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
          <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Mode split</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-red-500/20 border border-red-500/40">
              <span className="text-[10px] text-red-300 font-display font-bold">Singles</span>
              <span className="min-w-[20px] h-[18px] px-1 rounded bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {summary.singleCount || 0}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-green-500/20 border border-green-500/40">
              <span className="text-[10px] text-green-300 font-display font-bold">Doubles</span>
              <span className="min-w-[20px] h-[18px] px-1 rounded bg-green-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {summary.doubleCount || 0}
              </span>
            </div>
            {(summary.otherCount || 0) > 0 ? (
              <div className="inline-flex items-center gap-1.5 rounded px-2 py-1 bg-blue-500/20 border border-blue-500/40">
                <span className="text-[10px] text-blue-300 font-display font-bold">Other</span>
                <span className="min-w-[20px] h-[18px] px-1 rounded bg-blue-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                  {summary.otherCount}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="col-span-2 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
          <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Judgment totals</p>
          <p className="mt-1 text-xs">
            <span className="text-sky-400">P {formatNumber(summary?.judgmentTotals?.perfect)}</span>
            <span className="text-gray-500"> | </span>
            <span className="text-green-400">G {formatNumber(summary?.judgmentTotals?.great)}</span>
            <span className="text-gray-500"> | </span>
            <span className="text-yellow-400">Good {formatNumber(summary?.judgmentTotals?.good)}</span>
            <span className="text-gray-500"> | </span>
            <span className="text-purple-400">Bad {formatNumber(summary?.judgmentTotals?.bad)}</span>
            <span className="text-gray-500"> | </span>
            <span className="text-red-400">Miss {formatNumber(summary?.judgmentTotals?.miss)}</span>
          </p>
          <p className="text-xs font-display font-bold text-emerald-300 mt-1">
            {parseInt(summary?.perfectRate, 10) || 0}% Perfects!
          </p>
        </div>
      </div>

      {!compact ? (
        <div className="mt-3 rounded-xl border border-cyan-400/25 bg-black/15 p-2.5">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2"
            onClick={() => setTopPlaysExpanded((prev) => !prev)}
            aria-expanded={topPlaysExpanded}
          >
            <span className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide">Top Plays</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold uppercase tracking-wide text-cyan-300/90">
              {topPlaysExpanded ? 'Hide' : 'Show'}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-3 h-3 transition-transform ${topPlaysExpanded ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </span>
          </button>
          {topPlaysExpanded ? (
            <div className="space-y-2 mt-2">
              <SongTable title="Top 3 songs by score" rows={summary?.topSongsByScore || []} type="score" onRowClick={handleRowClick} />
              <SongTable title="Top 3 songs by rating" rows={summary?.topSongsByRating || []} type="rating" onRowClick={handleRowClick} />
              {hr ? <SessionHrSection hr={hr} /> : null}
            </div>
          ) : (
            <p className="text-[10px] text-gray-500 mt-1.5">Tap to expand{summary?.hr || summary?.sessionId ? ' · ♥ heart rate' : ''}</p>
          )}
        </div>
      ) : null}
    </div>

    {selectedScore ? (
      <ScoreSnapshotModal
        score={selectedScore}
        jacketUrl={selectedScore._jacketUrl || ''}
        chartLink={selectedScore._chartLink || ''}
        onClose={() => setSelectedScore(null)}
        modalLabel="Play details"
        directMessageLinkShare={selectedScore._linkShare || null}
        playId={selectedScore._playId || null}
      />
    ) : null}
    </>
  );
}
