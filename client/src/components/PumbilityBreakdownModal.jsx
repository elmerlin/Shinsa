import React from 'react';
import { Link } from 'react-router-dom';
import PiuChartJacket, { resolveChartJacketUrl } from './PiuChartJacket';

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getRank(score) {
  const s = parseInt(score, 10) || 0;
  if (s >= 995000) return { label: 'SSS+', color: 'text-sky-300' };
  if (s >= 990000) return { label: 'SSS', color: 'text-sky-400' };
  if (s >= 985000) return { label: 'SS+', color: 'text-piu-gold' };
  if (s >= 980000) return { label: 'SS', color: 'text-yellow-400' };
  if (s >= 975000) return { label: 'S+', color: 'text-amber-400' };
  if (s >= 970000) return { label: 'S', color: 'text-amber-500' };
  if (s >= 960000) return { label: 'AAA+', color: 'text-piu-silver' };
  if (s >= 950000) return { label: 'AAA', color: 'text-gray-300' };
  if (s >= 925000) return { label: 'AA+', color: 'text-piu-bronze' };
  if (s >= 900000) return { label: 'AA', color: 'text-piu-bronze' };
  if (s >= 825000) return { label: 'A+', color: 'text-amber-700' };
  if (s >= 750000) return { label: 'A', color: 'text-amber-700' };
  if (s >= 650000) return { label: 'B', color: 'text-gray-500' };
  if (s >= 550000) return { label: 'C', color: 'text-gray-500' };
  if (s >= 450000) return { label: 'D', color: 'text-gray-600' };
  return { label: 'F', color: 'text-gray-600' };
}

function getGradeColor(grade, score = 0) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized) {
    if (normalized.includes('SSS')) return 'text-sky-300';
    if (normalized.includes('SS')) return 'text-piu-gold';
    if (normalized.includes('S')) return 'text-amber-400';
    if (normalized.includes('AAA')) return 'text-piu-silver';
    if (normalized.includes('AA')) return 'text-piu-bronze';
    if (normalized === 'A+' || normalized === 'A') return 'text-amber-700';
  }
  return getRank(score).color;
}

