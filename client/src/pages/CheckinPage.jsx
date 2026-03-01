import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getVenues, getActiveCheckins, checkin, checkout, getMyCheckinStatus,
  getCheckinHistory, getUserCheckinHistory, getDojoOverview,
} from '../utils/api';
import { getAvatarUrl } from '../components/AvatarPicker';
import { getProfilePath } from '../utils/profile';
import DojoActivityPanel from '../components/DojoActivityPanel';

function formatDuration(minutes) {
  if (!minutes || minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatCheckinTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sessionDuration(checkinAt, checkoutAt) {
  if (!checkinAt || !checkoutAt) return null;
  const start = new Date(checkinAt + 'Z');
  const end = new Date(checkoutAt + 'Z');
  return Math.max(0, (end - start) / 60000);
}

// ─── Machine Visual ───────────────────────────────────────────────────
function MachineUnit({ machine, players, isMyMachine, onSelect }) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      {/* Players on this machine */}
      <div className="flex flex-wrap justify-center gap-1.5 min-h-[44px] items-end">
        {players.map((p, i) => (
          <Link
            key={p.user_id}
            to={getProfilePath(p.user_id, p.username)}
            className="flex flex-col items-center group"
            style={{ zIndex: players.length - i }}
          >
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 ${isMyMachine && p.user_id === isMyMachine ? 'border-piu-accent ring-2 ring-piu-accent/40' : 'border-white/80'} bg-gradient-to-br from-slate-200 to-slate-500 shadow-md`}>
              {p.avatar ? (
                <img src={getAvatarUrl(p.avatar)} alt={p.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-display font-bold text-xs text-white bg-gradient-to-br from-piu-accent to-purple-700">
                  {(p.username || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[9px] sm:text-[10px] font-display text-gray-300 truncate max-w-[60px] text-center mt-0.5 group-hover:text-piu-accent transition-colors">
              {p.username}
            </span>
          </Link>
        ))}
        {players.length === 0 && (
          <div className="text-[10px] text-gray-600 italic">No one playing</div>
        )}
      </div>

      {/* Machine cabinet */}
      <button
        onClick={() => onSelect && onSelect(machine)}
        className={`relative w-full max-w-[140px] sm:max-w-[160px] aspect-[3/4] rounded-xl border-2 transition-all ${
          onSelect
            ? 'border-piu-border hover:border-piu-accent/60 hover:shadow-lg hover:shadow-piu-accent/10 cursor-pointer'
            : 'border-piu-border cursor-default'
        } bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden`}
      >
        {/* Screen area */}
        <div className="absolute inset-x-2 top-2 bottom-[40%] rounded-lg bg-gradient-to-b from-blue-900/80 to-indigo-950/80 border border-blue-700/30 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.15),transparent_70%)]" />
          <div className="text-center px-1 relative z-10">
            <div className="text-[9px] sm:text-[10px] font-display font-bold text-blue-300/90 tracking-wide uppercase">
              Pump It Up
            </div>
            <div className="text-[8px] text-blue-400/60 mt-0.5">Phoenix</div>
          </div>
        </div>

        {/* Pad area – PIU 5-panel diamond */}
        <div className="absolute inset-x-3 bottom-2 top-[65%] rounded-md bg-slate-700/50 border border-slate-600/30 flex items-center justify-center">
          <div className="grid grid-cols-3 gap-[2px]">
            {/* Row 1: ↖ · ↗ */}
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-blue-500/40 border border-blue-400/30" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-red-500/40 border border-red-400/30" />
            {/* Row 2: · ● · */}
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-yellow-500/40 border border-yellow-400/30" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {/* Row 3: ↙ · ↘ */}
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-red-500/40 border border-red-400/30" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-blue-500/40 border border-blue-400/30" />
          </div>
        </div>

        {/* Status indicator */}
        <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${players.length > 0 ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-gray-600'}`} />
      </button>

      {/* Machine label */}
      <div className="text-[10px] sm:text-xs font-display font-bold text-gray-400 text-center truncate max-w-full px-1">
        {machine.name}
      </div>
    </div>
  );
}

// ─── Room Layout ──────────────────────────────────────────────────────
function RoomLayout({ venue, machines, activeCheckins, myUserId, onSelectMachine }) {
  const checkinsByMachine = {};
  for (const c of activeCheckins) {
    if (!checkinsByMachine[c.machine_id]) checkinsByMachine[c.machine_id] = [];
    checkinsByMachine[c.machine_id].push(c);
  }

  const myCheckin = activeCheckins.find(c => c.user_id === myUserId);

  return (
    <div className="bg-piu-card border border-piu-border rounded-2xl p-4 sm:p-6">
      {/* Venue header */}
      <div className="text-center mb-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white">{venue.name}</h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className={`inline-block w-2 h-2 rounded-full ${activeCheckins.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          <span className="text-[11px] sm:text-xs text-gray-400">
            {activeCheckins.length} player{activeCheckins.length !== 1 ? 's' : ''} here
          </span>
        </div>
      </div>

      {/* Room floor */}
      <div className="relative bg-gradient-to-b from-slate-900/50 to-slate-950/50 border border-piu-border/50 rounded-xl p-4 sm:p-6">
        {/* Floor pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 21px)',
        }} />

        {/* Machines row */}
        <div className="relative flex items-start justify-center gap-6 sm:gap-10">
          {machines.map(m => (
            <MachineUnit
              key={m.id}
              machine={m}
              players={checkinsByMachine[m.id] || []}
              isMyMachine={myCheckin?.user_id}
              onSelect={onSelectMachine}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Check-In Confirm Modal ──────────────────────────────────────────
function CheckinModal({ machine, venue, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-piu-card border border-piu-border rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-bold text-lg text-white mb-1">Check In</h3>
        <p className="text-sm text-gray-400 mb-4">
          You'll be checked in at <span className="text-white font-bold">{machine.name}</span>
        </p>

        <div className="bg-piu-dark/60 border border-piu-border/50 rounded-xl p-3 mb-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Your status will be set to</div>
          <div className="text-sm font-display font-bold text-piu-accent">
            Playing at {machine.name}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-display font-bold text-gray-400 bg-piu-dark border border-piu-border rounded-xl hover:bg-piu-dark/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-display font-bold text-white bg-gradient-to-r from-piu-accent to-pink-600 rounded-xl hover:from-pink-600 hover:to-piu-accent transition-all disabled:opacity-50"
          >
            {loading ? 'Checking in...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────
function HistoryTab({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const result = userId && userId !== user?.id
          ? await getUserCheckinHistory(userId)
          : await getCheckinHistory();
        setData(result);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchHistory();
  }, [userId, user?.id]);

  if (loading) return <div className="text-center py-8 text-gray-500 text-sm">Loading history...</div>;
  if (!data) return <div className="text-center py-8 text-gray-500 text-sm">No history available</div>;

  const { checkins, stats } = data;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Sessions" value={stats.total_sessions} />
        <StatCard label="Total Hours" value={stats.total_hours} suffix="h" />
        <StatCard label="Avg Session" value={formatDuration(stats.avg_session_minutes)} raw />
        <StatCard label="This Week" value={stats.week_hours} suffix="h" sub={`${stats.week_sessions} session${stats.week_sessions !== 1 ? 's' : ''}`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="This Month" value={stats.month_hours} suffix="h" sub={`${stats.month_sessions} session${stats.month_sessions !== 1 ? 's' : ''}`} />
        <StatCard
          label="Weekly Avg"
          value={stats.total_sessions > 0 ? Math.round(stats.total_hours / Math.max(1, Math.ceil(stats.total_sessions / 4)) * 10) / 10 : 0}
          suffix="h"
        />
      </div>

      {/* Recent sessions */}
      <div>
        <h3 className="font-display font-bold text-sm text-gray-300 mb-2">Recent Sessions</h3>
        {checkins.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No sessions yet</p>
        ) : (
          <div className="space-y-1.5">
            {checkins.map(c => {
              const dur = sessionDuration(c.checked_in_at, c.checked_out_at);
              return (
                <div key={c.id} className="flex items-center justify-between bg-piu-dark/40 border border-piu-border/30 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-display font-bold text-gray-300 truncate">{c.machine_name}</div>
                    <div className="text-[10px] text-gray-500">{formatCheckinTime(c.checked_in_at)}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {c.checked_out_at ? (
                      <span className="text-[11px] font-mono text-gray-400">{formatDuration(dur)}</span>
                    ) : (
                      <span className="text-[10px] text-green-400 font-display font-bold">Active</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix, sub, raw }) {
  return (
    <div className="bg-piu-card border border-piu-border rounded-xl p-3 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg sm:text-xl font-display font-bold text-white">
        {raw ? value : <>{value}{suffix && <span className="text-sm text-gray-400 ml-0.5">{suffix}</span>}</>}
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── QR Check-In Handler ──────────────────────────────────────────────
function QRCheckinHandler({ venues, onCheckin }) {
  const [searchParams] = useSearchParams();
  const venueSlug = searchParams.get('venue');
  const machinePos = searchParams.get('machine');
  const [resolved, setResolved] = useState(null);

  useEffect(() => {
    if (!venueSlug || !venues.length) return;
    const venue = venues.find(v => v.slug === venueSlug);
    if (!venue) return;

    let machine = null;
    if (machinePos) {
      machine = venue.machines.find(m => m.position === machinePos || m.name.toLowerCase().includes(machinePos.toLowerCase()));
    }
    setResolved({ venue, machine });
  }, [venueSlug, machinePos, venues]);

  useEffect(() => {
    if (resolved?.venue && resolved?.machine) {
      onCheckin(resolved.venue, resolved.machine);
    }
  }, [resolved]);

  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function CheckinPage() {
  const { user } = useAuth();
  const hasCheckinAccess = !!(user?.is_admin || user?.feature_access?.checkin);
  const [venues, setVenues] = useState([]);
  const [activeCheckins, setActiveCheckins] = useState([]);
  const [myStatus, setMyStatus] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [tab, setTab] = useState('live');
  const [error, setError] = useState('');
  const [dojoOverview, setDojoOverview] = useState(null);
  const [dojoLoading, setDojoLoading] = useState(true);
  const [dojoError, setDojoError] = useState('');

  const loadData = useCallback(async () => {
    if (!user || !hasCheckinAccess) {
      setVenues([]);
      setActiveCheckins([]);
      setMyStatus(null);
      setDojoOverview(null);
      setDojoError('');
      setDojoLoading(false);
      setLoading(false);
      return;
    }
    setDojoLoading(true);
    setDojoError('');
    try {
      const venueData = await getVenues();
      setVenues(venueData);

      // Load active checkins for the first (default) venue
      if (venueData.length > 0) {
        const [active, overview] = await Promise.all([
          getActiveCheckins(venueData[0].slug),
          getDojoOverview(venueData[0].slug),
        ]);
        setActiveCheckins(active.activeCheckins || []);
        setDojoOverview(overview || null);
      } else {
        setDojoOverview(null);
      }

      const status = await getMyCheckinStatus();
      setMyStatus(status);
    } catch (e) {
      setError(e.message);
      setDojoError(e.message);
    } finally {
      setDojoLoading(false);
    }
    setLoading(false);
  }, [hasCheckinAccess, user]);

  useEffect(() => {
    if (!user || !hasCheckinAccess) {
      setLoading(false);
      return undefined;
    }
    loadData();
    // Poll for updates every 15 seconds
    const interval = setInterval(async () => {
      try {
        if (venues.length > 0) {
          const [active, overview] = await Promise.all([
            getActiveCheckins(venues[0].slug),
            getDojoOverview(venues[0].slug),
          ]);
          setActiveCheckins(active.activeCheckins || []);
          setDojoOverview(overview || null);
          setDojoError('');
        }
        const status = await getMyCheckinStatus();
        setMyStatus(status);
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [hasCheckinAccess, loadData, user, venues.length > 0 ? venues[0]?.slug : '']);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">Check In</h1>
          <p className="text-sm text-gray-400 mt-2">Login required.</p>
          <Link to="/login" className="inline-flex mt-4 btn-primary">Login</Link>
        </div>
      </div>
    );
  }

  if (!hasCheckinAccess) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="card text-center">
          <h1 className="text-xl font-display font-bold">Check In</h1>
          <p className="text-sm text-red-300 mt-2">Check In access has not been granted for your account.</p>
        </div>
      </div>
    );
  }

  const handleSelectMachine = (machine) => {
    if (!user) return;
    // If already checked in at this machine, don't show modal
    if (myStatus?.checked_in && myStatus?.checkin?.machine_id === machine.id) return;
    setSelectedMachine(machine);
    setSelectedVenue(venues[0]);
  };

  const handleConfirmCheckin = async () => {
    if (!selectedVenue || !selectedMachine) return;
    setCheckinLoading(true);
    setError('');
    try {
      await checkin(selectedVenue.id, selectedMachine.id);
      setSelectedMachine(null);
      setSelectedVenue(null);
      await loadData();
    } catch (e) {
      setError(e.message);
    }
    setCheckinLoading(false);
  };

  const handleCheckout = async () => {
    setError('');
    try {
      await checkout();
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleQRCheckin = (venue, machine) => {
    if (!user) return;
    setSelectedMachine(machine);
    setSelectedVenue(venue);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-8">
        <div className="text-center text-gray-500 py-12">Loading...</div>
      </div>
    );
  }

  const venue = venues[0];

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* QR handler */}
      <QRCheckinHandler venues={venues} onCheckin={handleQRCheckin} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold text-lg sm:text-xl text-white">Check In</h1>
        {myStatus?.checked_in && (
          <button
            onClick={handleCheckout}
            className="px-3 py-1.5 text-xs font-display font-bold text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            Check Out
          </button>
        )}
      </div>

      {/* Current status banner */}
      {myStatus?.checked_in && (
        <div className="bg-gradient-to-r from-piu-accent/10 to-pink-600/10 border border-piu-accent/30 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-piu-accent/70 uppercase tracking-wider font-display">Currently Playing</div>
            <div className="text-sm font-display font-bold text-white mt-0.5">
              {myStatus.checkin?.machine_name}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              Since {formatCheckinTime(myStatus.checkin?.checked_in_at)}
            </div>
          </div>
          <button
            onClick={handleCheckout}
            className="px-3 py-2 text-xs font-display font-bold text-white bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
          >
            Check Out
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4 text-xs text-red-400">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-piu-dark/50 p-1 rounded-xl mb-4">
        {['live', 'history'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 text-xs font-display font-bold rounded-lg transition-colors ${
              tab === t ? 'bg-piu-card text-white shadow' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'live' ? 'Live Status' : 'My History'}
          </button>
        ))}
      </div>

      {tab === 'live' && venue && (
        <>
          <RoomLayout
            venue={venue}
            machines={venue.machines}
            activeCheckins={activeCheckins}
            myUserId={user?.id}
            onSelectMachine={user ? handleSelectMachine : null}
          />

          {!user && (
            <div className="text-center mt-4">
              <Link to="/login" className="text-sm text-piu-accent hover:underline font-display">
                Log in to check in
              </Link>
            </div>
          )}

          {user && !myStatus?.checked_in && (
            <p className="text-center text-[11px] text-gray-500 mt-3">
              Tap a machine to check in
            </p>
          )}
        </>
      )}

      {tab === 'history' && user && (
        <HistoryTab userId={user.id} />
      )}

      {tab === 'history' && !user && (
        <div className="text-center py-8">
          <Link to="/login" className="text-sm text-piu-accent hover:underline font-display">
            Log in to view history
          </Link>
        </div>
      )}

      <div className="mt-4">
        <DojoActivityPanel
          overview={dojoOverview}
          loading={dojoLoading}
          error={dojoError}
          onRefresh={loadData}
        />
      </div>

      {/* Checkin confirmation modal */}
      {selectedMachine && (
        <CheckinModal
          machine={selectedMachine}
          venue={selectedVenue}
          onConfirm={handleConfirmCheckin}
          onClose={() => setSelectedMachine(null)}
          loading={checkinLoading}
        />
      )}
    </div>
  );
}
