import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));

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

function ChartModeBadge({ mode, level }) {
  const isSingle = mode === 'Single';
  const label = `${isSingle ? 'S' : 'D'}${level}`;

  return (
    <span
      className={`absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full min-w-[34px] h-6 px-1.5 border text-white font-display font-black text-[11px] ${
        isSingle
          ? 'bg-gradient-to-b from-red-500 to-red-800 border-red-300/50'
          : 'bg-gradient-to-b from-green-500 to-emerald-800 border-green-300/50'
      }`}
    >
      {label}
    </span>
  );
}

function PumbilityBreakdownModal({ open, title, rows, onClose }) {
  const [openSongInfoKey, setOpenSongInfoKey] = useState('');

  useEffect(() => {
    if (!open) setOpenSongInfoKey('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm sm:text-base">{title}</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-3 space-y-2">
          {(rows || []).map((row, index) => {
            const grade = row.grade || getRank(row.score).label;
            const rowKey = `${row.chart_id || 'chart'}-${index}`;
            const isInfoOpen = openSongInfoKey === rowKey;

            return (
              <div key={rowKey} className="rounded-lg border border-piu-border/40 bg-piu-dark/45 px-2.5 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 shrink-0 text-[11px] text-gray-500 font-mono text-right">#{index + 1}</span>

                  <button
                    type="button"
                    onClick={() => setOpenSongInfoKey((prev) => (prev === rowKey ? '' : rowKey))}
                    className="relative w-16 h-10 rounded overflow-hidden border border-piu-border/40 shrink-0 hover:border-piu-accent/50 transition-colors"
                    title={`${row.title || 'Unknown song'}${row.artist ? ` — ${row.artist}` : ''}`}
                    aria-label={`Show song info for ${row.title || 'song'}`}
                  >
                    {row.jacket_url ? (
                      <img src={row.jacket_url} alt={row.title || 'Song jacket'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-piu-dark flex items-center justify-center text-[10px] text-gray-500">No art</div>
                    )}
                    <ChartModeBadge mode={row.mode} level={row.level} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono text-gray-100">{formatNumber(row.score)}</p>
                      <p className={`text-sm font-display font-bold ${getGradeColor(grade, row.score)}`}>{grade}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[11px] text-gray-500">Tap jacket for song info</p>
                      <p className="text-xs font-mono text-piu-gold">R {formatNumber(row.rating)}</p>
                    </div>

                    {isInfoOpen && (
                      <div className="mt-1.5 rounded-md border border-piu-border/35 bg-[#0b1324]/70 px-2 py-1.5">
                        <p className="text-xs font-display font-bold leading-tight break-words">{row.title || 'Unknown song'}</p>
                        <p className="text-[11px] text-gray-400 break-words">{row.artist || 'Unknown artist'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {(rows || []).length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">No rated songs yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CompetitiveLevelCard({
  title,
  modePrefix,
  modeColorClass,
  rows,
  cursor,
  onCursorChange,
  competitiveLevel,
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedRow = rows[cursor] || null;
  const selectedLevel = selectedRow?.level || null;
  const selectedGrade = selectedRow?.average_grade || '';
  const selectedAverage = selectedRow?.average_score || 0;
  const selectedPassed = selectedRow?.cleared_charts || 0;
  const selectedTotal = selectedRow?.total_charts || 0;

  const qualifies = selectedGrade
    ? (GRADE_INDEX[selectedGrade] || 0) >= (GRADE_INDEX.S || 0)
    : false;

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-dark/55 p-2.5">
      <p className="text-[11px] font-display font-bold tracking-wide text-gray-300 mb-1.5">{title}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={rows.length <= 1}
          onClick={() => onCursorChange((prev) => (prev <= 0 ? rows.length - 1 : prev - 1))}
          className="w-7 h-7 shrink-0 rounded bg-piu-card border border-piu-border/60 text-gray-300 hover:text-white disabled:opacity-40"
          aria-label={`Previous ${title} level`}
        >
          &#8592;
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex-1 rounded-md border border-piu-border/40 bg-[#0b1324]/70 px-2 py-1.5 text-left hover:border-piu-accent/40 transition-colors"
          title="Toggle competitive level details"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`font-display font-black text-lg ${modeColorClass}`}>
              {selectedLevel ? `${modePrefix}${selectedLevel}` : '-'}
            </span>
            <span className={`text-sm font-display font-bold ${selectedGrade ? getGradeColor(selectedGrade, selectedAverage) : 'text-gray-500'}`}>
              {selectedGrade || '-'}
            </span>
          </div>
        </button>
        <button
          type="button"
          disabled={rows.length <= 1}
          onClick={() => onCursorChange((prev) => (prev >= rows.length - 1 ? 0 : prev + 1))}
          className="w-7 h-7 shrink-0 rounded bg-piu-card border border-piu-border/60 text-gray-300 hover:text-white disabled:opacity-40"
          aria-label={`Next ${title} level`}
        >
          &#8594;
        </button>
      </div>

      {expanded && (
        <div className="mt-2 text-[10px] text-gray-400 rounded-md border border-piu-border/40 bg-piu-card/50 px-2 py-1.5 space-y-1">
          <p>Average score: <span className="font-mono text-gray-200">{selectedAverage ? formatNumber(selectedAverage) : '-'}</span></p>
          <p>Hypothetical grade: <span className={`font-display font-bold ${selectedGrade ? getGradeColor(selectedGrade, selectedAverage) : 'text-gray-500'}`}>{selectedGrade || '-'}</span></p>
          <p>Passes at this level: {selectedPassed}/{selectedTotal}</p>
          <p className={`${qualifies ? 'text-emerald-300' : 'text-gray-500'}`}>
            {qualifies ? 'Meets S-or-better threshold at this level.' : 'Below S threshold at this level.'}
          </p>
          <p className="text-gray-500 pt-1 border-t border-piu-border/40">
            Computed competitive level: <span className={`font-display font-bold ${modeColorClass}`}>{competitiveLevel?.level ? `${modePrefix}${competitiveLevel.level}` : '-'}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function CompactMetricButton({ label, value, colorClass, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-piu-dark/60 border border-piu-border/50 p-2 hover:border-piu-accent/40 transition-colors text-center"
    >
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className={`font-display font-bold text-base ${colorClass}`}>{value}</p>
    </button>
  );
}

function PlayerMetricsPanel({
  analytics,
  singleLevels,
  doubleLevels,
  singleCursor,
  setSingleCursor,
  doubleCursor,
  setDoubleCursor,
  setOpenBreakdown,
}) {
  return (
    <div className="rounded-xl border border-piu-border/60 bg-gradient-to-br from-slate-900/80 to-slate-800/50 p-3 space-y-3">
      <h2 className="text-xs font-display font-bold tracking-wide text-piu-accent">PLAYER METRICS</h2>
      <div className="grid grid-cols-2 gap-2 text-center">
        <CompactMetricButton
          label="Pumbility"
          value={formatNumber(analytics.pumbility)}
          colorClass="text-piu-gold"
          onClick={() => setOpenBreakdown('overall')}
        />
        <CompactMetricButton
          label="Singles Pumbility"
          value={formatNumber(analytics.singles_pumbility)}
          colorClass="text-red-300"
          onClick={() => setOpenBreakdown('singles')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CompetitiveLevelCard
          title="Singles Competitive Level"
          modePrefix="S"
          modeColorClass="text-red-400"
          rows={singleLevels}
          cursor={singleCursor}
          onCursorChange={setSingleCursor}
          competitiveLevel={analytics.competitive_levels?.single}
        />

        <CompetitiveLevelCard
          title="Doubles Competitive Level"
          modePrefix="D"
          modeColorClass="text-green-400"
          rows={doubleLevels}
          cursor={doubleCursor}
          onCursorChange={setDoubleCursor}
          competitiveLevel={analytics.competitive_levels?.double}
        />
      </div>
    </div>
  );
}

export default function SongAnalyticsPanel({ analytics }) {
  const [progressMode, setProgressMode] = useState('Combined');
  const [openBreakdown, setOpenBreakdown] = useState('');
  const [singleCursor, setSingleCursor] = useState(0);
  const [doubleCursor, setDoubleCursor] = useState(0);

  const singleLevels = analytics?.levels?.single || [];
  const doubleLevels = analytics?.levels?.double || [];

  useEffect(() => {
    const targetLevel = analytics?.competitive_levels?.single?.level;
    if (!singleLevels.length) {
      setSingleCursor(0);
      return;
    }
    if (!targetLevel) {
      setSingleCursor(0);
      return;
    }
    const idx = singleLevels.findIndex((row) => row.level === targetLevel);
    setSingleCursor(idx >= 0 ? idx : 0);
  }, [analytics?.competitive_levels?.single?.level, singleLevels]);

  useEffect(() => {
    const targetLevel = analytics?.competitive_levels?.double?.level;
    if (!doubleLevels.length) {
      setDoubleCursor(0);
      return;
    }
    if (!targetLevel) {
      setDoubleCursor(0);
      return;
    }
    const idx = doubleLevels.findIndex((row) => row.level === targetLevel);
    setDoubleCursor(idx >= 0 ? idx : 0);
  }, [analytics?.competitive_levels?.double?.level, doubleLevels]);

  const progressRows = useMemo(() => {
    if (!analytics) return [];
    if (progressMode === 'Singles') return analytics.levels?.single || [];
    if (progressMode === 'Doubles') return analytics.levels?.double || [];
    return analytics.levels?.both || [];
  }, [analytics, progressMode]);

  const progressData = useMemo(() => {
    return progressRows.map((row) => ({
      level: row.level,
      clear_percentage: Number(row.clear_percentage) || 0,
      rating_total: parseInt(row.rating_total, 10) || 0,
      cleared_charts: parseInt(row.cleared_charts, 10) || 0,
      total_charts: parseInt(row.total_charts, 10) || 0,
    }));
  }, [progressRows]);

  const ratingMax = useMemo(() => {
    if (!progressData.length) return 100;
    const max = Math.max(...progressData.map((row) => row.rating_total || 0));
    return max > 0 ? Math.ceil(max / 100) * 100 : 100;
  }, [progressData]);

  const breakdownRows = openBreakdown === 'overall'
    ? analytics?.pumbility_breakdown?.overall_top50 || []
    : openBreakdown === 'singles'
      ? analytics?.pumbility_breakdown?.singles_top50 || []
      : [];

  if (!analytics) return null;

  return (
    <>
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <PlayerMetricsPanel
          analytics={analytics}
          singleLevels={singleLevels}
          doubleLevels={doubleLevels}
          singleCursor={singleCursor}
          setSingleCursor={setSingleCursor}
          doubleCursor={doubleCursor}
          setDoubleCursor={setDoubleCursor}
          setOpenBreakdown={setOpenBreakdown}
        />

        <div className="xl:col-span-2 rounded-xl border border-piu-border/60 bg-piu-card/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-xs font-display font-bold tracking-wide text-piu-accent">CLEAR % + LEVEL RATING</h2>
            <div className="flex items-center gap-1 rounded-lg bg-piu-dark border border-piu-border/40 p-1">
              {['Singles', 'Doubles', 'Combined'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setProgressMode(mode)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-display font-bold transition-colors ${
                    progressMode === mode ? 'bg-piu-accent text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={progressData} margin={{ top: 8, right: 16, left: 2, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="level" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(value) => `Lv.${value}`} />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  domain={[0, 100]}
                  label={{ value: 'Completion %', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  domain={[0, ratingMax]}
                  label={{ value: 'Rating', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.3)', borderRadius: '8px' }}
                  formatter={(value, name) => {
                    if (name === 'Completion %') return [`${Number(value).toFixed(2)}%`, name];
                    if (name === 'Rating') return [formatNumber(value), name];
                    return [value, name];
                  }}
                  labelFormatter={(_label, payload) => {
                    const row = payload?.[0]?.payload;
                    if (!row) return '';
                    return `Lv.${row.level} | ${row.cleared_charts}/${row.total_charts} cleared`;
                  }}
                />
                <Bar yAxisId="left" dataKey="clear_percentage" name="Completion %" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={18} />
                <Line yAxisId="right" type="monotone" dataKey="rating_total" name="Rating" stroke="#facc15" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#fde047' }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <PumbilityBreakdownModal
        open={openBreakdown === 'overall' || openBreakdown === 'singles'}
        title={openBreakdown === 'singles' ? 'Singles Pumbility Top Songs' : 'Pumbility Top Songs'}
        rows={breakdownRows}
        onClose={() => setOpenBreakdown('')}
      />
    </>
  );
}
