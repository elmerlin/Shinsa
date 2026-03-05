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
import PumbilityBreakdownModal from './PumbilityBreakdownModal';

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, index) => [grade, index]));

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getInitialLevelCursor(rows, targetLevel) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  if (targetLevel) {
    const idx = rows.findIndex((row) => row.level === targetLevel);
    if (idx >= 0) return idx;
  }
  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    const cleared = parseInt(rows[idx]?.cleared_charts, 10) || 0;
    if (cleared > 0) return idx;
  }
  return 0;
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

function CompetitiveLevelCard({
  title,
  modePrefix,
  modeColorClass,
  rows,
  cursor,
  onCursorChange,
  competitiveLevel,
  onTitleClick,
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedRow = rows[cursor] || null;
  const computedLevel = parseInt(competitiveLevel?.level, 10) || null;
  const displayLevel = selectedRow?.level ? `${modePrefix}${selectedRow.level}` : '-';
  const displayGrade = selectedRow?.average_grade || '';
  const displayAverage = parseInt(selectedRow?.average_score, 10) || 0;

  const selectedLevel = selectedRow?.level || null;
  const selectedGrade = selectedRow?.average_grade || '';
  const selectedAverage = selectedRow?.average_score || 0;
  const selectedPassed = selectedRow?.cleared_charts || 0;
  const selectedTotal = selectedRow?.total_charts || 0;
  const selectedPassPercent = selectedTotal > 0
    ? Number(((selectedPassed / selectedTotal) * 100).toFixed(2))
    : 0;

  const meetsScoreThreshold = selectedGrade
    ? (GRADE_INDEX[selectedGrade] || 0) >= (GRADE_INDEX.S || 0)
    : false;
  const meetsCoverageThreshold = selectedTotal > 0 && selectedPassPercent >= 50;
  const qualifies = meetsScoreThreshold && meetsCoverageThreshold;

  const handleBoxClick = (e) => {
    if (rows.length <= 1) {
      setExpanded((value) => !value);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const edgeThreshold = rect.width * 0.26;
    if (clickX <= edgeThreshold) {
      onCursorChange((prev) => (prev <= 0 ? rows.length - 1 : prev - 1));
      return;
    }
    if (clickX >= (rect.width - edgeThreshold)) {
      onCursorChange((prev) => (prev >= rows.length - 1 ? 0 : prev + 1));
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-dark/55 p-2.5 overflow-hidden">
      <button
        type="button"
        onClick={onTitleClick}
        className="text-[11px] font-display font-bold tracking-wide text-gray-300 mb-1.5 hover:text-piu-accent transition-colors underline decoration-dotted underline-offset-2"
      >
        {title}
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={handleBoxClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onCursorChange((prev) => (prev <= 0 ? rows.length - 1 : prev - 1));
          if (e.key === 'ArrowRight') onCursorChange((prev) => (prev >= rows.length - 1 ? 0 : prev + 1));
          if (e.key === 'Enter' || e.key === ' ') setExpanded((value) => !value);
        }}
        className="min-w-0 rounded-md border border-piu-border/40 bg-[#0b1324]/70 px-2.5 py-2 text-left hover:border-piu-accent/40 transition-colors cursor-pointer select-none"
        title={rows.length > 1
          ? 'Tap center to show breakdown. Tap left/right edge to navigate levels.'
          : 'Tap to show competitive level breakdown'}
      >
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className={`font-display font-black text-base ${modeColorClass}`}>
            {displayLevel}
          </span>
          <div className="shrink-0 flex items-center gap-1.5">
            <span className={`text-xs font-display font-bold ${displayGrade ? getGradeColor(displayGrade, displayAverage) : 'text-gray-500'}`}>
              {displayGrade || '-'}
            </span>
            <span className="sm:hidden text-[10px] font-mono text-gray-400">
              {displayAverage ? formatNumber(displayAverage) : '-'}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden xl:block mt-2 rounded-md border border-piu-border/40 bg-[#0b1324]/70 px-2 py-1.5">
        <p className="text-[10px] text-gray-500">Average Score ({displayLevel})</p>
        <p className="text-xs font-mono text-gray-100">{displayAverage ? formatNumber(displayAverage) : '-'}</p>
      </div>

      <p className="mt-2 text-[10px] text-gray-500">
        Computed competitive level:{' '}
        <span className={`font-display font-bold ${modeColorClass}`}>
          {computedLevel ? `${modePrefix}${computedLevel}` : '-'}
        </span>
      </p>

      {expanded && (
        <div className="mt-2 text-[10px] text-gray-400 rounded-md border border-piu-border/40 bg-piu-card/50 px-2 py-1.5 space-y-1">
          <p className="text-gray-500">Inspecting level: <span className="font-display font-bold text-gray-300">{selectedLevel ? `${modePrefix}${selectedLevel}` : '-'}</span></p>
          {!computedLevel && (
            <p className="text-amber-300">
              No level currently satisfies both requirements (50%+ clear and S-or-better average).
            </p>
          )}
          <p>% passed: <span className="font-mono text-gray-200">{selectedTotal > 0 ? `${selectedPassPercent}% (${selectedPassed}/${selectedTotal})` : '-'}</span></p>
          <p>Average score: <span className="font-mono text-gray-200">{selectedAverage ? formatNumber(selectedAverage) : '-'}</span></p>
          <p>Hypothetical grade: <span className={`font-display font-bold ${selectedGrade ? getGradeColor(selectedGrade, selectedAverage) : 'text-gray-500'}`}>{selectedGrade || '-'}</span></p>
          <p className={meetsCoverageThreshold ? 'text-emerald-300' : 'text-gray-500'}>
            50%+ clear requirement: {meetsCoverageThreshold ? 'met' : 'not met'}.
          </p>
          <p className={meetsScoreThreshold ? 'text-emerald-300' : 'text-gray-500'}>
            S-or-better average requirement: {meetsScoreThreshold ? 'met' : 'not met'}.
          </p>
          <p className={`${qualifies ? 'text-emerald-300' : 'text-gray-500'}`}>
            {qualifies ? 'This level qualifies for competitive level.' : 'This level does not qualify for competitive level.'}
          </p>
          <p className="text-gray-500 pt-1 border-t border-piu-border/40">
            Computed competitive level: <span className={`font-display font-bold ${modeColorClass}`}>{competitiveLevel?.level ? `${modePrefix}${competitiveLevel.level}` : '-'}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function CompetitiveLevelInfoModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <h3 className="font-display font-bold tracking-wide text-sm">Competitive Level</h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>
        <div className="px-4 py-4 text-sm text-gray-300 leading-relaxed space-y-3">
          <p>
            The competitive level is defined as the level of a folder for which your average score
            across cleared songs is 970,000 (Grade S) or better. You must also clear at least 50%
            of charts in that folder.
          </p>
          <p className="text-xs text-gray-500">
            A folder is just the songs within a mode and level. For instance the S23 folder, or D23 folder etc.
          </p>
        </div>
      </div>
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
  const [showCompLevelInfo, setShowCompLevelInfo] = useState(false);

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
          onTitleClick={() => setShowCompLevelInfo(true)}
        />

        <CompetitiveLevelCard
          title="Doubles Competitive Level"
          modePrefix="D"
          modeColorClass="text-green-400"
          rows={doubleLevels}
          cursor={doubleCursor}
          onCursorChange={setDoubleCursor}
          competitiveLevel={analytics.competitive_levels?.double}
          onTitleClick={() => setShowCompLevelInfo(true)}
        />
      </div>

      <CompetitiveLevelInfoModal open={showCompLevelInfo} onClose={() => setShowCompLevelInfo(false)} />
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
    const targetLevel = parseInt(analytics?.competitive_levels?.single?.level, 10) || null;
    setSingleCursor(getInitialLevelCursor(singleLevels, targetLevel));
  }, [analytics?.competitive_levels?.single?.level, singleLevels]);

  useEffect(() => {
    const targetLevel = parseInt(analytics?.competitive_levels?.double?.level, 10) || null;
    setDoubleCursor(getInitialLevelCursor(doubleLevels, targetLevel));
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
