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

const TRAINING_ZONE_DETAILS = [
  {
    status: 'Overclocked',
    range: '150%+',
    meaning: 'Your recent week is far above your long-term baseline.',
    playerPattern: 'Usually means you are playing a lot more, pushing harder levels, or stacking long sessions with strong clears.',
    achievementPattern: 'Great for short-term peaks, but it can be hard to sustain and may come with fatigue.',
  },
  {
    status: 'In The Zone',
    range: '100% to 149%',
    meaning: 'Your recent week is matching or outperforming your baseline.',
    playerPattern: 'Usually means you are clearing solid volume at your normal hard levels, or mixing consistency with some pushes.',
    achievementPattern: 'This is the healthiest zone for building form and keeping progress moving.',
  },
  {
    status: 'Cruising',
    range: '80% to 99%',
    meaning: 'Your recent week is a bit lighter than baseline, but still close enough to maintain.',
    playerPattern: 'Usually means you are still playing regularly and getting clears, but not quite matching the load or difficulty of your better weeks.',
    achievementPattern: 'You are more likely maintaining current skill than actively pushing your ceiling.',
  },
  {
    status: 'Warming Up',
    range: '50% to 79%',
    meaning: 'Your recent week is clearly below baseline.',
    playerPattern: 'Usually means shorter sessions, fewer active days, easier clears, or a comeback after time off.',
    achievementPattern: 'Good for rebuilding rhythm, but usually not enough yet to hold top form.',
  },
  {
    status: 'Cooling Down',
    range: '1% to 49%',
    meaning: 'Your recent week is much lighter than baseline.',
    playerPattern: 'Usually means very little recent play, very easy sessions, or scattered activity with not many strong clears.',
    achievementPattern: 'Your sharpness may slip here unless you start rebuilding recent load.',
  },
  {
    status: 'Calibrating',
    range: '1 to 6 play days',
    meaning: 'The system does not trust the ratio yet because there is not enough recent history.',
    playerPattern: 'Usually means you just started syncing, changed mode, or do not have enough separate days logged yet.',
    achievementPattern: 'Keep playing on more days and the profile will settle into a real zone.',
  },
  {
    status: 'Idle',
    range: 'No recent data',
    meaning: 'There is not enough current activity to classify your training state.',
    playerPattern: 'Usually means no recent synced play or a fully decayed training profile.',
    achievementPattern: 'Once you start logging sessions again, the system will begin rebuilding your profile.',
  },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Math.round(numeric).toLocaleString();
}