export default function PumbilityBreakdownModal({
  open,
  title,
  rows,
  summary = null,
  headerMeta = null,
  jacketLookup = {},
  onClose,
  showIncompleteCta = false,
  ctaMessage = '',
}) {
  if (!open) return null;

  const averageRating = Number(summary?.average_rating) || 0;
  const minEntryRating = parseInt(summary?.min_entry_rating, 10) || 0;
  const averageScore = parseInt(summary?.average_score, 10) || 0;
  const averageScoreGrade = String(summary?.average_score_grade || '').trim();
  const averageLevel = Number(summary?.average_level) || 0;
  const equivalentLevel = parseInt(summary?.equivalent_level, 10) || 0;
  const equivalentGrade = String(summary?.equivalent_grade || '').trim();
  const minEntryDetails = summary?.min_entry_details || null;
  const scoreCount = parseInt(summary?.score_count, 10) || 0;
  const metaRank = parseInt(headerMeta?.rank, 10) || 0;
  const metaPumbility = parseInt(headerMeta?.pumbility, 10) || 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 pt-6 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden max-h-[calc(100vh-1.5rem)] sm:max-h-[min(72vh,calc(100vh-2rem))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <div>
            <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">{title}</h3>
            {(metaPumbility > 0 || metaRank > 0) ? (
              <div className="mt-1 flex items-center gap-2">
                {metaPumbility > 0 ? (
                  <span className="font-mono font-bold text-piu-gold text-sm">{formatNumber(metaPumbility)}</span>
                ) : null}
                {metaRank > 0 ? (
                  <span className="px-2 py-0.5 rounded border border-piu-gold/35 text-[11px] font-display font-bold text-piu-gold">#{metaRank}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-3 space-y-2">
          {summary ? (
            <div className="rounded-lg border border-piu-border/45 bg-piu-dark/35 p-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border border-piu-border/40 bg-piu-card/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Avg Rating</p>
                  <p className="font-mono font-bold text-sm text-white">
                    {averageRating > 0
                      ? averageRating.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : '--'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {equivalentLevel > 0 && equivalentGrade
                      ? `~ Lv.${equivalentLevel} ${equivalentGrade}`
                      : '--'}
                  </p>
                </div>
                <div className="rounded-md border border-piu-border/40 bg-piu-card/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Min Entry</p>
                  <p className="font-mono font-bold text-sm text-white">{minEntryRating > 0 ? formatNumber(minEntryRating) : '--'}</p>
                  <p className={`text-[10px] mt-0.5 ${minEntryDetails?.grade ? getGradeColor(minEntryDetails.grade, minEntryDetails?.score || 0) : 'text-gray-500'}`}>
                    {minEntryDetails?.level > 0 && minEntryDetails?.grade
                      ? `Lv.${minEntryDetails.level} ${minEntryDetails.grade}`
                      : '--'}
                  </p>
                </div>
                <div className="rounded-md border border-piu-border/40 bg-piu-card/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Avg Score</p>
                  <p className="font-mono font-bold text-sm text-white">{averageScore > 0 ? formatNumber(averageScore) : '--'}</p>
                  <p className={`text-[10px] mt-0.5 ${averageScoreGrade ? getGradeColor(averageScoreGrade, averageScore) : 'text-gray-500'}`}>
                    {averageScoreGrade || '--'}
                  </p>
                </div>
                <div className="rounded-md border border-piu-border/40 bg-piu-card/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Avg Level</p>
                  <p className="font-mono font-bold text-sm text-white">{averageLevel > 0 ? averageLevel.toFixed(1) : '--'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Top 50 average</p>
                </div>
              </div>
              {scoreCount > 0 && scoreCount < 50 ? (
                <p className="mt-2 text-[10px] text-gray-500 text-center">
                  Based on {scoreCount} available scores.
                </p>
              ) : null}
            </div>
          ) : null}

          {(rows || []).map((row, index) => {
            const grade = row.grade || getRank(row.score).label;
            const rowJacketUrl = resolveChartJacketUrl({
              title: row.title,
              mode: row.mode,
              level: row.level,
              jacketLookup,
              backgroundUrl: row.background_url,
              jacketUrl: row.jacket_url,
            });

            return (
              <div
                key={`${row.chart_id || 'chart'}-${index}`}
                className="rounded-xl border border-piu-border/45 bg-[#0d1628]/75 px-3 py-2.5 shadow-[0_14px_28px_rgba(0,0,0,0.18)]"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-[11px] text-gray-500 font-mono text-right">#{index + 1}</span>

                  <PiuChartJacket
                    title={row.title}
                    mode={row.mode}
                    level={row.level}
                    jacketUrl={rowJacketUrl}
                    size="wide"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-display font-bold text-white truncate">{row.title || 'Unknown song'}</p>
                        <p className="text-[11px] text-gray-500 truncate">{row.artist || 'Unknown artist'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-display font-black ${getGradeColor(grade, row.score)}`}>{grade}</p>
                        <p className="text-[11px] font-mono text-gray-100">{formatNumber(row.score)}</p>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Rating</p>
                      <p className="text-xs font-mono text-piu-gold">R {formatNumber(row.rating)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {(rows || []).length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">No rated songs yet.</p>
          )}

          {showIncompleteCta && (
            <div className="mt-3 rounded-lg border border-piu-border/45 bg-piu-dark/35 px-3 py-2.5">
              <p className="text-[11px] text-gray-400">
                {ctaMessage || 'This pumbility sheet is partial. Sign up and sync your PIUGAME account for full Top 50 data.'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Link
                  to="/register"
                  className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-gray-200 hover:text-white hover:bg-piu-dark/60 transition-colors"
                >
                  Sign Up
                </Link>
                <Link
                  to="/account"
                  className="px-2.5 py-1 rounded border border-piu-accent/50 text-[11px] font-display font-bold text-piu-accent hover:text-white hover:bg-piu-accent/20 transition-colors"
                >
                  Sync PIUGAME
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
