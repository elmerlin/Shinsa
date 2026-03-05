import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminOverRankingRuns,
  getAdminOverRankingScheduler,
  getAdminPumbilityRankingScheduler,
} from '../utils/api';

function formatDateTime(value) {
  if (!value) return '--';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function formatDurationMs(value) {
  const ms = Math.max(0, parseInt(value, 10) || 0);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatSchedule(hour, minute) {
  const h = Number.isFinite(parseInt(hour, 10)) ? parseInt(hour, 10) : 3;
  const m = Number.isFinite(parseInt(minute, 10)) ? parseInt(minute, 10) : 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function AdminLeaderboardsTab() {
  const [runType, setRunType] = useState('sync');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRuns, setTotalRuns] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [overScheduler, setOverScheduler] = useState({
    enabled: true,
    hour: 3,
    minute: 0,
    next_run_at: null,
    running: false,
  });
  const [pumbilityScheduler, setPumbilityScheduler] = useState({
    enabled: true,
    hour: 3,
    minute: 0,
    next_run_at: null,
    running: false,
  });

  const loadScheduler = async () => {
    try {
      const [overPayload, pumbilityPayload] = await Promise.all([
        getAdminOverRankingScheduler(),
        getAdminPumbilityRankingScheduler(),
      ]);
      setOverScheduler({
        enabled: !!overPayload?.enabled,
        hour: parseInt(overPayload?.hour, 10) || 0,
        minute: parseInt(overPayload?.minute, 10) || 0,
        next_run_at: overPayload?.next_run_at || null,
        running: !!overPayload?.running,
      });
      setPumbilityScheduler({
        enabled: !!pumbilityPayload?.enabled,
        hour: parseInt(pumbilityPayload?.hour, 10) || 0,
        minute: parseInt(pumbilityPayload?.minute, 10) || 0,
        next_run_at: pumbilityPayload?.next_run_at || null,
        running: !!pumbilityPayload?.running,
      });
    } catch {
      // Keep defaults if scheduler endpoint fails.
    }
  };

  const loadRuns = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getAdminOverRankingRuns({ type: runType, page, limit: 20 });
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setTotalPages(Math.max(1, parseInt(payload?.total_pages, 10) || 1));
      setTotalRuns(Math.max(0, parseInt(payload?.total, 10) || 0));
    } catch (err) {
      setRows([]);
      setTotalPages(1);
      setTotalRuns(0);
      setError(err?.message || 'Failed to load over-ranking run history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScheduler();
  }, []);

  useEffect(() => {
    loadRuns();
  }, [runType, page]);

  const pageLabel = useMemo(() => `${page} / ${totalPages}`, [page, totalPages]);
  const runTypeLabel = runType === 'backfill'
    ? 'backfill'
    : runType === 'pumbility'
      ? 'global pumbility'
      : 'full sync';
  const isPumbilityRunType = runType === 'pumbility';
  const tableColumnCount = isPumbilityRunType ? 4 : 6;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <h3 className="font-display font-bold text-piu-accent">Leaderboard Nightly Jobs</h3>
        <p className="text-xs text-gray-400">
          Over Lv.20: <span className="font-mono text-gray-200">{formatSchedule(overScheduler.hour, overScheduler.minute)}</span>
          {' '}
          (server time)
          {' • '}
          {overScheduler.enabled ? (overScheduler.running ? 'running' : 'enabled') : 'disabled'}
          {' • '}
          Next run: {formatDateTime(overScheduler.next_run_at)}
        </p>
        <p className="text-xs text-gray-400">
          Global Pumbility: <span className="font-mono text-gray-200">{formatSchedule(pumbilityScheduler.hour, pumbilityScheduler.minute)}</span>
          {' '}
          (server time)
          {' • '}
          {pumbilityScheduler.enabled ? (pumbilityScheduler.running ? 'running' : 'enabled') : 'disabled'}
          {' • '}
          Next run: {formatDateTime(pumbilityScheduler.next_run_at)}
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setRunType('sync'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                runType === 'sync' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
              }`}
            >
              Full Sync
            </button>
            <button
              type="button"
              onClick={() => { setRunType('backfill'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                runType === 'backfill' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
              }`}
            >
              Backfill
            </button>
            <button
              type="button"
              onClick={() => { setRunType('pumbility'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-colors ${
                runType === 'pumbility' ? 'bg-piu-accent text-white' : 'bg-piu-dark text-gray-400 hover:text-white'
              }`}
            >
              Global Pumbility
            </button>
          </div>
          <button
            type="button"
            onClick={loadRuns}
            disabled={loading}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Total {runTypeLabel} runs: {totalRuns}
        </p>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-piu-border/50 bg-piu-card/35 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-piu-dark/70">
              <tr className="border-b border-piu-border/40">
                <th className="px-2 py-2 text-left font-display text-gray-400">Start</th>
                <th className="px-2 py-2 text-left font-display text-gray-400">Duration</th>
                <th className="px-2 py-2 text-left font-display text-gray-400">Status</th>
                <th className="px-2 py-2 text-left font-display text-gray-400">Entries</th>
                {!isPumbilityRunType ? (
                  <th className="px-2 py-2 text-left font-display text-gray-400">Charts</th>
                ) : null}
                {!isPumbilityRunType ? (
                  <th className="px-2 py-2 text-left font-display text-gray-400">Backfill Updated</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColumnCount} className="px-2 py-4 text-center text-gray-500">Loading run history...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColumnCount} className="px-2 py-4 text-center text-gray-500">No runs logged yet.</td>
                </tr>
              ) : rows.map((row) => (
                <tr key={`${row.id}-${row.run_type}`} className="border-b border-piu-border/20 last:border-b-0">
                  <td className="px-2 py-2 text-gray-300">{formatDateTime(row.started_at)}</td>
                  <td className="px-2 py-2 text-gray-300 font-mono">{formatDurationMs(row.duration_ms)}</td>
                  <td className="px-2 py-2">
                    <span className={`font-display font-bold ${row.status === 'failed' ? 'text-red-300' : 'text-emerald-300'}`}>
                      {row.status === 'failed' ? 'FAILED' : 'SUCCESS'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-gray-300 font-mono">{parseInt(row.entries, 10) || 0}</td>
                  {!isPumbilityRunType ? (
                    <td className="px-2 py-2 text-gray-300 font-mono">{parseInt(row.charts, 10) || 0}</td>
                  ) : null}
                  {!isPumbilityRunType ? (
                    <td className="px-2 py-2 text-gray-300 font-mono">{parseInt(row.backfill_total_updated, 10) || 0}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={loading || page <= 1}
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">{pageLabel}</span>
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
