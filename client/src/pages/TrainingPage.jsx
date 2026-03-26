import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPiugameTrainingLoad, getPiugameTrainingPopulation } from '../utils/api';
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
  ReferenceArea,
  LineChart,
  Line,
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
        calculation: 'In plain English: every song adds some training-load points. Harder levels and better results add more, while failed songs still add a little. We total those points for each day, then Base Skill smooths the last 28 days with an EWMA, which is just a rolling average that gives more weight to recent days.',
        trend: `${tone.label}. You are ${formatSignedNumber(baseTrend.delta, 0)} points versus 7 days ago. In the last 7 days you logged ${formatNumber(recentLoad7)} total load, compared with ${formatNumber(previousLoad7)} in the 7 days before that.`,
        improve: 'To push Base Skill back up, play and clear more songs across more days, and keep the clears at meaningful levels for 2 to 4 weeks. Higher sustained levels and better grades raise it faster than one-off spikes.',
        note: 'If Base Skill is falling, it usually means your recent weeks are lighter than your longer-term baseline. Because it is smoothed, one big day will not instantly spike it.',
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
        calculation: 'Current Form uses the same daily training-load points as Base Skill, but only smooths about the last 7 days. It still uses an EWMA, so recent sessions count more, but it reacts much faster to what you did this week.',
        trend: `${tone.label}. Current Form is ${formatSignedNumber(formTrend.delta, 0)} versus 7 days ago and ${formGap >= 0 ? 'above' : 'below'} Base Skill by ${formatNumber(Math.abs(formGap))}.`,
        improve: formGap < 0
          ? 'To bring it back up, stack a few strong sessions this week. Recent sessions matter a lot here, so harder clears and more volume over the next several days will move it faster than older play.'
          : 'You are already running at or above baseline. To hold it there, keep the recent sessions coming, but watch fatigue if you stay elevated for too long.',
        note: 'This is the quickest metric to react when you go on a hot streak or take a few days off, because the smoothing window is much shorter than Base Skill.',
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
      <div className="relative px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{zone.icon}</span>
            <div>
              {onExplainStatus ? (
                <button
                  type="button"
                  onClick={onExplainStatus}
                  className="rounded px-1 -mx-1 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-piu-accent/50"
                  aria-label={`Explain training status ${status}`}
                >
                  <span
                    className="font-display font-bold text-lg sm:text-xl tracking-wide text-left"
                    style={{ color: zone.gradient[0] }}
                  >
                    {status}
                  </span>
                </button>
              ) : (
                <h3
                  className="font-display font-bold text-lg sm:text-xl tracking-wide"
                  style={{ color: zone.gradient[0] }}
                >
                  {status}
                </h3>
              )}
              <div className="flex items-center gap-2">
                {ratio != null && (
                  <span className="text-xs text-gray-400 font-display">
                    Ratio:{' '}
                    {onExplainRatio ? (
                      <button
                        type="button"
                        onClick={onExplainRatio}
                        className="font-bold text-gray-200 rounded px-0.5 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-piu-accent/50"
                      >
                        {ratio}%
                      </button>
                    ) : (
                      <span className="text-gray-200 font-bold">{ratio}%</span>
                    )}
                  </span>
                )}
                <span className="text-[10px] text-gray-500">{zone.desc}</span>
              </div>
            </div>
          </div>
          <PulsingDot color={zone.gradient[0]} active={zone.pulse} />
        </div>
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
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-gray-500 font-display mb-1 whitespace-nowrap">{label}</p>
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

