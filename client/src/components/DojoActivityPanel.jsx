import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvatarUrl } from './AvatarPicker';
import { getProfilePath } from '../utils/profile';

function parseUtc(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withZone = raw.endsWith('Z') ? raw : `${raw}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortTime(value) {
  const d = parseUtc(value);
  if (!d) return '--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  const d = parseUtc(value);
  if (!d) return '--';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-piu-dark/45 border border-piu-border/40 rounded-lg p-3 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-display font-bold text-white mt-0.5">{value}</p>
      {sub ? <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function DayBusyBadge({ visitors, maxVisitors }) {
  const ratio = maxVisitors > 0 ? visitors / maxVisitors : 0;
  const className = ratio >= 0.75
    ? 'bg-red-500'
    : ratio >= 0.45
      ? 'bg-amber-400'
      : ratio > 0
        ? 'bg-emerald-400'
        : 'bg-gray-600';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${className}`} />;
}

function ActivityLogSection({ activityLog }) {
  return (
    <div className="bg-piu-dark/35 border border-piu-border/35 rounded-xl p-3">
      <h5 className="text-xs font-display font-bold text-gray-300 uppercase tracking-wide">Check-in / Check-out Log</h5>
      <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {activityLog.length === 0 ? (
          <p className="text-xs text-gray-500">No activity logged yet.</p>
        ) : (
          activityLog.map((event, idx) => (
            <div key={`${event.event_type}-${event.user_id}-${event.occurred_at}-${idx}`} className="flex items-center gap-2 rounded-lg border border-piu-border/25 bg-piu-dark/25 px-2 py-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-display font-bold shrink-0 ${event.event_type === 'checkout' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                {event.event_type === 'checkout' ? 'OUT' : 'IN'}
              </span>
              <Link to={getProfilePath(event.user_id, event.username)} className="text-xs font-display font-bold hover:text-piu-accent shrink-0">
                {event.username}
              </Link>
              <p className="text-[10px] text-gray-400 truncate flex-1 min-w-0">{event.machine_name}</p>
              {event.event_type === 'checkout' ? (
                <span className="text-[10px] text-gray-300 shrink-0">{formatDuration(event.session_minutes)}</span>
              ) : null}
              <span className="text-[10px] text-gray-500 shrink-0">{formatDateTime(event.occurred_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function DojoActivityPanel({ overview, loading, error, onRefresh, logOnly = false }) {
  const week = overview?.week || null;
  const days = Array.isArray(week?.days) ? week.days : [];
  const users = Array.isArray(week?.users) ? week.users : [];
  const activityLog = Array.isArray(overview?.activity_log) ? overview.activity_log : [];

  const maxVisitors = useMemo(
    () => Math.max(0, ...days.map((day) => Number(day.visitors) || 0)),
    [days]
  );

  const [selectedDayKey, setSelectedDayKey] = useState('');

  useEffect(() => {
    if (days.length === 0) {
      setSelectedDayKey('');
      return;
    }
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const existing = days.find((d) => d.day_key === selectedDayKey);
    if (existing) return;

    const todayBucket = days.find((d) => d.day_key === todayKey);
    const firstBusy = days.find((d) => (Number(d.sessions) || 0) > 0);
    setSelectedDayKey((todayBucket || firstBusy || days[0]).day_key);
  }, [days, selectedDayKey]);

  const selectedDay = days.find((d) => d.day_key === selectedDayKey) || null;

  return (
    <div className="bg-piu-card border border-piu-border rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-white text-sm sm:text-base">Dojo Activity</h3>
          {overview?.venue?.name ? (
            <p className="text-[11px] text-gray-500 mt-0.5">{overview.venue.name}</p>
          ) : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg border border-piu-border text-xs font-display font-bold text-gray-300 hover:text-white hover:border-piu-accent/60 transition-colors"
          >
            Refresh
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Loading dojo activity...</p>
      ) : null}

      {!loading && error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && !error && week ? (
        <>
          {!logOnly ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label="Visitors" value={week.total_visitors || 0} />
                <StatCard label="Sessions" value={week.total_sessions || 0} />
                <StatCard label="Time This Week" value={formatDuration(week.total_minutes)} />
                <StatCard label="Avg Session" value={week.total_sessions > 0 ? formatDuration((week.total_minutes || 0) / week.total_sessions) : '--'} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-display font-bold text-gray-300 uppercase tracking-wide">Week Grid (Mon-Sun)</h4>
                  <p className="text-[10px] text-gray-500">Tap a day for visitors + session times</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {days.map((day) => {
                    const active = day.day_key === selectedDayKey;
                    return (
                      <button
                        key={day.day_key}
                        type="button"
                        onClick={() => setSelectedDayKey(day.day_key)}
                        className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
                          active
                            ? 'border-piu-accent bg-piu-accent/10'
                            : 'border-piu-border/45 bg-piu-dark/40 hover:border-piu-accent/45'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-display font-bold text-white">{day.day_label}</span>
                          <DayBusyBadge visitors={day.visitors} maxVisitors={maxVisitors} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{day.visitors || 0} visitors</p>
                        <p className="text-[10px] text-gray-500">{day.sessions || 0} sessions</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDay ? (
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="bg-piu-dark/35 border border-piu-border/35 rounded-xl p-3">
                    <h5 className="text-xs font-display font-bold text-piu-accent uppercase tracking-wide">
                      {selectedDay.day_label} Visitors
                    </h5>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {selectedDay.visitors || 0} visitors, {selectedDay.sessions || 0} sessions, {formatDuration(selectedDay.total_minutes)} total
                    </p>
                    <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                      {(selectedDay.entries || []).length === 0 ? (
                        <p className="text-xs text-gray-500">No sessions logged for this day.</p>
                      ) : (
                        selectedDay.entries.map((entry) => (
                          <div key={`${entry.checkin_id}-${entry.user_id}`} className="flex items-center gap-2 border-b border-piu-border/25 pb-1.5 last:border-0 last:pb-0">
                            <Link to={getProfilePath(entry.user_id, entry.username)} className="shrink-0">
                              {entry.avatar ? (
                                <img src={getAvatarUrl(entry.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border/60" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                                  {(entry.username || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <Link to={getProfilePath(entry.user_id, entry.username)} className="text-xs font-display font-bold hover:text-piu-accent truncate block">
                                {entry.username}
                              </Link>
                              <p className="text-[10px] text-gray-500 truncate">{entry.machine_name}</p>
                              <p className="text-[10px] text-gray-500">
                                {formatShortTime(entry.checked_in_at)} - {entry.active ? 'Now' : formatShortTime(entry.checked_out_at)}
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-gray-300 shrink-0">{formatDuration(entry.session_minutes)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-piu-dark/35 border border-piu-border/35 rounded-xl p-3">
                    <h5 className="text-xs font-display font-bold text-gray-300 uppercase tracking-wide">Weekly User Summary</h5>
                    <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {users.length === 0 ? (
                        <p className="text-xs text-gray-500">No user activity this week yet.</p>
                      ) : (
                        users.map((u) => (
                          <div key={u.user_id} className="flex items-center gap-2 rounded-lg border border-piu-border/25 bg-piu-dark/25 px-2 py-1.5">
                            <Link to={getProfilePath(u.user_id, u.username)} className="shrink-0">
                              {u.avatar ? (
                                <img src={getAvatarUrl(u.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border/60" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                                  {(u.username || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <Link to={getProfilePath(u.user_id, u.username)} className="text-xs font-display font-bold hover:text-piu-accent truncate block">
                                {u.username}
                              </Link>
                              <p className="text-[10px] text-gray-500">{u.week_sessions} session{u.week_sessions === 1 ? '' : 's'} this week</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] font-mono text-gray-200">{formatDuration(u.week_minutes)}</p>
                              {u.active ? <p className="text-[10px] text-emerald-400">Active now</p> : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <ActivityLogSection activityLog={activityLog} />
        </>
      ) : null}

      {!loading && !error && !week ? (
        <ActivityLogSection activityLog={activityLog} />
      ) : null}
    </div>
  );
}