function formatDetailedNumber(value, decimals = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSignedNumber(value, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  const rounded = Number(numeric.toFixed(decimals));
  const prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${prefix}${Math.abs(rounded).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function getModeEwmaSeries(data, mode) {
  if (!Array.isArray(data?.ewma_history)) return [];
  return data.ewma_history.map((entry) => {
    const point = entry?.[mode] || {};
    return {
      date: entry.date,
      baseSkill: Number(point.base_skill) || 0,
      currentForm: Number(point.current_form) || 0,
      chronicClearCount: Number(point.chronic_clear_count) || 0,
    };
  });
}

function getModeDailySeries(data, mode) {
  if (!Array.isArray(data?.daily_load_history)) return [];
  return data.daily_load_history.map((entry) => ({
    date: entry.date,
    load: Number(entry?.[mode]) || 0,
  }));
}

function getTrendSnapshot(values, lookback = 7) {
  if (!values.length) {
    return { current: null, previous: null, delta: null };
  }
  const current = values[values.length - 1];
  const previous = values[Math.max(0, values.length - lookback - 1)];
  return {
    current,
    previous,
    delta: current - previous,
  };
}

function getTrendTone(delta, stableThreshold = 1) {
  if (!Number.isFinite(delta)) {
    return { label: 'Not enough trend data yet', color: '#94A3B8' };
  }
  if (Math.abs(delta) <= stableThreshold) {
    return { label: 'Holding steady', color: '#94A3B8' };
  }
  return delta > 0
    ? { label: 'Trending up', color: '#22C55E' }
    : { label: 'Trending down', color: '#EF4444' };
}

function countActiveDays(entries, windowSize, offset = 0) {
  const end = Math.max(0, entries.length - offset);
  const start = Math.max(0, end - windowSize);
  return entries.slice(start, end).filter((entry) => entry.load > 0).length;
}

function sumLoad(entries, windowSize, offset = 0) {
  const end = Math.max(0, entries.length - offset);
  const start = Math.max(0, end - windowSize);
  return entries.slice(start, end).reduce((sum, entry) => sum + entry.load, 0);
}

function buildMetricExplainer(metricKey, profile, data, mode) {
  if (!profile) return null;

  const modeLabel = MODE_LABELS[mode] || 'Overall';
  const ewmaSeries = getModeEwmaSeries(data, mode);
  const dailySeries = getModeDailySeries(data, mode);
  const baseTrend = getTrendSnapshot(ewmaSeries.map((point) => point.baseSkill));
  const formTrend = getTrendSnapshot(ewmaSeries.map((point) => point.currentForm));
  const ratioTrend = getTrendSnapshot(
    ewmaSeries
      .map((point) => (point.baseSkill > 0.01 ? (point.currentForm / point.baseSkill) * 100 : null))
      .filter((value) => value != null)
  );
  const avgLoadTrend = getTrendSnapshot(
    ewmaSeries.map((point) => point.baseSkill / Math.max(point.chronicClearCount, 0.5))
  );
  const recentActive14 = countActiveDays(dailySeries, 14);
  const previousActive14 = countActiveDays(dailySeries, 14, 14);
  const recentActive7 = countActiveDays(dailySeries, 7);
  const recentLoad7 = sumLoad(dailySeries, 7);
  const previousLoad7 = sumLoad(dailySeries, 7, 7);
  const pluralDays = (count) => `${count} active day${count === 1 ? '' : 's'}`;

  switch (metricKey) {
    case 'base_skill': {
      const tone = getTrendTone(baseTrend.delta, 20);
      return {
        title: 'Base Skill',
        subtitle: `Your ${modeLabel.toLowerCase()} long-term training baseline.`,
        color: '#22C55E',
        value: formatNumber(profile.base_skill),
        summary: 'This moves slowly and rewards sustained work over multiple weeks.',
        trendLabel: tone.label,
        trendColor: tone.color,
        metrics: [
          { label: 'Current', value: formatNumber(profile.base_skill), accent: '#22C55E' },
          { label: '7d Change', value: formatSignedNumber(baseTrend.delta, 0), accent: tone.color },
          { label: 'Last 7d Load', value: formatNumber(recentLoad7), accent: '#ff3366' },
          { label: 'Last 14d', value: pluralDays(recentActive14), accent: '#4488ff' },
        ],
        calculation: 'Every local day gets a total training load from the songs you played, weighted by level and result. Base Skill is a 28-day EWMA of those daily totals, so consistent weeks matter more than one huge session.',
        trend: `${tone.label}. You are ${formatSignedNumber(baseTrend.delta, 0)} points versus 7 days ago. In the last 7 days you logged ${formatNumber(recentLoad7)} total load, compared with ${formatNumber(previousLoad7)} in the 7 days before that.`,
        improve: 'To push Base Skill back up, play and clear more songs across more days, and keep the clears at meaningful levels for 2 to 4 weeks. Higher sustained levels and better grades raise it faster than one-off spikes.',
        note: 'If Base Skill is falling, it usually means your recent weeks are lighter than your longer-term baseline.',
      };
    }
    case 'current_form': {
      const tone = getTrendTone(formTrend.delta, 20);
      const formVsBase = profile.base_skill > 0
        ? (profile.current_form / profile.base_skill) * 100
        : null;
      const formGap = profile.current_form - profile.base_skill;
      return {
        title: 'Current Form',
        subtitle: `Your ${modeLabel.toLowerCase()} recent sharpness and momentum.`,
        color: '#ff3366',
        value: formatNumber(profile.current_form),
        summary: formVsBase != null
          ? `Right now you are at ${formatDetailedNumber(formVsBase, 0)}% of your Base Skill.`
          : 'This tracks how hard your recent week has been.',
        trendLabel: tone.label,
        trendColor: tone.color,
        metrics: [
          { label: 'Current', value: formatNumber(profile.current_form), accent: '#ff3366' },
          { label: '7d Change', value: formatSignedNumber(formTrend.delta, 0), accent: tone.color },
          { label: 'Vs Base', value: formVsBase != null ? `${formatDetailedNumber(formVsBase, 0)}%` : '--', accent: '#22C55E' },
          { label: 'Gap To Base', value: formatSignedNumber(formGap, 0), accent: formGap >= 0 ? '#22C55E' : '#F59E0B' },
        ],
        calculation: 'Current Form uses the same daily load input as Base Skill, but smooths it over 7 days instead of 28. That makes it respond much faster to what you have done this week.',
        trend: `${tone.label}. Current Form is ${formatSignedNumber(formTrend.delta, 0)} versus 7 days ago and ${formGap >= 0 ? 'above' : 'below'} Base Skill by ${formatNumber(Math.abs(formGap))}.`,
        improve: formGap < 0
          ? 'To bring it back up, stack a few strong sessions this week. Recent sessions matter a lot here, so harder clears and more volume over the next several days will move it faster than older play.'
          : 'You are already running at or above baseline. To hold it there, keep the recent sessions coming, but watch fatigue if you stay elevated for too long.',
        note: 'This is the quickest metric to react when you go on a hot streak or take a few days off.',
      };
    }
    case 'play_days': {
      const dayDelta = recentActive14 - previousActive14;
      const tone = getTrendTone(dayDelta, 0);
      return {
        title: 'Play Days',
        subtitle: `How often you have shown up for ${modeLabel.toLowerCase()} play.`,
        color: '#4488ff',
        value: formatNumber(profile.play_days),
        summary: 'This rewards consistency across days, not marathoning everything into one session.',
        trendLabel: tone.label,
        trendColor: tone.color,
        metrics: [
          { label: 'Total 56d', value: formatNumber(profile.play_days), accent: '#4488ff' },
          { label: 'Last 14d', value: recentActive14, accent: '#7dd3fc' },
          { label: 'Prev 14d', value: previousActive14, accent: '#94A3B8' },
          { label: 'Last 7d', value: recentActive7, accent: '#22C55E' },
        ],
        calculation: 'Play Days is the number of distinct local calendar days with at least one logged play in the last 56 days. Twenty songs on one day still count as one play day.',
        trend: `${tone.label}. You had ${recentActive14} active day${recentActive14 === 1 ? '' : 's'} in the last 14 days versus ${previousActive14} in the 14 days before that.`,
        improve: 'To raise this, spread your sessions across more separate days. Even a shorter session counts, so regular cadence works better than saving everything for one long day.',
        note: 'If this number slips, calibration and other training metrics also become slower to trust.',
      };
    }
    case 'training_ratio': {
      const tone = getTrendTone(ratioTrend.delta, 2);
      const ratio = profile.training_ratio;
      let improve = 'Keep the recent week strong enough to stay near or above your long-term baseline.';
      if (ratio == null) {
        improve = 'Play on at least 7 separate days to calibrate the ratio. Once calibrated, stronger recent sessions will lift it quickly.';
      } else if (ratio < 80) {
        improve = 'To move this back up, you need a stronger recent week than the one you just had. More recent sessions, higher levels, and better clears will lift Current Form relative to Base Skill.';
      } else if (ratio < 100) {
        improve = 'A couple of strong recent sessions should pull this back toward baseline. Focus on quality clears this week.';
      } else if (ratio >= 150) {
        improve = 'This is already very high. You can push it further, but recovery and consistency are probably more useful than chasing a higher ratio here.';
      }
      return {
        title: 'Training Ratio',
        subtitle: 'How your recent week compares with your longer baseline.',
        color: profile.training_color || '#ff3366',
        value: ratio != null ? formatDetailedNumber(ratio, 0) : '--',
        unit: '%',
        summary: ratio != null
          ? `${profile.training_status} means your recent load is ${ratio >= 100 ? 'matching or beating' : 'below'} baseline.`
          : 'This stays hidden until your profile has enough play days to calibrate.',
        trendLabel: tone.label,
        trendColor: tone.color,
        metrics: [
          { label: 'Ratio', value: ratio != null ? `${formatDetailedNumber(ratio, 0)}%` : '--', accent: profile.training_color || '#ff3366' },
          { label: 'Status', value: profile.training_status || '--', accent: profile.training_color || '#ff3366' },
          { label: '7d Change', value: ratio != null ? `${formatSignedNumber(ratioTrend.delta, 0)} pts` : '--', accent: tone.color },
          { label: 'Formula', value: `${formatNumber(profile.current_form)} / ${formatNumber(profile.base_skill)}`, accent: '#e5e7eb' },
        ],
        calculation: 'Training Ratio is Current Form divided by Base Skill, multiplied by 100. Around 100% means your recent week matches your baseline. Above that means you are running hot; below that means your recent week has been lighter.',
        trend: ratio != null
          ? `${tone.label}. You are at ${formatDetailedNumber(ratio, 0)}%, which is ${formatSignedNumber(ratioTrend.delta, 0)} percentage points versus 7 days ago.`
          : 'Still calibrating. Once you have enough play days, this will show how your recent week compares with your longer baseline.',
        improve,
        note: 'This metric is great for spotting whether you are building, maintaining, or cooling off.',
      };
    }
    case 'avg_play_load': {
      const tone = getTrendTone(avgLoadTrend.delta, 15);
      const smoothedClears = Number(profile.chronic_clear_count) || 0;
      return {
        title: 'Avg Load / Clear',
        subtitle: `The average difficulty weight of the clears supporting your ${modeLabel.toLowerCase()} profile.`,
        color: '#A855F7',
        value: formatNumber(profile.avg_play_load),
        summary: 'This is a conservative difficulty baseline, not a pass guarantee.',
        trendLabel: tone.label,
        trendColor: tone.color,
        metrics: [
          { label: 'Current', value: formatNumber(profile.avg_play_load), accent: '#A855F7' },
          { label: '7d Change', value: formatSignedNumber(avgLoadTrend.delta, 0), accent: tone.color },
          { label: 'Smoothed Clears', value: formatDetailedNumber(smoothedClears, 2), accent: '#7dd3fc' },
          { label: 'Comfortable Lv.', value: profile.comfortable_level != null ? `Lv.${profile.comfortable_level}` : '--', accent: '#f9a8d4' },
        ],
        calculation: `Avg Load / Clear is Base Skill divided by smoothed clear count. With your current numbers that is ${formatDetailedNumber(profile.base_skill, 2)} / ${formatDetailedNumber(smoothedClears, 2)} = ${formatDetailedNumber(profile.avg_play_load, 2)}.`,
        trend: `${tone.label}. This metric is ${formatSignedNumber(avgLoadTrend.delta, 0)} versus 7 days ago. Stronger clears and better grades push it up, while lots of easier clears can pull it down.`,
        improve: 'To move this up, clear harder songs or improve your grades on the songs you are already clearing. A big pile of easy clears can grow the clear count faster than the load, which usually drags this number down.',
        note: 'We use this as one input for comfortable level and pass-ceiling logic, but it is not enough on its own.',
      };
    }
    default:
      return null;
  }
}

function getTrainingStatusDetail(status) {
  return TRAINING_ZONE_DETAILS.find((zone) => zone.status === status)
    || TRAINING_ZONE_DETAILS.find((zone) => zone.status === 'Idle');
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

function ZoneBadge({ status, color, ratio, onExplainRatio, onExplainStatus }) {
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
              {onExplainStatus ? (
                <button
                  type="button"
                  onClick={onExplainStatus}
                  className="rounded px-1 -mx-1 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-piu-accent/50"
                  aria-label={`Explain training status ${status}`}
                >
                  <span
                    className="font-display font-bold text-xl sm:text-2xl tracking-wide text-left"
                    style={{ color: zone.gradient[0] }}
                  >
                    {status}
                  </span>
                </button>
              ) : (
                <h3
                  className="font-display font-bold text-xl sm:text-2xl tracking-wide"
                  style={{ color: zone.gradient[0] }}
                >
                  {status}
                </h3>
              )}
              {ratio != null && (
                <div className="text-xs text-gray-400 font-display">
                  Training Ratio:{' '}
                  {onExplainRatio ? (
                    <button
                      type="button"
                      onClick={onExplainRatio}
                      className="font-bold text-gray-200 rounded px-1 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-piu-accent/50"
                    >
                      {ratio}%
                    </button>
                  ) : (
                    <span className="text-gray-200 font-bold">{ratio}%</span>
                  )}
                </div>
              )}
              {onExplainStatus && (
                <p className="text-[10px] text-gray-600 font-display mt-0.5">Click status to compare zones</p>
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

function StatCard({ label, value, unit, color, delay = 0, onExplain }) {
  const valueNode = (
    <>
      <AnimatedNumber value={value} />
      {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
    </>
  );

  return (
    <div
      className="card py-3 px-4 text-center animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-display mb-1">{label}</p>
      {onExplain ? (
        <button
          type="button"
          onClick={onExplain}
          className="mx-auto inline-flex items-end rounded-lg px-2 py-1 transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-piu-accent/50"
          aria-label={`Explain ${label}`}
        >
          <span className="text-xl sm:text-2xl font-display font-bold" style={{ color: color || '#e5e7eb' }}>
            {valueNode}
          </span>
        </button>
      ) : (
        <p className="text-xl sm:text-2xl font-display font-bold" style={{ color: color || '#e5e7eb' }}>
          {valueNode}
        </p>
      )}
      {onExplain && (
        <p className="text-[10px] text-gray-600 mt-1">Click value to explain</p>
      )}
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

function HelpButton({ onClick, label = 'Explain this metric' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-piu-border/50 bg-piu-dark/70 text-[10px] font-display font-bold text-gray-300 transition-colors hover:text-white hover:border-piu-accent/50"
    >
      ?
    </button>
  );
}

function getProjectionTone(mode) {
  if (mode === 'single') {
    return {
      accent: '#22C55E',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      subtleClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
    };
  }

  if (mode === 'double') {
    return {
      accent: '#A855F7',
      badgeClass: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
      subtleClass: 'border-violet-500/20 bg-violet-500/10 text-violet-100',
    };
  }

  return {
    accent: '#ff3366',
    badgeClass: 'border-piu-accent/30 bg-piu-accent/10 text-pink-200',
    subtleClass: 'border-piu-accent/20 bg-piu-accent/10 text-pink-100',
  };
}

function ConfidencePill({ confidence = 'Low' }) {
  const toneMap = {
    High: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    Medium: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    Low: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${toneMap[confidence] || toneMap.Low}`}>
      {confidence}
    </span>
  );
}

function MiniMetric({ label, value, accent = '#e5e7eb' }) {
  return (
    <div className="rounded-lg border border-piu-border/35 bg-piu-dark/40 px-3 py-2 text-center">
      <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-display font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function LikelyPassCeilingCard({ passCeiling, mode, onExplain }) {
  if (!passCeiling?.level) return null;

  const target = passCeiling.target || {};
  const feeder = passCeiling.feeder_levels?.[0] || null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  const nearPassCount = target.strong_near_pass_count || target.near_pass_count || 0;
  const tone = getProjectionTone(mode);

  return (
    <div className="card overflow-hidden border-piu-border/60 bg-piu-card/95">
      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3 border-b border-piu-border/35 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-display">
              Likely {modeLabel} Pass Ceiling
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
                Supported now
              </span>
              <span className="text-[11px] text-gray-500">
                Recent clears and near-passes support this push.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ConfidencePill confidence={passCeiling.confidence} />
            <HelpButton onClick={onExplain} label="Explain likely pass ceiling" />
          </div>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <span className="text-5xl sm:text-6xl font-display font-bold tracking-tight text-white">
            <AnimatedNumber value={passCeiling.level} duration={1200} />
          </span>
          <span className={`mb-2 rounded-md border px-2 py-0.5 text-xs font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
            Lv.
          </span>
        </div>

        <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-gray-400">
          Highest level with enough recent evidence to call a real pass chance right now.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniMetric label={`Lv.${passCeiling.level} clears`} value={target.clear_count || 0} accent={tone.accent} />
          <MiniMetric label="Near-passes" value={nearPassCount} accent="#f9a8d4" />
          <MiniMetric label={feeder ? `Lv.${feeder.level} clears` : 'Feeder clears'} value={feeder?.clear_count || 0} accent="#86efac" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-piu-border/30 pt-3">
          {passCeiling.predicted_grade && <GradePill grade={passCeiling.predicted_grade} />}
          {target.best_clear_score > 0 && (
            <span className="text-[11px] text-gray-400">
              Best clear: <span className="font-mono text-gray-200">{formatNumber(target.best_clear_score)}</span>
            </span>
          )}
          {target.best_near_pass_score > 0 && (
            <span className="text-[11px] text-gray-400">
              Best near-pass: <span className="font-mono text-gray-200">{formatNumber(target.best_near_pass_score)}</span>
            </span>
          )}
        </div>

        {passCeiling.reasons?.length > 0 && (
          <div className="mt-3 space-y-1 border-l border-piu-border/40 pl-3">
            {passCeiling.reasons.slice(0, 3).map((reason) => (
              <p key={reason} className="text-[11px] text-gray-500">
                {reason}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExplainerBlock({ title, body }) {
  return (
    <div className="rounded-xl border border-piu-border/45 bg-piu-dark/45 p-3">
      <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-300">{body}</p>
    </div>
  );
}

function PassCeilingHelpModal({ open, onClose, mode, profile }) {
  if (!open) return null;

  const passCeiling = profile?.likely_pass || null;
  const feeder = passCeiling?.feeder_levels?.[0] || null;
  const feederTwo = passCeiling?.feeder_levels?.[1] || null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Training Explainer</p>
            <h3 className="text-sm sm:text-base font-display font-bold text-piu-accent break-words">
              Likely {modeLabel} Pass Ceiling
            </h3>
            <p className="mt-1 text-[11px] text-gray-500">
              A “good chance right now” estimate, not a guaranteed pass and not your all-time peak.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {passCeiling && (
            <div className="rounded-2xl border border-piu-border/45 bg-gradient-to-br from-sky-500/10 via-piu-dark/30 to-emerald-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Current estimate</p>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-4xl font-display font-bold text-white">Lv.{passCeiling.level}</span>
                    <ConfidencePill confidence={passCeiling.confidence} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {passCeiling.predicted_grade && <GradePill grade={passCeiling.predicted_grade} />}
                  <span className="rounded-full border border-piu-border/45 px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide text-gray-300">
                    Comfortable Lv.{profile?.comfortable_level ?? '--'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ExplainerBlock
              title="Base Skill"
              body="A 28-day smoothed daily load baseline. Higher means you have been sustaining more total work over time."
            />
            <ExplainerBlock
              title="Current Form"
              body="A 7-day smoothed daily load. We compare it against base skill to see whether you are hot, neutral, or cooling off."
            />
            <ExplainerBlock
              title="Avg Load / Clear"
              body="Your smoothed training load divided by smoothed clears. We use it as a conservative difficulty baseline, not as a pass guarantee."
            />
            <ExplainerBlock
              title="Exact-Level Evidence"
              body="Recent clears at the target level matter most. High-score stage breaks around 900k+ also count as near-passes for ceiling logic."
            />
            <ExplainerBlock
              title="Feeder Levels"
              body="Clear volume one and two levels below the target helps support moving up. Strong sessions at level minus one matter too."
            />
            <ExplainerBlock
              title="Final Decision"
              body="We choose the highest level with enough recent evidence to call it a likely pass, then lower confidence if your form is running cold."
            />
          </div>

          {passCeiling && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniMetric label="Base Skill" value={formatNumber(profile?.base_skill)} accent="#22C55E" />
                <MiniMetric label="Current Form" value={formatNumber(profile?.current_form)} accent="#ff3366" />
                <MiniMetric label="Avg Load/Clear" value={formatNumber(profile?.avg_play_load)} accent="#A855F7" />
                <MiniMetric label="Form Ratio" value={`${formatNumber(passCeiling.form_ratio)}%`} accent="#7dd3fc" />
              </div>

              <div className="rounded-xl border border-piu-border/45 bg-piu-dark/45 p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Target Level Evidence</p>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniMetric label={`Lv.${passCeiling.level} attempts`} value={passCeiling.target?.attempt_count || 0} accent="#e5e7eb" />
                    <MiniMetric label="Clears" value={passCeiling.target?.clear_count || 0} accent="#7dd3fc" />
                    <MiniMetric label="Near-passes" value={(passCeiling.target?.strong_near_pass_count || passCeiling.target?.near_pass_count || 0)} accent="#f9a8d4" />
                    <MiniMetric label="Peak day clears" value={passCeiling.target?.clear_day_peak || 0} accent="#86efac" />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-piu-border/35 bg-piu-card/30 p-3">
                    <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Target bests</p>
                    <p className="mt-1 text-sm text-gray-300">
                      Best clear: <span className="font-mono text-white">{formatNumber(passCeiling.target?.best_clear_score)}</span>
                    </p>
                    <p className="text-sm text-gray-300">
                      Best near-pass: <span className="font-mono text-white">{formatNumber(passCeiling.target?.best_near_pass_score)}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-piu-border/35 bg-piu-card/30 p-3">
                    <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Feeder support</p>
                    <p className="mt-1 text-sm text-gray-300">
                      {feeder ? `Lv.${feeder.level}: ${feeder.clear_count} clears, peak day ${feeder.clear_day_peak}` : 'Lv.-1: --'}
                    </p>
                    <p className="text-sm text-gray-300">
                      {feederTwo ? `Lv.${feederTwo.level}: ${feederTwo.clear_count} clears` : 'Lv.-2: --'}
                    </p>
                    <p className="text-sm text-gray-300">
                      Load-supported pass level: <span className="font-display font-bold text-white">Lv.{passCeiling.load_supported_pass_level ?? '--'}</span>
                    </p>
                  </div>
                </div>

                {passCeiling.reasons?.length > 0 && (
                  <div className="rounded-lg border border-piu-border/35 bg-piu-card/30 p-3">
                    <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Why this level</p>
                    <div className="mt-2 space-y-1">
                      {passCeiling.reasons.map((reason) => (
                        <p key={reason} className="text-sm text-gray-300">{reason}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="rounded-xl border border-piu-border/45 bg-piu-dark/35 p-3">
            <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Important note</p>
            <p className="mt-1 text-sm text-gray-300 leading-relaxed">
              Grade predictions ignore failed runs, but likely pass ceiling does use strong positive-score stage breaks as “near-pass” evidence.
              That lets us recognize when someone is close to a new pass even before the first clean clear lands.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricHelpModal({ metricKey, onClose, profile, data, mode }) {
  const content = buildMetricExplainer(metricKey, profile, data, mode);
  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Metric Explainer</p>
            <h3 className="text-sm sm:text-base font-display font-bold break-words" style={{ color: content.color }}>
              {content.title}
            </h3>
            <p className="mt-1 text-[11px] text-gray-500">
              {content.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="rounded-2xl border border-piu-border/45 bg-gradient-to-br from-piu-accent/10 via-piu-dark/35 to-transparent p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Current value</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-4xl font-display font-bold text-white">
                    {content.value}
                  </span>
                  {content.unit && (
                    <span className="pb-1 text-sm font-display font-bold text-gray-400">{content.unit}</span>
                  )}
                </div>
              </div>
              <span
                className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide"
                style={{ color: content.trendColor, borderColor: `${content.trendColor}55`, backgroundColor: `${content.trendColor}12` }}
              >
                {content.trendLabel}
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-300 leading-relaxed">
              {content.summary}
            </p>
          </div>

          {content.metrics?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {content.metrics.map((metric) => (
                <MiniMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  accent={metric.accent}
                />
              ))}
            </div>
          )}

          <div className="grid gap-3">
            <ExplainerBlock title="How It Is Calculated" body={content.calculation} />
            <ExplainerBlock title="Your Trend" body={content.trend} />
            <ExplainerBlock title="How To Move It" body={content.improve} />
          </div>

          {content.note && (
            <div className="rounded-xl border border-piu-border/45 bg-piu-dark/35 p-3">
              <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">What To Keep In Mind</p>
              <p className="mt-1 text-sm text-gray-300 leading-relaxed">{content.note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainingStatusHelpModal({ open, onClose, profile, mode }) {
  if (!open || !profile) return null;

  const activeStatus = profile.training_status || 'Idle';
  const activeZone = ZONE_CONFIG[activeStatus] || ZONE_CONFIG.Idle;
  const activeDetail = getTrainingStatusDetail(activeStatus);
  const modeLabel = MODE_LABELS[mode] || 'Overall';
  const ratio = profile.training_ratio;
  const formVsBase = profile.base_skill > 0
    ? (profile.current_form / profile.base_skill) * 100
    : null;

  const currentSummary = ratio != null
    ? `Your recent ${modeLabel.toLowerCase()} load is running at ${formatDetailedNumber(ratio, 0)}% of your baseline. That comes from Current Form ${formatNumber(profile.current_form)} compared with Base Skill ${formatNumber(profile.base_skill)}.`
    : activeStatus === 'Calibrating'
      ? `You have ${profile.play_days} play day${profile.play_days === 1 ? '' : 's'} so far in this profile. The system waits for at least 7 play days before it trusts the training ratio.`
      : 'There is not enough current activity in this profile to compare recent load against long-term baseline yet.';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-piu-border bg-[#0b1220] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-piu-border/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Training Status</p>
            <h3 className="text-sm sm:text-base font-display font-bold break-words" style={{ color: activeZone.gradient[0] }}>
              {activeStatus}
            </h3>
            <p className="mt-1 text-[11px] text-gray-500">
              Clicking the status shows what each zone means and how your recent play fits into it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-white transition-colors shrink-0"
          >
            Close
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="rounded-2xl border border-piu-border/45 p-4" style={{ background: `linear-gradient(135deg, ${activeZone.gradient[0]}18, ${activeZone.gradient[1]}10)` }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeZone.icon}</span>
                <div>
                  <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Current zone</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-2xl font-display font-bold text-white">{activeStatus}</span>
                    <span
                      className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide"
                      style={{ color: activeZone.gradient[0], borderColor: `${activeZone.gradient[0]}55`, backgroundColor: `${activeZone.gradient[0]}12` }}
                    >
                      {activeDetail.range}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniMetric label="Base Skill" value={formatNumber(profile.base_skill)} accent="#22C55E" />
                <MiniMetric label="Current Form" value={formatNumber(profile.current_form)} accent="#ff3366" />
                <MiniMetric label="Training Ratio" value={ratio != null ? `${formatDetailedNumber(ratio, 0)}%` : '--'} accent={profile.training_color || activeZone.gradient[0]} />
                <MiniMetric label="Play Days" value={profile.play_days} accent="#4488ff" />
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-300 leading-relaxed">{currentSummary}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ExplainerBlock
              title="What This Means"
              body={`${activeDetail.meaning} ${activeDetail.playerPattern}`}
            />
            <ExplainerBlock
              title="What You Are Likely Achieving"
              body={activeDetail.achievementPattern}
            />
            <ExplainerBlock
              title="How The System Decides"
              body={ratio != null
                ? `This status comes from Current Form divided by Base Skill. Your profile is currently at ${formatDetailedNumber(formVsBase, 0)}%, which places you in ${activeStatus}.`
                : activeStatus === 'Calibrating'
                  ? 'This profile has activity, but fewer than 7 play days, so the system waits before assigning a fully trusted ratio zone.'
                  : 'Without recent synced activity or baseline data, the system cannot place you in an active training zone yet.'}
            />
            <ExplainerBlock
              title="How To Move Up"
              body={activeStatus === 'Overclocked'
                ? 'You are already above baseline. The real goal here is to hold quality without burning out.'
                : 'To climb into a stronger zone, increase recent load relative to your baseline: play on more days this week, clear more songs, or raise the level and grade quality of those clears.'}
            />
          </div>

          <div className="rounded-xl border border-piu-border/45 bg-piu-dark/35 p-4">
            <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">All Training Zones</p>
            <div className="mt-3 space-y-3">
              {TRAINING_ZONE_DETAILS.map((detail) => {
                const zone = ZONE_CONFIG[detail.status] || ZONE_CONFIG.Idle;
                const active = detail.status === activeStatus;
                return (
                  <div
                    key={detail.status}
                    className={`rounded-xl border p-3 transition-colors ${active ? 'border-white/20 bg-white/5' : 'border-piu-border/35 bg-piu-dark/35'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{zone.icon}</span>
                        <span className="font-display font-bold" style={{ color: zone.gradient[0] }}>{detail.status}</span>
                        {active && (
                          <span className="rounded-full border border-piu-accent/30 bg-piu-accent/10 px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide text-piu-accent">
                            Current
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-display uppercase tracking-wide text-gray-400">{detail.range}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{detail.meaning}</p>
                    <p className="mt-1 text-sm text-gray-400">{detail.playerPattern}</p>
                    <p className="mt-1 text-sm text-gray-500">{detail.achievementPattern}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
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

function ComfortableLevelDisplay({ level, mode, className = '' }) {
  if (level == null) return null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  const tone = getProjectionTone(mode);
  return (
    <div className={`card overflow-hidden border-piu-border/60 bg-piu-card/95 ${className}`}>
      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3 border-b border-piu-border/35 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-display">
              Comfortable {modeLabel} Level
            </p>
            <p className="mt-2 max-w-[30ch] text-xs leading-relaxed text-gray-400">
              Your repeatable level based on clears you can sustain at AA or better.
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
            Stable baseline
          </span>
        </div>

        <div className="mt-4 flex items-end gap-3">
          <span className="text-5xl sm:text-6xl font-display font-bold tracking-tight text-white">
            <AnimatedNumber value={level} duration={1200} />
          </span>
          <span className={`mb-2 rounded-md border px-2 py-0.5 text-xs font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
            Lv.
          </span>
        </div>

        <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-gray-400">
          The level you can consistently clear with an AA grade or higher
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-piu-border/30 pt-3">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${tone.subtleClass}`}>
            AA+ or better
          </span>
          <span className="inline-flex rounded-full border border-piu-border/45 bg-piu-dark/55 px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide text-gray-300">
            Built for consistency
          </span>
        </div>
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
  const [showPassCeilingHelp, setShowPassCeilingHelp] = useState(false);
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const [activeMetricHelp, setActiveMetricHelp] = useState('');

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
  const statCards = profile ? [
    { key: 'base_skill', label: 'Base Skill', value: Math.round(profile.base_skill), color: '#22C55E', delay: 0 },
    { key: 'current_form', label: 'Current Form', value: Math.round(profile.current_form), color: '#ff3366', delay: 50 },
    { key: 'play_days', label: 'Play Days', value: profile.play_days, color: '#4488ff', delay: 100 },
    profile.avg_play_load != null
      ? { key: 'avg_play_load', label: 'Avg Load/Clear', value: Math.round(profile.avg_play_load), color: '#A855F7', delay: 150 }
      : { key: 'training_ratio', label: 'Training Ratio', value: profile.training_ratio || 0, unit: '%', color: profile.training_color, delay: 150 },
  ] : [];

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
              onExplainStatus={() => setShowStatusHelp(true)}
              onExplainRatio={profile.training_ratio != null ? () => setActiveMetricHelp('training_ratio') : null}
            />
          )}

          {/* Key Stats */}
          {profile && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {statCards.map((card) => (
                <StatCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  unit={card.unit}
                  color={card.color}
                  delay={card.delay}
                  onExplain={() => setActiveMetricHelp(card.key)}
                />
              ))}
            </div>
          )}

          {/* Level Projections */}
          {showPredictions && profile.comfortable_level != null && (
            <div className={`grid gap-3 ${profile.likely_pass?.level ? 'md:grid-cols-2' : ''}`}>
              <ComfortableLevelDisplay level={profile.comfortable_level} mode={mode} />
              <LikelyPassCeilingCard
                passCeiling={profile.likely_pass}
                mode={mode}
                onExplain={() => setShowPassCeilingHelp(true)}
              />
            </div>
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

          <PassCeilingHelpModal
            open={showPassCeilingHelp}
            onClose={() => setShowPassCeilingHelp(false)}
            mode={mode}
            profile={profile}
          />
          <TrainingStatusHelpModal
            open={showStatusHelp}
            onClose={() => setShowStatusHelp(false)}
            mode={mode}
            profile={profile}
          />
          <MetricHelpModal
            metricKey={activeMetricHelp}
            onClose={() => setActiveMetricHelp('')}
            mode={mode}
            profile={profile}
            data={data}
          />
        </>
      )}
    </div>
  );
}