function TrainingBasicsModal({ open, onClose, profile, mode }) {
  if (!open) return null;

  const modeLabel = MODE_LABELS[mode] || 'Overall';

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
            <p className="text-[10px] text-gray-500 font-display uppercase tracking-wide">Training Basics</p>
            <h3 className="text-sm sm:text-base font-display font-bold text-piu-accent break-words">
              How {modeLabel} Training Load Works
            </h3>
            <p className="mt-1 text-[11px] text-gray-500">
              A plain-English guide to load, smoothing, Base Skill, and Current Form.
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
          <div className="rounded-2xl border border-piu-border/45 bg-piu-card/60 p-4">
            <div className="flex flex-wrap gap-3">
              <MiniMetric label="Base Skill" value={formatNumber(profile?.base_skill)} accent="#22C55E" />
              <MiniMetric label="Current Form" value={formatNumber(profile?.current_form)} accent="#ff3366" />
              <MiniMetric label="Play Days" value={profile?.play_days ?? '--'} accent="#4488ff" />
              <MiniMetric label="Avg Load/Clear" value={profile?.avg_play_load != null ? formatNumber(profile.avg_play_load) : '--'} accent="#A855F7" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ExplainerBlock
              title="1. Every Song Adds Load"
              body="Think of training load as workout points. Every song you play adds some. Harder charts add more. Better results add more. Failed songs still add a little because they still count as effort."
            />
            <ExplainerBlock
              title="2. Your Day Total"
              body="All of the songs from one day get added together into one daily load number. So a long session with lots of clears will build a much bigger day than one or two songs."
            />
            <ExplainerBlock
              title="3. What EWMA Means"
              body="EWMA stands for Exponentially Weighted Moving Average. In normal terms, it is a smoothed rolling average where recent days count more than older days. It stops one huge session from instantly redefining your profile."
            />
            <ExplainerBlock
              title="4. Base Skill"
              body="Base Skill is the slower 28-day smoothed version of your daily load. It shows the level of work you have been sustaining over a few weeks, not just what happened yesterday."
            />
            <ExplainerBlock
              title="5. Current Form"
              body="Current Form is the faster 7-day smoothed version of your daily load. It reacts much quicker, so it tells you whether your recent week is sharper, flatter, or stronger than normal."
            />
            <ExplainerBlock
              title="6. Why The Lines Look Smooth"
              body="The bars show raw daily load. The Base Skill and Current Form lines are smoothed versions of those bars. That is why the lines change gradually even if one day spikes hard."
            />
          </div>

          <div className="rounded-xl border border-piu-border/45 bg-piu-dark/35 p-3">
            <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">Simple Example</p>
            <p className="mt-1 text-sm text-gray-300 leading-relaxed">
              If you play lots of easier songs, you still gain some load. If you start clearing harder songs with better grades, your daily load rises faster. Keep doing that across multiple days and Base Skill climbs. Do it mainly this week and Current Form climbs first.
            </p>
          </div>
        </div>
      </div>
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
      accent: '#ff3366',
      badgeClass: 'border-piu-accent/30 bg-piu-accent/10 text-pink-200',
      subtleClass: 'border-piu-accent/20 bg-piu-accent/10 text-pink-100',
    };
  }

  if (mode === 'double') {
    return {
      accent: '#22C55E',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      subtleClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
    };
  }

  return {
    accent: '#A855F7',
    badgeClass: 'border-violet-500/30 bg-violet-500/10 text-violet-200',
    subtleClass: 'border-violet-500/20 bg-violet-500/10 text-violet-100',
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

function MiniMetric({ label, value, accent = '#e5e7eb', onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-lg border border-piu-border/35 bg-piu-dark/40 px-3 py-2 text-center ${onClick ? 'cursor-pointer hover:border-piu-border/60 hover:bg-piu-dark/60 transition-colors' : ''}`}
    >
      <p className="text-[10px] font-display uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-display font-bold" style={{ color: accent }}>
        {value}
      </p>
    </Wrapper>
  );
}

function getGradeColor(grade) {
  const g = String(grade || '').replace('+', '_p').toUpperCase();
  if (g.includes('SSS')) return 'text-sky-300';
  if (g.includes('SS')) return 'text-piu-gold';
  if (g.includes('S')) return 'text-amber-400';
  if (g.includes('AAA')) return 'text-piu-silver';
  if (g.includes('AA')) return 'text-piu-bronze';
  if (g.includes('A')) return 'text-amber-700';
  return 'text-gray-500';
}

function EvidenceSongListModal({ open, onClose, title, songs }) {
  if (!open || !songs?.length) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md max-h-[70vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border/60 bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-piu-border/40 bg-piu-card px-4 py-3">
          <h3 className="font-display font-bold text-sm text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="divide-y divide-piu-border/25">
          {songs.map((song, i) => (
            <div key={`${song.song_title}-${song.score}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              {song.background_url ? (
                <img src={song.background_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-piu-border/30" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-piu-dark/60 border border-piu-border/30 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 font-display font-bold truncate">{song.song_title || 'Unknown'}</p>
                <p className="text-[11px] text-gray-500">
                  {song.score?.toLocaleString()}
                </p>
              </div>
              {song.grade && (
                <span className={`shrink-0 text-sm font-display font-black ${getGradeColor(song.grade)}`}>
                  {song.grade}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LikelyPassCeilingCard({ passCeiling, mode, onExplain }) {
  const [songList, setSongList] = useState(null);

  if (!passCeiling?.level) return null;

  const target = passCeiling.target || {};
  const feeder = passCeiling.feeder_levels?.[0] || null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  const nearPassCount = target.strong_near_pass_count || target.near_pass_count || 0;
  const tone = getProjectionTone(mode);

  return (
    <div className="card overflow-hidden border-piu-border/60 bg-piu-card/95">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-display">
              Likely {modeLabel} Pass Ceiling
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide whitespace-nowrap ${tone.badgeClass}`}>
                Supported
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ConfidencePill confidence={passCeiling.confidence} />
            <HelpButton onClick={onExplain} label="Explain likely pass ceiling" />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-piu-border/30 pt-3">
          <div className="flex items-end gap-2 shrink-0">
            <span className="text-4xl sm:text-5xl font-display font-bold tracking-tight text-white leading-none">
              <AnimatedNumber value={passCeiling.level} duration={1200} />
            </span>
            <span className={`mb-0.5 rounded-md border px-1.5 py-px text-[10px] font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
              Lv.
            </span>
          </div>
          <p className="text-sm leading-snug text-gray-400">
            Enough recent evidence for a real pass chance right now.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniMetric
            label={`Lv.${passCeiling.level} clears`}
            value={target.clear_count || 0}
            accent={tone.accent}
            onClick={target.clears?.length ? () => setSongList({ title: `Lv.${passCeiling.level} Clears`, songs: target.clears }) : undefined}
          />
          <MiniMetric
            label="Near-passes"
            value={nearPassCount}
            accent="#f9a8d4"
            onClick={target.near_passes?.length ? () => setSongList({ title: `Lv.${passCeiling.level} Near-Passes`, songs: target.near_passes }) : undefined}
          />
          <MiniMetric
            label={feeder ? `Lv.${feeder.level} clears` : 'Feeder clears'}
            value={feeder?.clear_count || 0}
            accent="#86efac"
            onClick={feeder?.clears?.length ? () => setSongList({ title: `Lv.${feeder.level} Clears`, songs: feeder.clears }) : undefined}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-piu-border/30 pt-3">
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
          <div className="mt-2 space-y-0.5 border-l border-piu-border/40 pl-3">
            {passCeiling.reasons.slice(0, 3).map((reason) => (
              <p key={reason} className="text-[11px] text-gray-500">
                {reason}
              </p>
            ))}
          </div>
        )}
      </div>

      <EvidenceSongListModal
        open={!!songList}
        onClose={() => setSongList(null)}
        title={songList?.title || ''}
        songs={songList?.songs || []}
      />
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

function EWMAChart({ data, mode, onExplain }) {
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
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full bg-emerald-400 inline-block" />
              <span className="text-gray-500 whitespace-nowrap">Base Skill</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded-full bg-piu-accent inline-block" />
              <span className="text-gray-500 whitespace-nowrap">Current Form</span>
            </span>
          </div>
          {onExplain && <HelpButton onClick={onExplain} label="Explain training load and EWMA" />}
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

const INTENSITY_ZONES = [
  { min: 150, label: 'Overclocked', color: '#F97316', bg: '#F97316', desc: 'Recent training may be excessive' },
  { min: 100, label: 'In The Zone', color: '#22C55E', bg: '#22C55E', desc: 'Productive training is building fitness' },
  { min: 80, label: 'Cruising', color: '#3B82F6', bg: '#3B82F6', desc: 'Moderate load, maintaining Base Fitness' },
  { min: 50, label: 'Warming Up', color: '#EAB308', bg: '#EAB308', desc: 'Increasing load is improving fitness' },
  { min: 0, label: 'Cooling Down', color: '#94A3B8', bg: '#94A3B8', desc: 'Low recent load, Base Fitness declining' },
];

function getIntensityZone(ratio) {
  if (ratio == null) return null;
  for (const z of INTENSITY_ZONES) {
    if (ratio >= z.min) return z;
  }
  return INTENSITY_ZONES[INTENSITY_ZONES.length - 1];
}

function IntensityTrendCard({ data, mode, profile }) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    const recent = data.slice(-28);
    return recent.map((d) => {
      const entry = d[mode] || {};
      const base = entry.base_skill || 0;
      const form = entry.current_form || 0;
      const ratio = base > 0.01 ? Math.round((form / base) * 100) : null;
      return { date: formatDate(d.date), ratio };
    }).filter((d) => d.ratio != null);
  }, [data, mode]);

  if (!chartData.length || !profile) return null;

  const currentRatio = profile.training_ratio;
  const currentZone = getIntensityZone(currentRatio);
  const maxRatio = Math.max(...chartData.map((d) => d.ratio), 160);
  const yMax = Math.min(Math.ceil(maxRatio / 10) * 10 + 10, 250);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm text-gray-200">Intensity Trend</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Training Ratio over last 28 days</p>
        </div>
        {currentRatio != null && currentZone && (
          <div className="text-right">
            <p className="text-lg font-display font-bold" style={{ color: currentZone.color }}>{currentRatio}%</p>
            <p className="text-[10px] font-display font-bold" style={{ color: currentZone.color }}>{currentZone.label}</p>
          </div>
        )}
      </div>

      <div className="px-1 pb-1" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRatio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentZone?.color || '#94A3B8'} stopOpacity={0.25} />
                <stop offset="100%" stopColor={currentZone?.color || '#94A3B8'} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Zone bands */}
            <ReferenceArea y1={150} y2={yMax} fill="#F97316" fillOpacity={0.06} />
            <ReferenceArea y1={100} y2={150} fill="#22C55E" fillOpacity={0.06} />
            <ReferenceArea y1={80} y2={100} fill="#3B82F6" fillOpacity={0.06} />
            <ReferenceArea y1={50} y2={80} fill="#EAB308" fillOpacity={0.06} />
            <ReferenceArea y1={0} y2={50} fill="#94A3B8" fillOpacity={0.06} />
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
              domain={[0, yMax]}
              ticks={[0, 50, 80, 100, 150]}
              width={35}
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
              formatter={(value) => [`${value}%`, 'Ratio']}
            />
            <ReferenceLine y={100} stroke="#22C55E" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Area
              type="monotone"
              dataKey="ratio"
              stroke={currentZone?.color || '#94A3B8'}
              strokeWidth={2}
              fill="url(#gradRatio)"
              dot={false}
              activeDot={{ r: 4, fill: currentZone?.color || '#94A3B8', stroke: '#0a0a1a', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Zone legend */}
      <div className="px-4 pb-3 space-y-1">
        {INTENSITY_ZONES.map((z) => {
          const isActive = currentZone?.label === z.label;
          return (
            <div key={z.label} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${isActive ? 'bg-white/[0.04]' : ''}`}>
              <div className="w-1 h-full min-h-[24px] rounded-full shrink-0 mt-0.5" style={{ backgroundColor: z.color, opacity: isActive ? 1 : 0.35 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-display font-bold ${isActive ? '' : 'opacity-50'}`} style={{ color: z.color }}>{z.label}</span>
                  <span className="text-[10px] text-gray-600">{z.min === 0 ? '0–49%' : z.min === 50 ? '50–79%' : z.min === 80 ? '80–99%' : z.min === 100 ? '100–149%' : '≥150%'}</span>
                  {isActive && <span className="text-[9px] font-display font-bold text-white bg-white/10 px-1.5 py-0.5 rounded-full">YOU</span>}
                </div>
                <p className={`text-[10px] ${isActive ? 'text-gray-400' : 'text-gray-600'}`}>{z.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyLoadChart({ data, mode, onExplain }) {
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
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-sm text-gray-200">Daily Load</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Each bar is that day&apos;s total load from all songs you played</p>
        </div>
        {onExplain && <HelpButton onClick={onExplain} label="Explain how daily training load is accumulated" />}
      </div>
      <div className="px-1 pb-3" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 50, left: 0, bottom: 0 }}>
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
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-display">
              Comfortable {modeLabel} Level
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Repeatable clears at AA or better.
            </p>
          </div>
          <span className={`shrink-0 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide whitespace-nowrap ${tone.badgeClass}`}>
            Baseline
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-piu-border/30 pt-3">
          <div className="flex items-end gap-2">
            <span className="text-4xl sm:text-5xl font-display font-bold tracking-tight text-white leading-none">
              <AnimatedNumber value={level} duration={1200} />
            </span>
            <span className={`mb-0.5 rounded-md border px-1.5 py-px text-[10px] font-display font-bold uppercase tracking-wide ${tone.badgeClass}`}>
              Lv.
            </span>
          </div>
          <p className="text-sm leading-snug text-gray-400">
            Consistently clear with an AA grade or higher
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded-full border px-2 py-px text-[9px] font-display font-bold uppercase tracking-wide ${tone.subtleClass}`}>
            AA+ or better
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Population Insights Components ---

function PopulationPercentileCard({ percentile, mode, avgPlayLoad, onExplain }) {
  if (!percentile) return null;
  const tone = getProjectionTone(mode);
  const topPct = Math.max(1, Math.round(100 - percentile.percentile));
  return (
    <button onClick={onExplain} className="card overflow-hidden border-piu-border/60 bg-piu-card/95 text-left w-full">
      <div className="px-2.5 py-2">
        <p className="text-[8px] uppercase tracking-[0.18em] text-gray-500 font-display">Percentile</p>
        <p className="mt-0.5 text-lg font-display font-bold text-white leading-none">Top {topPct}%</p>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-piu-dark/80 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, percentile.percentile)}%`, background: `linear-gradient(90deg, ${tone.accent}60, ${tone.accent})` }} />
          </div>
          <span className="text-[9px] text-gray-600 shrink-0">{percentile.total_users}p</span>
        </div>
      </div>
    </button>
  );
}

function MilestoneTargetCard({ milestone, mode, onExplain }) {
  if (!milestone) return null;
  const tone = getProjectionTone(mode);
  const modePrefix = mode === 'single' ? 'S' : 'D';
  const progress = milestone.already_met ? 100 : Math.min(99, Math.round((milestone.current_avg_load / milestone.target_avg_load) * 100));
  return (
    <button onClick={onExplain} className="card overflow-hidden border-piu-border/60 bg-piu-card/95 text-left w-full">
      <div className="px-2.5 py-2">
        <p className="text-[8px] uppercase tracking-[0.18em] text-gray-500 font-display">Next Target</p>
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="text-lg font-display font-bold text-white leading-none">{modePrefix}{milestone.target_level}</span>
          {!milestone.already_met && <span className="text-[9px] text-gray-600">+{Math.round(milestone.gap_percent)}%</span>}
        </div>
        <div className="mt-1 h-1 rounded-full bg-piu-dark/80 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: milestone.already_met ? '#22C55E' : `linear-gradient(90deg, ${tone.accent}60, ${tone.accent})` }} />
        </div>
      </div>
    </button>
  );
}

function CeilingPredictionCard({ ceiling, mode, onExplain }) {
  if (!ceiling) return null;
  const tone = getProjectionTone(mode);
  const modePrefix = mode === 'single' ? 'S' : 'D';
  return (
    <button onClick={onExplain} className="card overflow-hidden border-piu-border/60 bg-piu-card/95 text-left w-full">
      <div className="px-2.5 py-2">
        <p className="text-[8px] uppercase tracking-[0.18em] text-gray-500 font-display">Ceiling</p>
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="text-lg font-display font-bold text-white leading-none">{modePrefix}{ceiling.ceiling_level}</span>
          <span className={`rounded border px-1 text-[7px] font-display font-bold uppercase ${tone.badgeClass}`}>Peak</span>
        </div>
        <p className="mt-0.5 text-[9px] text-gray-600">{modePrefix}{ceiling.comfortable_level} + {ceiling.delta}</p>
      </div>
    </button>
  );
}

function PopulationScatterChart({ scatter, mode, onExplain }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [activePoint, setActivePoint] = useState(null);
  const gestureRef = useRef({ initialDistance: 0, initialScale: 1, isPinching: false, lastTouch: null, panStart: null });

  if (!scatter?.length || scatter.length < 3) return null;
  const modePrefix = mode === 'single' ? 'S' : 'D';
  const tone = getProjectionTone(mode);

  // Compute data ranges with padding
  const allLoads = scatter.map((p) => p.avg_load_per_clear);
  const allLevels = scatter.flatMap((p) => [p.comfortable_level, p.ceiling_level]);
  const dataMinLoad = Math.min(...allLoads);
  const dataMaxLoad = Math.max(...allLoads);
  const dataMinLevel = Math.min(...allLevels);
  const dataMaxLevel = Math.max(...allLevels);
  const loadPad = Math.max(50, (dataMaxLoad - dataMinLoad) * 0.12);
  const levelPad = 1;
  const minLoad = dataMinLoad - loadPad;
  const maxLoad = dataMaxLoad + loadPad;
  const minLevel = dataMinLevel - levelPad;
  const maxLevel = dataMaxLevel + levelPad;
  const loadRange = maxLoad - minLoad;
  const levelRange = maxLevel - minLevel;

  function xPct(load) { return ((load - minLoad) / loadRange) * 100; }
  function yPct(level) { return (1 - (level - minLevel) / levelRange) * 100; }

  // Axis tick helpers
  function niceStep(range, targetTicks) {
    const rough = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / mag;
    return (residual <= 1.5 ? 1 : residual <= 3 ? 2 : residual <= 7 ? 5 : 10) * mag;
  }
  const xStep = niceStep(loadRange, 5);
  const xTickStart = Math.ceil(minLoad / xStep) * xStep;
  const xTicks = [];
  for (let v = xTickStart; v <= maxLoad; v += xStep) xTicks.push(Math.round(v));
  const yTicks = [];
  for (let v = Math.ceil(minLevel); v <= Math.floor(maxLevel); v++) yTicks.push(v);

  // Regression line
  const n = scatter.length;
  const sumX = scatter.reduce((s, p) => s + p.avg_load_per_clear, 0);
  const sumY = scatter.reduce((s, p) => s + p.comfortable_level, 0);
  const sumXY = scatter.reduce((s, p) => s + p.avg_load_per_clear * p.comfortable_level, 0);
  const sumX2 = scatter.reduce((s, p) => s + p.avg_load_per_clear * p.avg_load_per_clear, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  // R² for display
  const meanY = sumY / n;
  const ssTot = scatter.reduce((s, p) => s + (p.comfortable_level - meanY) ** 2, 0);
  const ssRes = scatter.reduce((s, p) => s + (p.comfortable_level - (slope * p.avg_load_per_clear + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? (1 - ssRes / ssTot) : 0;

  // Pinch-to-zoom gesture handlers
  function getDistance(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      gestureRef.current.initialDistance = getDistance(e.touches[0], e.touches[1]);
      gestureRef.current.initialScale = scale;
      gestureRef.current.isPinching = true;
    } else if (e.touches.length === 1 && scale > 1) {
      gestureRef.current.panStart = { x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y };
    }
  }

  function handleTouchMove(e) {
    if (gestureRef.current.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(4, gestureRef.current.initialScale * (dist / gestureRef.current.initialDistance)));
      setScale(newScale);
    } else if (gestureRef.current.panStart && e.touches.length === 1 && scale > 1) {
      const newX = e.touches[0].clientX - gestureRef.current.panStart.x;
      const newY = e.touches[0].clientY - gestureRef.current.panStart.y;
      setTranslate({ x: newX, y: newY });
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) {
      gestureRef.current.isPinching = false;
    }
    if (e.touches.length === 0) {
      gestureRef.current.panStart = null;
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(1, Math.min(4, s * delta)));
  }

  function resetZoom() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  const chartAreaStyle = {
    transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
    transformOrigin: 'center center',
    touchAction: scale > 1 ? 'none' : 'pan-y',
  };

  return (
    <div className="card overflow-hidden border-piu-border/60 bg-piu-card/95">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm text-gray-200">Player Landscape</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            R² = {r2.toFixed(2)} correlation
            {scale > 1 && <span className="text-gray-600"> · pinch or scroll to zoom</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scale > 1 && (
            <button onClick={resetZoom} className="text-[9px] font-display font-bold uppercase text-gray-500 hover:text-gray-300 transition-colors">Reset</button>
          )}
          {onExplain && <HelpButton onClick={onExplain} label="Explain player landscape" />}
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden mx-4 mb-4 rounded-lg border border-piu-border/20 bg-piu-dark/30"
        style={{ paddingBottom: '60%' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0" style={chartAreaStyle}>
          {/* Y-axis ticks (levels) */}
          {yTicks.map((level) => {
            const top = yPct(level);
            if (top < 2 || top > 98) return null;
            return (
              <div key={`y-${level}`} className="absolute left-0 right-0" style={{ top: `${top}%` }}>
                <div className="border-t border-piu-border/15 w-full" />
                <span className="absolute -left-0.5 -translate-y-1/2 text-[9px] font-display text-gray-600 pl-1.5">
                  {modePrefix}{level}
                </span>
              </div>
            );
          })}
          {/* X-axis ticks (load values) */}
          {xTicks.map((load) => {
            const left = xPct(load);
            if (left < 5 || left > 98) return null;
            return (
              <div key={`x-${load}`} className="absolute top-0 bottom-0" style={{ left: `${left}%` }}>
                <div className="border-l border-piu-border/15 h-full" />
                <span className="absolute bottom-0 -translate-x-1/2 text-[8px] font-display text-gray-600 pb-1">
                  {load >= 1000 ? `${(load / 1000).toFixed(1)}k` : load}
                </span>
              </div>
            );
          })}

          {/* Trend line */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1={xPct(dataMinLoad)} y1={yPct(slope * dataMinLoad + intercept)}
              x2={xPct(dataMaxLoad)} y2={yPct(slope * dataMaxLoad + intercept)}
              stroke={tone.accent} strokeOpacity={0.35} strokeWidth={0.4} strokeDasharray="1.5 1.5"
            />
          </svg>

          {/* Data points */}
          {scatter.map((point) => {
            const isMe = point.is_current_user;
            const isActive = activePoint === point.username;
            const x = xPct(point.avg_load_per_clear);
            const comfortY = yPct(point.comfortable_level);
            const ceilingY = yPct(point.ceiling_level);
            return (
              <div key={point.username}>
                {/* Ceiling whisker line */}
                {point.ceiling_level > point.comfortable_level && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line x1={x} y1={comfortY} x2={x} y2={ceilingY} stroke="#F59E0B" strokeOpacity={0.35} strokeWidth={0.3} strokeDasharray="0.8 0.8" />
                    <circle cx={x} cy={ceilingY} r={0.6} fill="#F59E0B" fillOpacity={0.5} />
                  </svg>
                )}
                {/* Avatar dot */}
                <div
                  className="absolute"
                  style={{ left: `${x}%`, top: `${comfortY}%`, transform: 'translate(-50%, -50%)', zIndex: isMe ? 30 : isActive ? 25 : 10 }}
                  onClick={() => setActivePoint(isActive ? null : point.username)}
                >
                  <div className={`rounded-full transition-transform duration-200 ${isMe ? 'ring-2 ring-offset-1 ring-offset-piu-dark' : ''} ${isActive ? 'scale-125' : ''}`}
                    style={isMe ? { '--tw-ring-color': tone.accent } : {}}
                  >
                    {point.avatar_url ? (
                      <img src={point.avatar_url} alt={point.username}
                        className={`rounded-full object-cover border border-piu-border/40 ${isMe ? 'w-7 h-7' : 'w-5 h-5'}`}
                      />
                    ) : (
                      <div className={`rounded-full border border-piu-border/40 flex items-center justify-center text-[7px] font-display font-bold text-gray-400 bg-piu-dark ${isMe ? 'w-7 h-7' : 'w-5 h-5'}`}>
                        {point.username.charAt(0)}
                      </div>
                    )}
                  </div>
                  {/* Tooltip on tap/hover — flip below when near top edge */}
                  {(isActive || undefined) && (
                    <div className={`absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none ${comfortY < 25 ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
                      <div className="bg-piu-card border border-piu-border/60 rounded-lg px-2 py-1 shadow-xl whitespace-nowrap">
                        <p className="text-[10px] font-display font-bold text-white">{point.username}</p>
                        <p className="text-[9px] text-gray-400">
                          {formatNumber(point.avg_load_per_clear)} load · {modePrefix}{point.comfortable_level} → {modePrefix}{point.ceiling_level}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Axis label — only y-axis since x-axis ticks are self-explanatory */}
        <span className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[8px] text-gray-600 font-display whitespace-nowrap pointer-events-none">Comfort Level</span>
      </div>
    </div>
  );
}

// --- Population Explainer Modals ---

function PopulationPercentileHelpModal({ open, onClose, mode, profile, popData }) {
  if (!open) return null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border/50 bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-piu-border/40 bg-piu-card px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="font-display font-bold text-lg text-white">Population Percentile</h2>
            <p className="text-xs text-gray-400 mt-1">Where you rank among all tracked {modeLabel.toLowerCase()} players</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none mt-1">✕</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <ExplainerBlock
            title="The Running Analogy"
            body="Think of avg load/clear as your training pace. A runner who averages 4:30/km on their runs will beat one averaging 5:30/km in a race — regardless of how many total kilometers they run. Your avg load/clear captures the difficulty weight of each clear, not the quantity. It's your pace, not your mileage."
          />
          <ExplainerBlock
            title="What We Measure"
            body={`We compute the average training load per clear for every tracked player in ${modeLabel} mode who has at least 10 clears in the last 60 days. Each clear generates load points based on the level's base difficulty and the grade achieved. Higher levels and better grades generate more load per clear.`}
          />
          <ExplainerBlock
            title="How Percentile Works"
            body="If you're in the 85th percentile, your avg load/clear exceeds 85% of all tracked players. 'Top 15%' means only 15% of the community generates higher-quality clears than you on average. This normalizes for play frequency — a player who clears 200 easy songs and one who clears 20 hard songs are compared on difficulty weight, not volume."
          />
          <ExplainerBlock
            title="Statistical Foundation"
            body="This metric works because PIU's scoring system assigns exponentially higher base points to harder levels (Lv.20 = 650, Lv.22 = 880, Lv.24 = 1150). When you consistently clear harder charts, your average load per clear rises proportionally. The population ranking then places you against other players using the same scale."
          />
          <ExplainerBlock
            title="Caveats"
            body="The population is all Shinsa users who sync their plays — not all PIU players worldwide. Small populations can shift percentiles with each new user. As more players join and sync, the percentiles become more stable and meaningful."
          />
        </div>
      </div>
    </div>
  );
}

function MilestoneTargetHelpModal({ open, onClose, mode, milestone }) {
  if (!open) return null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  const modePrefix = mode === 'single' ? 'S' : 'D';
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border/50 bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-piu-border/40 bg-piu-card px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="font-display font-bold text-lg text-white">Next Milestone Target</h2>
            <p className="text-xs text-gray-400 mt-1">What your training numbers need to reach {modePrefix}{milestone?.target_level} comfort</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none mt-1">✕</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <ExplainerBlock
            title="The Running Analogy"
            body={`If avg load/clear is your pace, then milestone targets are like saying "to run a sub-3:00 marathon, you need to sustain 4:15/km." Each PIU level has a known load threshold from the scoring system, just like each marathon time has a required pace.`}
          />
          <ExplainerBlock
            title="Where Targets Come From"
            body={`Each level has a base point value in the scoring system (e.g., ${modePrefix}22 = 880, ${modePrefix}23 = 1,010, ${modePrefix}24 = 1,150). When your avg load/clear reaches that value, it means your typical clear effort matches the difficulty weight of that level at AA grade — which is the threshold for "comfortable" play.`}
          />
          <ExplainerBlock
            title="Why This Predicts Comfort Level"
            body="Across all tracked players, the ratio of avg load/clear to LEVEL_BASE_POINTS at their comfortable level falls consistently between 0.93× and 1.20×. In other words, the lookup table predicts comfortable level within ±1 for every player in our dataset. The milestone target is simply the next level's base point value."
          />
          {milestone && !milestone.already_met && (
            <ExplainerBlock
              title="Your Current Gap"
              body={`Your current avg load/clear is ${formatNumber(milestone.current_avg_load)}. To reach ${modePrefix}${milestone.target_level} comfort, you need ~${formatNumber(milestone.target_avg_load)} — a gap of ${formatNumber(milestone.gap_absolute)} points (+${Math.round(milestone.gap_percent)}%). This means sustaining higher-quality clears: either clearing harder charts, or achieving better grades on current charts.`}
            />
          )}
          <ExplainerBlock
            title="How To Close The Gap"
            body="There are two ways to raise your avg load/clear: (1) Clear harder charts — each level up adds significantly more load per clear due to the exponential base point curve. (2) Score better — an S grade generates 1.20× the load of an AA grade on the same chart. Both contribute, but pushing level difficulty tends to have the bigger impact."
          />
        </div>
      </div>
    </div>
  );
}

function CeilingPredictionHelpModal({ open, onClose, mode, ceiling }) {
  if (!open) return null;
  const modePrefix = mode === 'single' ? 'S' : 'D';
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border/50 bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-piu-border/40 bg-piu-card px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="font-display font-bold text-lg text-white">Predicted Ceiling</h2>
            <p className="text-xs text-gray-400 mt-1">Your peak pass level based on population patterns</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none mt-1">✕</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <ExplainerBlock
            title="The Running Analogy"
            body="Comfortable level is your sustainable race pace — what you can repeat day after day. Ceiling is your PR: the best you can do when everything clicks. Just as most runners' PRs tend to be a predictable margin above their training pace, we observe a remarkably consistent gap between comfort and ceiling across all tracked players."
          />
          <ExplainerBlock
            title="The Observation"
            body={`Across all tracked Shinsa players, we observe that players whose comfortable level is N tend to have their highest reliable passes at N+2. For example: a player comfortable at ${modePrefix}22 typically has ceiling passes at ${modePrefix}24. A player comfortable at ${modePrefix}20 peaks around ${modePrefix}22. This holds across the entire skill spectrum in our dataset.`}
          />
          <ExplainerBlock
            title="Why +2 Levels?"
            body="PIU's difficulty curve is exponential — each level adds roughly 10-15% more base difficulty. Two levels above comfort represents a zone where peak form, favorable chart selection, and strong execution can overcome the difficulty gap. At +3 levels, the gap becomes too large for consistent passes. The +2 rule emerges naturally from the scoring curve's shape."
          />
          <ExplainerBlock
            title="How To Raise Your Ceiling"
            body="Since ceiling tracks comfort + 2, the only way to raise it is to raise your comfortable level. That means sustaining higher avg load/clear over time — clearing harder charts consistently, not just spiking one lucky pass. As your comfort creeps up, your ceiling follows automatically."
          />
          <ExplainerBlock
            title="Limitations"
            body="This is a statistical prediction, not a guarantee. Individual chart difficulty varies widely within a level. A player might pass one specific Lv.25 but fail most others. The +2 rule describes the typical range where passes become possible, not where they're guaranteed."
          />
        </div>
      </div>
    </div>
  );
}

function PlayerLandscapeHelpModal({ open, onClose, mode }) {
  if (!open) return null;
  const modeLabel = mode === 'single' ? 'Singles' : 'Doubles';
  const modePrefix = mode === 'single' ? 'S' : 'D';
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-piu-border/50 bg-piu-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-piu-border/40 bg-piu-card px-5 py-4 rounded-t-2xl">
          <div>
            <h2 className="font-display font-bold text-lg text-white">Player Landscape</h2>
            <p className="text-xs text-gray-400 mt-1">How all tracked {modeLabel.toLowerCase()} players compare</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none mt-1">✕</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <ExplainerBlock
            title="What This Chart Shows"
            body={`Each avatar represents a tracked ${modeLabel.toLowerCase()} player. The horizontal position shows their average training load per clear — how much difficulty weight each clear contributes. The vertical position shows their comfortable level — the highest level they can consistently clear at AA or better. Your avatar has a highlighted ring.`}
          />
          <ExplainerBlock
            title="The Regression Line"
            body="The dashed trend line is a least-squares regression fit to all data points. It shows the overall relationship between avg load/clear and comfortable level. The R² value measures how tightly the data clusters around this line — closer to 1.00 means stronger correlation. In our data, R² is typically above 0.85, meaning avg load/clear is a very reliable predictor of comfortable level."
          />
          <ExplainerBlock
            title="Ceiling Whiskers"
            body="The small amber dots above each avatar show that player's ceiling — the highest level they've cleared. The dashed line connecting comfort to ceiling visualizes the gap. Across the population, this gap is remarkably consistent at roughly +2 levels, regardless of skill tier."
          />
          <ExplainerBlock
            title="The Running Analogy"
            body={`This chart is like plotting all runners in a club by their average training pace (x-axis) versus the marathon time they can sustain (y-axis). Faster training pace reliably predicts faster race times. Similarly, higher avg load/clear reliably predicts higher comfortable level in ${modeLabel.toLowerCase()}.`}
          />
          <ExplainerBlock
            title="How To Move Right And Up"
            body="To shift your position on this chart, you need to raise your avg load/clear over time. That means consistently clearing harder charts (pushing into your frontier levels) and scoring well on them. As your avg load/clear rises, your comfortable level follows the regression line upward."
          />
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
  const [showTrainingBasicsHelp, setShowTrainingBasicsHelp] = useState(false);
  const [showPassCeilingHelp, setShowPassCeilingHelp] = useState(false);
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const [activeMetricHelp, setActiveMetricHelp] = useState('');
  const [popData, setPopData] = useState(null);
  const [showPercentileHelp, setShowPercentileHelp] = useState(false);
  const [showMilestoneHelp, setShowMilestoneHelp] = useState(false);
  const [showCeilingHelp, setShowCeilingHelp] = useState(false);
  const [showLandscapeHelp, setShowLandscapeHelp] = useState(false);

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

  // Load population stats after main data is available
  useEffect(() => {
    if (!user?.id || !data) return;
    let cancelled = false;
    getPiugameTrainingPopulation(user.id)
      .then((result) => {
        if (!cancelled) setPopData(result);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, data]);

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
  const modePopData = popData?.[mode] || null;
  const modeColor = mode === 'single' ? '#ff3366' : mode === 'double' ? '#22C55E' : '#A855F7';
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
          <p className="mt-0.5 text-[10px] text-gray-500 whitespace-nowrap">Tracked Training Load</p>
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
            <EWMAChart
              data={data.ewma_history}
              mode={mode}
              onExplain={() => setShowTrainingBasicsHelp(true)}
            />
          )}

          {/* Intensity Trend (Training Ratio) */}
          {data.ewma_history?.length > 0 && profile && (
            <IntensityTrendCard
              data={data.ewma_history}
              mode={mode}
              profile={profile}
            />
          )}

          {/* Daily Load Chart */}
          {data.daily_load_history?.length > 0 && (
            <DailyLoadChart
              data={data.daily_load_history}
              mode={mode}
              onExplain={() => setShowTrainingBasicsHelp(true)}
            />
          )}

          {/* Grade Predictions */}
          {showPredictions && (
            <GradePredictionTable
              predictions={profile.grade_predictions}
              comfortableLevel={profile.comfortable_level}
            />
          )}

          {/* Population Insights */}
          {showPredictions && modePopData && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-display">
                Population Insights
              </p>
              <div className="grid gap-3 grid-cols-3">
                <PopulationPercentileCard
                  percentile={modePopData.percentile}
                  mode={mode}
                  avgPlayLoad={profile.avg_play_load}
                  onExplain={() => setShowPercentileHelp(true)}
                />
                <MilestoneTargetCard
                  milestone={modePopData.milestone}
                  mode={mode}
                  onExplain={() => setShowMilestoneHelp(true)}
                />
                <CeilingPredictionCard
                  ceiling={modePopData.ceiling}
                  mode={mode}
                  onExplain={() => setShowCeilingHelp(true)}
                />
              </div>
              <PopulationScatterChart
                scatter={modePopData.scatter}
                mode={mode}
                onExplain={() => setShowLandscapeHelp(true)}
              />
            </div>
          )}

          {/* How It Works footer */}
          <div className="flex justify-center pt-2 pb-4">
            <button
              type="button"
              onClick={() => setShowTrainingBasicsHelp(true)}
              className="text-[11px] font-display font-bold uppercase tracking-wide text-gray-600 hover:text-gray-400 transition-colors"
            >
              How does training load work?
            </button>
          </div>

          <PassCeilingHelpModal
            open={showPassCeilingHelp}
            onClose={() => setShowPassCeilingHelp(false)}
            mode={mode}
            profile={profile}
          />
          <TrainingBasicsModal
            open={showTrainingBasicsHelp}
            onClose={() => setShowTrainingBasicsHelp(false)}
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
          <PopulationPercentileHelpModal
            open={showPercentileHelp}
            onClose={() => setShowPercentileHelp(false)}
            mode={mode}
            profile={profile}
            popData={modePopData}
          />
          <MilestoneTargetHelpModal
            open={showMilestoneHelp}
            onClose={() => setShowMilestoneHelp(false)}
            mode={mode}
            milestone={modePopData?.milestone}
          />
          <CeilingPredictionHelpModal
            open={showCeilingHelp}
            onClose={() => setShowCeilingHelp(false)}
            mode={mode}
            ceiling={modePopData?.ceiling}
          />
          <PlayerLandscapeHelpModal
            open={showLandscapeHelp}
            onClose={() => setShowLandscapeHelp(false)}
            mode={mode}
          />
        </>
      )}
    </div>
  );
}
