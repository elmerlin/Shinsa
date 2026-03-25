import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPiugameTrainingLoad } from '../utils/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

const MODE_LABELS = { overall: 'Overall', single: 'Singles', double: 'Doubles' };
const MODE_KEYS = ['overall', 'single', 'double'];

const ZONE_CONFIG = {
  Overclocked: { gradient: ['#F97316', '#EF4444'], pulse: true, icon: '⚡', desc: 'Playing significantly above your baseline. Risk of burnout — consider scaling back.' },
  'In The Zone': { gradient: ['#22C55E', '#10B981'], pulse: false, icon: '🔥', desc: 'Sweet spot. Your training load is productive and building fitness.' },
  Cruising: { gradient: ['#3B82F6', '#6366F1'], pulse: false, icon: '🎯', desc: 'Maintaining your current skill level with consistent play.' },
  'Warming Up': { gradient: ['#EAB308', '#F59E0B'], pulse: false, icon: '📈', desc: 'Building back up. Your recent load is below your established baseline.' },
  'Cooling Down': { gradient: ['#94A3B8', '#64748B'], pulse: false, icon: '❄️', desc: 'Skills may be getting rusty. Time to hit the pads!' },
  Idle: { gradient: ['#6B7280', '#4B5563'], pulse: false, icon: '💤', desc: 'No recent activity detected. Sync your plays to get started.' },
  Calibrating: { gradient: ['#A855F7', '#7C3AED'], pulse: true, icon: '📡', desc: 'Gathering data. Play a few more sessions to calibrate your profile.' },
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const target = Number(value) || 0;
    const start = ref.current || 0;
    ref.current = target;
    if (start === target) { setDisplay(target); return; }
    const startTime = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration]);
  return <span>{display.toLocaleString()}</span>;
}

