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

function toDayKey(value) {
  const d = parseUtc(value);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDayLabel(dayKey) {
  if (!dayKey) return 'Unknown day';
  const d = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function sessionMinutes(startValue, endValue) {
  const start = parseUtc(startValue);
  if (!start) return 0;
  const end = parseUtc(endValue) || new Date();
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
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

function ActivityLogSection({ activityLog, groupByUserDay = false }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setExpandedGroups({});
  }, [groupByUserDay, activityLog]);

  const groupedRows = useMemo(() => {
    if (!groupByUserDay) return [];

    const groups = new Map();
    for (const event of activityLog) {
      const dayKey = toDayKey(event?.checked_in_at || event?.occurred_at);
      const userKey = String(event?.user_id || event?.username || 'unknown');
      const groupKey = `${dayKey || 'unknown'}:${userKey}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          day_key: dayKey,
          user_id: event?.user_id || '',
          username: event?.username || 'Unknown',
          avatar: event?.avatar || '',
          latest_at: event?.occurred_at || event?.checked_in_at || '',
          sessions: new Map(),
        });
      }

      const group = groups.get(groupKey);
      const occurredAt = String(event?.occurred_at || event?.checked_in_at || '');
      if (occurredAt > String(group.latest_at || '')) {
        group.latest_at = occurredAt;
      }

      const sessionKey = [
        String(event?.user_id || ''),
        String(event?.machine_id || ''),
        String(event?.checked_in_at || ''),
        String(event?.machine_name || ''),
      ].join(':');

      if (!group.sessions.has(sessionKey)) {
        group.sessions.set(sessionKey, {
          key: sessionKey,
          machine_name: event?.machine_name || 'Unknown machine',
          checked_in_at: event?.checked_in_at || event?.occurred_at || '',
          checked_out_at: event?.checked_out_at || null,
        });
      } else if (event?.checked_out_at) {
        const existing = group.sessions.get(sessionKey);
        existing.checked_out_at = event.checked_out_at;
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        const sessions = Array.from(group.sessions.values())
          .map((session) => ({
            ...session,
            active: !session.checked_out_at,
            session_minutes: sessionMinutes(session.checked_in_at, session.checked_out_at),
          }))
          .sort((a, b) => (b.checked_in_at > a.checked_in_at ? 1 : -1));
        const machineCount = new Set(sessions.map((session) => session.machine_name)).size;
        return {
          ...group,
          sessions,
          session_count: sessions.length,
          machine_count: machineCount,
          total_minutes: sessions.reduce((sum, session) => sum + session.session_minutes, 0),
          active: sessions.some((session) => session.active),
        };
      })
      .sort((a, b) => {
        if (a.day_key !== b.day_key) return String(b.day_key || '').localeCompare(String(a.day_key || ''));
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (b.total_minutes !== a.total_minutes) return b.total_minutes - a.total_minutes;
        return String(a.username || '').localeCompare(String(b.username || ''));
      });
  }, [activityLog, groupByUserDay]);

  if (groupByUserDay) {
    return (
      <div className="bg-piu-dark/35 border border-piu-border/35 rounded-xl p-3">
        <h5 className="text-xs font-display font-bold text-gray-300 uppercase tracking-wide">Check-in Activity (Grouped by Day)</h5>
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
          {groupedRows.length === 0 ? (
            <p className="text-xs text-gray-500">No activity logged yet.</p>
          ) : (
            groupedRows.map((entry) => {
              const expanded = !!expandedGroups[entry.key];
              return (
                <div key={entry.key} className="rounded-lg border border-piu-border/25 bg-piu-dark/25">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Link to={getProfilePath(entry.user_id, entry.username)} className="shrink-0" onClick={(event) => event.stopPropagation()}>
                      {entry.avatar ? (
                        <img src={getAvatarUrl(entry.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border/60" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                          {(entry.username || '?')[0]?.toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={getProfilePath(entry.user_id, entry.username)}
                        className="text-xs font-display font-bold hover:text-piu-accent truncate block"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {entry.username}
                      </Link>
                      <p className="text-[10px] text-gray-500">
                        {formatDayLabel(entry.day_key)} • {entry.session_count} session{entry.session_count === 1 ? '' : 's'} across {entry.machine_count} machine{entry.machine_count === 1 ? '' : 's'}
                        {entry.active ? ' • Active now' : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-gray-300 shrink-0">{formatDuration(entry.total_minutes)}</span>
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                      className="text-[10px] text-gray-500 hover:text-white shrink-0"
                    >
                      {expanded ? 'Hide' : 'View'}
                    </button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-piu-border/20 px-2 pb-2 pt-1.5 space-y-1.5">
                      {entry.sessions.map((session) => (
                        <div key={session.key} className="flex items-center gap-2 rounded border border-piu-border/20 bg-piu-dark/35 px-2 py-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-gray-300 truncate">{session.machine_name}</p>
                            <p className="text-[10px] text-gray-500">
                              {formatShortTime(session.checked_in_at)} - {session.active ? 'Now' : formatShortTime(session.checked_out_at)}
                            </p>
                          </div>
                          <span className="text-[10px] font-mono text-gray-300 shrink-0">{formatDuration(session.session_minutes)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

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
  const [expandedVisitors, setExpandedVisitors] = useState({});

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
  const groupedSelectedEntries = useMemo(() => {
    const rows = Array.isArray(selectedDay?.entries) ? selectedDay.entries : [];
    const groups = new Map();

    for (const entry of rows) {
      const userKey = String(entry?.user_id || `${entry?.username || 'unknown'}:${entry?.checkin_id || ''}`);
      if (!groups.has(userKey)) {
        groups.set(userKey, {
          key: userKey,
          user_id: entry?.user_id || '',
          username: entry?.username || 'Unknown',
          avatar: entry?.avatar || '',
          total_minutes: 0,
          active: false,
          sessions: [],
        });
      }
      const group = groups.get(userKey);
      group.total_minutes += Number(entry?.session_minutes) || 0;
      if (entry?.active) group.active = true;
      group.sessions.push(entry);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        session_count: group.sessions.length,
        sessions: group.sessions.sort((a, b) => (b.checked_in_at > a.checked_in_at ? 1 : -1)),
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (b.total_minutes !== a.total_minutes) return b.total_minutes - a.total_minutes;
        return String(a.username || '').localeCompare(String(b.username || ''));
      });
  }, [selectedDay]);

  useEffect(() => {
    setExpandedVisitors({});
  }, [selectedDayKey]);

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
                      {groupedSelectedEntries.length === 0 ? (
                        <p className="text-xs text-gray-500">No sessions logged for this day.</p>
                      ) : (
                        groupedSelectedEntries.map((entry) => {
                          const expanded = !!expandedVisitors[entry.key];
                          const profileLink = getProfilePath(entry.user_id, entry.username);
                          return (
                            <div key={entry.key} className="rounded-lg border border-piu-border/25 bg-piu-dark/25">
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <Link to={profileLink} className="shrink-0" onClick={(event) => event.stopPropagation()}>
                                  {entry.avatar ? (
                                    <img src={getAvatarUrl(entry.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-piu-border/60" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center text-[10px] font-display font-bold">
                                      {(entry.username || '?')[0]?.toUpperCase()}
                                    </div>
                                  )}
                                </Link>
                                <div className="min-w-0 flex-1">
                                  <Link
                                    to={profileLink}
                                    className="text-xs font-display font-bold hover:text-piu-accent truncate block"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {entry.username}
                                  </Link>
                                  <p className="text-[10px] text-gray-500">
                                    {entry.session_count} session{entry.session_count === 1 ? '' : 's'}
                                    {entry.active ? ' • Active now' : ''}
                                  </p>
                                </div>
                                <span className="text-[10px] font-mono text-gray-300 shrink-0">{formatDuration(entry.total_minutes)}</span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedVisitors((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))}
                                  className="text-[10px] text-gray-500 hover:text-white shrink-0"
                                >
                                  {expanded ? 'Hide' : 'View'}
                                </button>
                              </div>
                              {expanded && (
                                <div className="border-t border-piu-border/20 px-2 pb-2 pt-1.5 space-y-1.5">
                                  {entry.sessions.map((session) => (
                                    <div key={session.checkin_id} className="flex items-center gap-2 rounded border border-piu-border/20 bg-piu-dark/35 px-2 py-1">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] text-gray-300 truncate">{session.machine_name}</p>
                                        <p className="text-[10px] text-gray-500">
                                          {formatShortTime(session.checked_in_at)} - {session.active ? 'Now' : formatShortTime(session.checked_out_at)}
                                        </p>
                                      </div>
                                      <span className="text-[10px] font-mono text-gray-300 shrink-0">{formatDuration(session.session_minutes)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
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

          <ActivityLogSection activityLog={activityLog} groupByUserDay={logOnly} />
        </>
      ) : null}

      {!loading && !error && !week ? (
        <ActivityLogSection activityLog={activityLog} groupByUserDay={logOnly} />
      ) : null}
    </div>
  );
}
