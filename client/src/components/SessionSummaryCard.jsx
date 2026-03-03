import React, { useState } from 'react';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatDecimal(value, maximumFractionDigits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

function modeShort(mode) {
  if (mode === 'Single') return 'S';
  if (mode === 'Double') return 'D';
  return 'X';
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
  const isSingle = row?.mode === 'Single';
  const isDouble = row?.mode === 'Double';
  const badgeColor = isSingle ? 'bg-red-600' : isDouble ? 'bg-green-600' : 'bg-blue-600';
  const level = parseInt(row?._level ?? row?.level, 10) || '?';
  const jacketUrl = row?.jacket_url || row?._jacketUrl || '';

  return (
    <div className="relative shrink-0">
      {jacketUrl ? (
        <img src={jacketUrl} alt="" className="w-9 h-9 rounded object-cover" />
      ) : (
        <div className="w-9 h-9 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-xs text-gray-500">
          {(row?.song_title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 min-w-[16px] h-[14px] px-1 rounded text-[8px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </div>
  );
}

function SongTable({ title, rows, type }) {
  const list = Array.isArray(rows) ? rows : [];
  const emptyLabel = type === 'score'
    ? 'No scored songs in this session.'
    : 'No rated songs in this session.';

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
              <th className="text-left px-2 py-1 font-display font-bold w-6">#</th>
              <th className="text-left px-2 py-1 font-display font-bold">Song</th>
              {type === 'score' ? (
                <>
                  <th className="text-right px-2 py-1 font-display font-bold">Score</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Grade</th>
                </>
              ) : (
                <>
                  <th className="text-right px-2 py-1 font-display font-bold">Rating</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Grade</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((row, idx) => {
              const rowScore = row?._score ?? row?.score;
              const rowGrade = row?._grade ?? row?.grade;
              const rowRating = row?._rating ?? row?.rating;
              const rowLevel = row?._level ?? row?.level;
              return (
                <tr key={`${type}-${idx}-${row.song_title}-${row.mode}-${row.level}`} className="border-b border-piu-border/20 last:border-0">
                  <td className="px-2 py-1.5 text-gray-400 font-mono align-top">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-start gap-2">
                      <SongJacket row={row} />
                      <div className="min-w-0">
                        <p className="text-gray-200 font-display font-bold whitespace-normal break-words leading-tight">{row.song_title}</p>
                        <p className="text-[10px] text-gray-500">{modeShort(row.mode)}{rowLevel || '?'}</p>
                      </div>
                    </div>
                  </td>
                  {type === 'score' ? (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-200 whitespace-nowrap">{formatNumber(rowScore)}</td>
                      <td className={`px-2 py-1.5 text-right font-display font-bold whitespace-nowrap ${getGradeColorClass(rowGrade)}`}>{rowGrade}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-cyan-300 whitespace-nowrap">{formatNumber(rowRating)}</td>
                      <td className={`px-2 py-1.5 text-right font-display font-bold whitespace-nowrap ${getGradeColorClass(rowGrade)}`}>
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

export default function SessionSummaryCard({
  summary,
  className = '',
  title = 'Session Summary',
  actions = null,
}) {
  const [topPlaysExpanded, setTopPlaysExpanded] = useState(false);
  if (!summary) return null;
  const kcalPerHour = parseInt(summary.estimatedKcalPerHour, 10) || 0;
  const calorieWeightKg = Number(summary.calorieWeightKg);
  const hasWeight = Number.isFinite(calorieWeightKg) && calorieWeightKg > 0;
  const personalized = !!summary.calorieEstimatePersonalized;
  const calorieSubvalue = kcalPerHour > 0
    ? `${formatNumber(kcalPerHour)} kcal/hour${hasWeight ? ` @ ${formatDecimal(calorieWeightKg)}kg` : ''}${!personalized ? ' (default)' : ''}`
    : '';
  return (
    <div className={`rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-transparent p-3 ${className}`.trim()}>
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
        <Stat label="Songs" value={summary.songCount} />
        <Stat label="Clears" value={`${summary.clearCount} (${summary.clearRate}%)`} />
        <Stat label="Steps" value={formatNumber(summary.totalSteps)} />
        <Stat
          label="Estimated Calories"
          value={`~${formatNumber(summary.estimatedKcal)} kcal`}
          subvalue={calorieSubvalue}
        />
      </div>

      <div className="mt-3 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
        <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Mode split</p>
        <div className="mt-1 flex items-center gap-2">
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

      <div className="mt-2 rounded-lg border border-piu-border/35 bg-piu-dark/30 px-3 py-2">
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
            <SongTable title="Top 3 songs by score" rows={summary?.topSongsByScore || []} type="score" />
            <SongTable title="Top 3 songs by rating" rows={summary?.topSongsByRating || []} type="rating" />
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 mt-1.5">Tap to expand</p>
        )}
      </div>
    </div>
  );
}
