import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getCountryFlag } from '../components/PlayerRegistration';
import PumbilityBreakdownModal from '../components/PumbilityBreakdownModal';
import { getProfilePath } from '../utils/profile';
import {
  getJacketMap,
  getGlobalPumbilityLeaderboard,
  getGlobalPumbilityPlayerSheet,
  getMyTop100Scores,
  getOver20ChartTop100,
  getOver20ChartsByLevel,
  getOver20Levels,
  getPiugamePumbility,
} from '../utils/api';

const GRADE_ORDER = ['F', 'D', 'C', 'B', 'A', 'A+', 'AA', 'AA+', 'AAA', 'AAA+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'];
const GRADE_INDEX = Object.fromEntries(GRADE_ORDER.map((grade, idx) => [grade, idx]));

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function normalizeNameKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

function getChartModeBadgeColor(mode) {
  if (mode === 'Single') return 'bg-red-600';
  if (mode === 'Double') return 'bg-green-600';
  return 'bg-blue-600';
}

function OverChartJacket({ chart, size = 'md' }) {
  const isSmall = size === 'sm';
  const boxClass = isSmall ? 'w-10 h-10' : 'w-12 h-12';
  const badgeClass = isSmall
    ? 'min-w-[16px] h-[14px] px-1 text-[9px]'
    : 'min-w-[18px] h-[16px] px-1 text-[9px]';
  const level = parseInt(chart?.level, 10);
  const levelText = Number.isFinite(level) && level > 0 ? String(level) : '?';
  const badgeColor = getChartModeBadgeColor(chart?.mode);
  const titleInitial = String(chart?.song_title || '?').trim()[0] || '?';

  return (
    <div className="relative shrink-0">
      {chart?.jacket_url ? (
        <img
          src={chart.jacket_url}
          alt=""
          className={`${boxClass} rounded object-cover border border-piu-border/50`}
        />
      ) : (
        <div className={`${boxClass} rounded bg-piu-dark border border-piu-border/50 flex items-center justify-center font-display font-bold text-sm text-gray-500`}>
          {titleInitial}
        </div>
      )}
      <span className={`absolute -bottom-1 -right-1 ${badgeClass} rounded flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
        {levelText}
      </span>
    </div>
  );
}

function Over20Top100Modal({
  open,
  chart,
  scores,
  loading,
  error,
  permalink,
  highlightRank = 0,
  highlightName = '',
  highlightScore = 0,
  onClose,
}) {
  if (!open) return null;
  const normalizedHighlightName = normalizeNameKey(highlightName);
  const numericHighlightScore = parseInt(highlightScore, 10) || 0;
  const hasExactHighlightMatch = normalizedHighlightName
    && numericHighlightScore > 0
    && (Array.isArray(scores) ? scores : []).some((row) => {
      const rowName = normalizeNameKey(row?.player_name);
      const rowScore = parseInt(row?.score, 10) || 0;
      return rowName === normalizedHighlightName && rowScore === numericHighlightScore;
    });

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-piu-border/60">
          <div className="min-w-0 flex items-center gap-2.5">
            <OverChartJacket chart={chart || {}} size="sm" />
            <div className="min-w-0">
              <p className="font-display font-bold text-sm truncate text-gray-100">
                {chart?.song_title || 'Top 100 Rankings'}
              </p>
              <p className="text-[11px] text-gray-500">
                {chart ? `${chart.mode} ${chart.level}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {permalink ? (
              <Link
                to={permalink}
                className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors"
              >
                Permalink
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded border border-piu-border/60 text-[11px] font-display font-bold text-gray-300 hover:text-white hover:bg-piu-dark/50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-4 text-xs text-gray-500">Loading top 100...</p>
          ) : error ? (
            <div className="px-4 py-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            </div>
          ) : !scores.length ? (
            <p className="px-4 py-4 text-xs text-gray-500">No top 100 rows available.</p>
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
                {scores.map((score) => {
                  const avatar = String(score?.player_avatar || score?.player_avatar_url || '').trim();
                  const avatarSrc = avatar
                    ? (avatar.startsWith('data:') || avatar.startsWith('http') ? avatar : getAvatarUrl(avatar))
                    : '';
                  const playerName = String(score?.player_name || '').trim();
                  const initial = playerName ? playerName[0].toUpperCase() : '?';
                  const rank = parseInt(score?.rank, 10) || 0;
                  const playerScore = parseInt(score?.score, 10) || 0;
                  const exactMatch = normalizedHighlightName
                    && numericHighlightScore > 0
                    && normalizeNameKey(playerName) === normalizedHighlightName
                    && playerScore === numericHighlightScore;
                  const isHighlighted = hasExactHighlightMatch ? exactMatch : (highlightRank > 0 && rank === highlightRank);
                  return (
                    <tr
                      key={`${score.rank}-${score.player_name}-${score.score}`}
                      className={`border-b border-piu-border/20 last:border-b-0 ${isHighlighted ? 'bg-piu-accent/10' : ''}`}
                    >
                      <td className={`px-2 py-1.5 font-mono ${isHighlighted ? 'text-piu-accent' : 'text-gray-500'}`}>#{score.rank}</td>
                      <td className="px-2 py-1.5 text-gray-200">
                        <div className="flex items-center gap-2 min-w-0">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover border border-piu-border/40 shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-[10px] border border-piu-border/40 shrink-0">
                              {initial}
                            </div>
                          )}
                          <span className="truncate">{playerName || '-'}</span>
                          {isHighlighted ? (
                            <span className="px-1.5 py-0.5 rounded bg-piu-accent/30 text-[10px] font-display font-bold text-piu-accent shrink-0">
                              YOU
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-200">{formatNumber(score.score)}</td>
                      <td className={`px-2 py-1.5 text-right font-display font-bold ${getGradeColorClass(score.grade)}`}>{score.grade || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function PumbilityLeaderboardTab() {
  const { user } = useAuth();
  const pageSize = 100;
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [mySnapshot, setMySnapshot] = useState(null);
  const [showPumbilityBreakdownModal, setShowPumbilityBreakdownModal] = useState(false);
  const [breakdownTitle, setBreakdownTitle] = useState('Pumbility Top Songs');
  const [breakdownRows, setBreakdownRows] = useState([]);
  const [breakdownSummary, setBreakdownSummary] = useState(null);
  const [breakdownHeaderMeta, setBreakdownHeaderMeta] = useState(null);
  const [breakdownIncomplete, setBreakdownIncomplete] = useState(false);
  const [breakdownLoadingKey, setBreakdownLoadingKey] = useState('');
  const [breakdownError, setBreakdownError] = useState('');
  const [jumpingToRank, setJumpingToRank] = useState(false);
  const [jacketLookup, setJacketLookup] = useState({});
  const loadMoreRef = useRef(null);

  const loadRows = async (nextPage, { append = false } = {}) => {
    if (append && (loadingMore || initialLoading)) return;
    if (!append && initialLoading) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setInitialLoading(true);
      setError('');
    }

    try {
      const payload = await getGlobalPumbilityLeaderboard({
        metric: 'overall',
        sort_by: 'pumbility',
        sort_order: 'desc',
        page: nextPage,
        limit: pageSize,
      });
      const incomingRows = Array.isArray(payload?.rows) ? payload.rows : [];
      const nextTotalPages = Math.max(1, parseInt(payload?.total_pages, 10) || 1);
      const nextTotalRows = Math.max(0, parseInt(payload?.total, 10) || 0);
      setTotalPages(nextTotalPages);
      setTotalRows(nextTotalRows);
      setPage(nextPage);
      if (append) {
        setRows((prev) => {
          const seen = new Set(prev.map((row) => `${parseInt(row?.global_rank, 10) || parseInt(row?.rank, 10) || 0}|${normalizeNameKey(row?.username)}`));
          const merged = [...prev];
          for (const row of incomingRows) {
            const key = `${parseInt(row?.global_rank, 10) || parseInt(row?.rank, 10) || 0}|${normalizeNameKey(row?.username)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(row);
          }
          return merged;
        });
      } else {
        setRows(incomingRows);
      }
    } catch (err) {
      if (!append) {
        setRows([]);
        setTotalPages(1);
        setTotalRows(0);
      }
      setError(err?.message || 'Failed to load leaderboard.');
    } finally {
      if (append) setLoadingMore(false);
      else setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadRows(1, { append: false });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJacketMap()
      .then((map) => {
        if (cancelled) return;
        setJacketLookup(map || {});
      })
      .catch(() => {
        if (cancelled) return;
        setJacketLookup({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadSnapshot = async () => {
      try {
        const payload = await getPiugamePumbility(user.id);
        if (cancelled) return;
        setMySnapshot({
          ranking: parseInt(payload?.ranking, 10) || 0,
          pumbility: parseInt(payload?.official_pumbility, 10) || parseInt(payload?.pumbility_value, 10) || 0,
        });
      } catch {
        if (cancelled) return;
        setMySnapshot(null);
      }
    };
    loadSnapshot();
    return () => { cancelled = true; };
  }, [user?.id]);

  const hasMore = page < totalPages;

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || initialLoading || loadingMore || jumpingToRank) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries?.[0]?.isIntersecting) return;
      loadRows(page + 1, { append: true });
    }, { rootMargin: '280px 0px' });

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [page, hasMore, initialLoading, loadingMore, jumpingToRank]);

  const refreshRows = () => {
    if (initialLoading || loadingMore || jumpingToRank) return;
    setRows([]);
    setPage(1);
    setTotalPages(1);
    setTotalRows(0);
    loadRows(1, { append: false });
  };

  const isCurrentUserRow = (row) => {
    if (!row) return false;
    const rowUserId = String(row?.user_id || '').trim();
    if (user?.id && rowUserId && rowUserId === user.id) return true;
    return normalizeNameKey(row?.username) === normalizeNameKey(user?.username);
  };

  const myRow = useMemo(() => rows.find((row) => isCurrentUserRow(row)) || null, [rows, user?.id, user?.username]);
  const myRank = parseInt(mySnapshot?.ranking, 10) || parseInt(myRow?.global_rank, 10) || parseInt(myRow?.rank, 10) || 0;
  const myPumbility = parseInt(mySnapshot?.pumbility, 10) || parseInt(myRow?.overall_pumbility, 10) || 0;
  const getBreakdownKey = (row) => `${String(row?.user_id || '').trim()}|${normalizeNameKey(row?.username)}`;

  const openPlayerPumbilityBreakdown = async (row) => {
    const targetName = String(row?.username || user?.username || '').replace(/\s+/g, ' ').trim();
    if (!targetName) return;
    const targetUserId = String(
      row?.user_id
        || (normalizeNameKey(targetName) === normalizeNameKey(user?.username) ? user?.id : '')
        || ''
    ).trim();
    const key = `${targetUserId}|${normalizeNameKey(targetName)}`;
    if (breakdownLoadingKey) return;

    setBreakdownLoadingKey(key);
    setBreakdownError('');
    try {
      const payload = await getGlobalPumbilityPlayerSheet({
        player_name: targetName,
        user_id: targetUserId,
      });
      const payloadRows = Array.isArray(payload?.rows) ? payload.rows : [];
      const resolvedName = String(payload?.player_name || targetName).replace(/\s+/g, ' ').trim() || targetName;
      setBreakdownTitle(`${resolvedName} • Pumbility Top Songs`);
      setBreakdownRows(payloadRows);
      setBreakdownSummary(payload?.summary || null);
      setBreakdownHeaderMeta({
        pumbility: parseInt(payload?.global_pumbility, 10) || 0,
        rank: parseInt(payload?.global_rank, 10) || 0,
      });
      setBreakdownIncomplete(!!payload?.incomplete);
      setShowPumbilityBreakdownModal(true);
    } catch (err) {
      setBreakdownError(err?.message || 'Failed to load pumbility score sheet.');
      setBreakdownSummary(null);
      setBreakdownHeaderMeta(null);
    } finally {
      setBreakdownLoadingKey('');
    }
  };

  const jumpToMyRank = async () => {
    if (!myRank || initialLoading || loadingMore || jumpingToRank) return;
    setJumpingToRank(true);
    try {
      const targetPage = Math.max(1, Math.ceil(myRank / pageSize));
      const safeTargetPage = Math.min(Math.max(totalPages, 1), targetPage);
      if (safeTargetPage > page) {
        for (let nextPage = page + 1; nextPage <= safeTargetPage; nextPage += 1) {
          // Load intermediate pages so infinite scroll data stays contiguous.
          // eslint-disable-next-line no-await-in-loop
          await loadRows(nextPage, { append: true });
        }
      }

      window.setTimeout(() => {
        const myRowNode = document.querySelector('[data-global-leaderboard-current="true"]');
        if (myRowNode) {
          myRowNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } finally {
      setJumpingToRank(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400 font-display font-bold">Global PIUGAME Pumbility Top 1000</p>
        <button
          type="button"
          onClick={refreshRows}
          disabled={initialLoading || loadingMore || jumpingToRank}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          {initialLoading || loadingMore ? 'Refreshing...' : jumpingToRank ? 'Jumping...' : 'Refresh'}
        </button>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-gray-500 font-display">Your Global Ranking</p>
          {myRank > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={jumpToMyRank}
                disabled={jumpingToRank || initialLoading || loadingMore}
                className="rounded-lg border border-piu-border/60 bg-piu-dark/40 px-2 py-1 text-left hover:border-piu-accent/50 hover:bg-piu-dark/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Jump to your leaderboard row"
              >
                <p className="text-[9px] text-gray-500 font-display uppercase tracking-wide leading-none">Global Rank</p>
                <p className="font-mono font-bold text-sm text-piu-accent leading-tight">#{myRank}</p>
              </button>
              <button
                type="button"
                onClick={() => openPlayerPumbilityBreakdown({
                  user_id: myRow?.user_id || user?.id || '',
                  username: myRow?.username || user?.username || '',
                })}
                disabled={!!breakdownLoadingKey}
                className="rounded-lg border border-piu-border/60 bg-piu-dark/40 px-2 py-1 text-left hover:border-piu-gold/50 hover:bg-piu-dark/70 transition-colors"
                title="Show your pumbility top songs"
              >
                <p className="text-[9px] text-gray-500 font-display uppercase tracking-wide leading-none">Pumbility</p>
                <p className="font-mono font-bold text-sm text-piu-gold leading-tight">{formatNumber(myPumbility)}</p>
              </button>
            </div>
          ) : null}
        </div>
        {myRank <= 0 ? (
          <p className="mt-1 text-sm text-gray-400">No Top 1000 rank found for your username yet.</p>
        ) : null}
      </div>
      {breakdownError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {breakdownError}
        </div>
      ) : null}

      {initialLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-piu-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-gray-500 py-8 font-display text-sm">No leaderboard data available yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
            <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-2 px-3 py-2 border-b border-piu-border/40 text-[11px] font-display font-bold uppercase tracking-wide text-gray-500">
              <span>#</span>
              <span>Player</span>
              <span>Pumbility</span>
            </div>
            {rows.map((row) => {
              const rowRank = parseInt(row?.global_rank, 10) || parseInt(row?.rank, 10) || 0;
              const pumbility = parseInt(row?.overall_pumbility, 10) || 0;
              const isCurrent = isCurrentUserRow(row);
              const avatar = String(row?.avatar || '').trim();
              const avatarSrc = avatar
                ? (avatar.startsWith('data:') || avatar.startsWith('http') ? avatar : getAvatarUrl(avatar))
                : '';
              const playerName = String(row?.username || '').trim() || 'Unknown';
              const isLocal = !!row?.is_local_user && !!row?.user_id;
              const rowBreakdownKey = getBreakdownKey(row);
              const rowBreakdownLoading = breakdownLoadingKey === rowBreakdownKey;

              return (
                <div
                  key={`${rowRank}-${playerName}`}
                  data-global-leaderboard-current={isCurrent ? 'true' : undefined}
                  className={`grid grid-cols-[56px_minmax(0,1fr)_auto] gap-2 px-3 py-2 border-b border-piu-border/25 last:border-b-0 items-center ${isCurrent ? 'bg-piu-accent/10' : 'hover:bg-piu-dark/25'} transition-colors`}
                >
                  <span className={`text-sm font-mono ${isCurrent ? 'text-piu-accent' : 'text-gray-500'}`}>#{rowRank}</span>
                  <div className="min-w-0 flex items-center gap-2">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover border border-piu-border/40 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs border border-piu-border/40 shrink-0">
                        {playerName?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex items-center gap-1.5">
                      {isLocal ? (
                        <Link
                          to={getProfilePath(row.user_id, playerName)}
                          className={`font-display font-bold text-[13px] truncate transition-colors ${isCurrent ? 'text-piu-accent' : 'text-gray-100 hover:text-piu-accent'}`}
                        >
                          {playerName}
                        </Link>
                      ) : (
                        <span className={`font-display font-bold text-[13px] truncate ${isCurrent ? 'text-piu-accent' : 'text-gray-100'}`}>{playerName}</span>
                      )}
                      {row?.nationality ? <span className="text-sm shrink-0">{getCountryFlag(row.nationality)}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPlayerPumbilityBreakdown(row)}
                    disabled={!!breakdownLoadingKey}
                    className={`font-mono font-bold whitespace-nowrap transition-colors ${
                      rowBreakdownLoading
                        ? 'text-yellow-200/80'
                        : 'text-piu-gold hover:text-yellow-200'
                    }`}
                    title="Show this player's pumbility top songs"
                  >
                    {pumbility > 0 ? formatNumber(pumbility) : '--'}
                  </button>
                </div>
              );
            })}

            <div className="px-3 py-2 text-center text-[11px] text-gray-500 border-t border-piu-border/30">
              Loaded {rows.length} / {Math.max(totalRows, rows.length)}
            </div>
          </div>

          <div ref={loadMoreRef} className="h-4" />
          {loadingMore ? (
            <div className="flex items-center justify-center py-2 text-xs text-gray-500">Loading more ranks...</div>
          ) : null}
          {!hasMore && rows.length > 0 ? (
            <div className="text-center text-xs text-gray-500 pb-1">Reached rank #1000.</div>
          ) : null}
        </>
      )}

      <PumbilityBreakdownModal
        open={showPumbilityBreakdownModal}
        title={breakdownTitle}
        rows={breakdownRows}
        summary={breakdownSummary}
        headerMeta={breakdownHeaderMeta}
        jacketLookup={jacketLookup}
        showIncompleteCta={breakdownIncomplete}
        ctaMessage="This pumbility sheet is partial from public OVER Lv.20 Top 100 data. Sign up and sync PIUGAME for complete Top 50 scores."
        onClose={() => {
          setShowPumbilityBreakdownModal(false);
          setBreakdownSummary(null);
          setBreakdownHeaderMeta(null);
        }}
      />

    </div>
  );
}

function Over20RankingsTab({ initialSelection = null }) {
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [charts, setCharts] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [activeChartKey, setActiveChartKey] = useState('');
  const [activeChart, setActiveChart] = useState(null);
  const [chartScores, setChartScores] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const initialSelectionAppliedRef = useRef(false);

  useEffect(() => {
    initialSelectionAppliedRef.current = false;
    setIsModalOpen(false);
  }, [initialSelection?.level, initialSelection?.chartKey, initialSelection?.song, initialSelection?.mode]);

  useEffect(() => {
    let cancelled = false;
    const loadLevels = async () => {
      try {
        const payload = await getOver20Levels();
        if (cancelled) return;
        const nextLevels = Array.isArray(payload?.levels) ? payload.levels : [];
        setLevels(nextLevels);
        if (nextLevels.length > 0) {
          const preferredLevel = parseInt(initialSelection?.level, 10) || 0;
          const hasPreferredLevel = preferredLevel > 0
            && nextLevels.some((row) => (parseInt(row?.level, 10) || 0) === preferredLevel);
          setSelectedLevel(hasPreferredLevel ? String(preferredLevel) : String(nextLevels[0].level));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load OVER levels.');
      }
    };
    loadLevels();
    return () => { cancelled = true; };
  }, [initialSelection?.level]);

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
        if (!nextCharts.length) {
          setActiveChartKey('');
          setActiveChart(null);
          setChartScores([]);
          setIsModalOpen(false);
          return;
        }

        if (!initialSelectionAppliedRef.current) {
          const preferredChartKey = String(initialSelection?.chartKey || '').trim();
          const preferredSong = String(initialSelection?.song || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const preferredMode = String(initialSelection?.mode || '').trim().toLowerCase();
          let matchedChart = null;

          if (preferredChartKey) {
            matchedChart = nextCharts.find((chart) => chart?.chart_key === preferredChartKey) || null;
          }
          if (!matchedChart && preferredSong) {
            matchedChart = nextCharts.find((chart) => {
              const song = String(chart?.song_title || '').replace(/\s+/g, ' ').trim().toLowerCase();
              const mode = String(chart?.mode || '').trim().toLowerCase();
              if (song !== preferredSong) return false;
              if (preferredMode && mode !== preferredMode) return false;
              return true;
            }) || null;
          }

          if (matchedChart?.chart_key) {
            setActiveChartKey(String(matchedChart.chart_key));
            setActiveChart(matchedChart);
            setIsModalOpen(true);
          }
          initialSelectionAppliedRef.current = true;
        }
      } catch (err) {
        if (cancelled) return;
        setCharts([]);
        setActiveChartKey('');
        setActiveChart(null);
        setChartScores([]);
        setIsModalOpen(false);
        setError(err?.message || 'Failed to load chart list.');
      } finally {
        if (!cancelled) setChartsLoading(false);
      }
    };
    loadCharts();
    return () => { cancelled = true; };
  }, [selectedLevel, initialSelection?.chartKey, initialSelection?.song, initialSelection?.mode]);

  useEffect(() => {
    if (!isModalOpen || !activeChartKey) return;
    let cancelled = false;
    const loadChart = async () => {
      setChartLoading(true);
      setChartError('');
      try {
        const payload = await getOver20ChartTop100(activeChartKey);
        if (cancelled) return;
        setActiveChart(payload?.chart || null);
        setChartScores(Array.isArray(payload?.scores) ? payload.scores : []);
      } catch (err) {
        if (cancelled) return;
        setActiveChart(null);
        setChartScores([]);
        setChartError(err?.message || 'Failed to load top 100 scores.');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };
    loadChart();
    return () => { cancelled = true; };
  }, [isModalOpen, activeChartKey]);

  const filteredCharts = useMemo(() => {
    const normalizedMode = modeFilter === 'single' ? 'Single' : modeFilter === 'double' ? 'Double' : '';
    const q = String(search || '').trim().toLowerCase();
    return charts.filter((chart) => {
      if (normalizedMode && String(chart?.mode || '').trim() !== normalizedMode) return false;
      if (!q) return true;
      return String(chart?.song_title || '').toLowerCase().includes(q);
    });
  }, [charts, search, modeFilter]);

  const modalPermalink = useMemo(() => {
    if (!activeChartKey) return '';
    const params = new URLSearchParams();
    params.set('tab', 'over20');
    if (selectedLevel) params.set('level', String(selectedLevel));
    params.set('chart_key', String(activeChartKey));
    if (activeChart?.song_title) params.set('song', String(activeChart.song_title));
    if (activeChart?.mode) params.set('mode', String(activeChart.mode));
    return `/leaderboards?${params.toString()}`;
  }, [selectedLevel, activeChartKey, activeChart?.song_title, activeChart?.mode]);

  const openChartModal = (chart) => {
    if (!chart?.chart_key) return;
    setActiveChartKey(String(chart.chart_key));
    setActiveChart(chart);
    setChartScores([]);
    setChartError('');
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500 font-display">Level</label>
        <select
          value={selectedLevel}
          onChange={(event) => {
            setSelectedLevel(event.target.value);
            setIsModalOpen(false);
            setActiveChartKey('');
            setActiveChart(null);
            setChartScores([]);
            setChartError('');
          }}
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
        <div className="inline-flex items-center rounded-lg border border-piu-border/60 bg-piu-dark p-0.5">
          <button
            type="button"
            onClick={() => setModeFilter('all')}
            className={`px-2.5 py-1 rounded text-[11px] font-display font-bold transition-colors ${
              modeFilter === 'all' ? 'bg-piu-accent text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setModeFilter('single')}
            className={`px-2.5 py-1 rounded text-[11px] font-display font-bold transition-colors ${
              modeFilter === 'single' ? 'bg-red-500/85 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Singles
          </button>
          <button
            type="button"
            onClick={() => setModeFilter('double')}
            className={`px-2.5 py-1 rounded text-[11px] font-display font-bold transition-colors ${
              modeFilter === 'double' ? 'bg-green-500/85 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Doubles
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
        <div className="px-3 py-2 border-b border-piu-border/40 text-xs font-display font-bold text-gray-400">
          Songs ({filteredCharts.length}) • Tap a jacket to view Top 100
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          {chartsLoading ? (
            <p className="px-1 py-4 text-xs text-gray-500">Loading songs...</p>
          ) : filteredCharts.length === 0 ? (
            <p className="px-1 py-4 text-xs text-gray-500">No songs found for this level.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {filteredCharts.map((chart) => {
                const isActive = isModalOpen && activeChartKey === chart.chart_key;
                return (
                  <button
                    key={chart.chart_key}
                    type="button"
                    onClick={() => openChartModal(chart)}
                    className={`rounded-lg border p-1.5 text-left transition-colors ${
                      isActive
                        ? 'border-piu-accent/70 bg-piu-accent/10'
                        : 'border-piu-border/40 bg-piu-dark/35 hover:border-piu-accent/45 hover:bg-piu-dark/55'
                    }`}
                  >
                    <div className="flex justify-center">
                      <OverChartJacket chart={chart} size="md" />
                    </div>
                    <p className="mt-1 text-[10px] font-display font-bold text-gray-200 leading-tight max-h-8 overflow-hidden">
                      {chart.song_title}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Over20Top100Modal
        open={isModalOpen}
        chart={activeChart}
        scores={chartScores}
        loading={chartLoading}
        error={chartError}
        permalink={modalPermalink}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}

function MyTop100Tab() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [activeChart, setActiveChart] = useState(null);
  const [chartScores, setChartScores] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [highlightRank, setHighlightRank] = useState(0);
  const [highlightName, setHighlightName] = useState('');
  const [highlightScore, setHighlightScore] = useState(0);

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

  useEffect(() => {
    if (!chartModalOpen || !activeChart?.chart_key) return;
    let cancelled = false;
    const loadChart = async () => {
      setChartLoading(true);
      setChartError('');
      try {
        const payload = await getOver20ChartTop100(activeChart.chart_key);
        if (cancelled) return;
        setActiveChart((prev) => ({ ...(prev || {}), ...(payload?.chart || {}) }));
        setChartScores(Array.isArray(payload?.scores) ? payload.scores : []);
      } catch (err) {
        if (cancelled) return;
        setChartScores([]);
        setChartError(err?.message || 'Failed to load top 100 scores.');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };
    loadChart();
    return () => { cancelled = true; };
  }, [chartModalOpen, activeChart?.chart_key]);

  const openTop100Modal = (row) => {
    const chartKey = String(row?.chart_key || '').trim();
    if (!chartKey) return;
    setActiveChart({
      chart_key: chartKey,
      song_title: String(row?.song_title || ''),
      mode: String(row?.mode || ''),
      level: parseInt(row?.level, 10) || 0,
      jacket_url: String(row?.jacket_url || ''),
    });
    setHighlightRank(parseInt(row?.over_top100_rank, 10) || 0);
    setHighlightName(String(user?.username || row?.player_name || '').trim());
    setHighlightScore(parseInt(row?.score, 10) || 0);
    setChartScores([]);
    setChartError('');
    setChartModalOpen(true);
  };

  const modalPermalink = useMemo(() => {
    if (!activeChart?.chart_key) return '';
    const params = new URLSearchParams();
    params.set('tab', 'over20');
    if (activeChart?.level) params.set('level', String(activeChart.level));
    if (activeChart?.song_title) params.set('song', String(activeChart.song_title));
    if (activeChart?.mode) params.set('mode', String(activeChart.mode));
    params.set('chart_key', String(activeChart.chart_key));
    return `/leaderboards?${params.toString()}`;
  }, [activeChart?.chart_key, activeChart?.song_title, activeChart?.mode, activeChart?.level]);

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
        <>
          <div className="md:hidden space-y-2">
            {rows.map((row) => (
              <div key={`${row.id}-${row.song_title}-${row.mode}-${row.level}`} className="rounded-lg border border-piu-border/45 bg-piu-card/35 px-2.5 py-2.5">
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => openTop100Modal(row)}
                    className="shrink-0 hover:opacity-90 transition-opacity"
                    title="View Top 100 for this chart"
                  >
                    <OverChartJacket chart={row} size="sm" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-bold text-gray-100 leading-tight break-words">{row.song_title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{row.mode}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded border border-piu-border/35 bg-piu-dark/45 px-2 py-1.5">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Score</p>
                    <p className="font-mono text-[13px] text-gray-100 whitespace-nowrap">{formatNumber(row.score)}</p>
                  </div>
                  <div className="rounded border border-piu-border/35 bg-piu-dark/45 px-2 py-1.5">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Grade</p>
                    <p className={`font-display font-bold text-[13px] whitespace-nowrap ${getGradeColorClass(row.grade)}`}>{row.grade || '-'}</p>
                  </div>
                  <div className="rounded border border-piu-border/35 bg-piu-dark/45 px-2 py-1.5">
                    <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Rank</p>
                    <p className="font-mono text-[13px] text-piu-gold whitespace-nowrap">#{row.over_top100_rank}/{row.top100_count || 100}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
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
                        <button
                          type="button"
                          onClick={() => openTop100Modal(row)}
                          className="shrink-0 hover:opacity-90 transition-opacity"
                          title="View Top 100 for this chart"
                        >
                          <OverChartJacket chart={row} size="sm" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-display font-bold text-gray-100 truncate">{row.song_title}</p>
                          <p className="text-[11px] text-gray-500">{row.mode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-200 whitespace-nowrap">{formatNumber(row.score)}</td>
                    <td className={`px-2 py-1.5 text-right font-display font-bold whitespace-nowrap ${getGradeColorClass(row.grade)}`}>{row.grade || '-'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-piu-gold whitespace-nowrap">
                      #{row.over_top100_rank}/{row.top100_count || 100}
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

      <Over20Top100Modal
        open={chartModalOpen}
        chart={activeChart}
        scores={chartScores}
        loading={chartLoading}
        error={chartError}
        permalink={modalPermalink}
        highlightRank={highlightRank}
        highlightName={highlightName}
        highlightScore={highlightScore}
        onClose={() => setChartModalOpen(false)}
      />
    </div>
  );
}

export default function LeaderboardsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('pumbility');
  const queryTab = String(searchParams.get('tab') || '').trim().toLowerCase();
  const over20InitialSelection = useMemo(() => ({
    level: String(searchParams.get('level') || '').trim(),
    chartKey: String(searchParams.get('chart_key') || '').trim(),
    song: String(searchParams.get('song') || '').trim(),
    mode: String(searchParams.get('mode') || '').trim(),
  }), [searchParams]);

  useEffect(() => {
    if (queryTab === 'pumbility' || queryTab === 'over20' || queryTab === 'my-top100') {
      setTab(queryTab);
    }
  }, [queryTab]);

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
      {tab === 'over20' && (
        <Over20RankingsTab
          key={`${over20InitialSelection.level}|${over20InitialSelection.chartKey}|${over20InitialSelection.song}|${over20InitialSelection.mode}`}
          initialSelection={over20InitialSelection}
        />
      )}
      {tab === 'my-top100' && <MyTop100Tab />}
    </div>
  );
}