function PulsingDot({ color, active }) {
  if (!active) return null;
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function ZoneBadge({ status, color, ratio }) {
  const zone = ZONE_CONFIG[status] || ZONE_CONFIG.Idle;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-piu-border/60">
      {/* Animated background gradient */}
      <div
        className="absolute inset-0 opacity-15"
        style={{
          background: `linear-gradient(135deg, ${zone.gradient[0]}, ${zone.gradient[1]})`,
        }}
      />
      {zone.pulse && (
        <div
          className="absolute inset-0 animate-pulse-glow rounded-2xl"
          style={{
            boxShadow: `0 0 30px ${zone.gradient[0]}40`,
          }}
        />
      )}
      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{zone.icon}</span>
            <div>
              <h3
                className="font-display font-bold text-xl sm:text-2xl tracking-wide"
                style={{ color: zone.gradient[0] }}
              >
                {status}
              </h3>
              {ratio != null && (
                <p className="text-xs text-gray-400 font-display">
                  Training Ratio: <span className="text-gray-200 font-bold">{ratio}%</span>
                </p>
              )}
            </div>
          </div>
          <PulsingDot color={zone.gradient[0]} active={zone.pulse} />
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">{zone.desc}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color, delay = 0 }) {
  return (
    <div
      className="card py-3 px-4 text-center animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-display mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-display font-bold" style={{ color: color || '#e5e7eb' }}>
        <AnimatedNumber value={value} />
        {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function GradePill({ grade }) {
  const colorMap = {
    'SSS+': 'bg-sky-400/20 text-sky-300 border-sky-400/30',
    SSS: 'bg-sky-400/15 text-sky-400 border-sky-400/25',
    'SS+': 'bg-blue-400/15 text-blue-300 border-blue-400/25',
    SS: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    'S+': 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
    S: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    'AAA+': 'bg-green-400/15 text-green-300 border-green-400/25',
    AAA: 'bg-green-400/10 text-green-400 border-green-400/20',
    'AA+': 'bg-yellow-400/15 text-yellow-300 border-yellow-400/25',
    AA: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    'A+': 'bg-orange-400/15 text-orange-300 border-orange-400/25',
    A: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
    B: 'bg-red-400/10 text-red-400 border-red-400/20',
    C: 'bg-red-500/10 text-red-500 border-red-500/20',
    D: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    F: 'bg-gray-600/10 text-gray-600 border-gray-600/20',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-display font-bold ${colorMap[grade] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
      {grade}
    </span>
  );
}

function EWMAChart({ data, mode }) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    // Show last 28 days
    const recent = data.slice(-28);
    return recent.map((d) => ({
      date: formatDate(d.date),
      rawDate: d.date,
      baseSkill: d[mode]?.base_skill || 0,
      currentForm: d[mode]?.current_form || 0,
    }));
  }, [data, mode]);

  if (!chartData.length) return null;

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.baseSkill, d.currentForm)), 1);
  const trend = chartData.length > 1
    ? chartData[chartData.length - 1].currentForm - chartData[chartData.length - 2].currentForm
    : 0;
  const trendColor = trend >= 0 ? '#22C55E' : '#EF4444';

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm text-gray-200">Fitness Trend</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">28-day EWMA — Base Skill vs Current Form</p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-gray-500">Base Skill</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full bg-piu-accent inline-block" />
            <span className="text-gray-500">Current Form</span>
          </span>
        </div>
      </div>
      <div className="px-1 pb-3" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradForm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff3366" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ff3366" stopOpacity={0} />
              </linearGradient>
              {/* Animated pulse filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#2a2a4a' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(maxVal * 1.15)]}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: '#141428',
                border: '1px solid #2a2a4a',
                borderRadius: 12,
                fontSize: 12,
                fontFamily: 'Rajdhani',
              }}
              labelStyle={{ color: '#9CA3AF', fontWeight: 700 }}
              itemStyle={{ color: '#e5e7eb' }}
              formatter={(value) => [value.toLocaleString(), '']}
            />
            <Area
              type="monotone"
              dataKey="baseSkill"
              stroke="#22C55E"
              strokeWidth={2}
              fill="url(#gradBase)"
              name="Base Skill"
              dot={false}
              activeDot={{ r: 4, fill: '#22C55E', stroke: '#0a0a1a', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="currentForm"
              stroke="#ff3366"
              strokeWidth={2.5}
              fill="url(#gradForm)"
              name="Current Form"
              dot={false}
              activeDot={{ r: 4, fill: '#ff3366', stroke: '#0a0a1a', strokeWidth: 2 }}
              filter="url(#glow)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Trend indicator */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 transition-transform duration-500"
          style={{ color: trendColor, transform: trend >= 0 ? 'rotate(0)' : 'rotate(180deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        <span className="text-xs font-display" style={{ color: trendColor }}>
          {trend >= 0 ? 'Trending up' : 'Trending down'}
        </span>
        <span className="text-[10px] text-gray-600">
          ({trend >= 0 ? '+' : ''}{Math.round(trend)})
        </span>
      </div>
    </div>
  );
}

function DailyLoadChart({ data, mode }) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    const recent = data.slice(-28);
    return recent.map((d) => ({
      date: formatDate(d.date),
      load: d[mode] || d.overall || 0,
      playCount: d.play_count || 0,
    }));
  }, [data, mode]);

  if (!chartData.length) return null;

  const avgLoad = chartData.reduce((s, d) => s + d.load, 0) / chartData.length;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-display font-bold text-sm text-gray-200">Daily Load</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">Play load per day — higher bars mean harder sessions</p>
      </div>
      <div className="px-1 pb-3" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff3366" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#ff3366" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickLine={false}
              axisLine={{ stroke: '#2a2a4a' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: '#141428',
                border: '1px solid #2a2a4a',
                borderRadius: 12,
                fontSize: 12,
                fontFamily: 'Rajdhani',
              }}
              labelStyle={{ color: '#9CA3AF', fontWeight: 700 }}
              formatter={(value, name) => {
                if (name === 'load') return [value.toLocaleString(), 'Load'];
                return [value, name];
              }}
            />
            <ReferenceLine
              y={Math.round(avgLoad)}
              stroke="#4488ff"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: `avg ${Math.round(avgLoad).toLocaleString()}`,
                position: 'right',
                fill: '#4488ff',
                fontSize: 10,
                fontFamily: 'Rajdhani',
              }}
            />
            <Bar
              dataKey="load"
              fill="url(#barGrad)"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GradePredictionTable({ predictions, comfortableLevel }) {
  if (!predictions || Object.keys(predictions).length === 0) return null;

  const sorted = Object.entries(predictions)
    .map(([lvl, grade]) => ({ level: parseInt(lvl, 10), grade }))
    .sort((a, b) => a.level - b.level);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-display font-bold text-sm text-gray-200">Grade Predictions</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">Expected grade at each level based on recent performance</p>
      </div>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {sorted.map(({ level, grade }) => {
            const isComfortable = level === comfortableLevel;
            return (
              <div
                key={level}
                className={`relative rounded-xl py-2.5 px-2 text-center transition-all duration-300 ${
                  isComfortable
                    ? 'bg-piu-accent/15 border border-piu-accent/40 ring-1 ring-piu-accent/20'
                    : 'bg-piu-dark/60 border border-piu-border/30'
                }`}
              >
                {isComfortable && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-display font-bold text-piu-accent bg-piu-card px-1.5 rounded-full border border-piu-accent/30 whitespace-nowrap">
                    YOUR LEVEL
                  </span>
                )}
                <p className="text-[10px] text-gray-500 font-display font-bold mb-1">Lv.{level}</p>
                <GradePill grade={grade} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ComfortableLevelDisplay({ level, mode }) {
  if (level == null) return null;
  return (
    <div className="card overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-piu-accent/5 to-purple-600/5" />
      <div className="relative px-5 py-5 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-display mb-2">
          Comfortable {mode === 'single' ? 'Singles' : 'Doubles'} Level
        </p>
        <div className="inline-flex items-baseline gap-1">
          <span className="text-5xl sm:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-piu-accent to-purple-400">
            <AnimatedNumber value={level} duration={1200} />
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The level you can consistently clear with an AA grade or higher
        </p>
      </div>
    </div>
  );
}

function SyncWarning({ syncStale, lastSyncedAt }) {
  if (!syncStale) return null;
  const ago = lastSyncedAt
    ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 86400000)
    : null;
  return (
    <div className="card border-amber-500/30 bg-amber-500/5 flex items-center gap-3 px-4 py-3">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <p className="text-sm text-amber-200 font-display font-bold">Sync your plays</p>
        <p className="text-xs text-amber-200/60">
          {ago != null ? `Last synced ${ago} day${ago !== 1 ? 's' : ''} ago.` : 'No recent sync.'}{' '}
          Training data may not reflect your latest sessions.
        </p>
      </div>
    </div>
  );
}

function ModeTab({ active, label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-xs font-display font-bold tracking-wide transition-all duration-200 rounded-lg ${
        active
          ? 'text-white bg-piu-dark/80 border border-piu-border/60'
          : 'text-gray-500 hover:text-gray-300 border border-transparent'
      }`}
    >
      {label}
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
          style={{ backgroundColor: color || '#ff3366' }}
        />
      )}
    </button>
  );
}

export default function TrainingPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('overall');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    getPiugameTrainingLoad(user.id)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load training data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card text-center py-12">
          <p className="text-sm text-gray-300 mb-4">Log in to view your training data.</p>
          <Link to="/login" className="btn-primary inline-flex">Go to Login</Link>
        </div>
      </div>
    );
  }

  const profile = data?.[mode] || null;
  const modeColor = mode === 'single' ? '#22C55E' : mode === 'double' ? '#A855F7' : '#ff3366';
  const showPredictions = mode !== 'overall' && profile && !profile.calibrating;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wide">Training</h1>
          <p className="text-xs text-gray-500 mt-0.5">Tracked Training Load</p>
        </div>
        {data && (
          <div className="flex gap-1 bg-piu-card/50 rounded-xl p-1 border border-piu-border/30">
            {MODE_KEYS.map((key) => (
              <ModeTab
                key={key}
                active={mode === key}
                label={MODE_LABELS[key]}
                onClick={() => setMode(key)}
                color={modeColor}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-200 text-sm px-4 py-3">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-32 animate-pulse bg-piu-dark/50" />
          ))}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Sync Warning */}
          <SyncWarning syncStale={data.sync_stale} lastSyncedAt={data.last_synced_at} />

          {/* Zone Badge */}
          {profile && (
            <ZoneBadge
              status={profile.training_status}
              color={profile.training_color}
              ratio={profile.training_ratio}
            />
          )}

          {/* Key Stats */}
          {profile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Base Skill" value={Math.round(profile.base_skill)} color="#22C55E" delay={0} />
              <StatCard label="Current Form" value={Math.round(profile.current_form)} color="#ff3366" delay={50} />
              <StatCard label="Play Days" value={profile.play_days} color="#4488ff" delay={100} />
              {profile.avg_play_load != null && (
                <StatCard label="Avg Play Load" value={Math.round(profile.avg_play_load)} color="#A855F7" delay={150} />
              )}
              {profile.avg_play_load == null && (
                <StatCard label="Training Ratio" value={profile.training_ratio || 0} unit="%" color={profile.training_color} delay={150} />
              )}
            </div>
          )}

          {/* Comfortable Level */}
          {showPredictions && profile.comfortable_level != null && (
            <ComfortableLevelDisplay level={profile.comfortable_level} mode={mode} />
          )}

          {/* EWMA Chart */}
          {data.ewma_history?.length > 0 && (
            <EWMAChart data={data.ewma_history} mode={mode} />
          )}

          {/* Daily Load Chart */}
          {data.daily_load_history?.length > 0 && (
            <DailyLoadChart data={data.daily_load_history} mode={mode} />
          )}

          {/* Grade Predictions */}
          {showPredictions && (
            <GradePredictionTable
              predictions={profile.grade_predictions}
              comfortableLevel={profile.comfortable_level}
            />
          )}
        </>
      )}
    </div>
  );
}
