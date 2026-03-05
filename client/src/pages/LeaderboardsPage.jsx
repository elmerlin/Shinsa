import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import PumbilityBreakdownModal from '../components/PumbilityBreakdownModal';
import { getProfilePath } from '../utils/profile';
import {
  getGlobalPumbilityLeaderboard,
  getMyTop100Scores,
  getOver20ChartTop100,
  getOver20ChartsByLevel,
  getOver20Levels,
  getSongAnalytics,
} from '../utils/api';

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, idx) => [grade, idx]));

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function getGradeSortValue(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  return GRADE_INDEX[normalized] ?? -1;
}

function getGradeColorClass(grade) {
  const normalized = String(grade || '').trim().toUpperCase();
  if (normalized.includes('SSS')) return 'text-sky-300';
  if (normalized.includes('SS+')) return 'text-yellow-300';
  if (normalized === 'SS') return 'text-yellow-400';
  if (normalized === 'S+' || normalized === 'S') return 'text-amber-400';
  if (normalized.includes('AAA')) return 'text-gray-200';
  if (normalized.includes('AA')) return 'text-orange-300';
  if (normalized.startsWith('A')) return 'text-orange-400';
  if (normalized === 'B') return 'text-gray-400';
  if (normalized === 'C' || normalized === 'D' || normalized === 'F') return 'text-gray-500';
  return 'text-gray-400';
}

function getCompetitiveLevelInspectRow(rows, computedLevel) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;

  const targetLevel = parseInt(computedLevel, 10) || 0;
  if (targetLevel > 0) {
    const exact = list.find((row) => (parseInt(row?.level, 10) || 0) === targetLevel);
    if (exact) return exact;
  }

  for (let idx = list.length - 1; idx >= 0; idx -= 1) {
    const cleared = parseInt(list[idx]?.cleared_charts, 10) || 0;
    if (cleared > 0) return list[idx];
  }
  return list[list.length - 1] || list[0];
}

function CompetitiveLevelFolderCard({ modeLabel, modePrefix, modeColorClass, computedLevel, rows }) {
  const inspectedRow = getCompetitiveLevelInspectRow(rows, computedLevel);
  const computed = parseInt(computedLevel, 10) || 0;

  if (!inspectedRow) {
    return (
      <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 p-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-display font-bold tracking-wide text-gray-300">{modeLabel}</p>
          <span className={`font-display font-black text-sm ${modeColorClass}`}>{computed > 0 ? `${modePrefix}${computed}` : '--'}</span>
        </div>
        <p className="text-[11px] text-gray-500">No folder data available yet.</p>
      </div>
    );
  }

  const folderLevel = parseInt(inspectedRow?.level, 10) || 0;
  const avgScore = parseInt(inspectedRow?.average_score, 10) || 0;
  const avgGrade = String(inspectedRow?.average_grade || '').trim() || '--';
  const clearedCharts = parseInt(inspectedRow?.cleared_charts, 10) || 0;
  const totalCharts = parseInt(inspectedRow?.total_charts, 10) || 0;
  const clearPct = totalCharts > 0 ? (clearedCharts / totalCharts) * 100 : 0;
  const meetsCoverage = totalCharts > 0 && clearPct >= 50;
  const meetsGrade = getGradeSortValue(avgGrade) >= getGradeSortValue('S');

  return (
    <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-display font-bold tracking-wide text-gray-300">{modeLabel}</p>
        <span className={`font-display font-black text-sm ${modeColorClass}`}>{computed > 0 ? `${modePrefix}${computed}` : '--'}</span>
      </div>
      <div className="space-y-1 text-[11px] text-gray-400">
        <p>Inspected folder: <span className={`font-display font-bold ${modeColorClass}`}>{folderLevel > 0 ? `${modePrefix}${folderLevel}` : '--'}</span></p>
        <p>
          Avg grade:{' '}
          <span className={`font-display font-bold ${avgGrade !== '--' ? getGradeColorClass(avgGrade) : 'text-gray-500'}`}>
            {avgGrade}
          </span>
        </p>
        <p>Avg score: <span className="font-mono text-gray-200">{avgScore > 0 ? formatNumber(avgScore) : '--'}</span></p>
        <p className={meetsCoverage ? 'text-emerald-300' : 'text-gray-500'}>
          Clear coverage: {totalCharts > 0 ? `${clearPct.toFixed(1)}% (${clearedCharts}/${totalCharts})` : '--'}
        </p>
        <p className={meetsGrade ? 'text-emerald-300' : 'text-gray-500'}>
          S-or-better average: {meetsGrade ? 'met' : 'not met'}
        </p>
      </div>
    </div>
  );
}

