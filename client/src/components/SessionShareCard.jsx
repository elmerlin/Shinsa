import React, { useEffect, useMemo, useState } from 'react';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
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

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-piu-border/30 bg-piu-dark/45 px-2.5 py-2">
      <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">{label}</p>
      <p className="text-sm font-display font-bold text-gray-100">{value}</p>
    </div>
  );
}

function SongJacketButton({ row, onClick }) {
  const isSingle = row?.mode === 'Single';
  const isDouble = row?.mode === 'Double';
  const badgeColor = isSingle ? 'bg-red-600' : isDouble ? 'bg-green-600' : 'bg-blue-600';
  const level = parseInt(row?.level, 10) || '?';

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400/80"
      title="View judgments"
    >
      {row?.jacket_url ? (
        <img src={row.jacket_url} alt="" className="w-10 h-10 rounded object-cover" />
      ) : (
        <div className="w-10 h-10 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-xs text-gray-500">
          {(row?.song_title || '?')[0]}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 min-w-[16px] h-[14px] px-1 rounded text-[8px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {level}
      </span>
    </button>
  );
}

function JudgmentModal({ row, onClose }) {
  if (!row) return null;

  const totalSteps = (parseInt(row.perfect, 10) || 0)
    + (parseInt(row.great, 10) || 0)
    + (parseInt(row.good, 10) || 0)
    + (parseInt(row.bad, 10) || 0)
    + (parseInt(row.miss, 10) || 0);
  const perfectRate = totalSteps > 0 ? Math.round(((parseInt(row.perfect, 10) || 0) / totalSteps) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-piu-border bg-piu-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-cyan-300 uppercase font-display font-bold tracking-wide">Judgments</p>
            <p className="text-sm font-display font-bold text-gray-100 break-words">{row.song_title || 'Song'}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{modeShort(row.mode)}{row.level || '?'} • {row.grade || '-'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            &#10005;
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-sky-300">P {formatNumber(row.perfect)}</div>
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-green-300">G {formatNumber(row.great)}</div>
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-yellow-300">Good {formatNumber(row.good)}</div>
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-purple-300">Bad {formatNumber(row.bad)}</div>
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-red-300">Miss {formatNumber(row.miss)}</div>
          <div className="rounded border border-piu-border/50 bg-piu-dark/45 px-2 py-1.5 text-gray-200">Combo {formatNumber(row.max_combo)}</div>
        </div>

        <div className="mt-3 rounded border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs">
          <p className="text-emerald-300 font-display font-bold">{perfectRate}% Perfects</p>
          <p className="text-gray-400 mt-0.5">{formatNumber(totalSteps)} judged steps</p>
        </div>
      </div>
    </div>
  );
}

export default function SessionShareCard({
  share,
  className = '',
  title = 'Session Share',
  actions = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [activeRow, setActiveRow] = useState(null);

  const rows = Array.isArray(share?.rows) ? share.rows : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / 10));

  useEffect(() => {
    if (!expanded) setPage(1);
  }, [expanded]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const startIndex = expanded ? (page - 1) * 10 : 0;
  const visibleRows = useMemo(() => {
    if (expanded) return rows.slice(startIndex, startIndex + 10);
    return rows.slice(0, 5);
  }, [expanded, rows, startIndex]);

  if (!share) return null;

  return (
    <>
      <div className={`rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 via-emerald-500/10 to-transparent p-3 ${className}`.trim()}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-wider text-cyan-300">{title}</p>
            <p className="text-xs text-gray-300">
              {share.sessionDateLabel}
              {share.sessionTimeRange ? ` • ${share.sessionTimeRange}` : ''}
              {share.sessionDurationLabel ? ` • ${share.sessionDurationLabel}` : ''}
            </p>
            {share.sessionMachineName ? (
              <p className="text-[11px] text-cyan-300/90 mt-0.5">Machine: {share.sessionMachineName}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Stat label="Songs" value={share.songCount || rows.length} />
          <Stat label="Clears" value={`${share.clearCount || 0} (${share.clearRate || 0}%)`} />
          <Stat label="Avg Score" value={formatNumber(share.averageScore)} />
          <Stat label="Perfects" value={`${share.perfectRate || 0}%`} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="px-2 py-1 rounded border border-cyan-400/35 bg-cyan-500/15 text-cyan-200 font-display font-bold">Mode: {share.filterMode || 'Both'}</span>
          <span className="px-2 py-1 rounded border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 font-display font-bold">Min grade: {share.minGradeLabel || 'Pass'}</span>
          <span className="px-2 py-1 rounded border border-piu-border/50 bg-piu-dark/50 text-gray-300 font-display font-bold">{share.levelRangeLabel || 'Any level'}</span>
        </div>

        <div className="mt-3 rounded-lg border border-piu-border/40 bg-piu-dark/35 overflow-hidden">
          <div className="px-3 py-2 border-b border-piu-border/30 bg-piu-dark/40 flex items-center justify-between">
            <p className="text-[11px] font-display font-bold text-cyan-300 uppercase tracking-wide">Selected Results</p>
            <p className="text-[10px] text-gray-500">{expanded ? `Page ${page}/${totalPages}` : `${Math.min(5, rows.length)} of ${rows.length}`}</p>
          </div>

          {visibleRows.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">No songs matched this filter.</p>
          ) : (
            <table className="w-full text-xs table-auto">
              <thead>
                <tr className="text-[10px] text-gray-500 border-b border-piu-border/25">
                  <th className="text-left px-2 py-1 font-display font-bold w-6">#</th>
                  <th className="text-left px-2 py-1 font-display font-bold">Song</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Score</th>
                  <th className="text-right px-2 py-1 font-display font-bold">Grade</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const number = expanded ? (startIndex + idx + 1) : (idx + 1);
                  return (
                    <tr key={`${row.song_title}-${row.mode}-${row.level}-${row.score}-${idx}`} className="border-b border-piu-border/20 last:border-0">
                      <td className="px-2 py-1.5 text-gray-400 font-mono align-top">{number}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-start gap-2">
                          <SongJacketButton row={row} onClick={() => setActiveRow(row)} />
                          <div className="min-w-0">
                            <p className="text-gray-200 font-display font-bold whitespace-normal break-words leading-tight">{row.song_title}</p>
                            <p className="text-[10px] text-gray-500">{modeShort(row.mode)}{row.level || '?'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-200 whitespace-nowrap">{formatNumber(row.score)}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveRow(row)}
                          className={`font-display font-bold hover:underline ${getGradeColorClass(row.grade)}`}
                          title="View judgments"
                        >
                          {row.grade || '-'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {rows.length > 5 ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="px-2.5 py-1 rounded border border-cyan-400/35 text-cyan-300 hover:bg-cyan-400/10 text-[10px] font-display font-bold"
            >
              {expanded ? 'Show Top 5' : 'Show More'}
            </button>
            {expanded && totalPages > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-piu-border/60 text-[10px] text-gray-300 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-[10px] text-gray-500">{page}/{totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-piu-border/60 text-[10px] text-gray-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-gray-500">Tap jackets or grades to view judgments.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-gray-500">Tap jackets or grades to view judgments.</p>
        )}
      </div>

      <JudgmentModal row={activeRow} onClose={() => setActiveRow(null)} />
    </>
  );
}