function CompetitiveLevelInfoModal({ open, member, onClose }) {
  if (!open || !member) return null;
  const singleLevel = parseInt(member?.singles_competitive_level, 10) || 0;
  const doubleLevel = parseInt(member?.doubles_competitive_level, 10) || 0;
  const highestLabel = doubleLevel > singleLevel
    ? `D${doubleLevel}`
    : (singleLevel > 0 ? `S${singleLevel}` : '--');

  const singleRows = member?.analytics?.levels?.single || [];
  const doubleRows = member?.analytics?.levels?.double || [];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-piu-border/60">
          <div>
            <h3 className="font-display font-bold tracking-wide text-sm">
              Competitive Level • {member.username}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Highest folder: <span className="font-display font-bold text-piu-accent">{highestLabel}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Close</button>
        </div>

        <div className="px-4 py-3 text-[11px] text-gray-400">
          Competitive level requires both: 50%+ clears in a folder and a folder average of Grade S (970,000+) or better.
        </div>

        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <CompetitiveLevelFolderCard
            modeLabel="Singles Folder"
            modePrefix="S"
            modeColorClass="text-red-300"
            computedLevel={singleLevel}
            rows={singleRows}
          />
          <CompetitiveLevelFolderCard
            modeLabel="Doubles Folder"
            modePrefix="D"
            modeColorClass="text-green-300"
            computedLevel={doubleLevel}
            rows={doubleRows}
          />
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, activeSortKey, sortDirection, onSort }) {
  const isActive = sortKey === activeSortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-[11px] font-display font-bold transition-colors ${
        isActive ? 'text-piu-accent' : 'text-gray-400 hover:text-white'
      }`}
    >
      {label}
      <span className="font-mono text-[10px]">{isActive ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}</span>
    </button>
  );
}

function PumbilityLeaderboardTab() {
  const [metric, setMetric] = useState('overall');
  const [sortBy, setSortBy] = useState('pumbility');
  const [sortOrder, setSortOrder] = useState('desc');
  const [mobileMetricView, setMobileMetricView] = useState('avg_grade');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [breakdownModal, setBreakdownModal] = useState(null);
  const [compModal, setCompModal] = useState(null);
  const [analyticsCache, setAnalyticsCache] = useState({});

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getGlobalPumbilityLeaderboard({
        metric,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        limit: 100,
      });
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setTotalPages(Math.max(1, parseInt(payload?.total_pages, 10) || 1));
    } catch (err) {
      setRows([]);
      setTotalPages(1);
      setError(err?.message || 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [metric, sortBy, sortOrder, page]);

  const onSort = (nextKey) => {
    if (nextKey === sortBy) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(nextKey);
    setSortOrder('desc');
  };

  const getOrLoadAnalytics = async (userId) => {
    const key = String(userId || '');
    if (!key) return null;
    if (analyticsCache[key]) return analyticsCache[key];
    const analytics = await getSongAnalytics(key);
    setAnalyticsCache((prev) => ({ ...prev, [key]: analytics }));
    return analytics;
  };

  const openBreakdown = async (row) => {
    try {
      const analytics = await getOrLoadAnalytics(row?.user_id);
      const breakdownRows = metric === 'singles'
        ? (analytics?.pumbility_breakdown?.singles_top50 || [])
        : (analytics?.pumbility_breakdown?.overall_top50 || []);
      if (!Array.isArray(breakdownRows) || breakdownRows.length === 0) return;
      setBreakdownModal({
        title: metric === 'singles'
          ? `${row.username} • Singles Pumbility Top Songs`
          : `${row.username} • Pumbility Top Songs`,
        rows: breakdownRows,
      });
    } catch {}
  };

  const openCompetitiveInfo = async (row) => {
    try {
      const analytics = await getOrLoadAnalytics(row?.user_id);
      setCompModal({
        ...row,
        analytics,
      });
    } catch {}
  };

  const metricRows = useMemo(() => {
    return rows.map((row) => {
      const pumbilityValue = metric === 'singles'
        ? (parseInt(row?.singles_pumbility, 10) || 0)
        : (parseInt(row?.overall_pumbility, 10) || 0);
      const averageGrade = metric === 'singles'
        ? (row?.singles_average_grade || '--')
        : (row?.overall_average_grade || '--');
      const averageLevel = metric === 'singles'
        ? (Number(row?.singles_average_level) || 0)
        : (Number(row?.overall_average_level) || 0);
      const breakdownCount = metric === 'singles'
        ? (parseInt(row?.singles_breakdown_count, 10) || 0)
        : (parseInt(row?.overall_breakdown_count, 10) || 0);
      const singleLevel = parseInt(row?.singles_competitive_level, 10) || 0;
      const doubleLevel = parseInt(row?.doubles_competitive_level, 10) || 0;
      const competitiveLabel = doubleLevel > singleLevel
        ? `D${doubleLevel}`
        : (singleLevel > 0 ? `S${singleLevel}` : '--');
      const competitiveClass = doubleLevel > singleLevel
        ? 'text-green-300'
        : (singleLevel > 0 ? 'text-red-300' : 'text-gray-500');
      return {
        ...row,
        pumbilityValue,
        averageGrade,
        averageLevel,
        breakdownCount,
        competitiveLabel,
        competitiveClass,
      };
    });
  }, [rows, metric]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-display">View:</span>
          <button
            type="button"
            onClick={() => { setMetric('overall'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              metric === 'overall' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Overall Pumbility
          </button>
          <button
            type="button"
            onClick={() => { setMetric('singles'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
              metric === 'singles' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
            }`}
          >
            Singles Pumbility
          </button>
        </div>
        <button
          type="button"
          onClick={loadRows}
          disabled={loading}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="md:hidden flex items-center gap-2">
        <label htmlFor="leaderboard-mobile-view" className="text-[11px] text-gray-500 font-display">Show:</label>
        <select
          id="leaderboard-mobile-view"
          className="flex-1 bg-piu-dark border border-piu-border rounded-lg px-2.5 py-1.5 text-xs text-gray-200 font-display"
          value={mobileMetricView}
          onChange={(event) => setMobileMetricView(event.target.value)}
        >
          <option value="avg_grade">Avg Grade</option>
          <option value="avg_level">Avg Level</option>
          <option value="competitive_level">C. Level</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : metricRows.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">No leaderboard data available yet.</p>
      ) : (
        <>
          <div className="md:hidden space-y-1.5">
            {metricRows.map((row) => (
              <div key={`${row.user_id}-${row.rank}`} className="rounded-lg border border-piu-border/40 bg-piu-card/35 px-2.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-7 shrink-0 text-sm font-mono text-gray-500">#{row.rank}</span>
                    <Link to={getProfilePath(row.user_id, row.username)} className="shrink-0">
                      {row.avatar ? (
                        <img src={String(row.avatar).startsWith('data:') ? row.avatar : getAvatarUrl(row.avatar)} alt="" className="w-9 h-9 rounded-full object-cover border border-piu-border/40" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs border border-piu-border/40">
                          {row.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link to={getProfilePath(row.user_id, row.username)} className="font-display font-bold text-sm truncate hover:text-piu-accent transition-colors">
                          {row.username}
                        </Link>
                        {row.nationality ? <span className="text-sm">{getCountryFlag(row.nationality)}</span> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span>
                          {mobileMetricView === 'avg_level' ? 'Avg Level' : mobileMetricView === 'competitive_level' ? 'C. Level' : 'Avg Grade'}:
                        </span>
                        {mobileMetricView === 'avg_level' ? (
                          <span className="font-mono text-gray-300">{row.averageLevel > 0 ? row.averageLevel.toFixed(1) : '--'}</span>
                        ) : null}
                        {mobileMetricView === 'avg_grade' ? (
                          <span className={`font-display font-bold ${row.averageGrade !== '--' ? getGradeColorClass(row.averageGrade) : 'text-gray-500'}`}>{row.averageGrade || '--'}</span>
                        ) : null}
                        {mobileMetricView === 'competitive_level' ? (
                          <button
                            type="button"
                            onClick={() => openCompetitiveInfo(row)}
                            className={`font-display font-bold underline decoration-dotted underline-offset-2 hover:text-piu-accent transition-colors ${row.competitiveClass}`}
                          >
                            {row.competitiveLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openBreakdown(row)}
                    disabled={row.pumbilityValue <= 0 || row.breakdownCount <= 0}
                    className={`shrink-0 text-sm font-mono font-bold ${
                      row.pumbilityValue > 0 && row.breakdownCount > 0
                        ? 'text-piu-gold hover:text-yellow-300'
                        : 'text-gray-500'
                    }`}
                  >
                    {row.pumbilityValue > 0 ? formatNumber(row.pumbilityValue) : '--'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
            <table className="w-full table-fixed">
              <thead className="bg-piu-dark/70">
                <tr className="border-b border-piu-border/50">
                  <th className="px-2 py-2 text-left text-[11px] font-display font-bold tracking-wide uppercase text-gray-500 w-[7%]">#</th>
                  <th className="px-2 py-2 text-left text-[11px] font-display font-bold tracking-wide uppercase text-gray-500 w-[34%]">Player</th>
                  <th className="px-2 py-2 text-left w-[16%]">
                    <SortHeader label="Pumbility" sortKey="pumbility" activeSortKey={sortBy} sortDirection={sortOrder} onSort={onSort} />
                  </th>
                  <th className="px-2 py-2 text-left w-[14%]">
                    <SortHeader label="Avg Grade" sortKey="avg_grade" activeSortKey={sortBy} sortDirection={sortOrder} onSort={onSort} />
                  </th>
                  <th className="px-2 py-2 text-left w-[14%]">
                    <SortHeader label="Avg Level" sortKey="avg_level" activeSortKey={sortBy} sortDirection={sortOrder} onSort={onSort} />
                  </th>
                  <th className="px-2 py-2 text-left w-[15%]">
                    <SortHeader label="Competitive Level" sortKey="competitive_level" activeSortKey={sortBy} sortDirection={sortOrder} onSort={onSort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {metricRows.map((row) => (
                  <tr key={`${row.user_id}-${row.rank}`} className="border-b border-piu-border/25 last:border-b-0 hover:bg-piu-dark/25 transition-colors">
                    <td className="px-2 py-2 text-sm font-mono text-gray-500 whitespace-nowrap">#{row.rank}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link to={getProfilePath(row.user_id, row.username)} className="shrink-0">
                          {row.avatar ? (
                            <img src={String(row.avatar).startsWith('data:') ? row.avatar : getAvatarUrl(row.avatar)} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border/40" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs border border-piu-border/40">
                              {row.username?.[0]?.toUpperCase()}
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link to={getProfilePath(row.user_id, row.username)} className="font-display font-bold text-[13px] hover:text-piu-accent transition-colors truncate max-w-[220px]">
                              {row.username}
                            </Link>
                            {row.nationality ? <span className="text-sm">{getCountryFlag(row.nationality)}</span> : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openBreakdown(row)}
                        disabled={row.pumbilityValue <= 0 || row.breakdownCount <= 0}
                        className={`font-mono font-bold ${
                          row.pumbilityValue > 0 && row.breakdownCount > 0
                            ? 'text-piu-gold hover:text-yellow-300'
                            : 'text-gray-500'
                        }`}
                      >
                        {row.pumbilityValue > 0 ? formatNumber(row.pumbilityValue) : '--'}
                      </button>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`font-display font-bold text-sm ${row.averageGrade !== '--' ? getGradeColorClass(row.averageGrade) : 'text-gray-500'}`}>
                        {row.averageGrade || '--'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-sm font-mono text-gray-300 whitespace-nowrap">
                      {row.averageLevel > 0 ? row.averageLevel.toFixed(1) : '--'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openCompetitiveInfo(row)}
                        className={`font-display font-bold text-sm underline decoration-dotted underline-offset-2 hover:text-piu-accent transition-colors ${row.competitiveClass}`}
                      >
                        {row.competitiveLabel}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1.5"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={loading || page <= 1}
        >
          Prev
        </button>
        <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1.5"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={loading || page >= totalPages}
        >
          Next
        </button>
      </div>

      <PumbilityBreakdownModal
        open={!!breakdownModal}
        title={breakdownModal?.title || ''}
        rows={breakdownModal?.rows || []}
        onClose={() => setBreakdownModal(null)}
      />
      <CompetitiveLevelInfoModal
        open={!!compModal}
        member={compModal}
        onClose={() => setCompModal(null)}
      />
    </div>
  );
}

function Over20RankingsTab() {
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [charts, setCharts] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [selectedChartKey, setSelectedChartKey] = useState('');
  const [selectedChart, setSelectedChart] = useState(null);
  const [chartScores, setChartScores] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadLevels = async () => {
      try {
        const payload = await getOver20Levels();
        if (cancelled) return;
        const nextLevels = Array.isArray(payload?.levels) ? payload.levels : [];
        setLevels(nextLevels);
        if (nextLevels.length > 0) {
          const initial = String(nextLevels[0].level);
          setSelectedLevel(initial);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load OVER levels.');
      }
    };
    loadLevels();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedLevel) return;
    let cancelled = false;
    const loadCharts = async () => {
      setChartsLoading(true);
      setError('');
      try {
        const payload = await getOver20ChartsByLevel(selectedLevel);
        if (cancelled) return;
        const nextCharts = Array.isArray(payload?.charts) ? payload.charts : [];
        setCharts(nextCharts);
        if (nextCharts.length > 0) {
          setSelectedChartKey(nextCharts[0].chart_key);
        } else {
          setSelectedChartKey('');
          setSelectedChart(null);
          setChartScores([]);
        }
      } catch (err) {
        if (cancelled) return;
        setCharts([]);
        setSelectedChartKey('');
        setSelectedChart(null);
        setChartScores([]);
        setError(err?.message || 'Failed to load chart list.');
      } finally {
        if (!cancelled) setChartsLoading(false);
      }
    };
    loadCharts();
    return () => { cancelled = true; };
  }, [selectedLevel]);

  useEffect(() => {
    if (!selectedChartKey) return;
    let cancelled = false;
    const loadChart = async () => {
      setChartLoading(true);
      setError('');
      try {
        const payload = await getOver20ChartTop100(selectedChartKey);
        if (cancelled) return;
        setSelectedChart(payload?.chart || null);
        setChartScores(Array.isArray(payload?.scores) ? payload.scores : []);
      } catch (err) {
        if (cancelled) return;
        setSelectedChart(null);
        setChartScores([]);
        setError(err?.message || 'Failed to load top 100 scores.');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };
    loadChart();
    return () => { cancelled = true; };
  }, [selectedChartKey]);

  const filteredCharts = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return charts;
    return charts.filter((chart) => String(chart?.song_title || '').toLowerCase().includes(q));
  }, [charts, search]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500 font-display">Level</label>
        <select
          value={selectedLevel}
          onChange={(event) => setSelectedLevel(event.target.value)}
          className="input-field max-w-[180px]"
        >
          {levels.map((row) => (
            <option key={row.level} value={row.level}>
              Level {row.level} ({row.chart_count})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input-field flex-1 min-w-[180px]"
          placeholder="Search songs in this level..."
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
          <div className="px-3 py-2 border-b border-piu-border/40 text-xs font-display font-bold text-gray-400">
            Songs ({filteredCharts.length})
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {chartsLoading ? (
              <p className="px-3 py-4 text-xs text-gray-500">Loading songs...</p>
            ) : filteredCharts.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">No songs found for this level.</p>
            ) : filteredCharts.map((chart) => (
              <button
                key={chart.chart_key}
                type="button"
                onClick={() => setSelectedChartKey(chart.chart_key)}
                className={`w-full px-3 py-2 text-left border-b border-piu-border/20 last:border-b-0 hover:bg-piu-dark/30 transition-colors ${
                  selectedChartKey === chart.chart_key ? 'bg-piu-dark/40' : ''
                }`}
              >
                <p className="text-sm font-display font-bold text-gray-100">{chart.song_title}</p>
                <p className="text-[11px] text-gray-500">{chart.mode} {chart.level}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
          <div className="px-3 py-2 border-b border-piu-border/40 flex items-center gap-2">
            {selectedChart?.jacket_url ? (
              <img src={selectedChart.jacket_url} alt="" className="w-9 h-9 rounded object-cover border border-piu-border/40" />
            ) : (
              <div className="w-9 h-9 rounded bg-piu-dark border border-piu-border/40" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-display font-bold text-gray-100 truncate">{selectedChart?.song_title || 'Select a chart'}</p>
              <p className="text-[11px] text-gray-500">{selectedChart ? `${selectedChart.mode} ${selectedChart.level}` : ''}</p>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {chartLoading ? (
              <p className="px-3 py-4 text-xs text-gray-500">Loading top 100...</p>
            ) : chartScores.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">No top 100 rows available.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-piu-dark/70 sticky top-0">
                  <tr className="border-b border-piu-border/40">
                    <th className="px-2 py-2 text-left text-gray-400 font-display">#</th>
                    <th className="px-2 py-2 text-left text-gray-400 font-display">Player</th>
                    <th className="px-2 py-2 text-right text-gray-400 font-display">Score</th>
                    <th className="px-2 py-2 text-right text-gray-400 font-display">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {chartScores.map((score) => (
                    <tr key={`${score.rank}-${score.player_name}-${score.score}`} className="border-b border-piu-border/20 last:border-b-0">
                      <td className="px-2 py-1.5 font-mono text-gray-500">#{score.rank}</td>
                      <td className="px-2 py-1.5 text-gray-200">{score.player_name || '-'}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(score.score)}</td>
                      <td className={`px-2 py-1.5 text-right font-display font-bold ${getGradeColorClass(score.grade)}`}>{score.grade || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MyTop100Tab() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getMyTop100Scores({ page, limit: 50 });
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setTotalPages(Math.max(1, parseInt(payload?.total_pages, 10) || 1));
    } catch (err) {
      setRows([]);
      setTotalPages(1);
      setError(err?.message || 'Failed to load your top 100 scores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [page]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">You do not have any tracked Top 100 scores yet.</p>
      ) : (
        <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-piu-dark/70">
              <tr className="border-b border-piu-border/40">
                <th className="px-2 py-2 text-left text-gray-400 font-display">Song</th>
                <th className="px-2 py-2 text-right text-gray-400 font-display">Score</th>
                <th className="px-2 py-2 text-right text-gray-400 font-display">Grade</th>
                <th className="px-2 py-2 text-right text-gray-400 font-display">Rank</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.id}-${row.song_title}-${row.mode}-${row.level}`} className="border-b border-piu-border/20 last:border-b-0">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {row.jacket_url ? (
                        <img src={row.jacket_url} alt="" className="w-9 h-9 rounded object-cover border border-piu-border/40" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-piu-dark border border-piu-border/40" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-display font-bold text-gray-100 truncate">{row.song_title}</p>
                        <p className="text-[11px] text-gray-500">{row.mode} {row.level}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(row.score)}</td>
                  <td className={`px-2 py-1.5 text-right font-display font-bold ${getGradeColorClass(row.grade)}`}>{row.grade || '-'}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-piu-gold">
                    #{row.over_top100_rank}/{row.top100_count || 100}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1.5"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={loading || page <= 1}
        >
          Prev
        </button>
        <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
        <button
          type="button"
          className="btn-secondary text-xs px-3 py-1.5"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={loading || page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function LeaderboardsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pumbility');

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h1 className="text-2xl font-display font-bold">LEADERBOARDS</h1>
          <p className="text-sm text-gray-400 mt-2">Login required.</p>
          <Link to="/login" className="inline-flex mt-4 btn-primary">Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-wider">LEADERBOARDS</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('pumbility')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            tab === 'pumbility' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Pumbility
        </button>
        <button
          type="button"
          onClick={() => setTab('over20')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            tab === 'over20' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Over 20 Level Rankings
        </button>
        <button
          type="button"
          onClick={() => setTab('my-top100')}
          className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
            tab === 'my-top100' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
          }`}
        >
          Your Top 100 Scores
        </button>
      </div>

      {tab === 'pumbility' && <PumbilityLeaderboardTab />}
      {tab === 'over20' && <Over20RankingsTab />}
      {tab === 'my-top100' && <MyTop100Tab />}
    </div>
  );
}
