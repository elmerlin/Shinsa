import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlayerIdentitySummary } from '../utils/api';

const VIEW_OPTIONS = [
  { key: 'all', label: 'All-time' },
  { key: 'recent', label: 'Recent form' },
];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatNumber(value) {
  return (parseInt(value, 10) || 0).toLocaleString();
}

function formatChartDate(value) {
  if (!value) return '';
  const date = new Date(String(value).endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function getModeAccent(mode) {
  if (mode === 'Double') {
    return {
      text: 'text-emerald-300',
      border: 'border-emerald-400/35',
      bg: 'bg-emerald-400/10',
      fill: 'linear-gradient(135deg, rgba(74,222,128,0.95), rgba(5,150,105,0.45))',
    };
  }
  return {
    text: 'text-rose-200',
    border: 'border-rose-400/35',
    bg: 'bg-rose-400/10',
    fill: 'linear-gradient(135deg, rgba(251,113,133,0.96), rgba(190,24,93,0.46))',
  };
}

function getGradeTone(grade) {
  const normalized = String(grade || '').toUpperCase();
  if (normalized === 'SSS+') return 'text-sky-300';
  if (normalized === 'SSS') return 'text-sky-400';
  if (normalized.includes('SS')) return 'text-piu-gold';
  if (normalized.includes('S')) return 'text-amber-300';
  if (normalized.includes('AAA')) return 'text-piu-silver';
  if (normalized.includes('AA')) return 'text-piu-bronze';
  return 'text-gray-300';
}

function getTileSpanClass(index) {
  if (index === 0 || index === 5) return 'col-span-2 row-span-2';
  return 'col-span-1 row-span-1';
}

function getIdentityArchetype(summary, view) {
  const dominantMode = summary?.mode_split?.dominant_mode || 'Balanced';
  const homeLabel = summary?.summary?.home_label || '';
  const stronghold = summary?.sss_strongholds?.[0] || null;
  const sssCharts = parseInt(summary?.totals?.sss_charts, 10) || 0;
  const passedCharts = parseInt(summary?.totals?.passed_charts, 10) || 0;

  if (view === 'recent') {
    if (dominantMode === 'Single') {
      return {
        title: sssCharts > 0 ? 'Current singles heat' : 'Current singles push',
        detail: stronghold
          ? `Recent form is concentrating around ${stronghold.label}.`
          : `Recent passing charts are leaning into ${homeLabel || 'Singles lanes'}.`,
        tone: 'rose',
      };
    }
    if (dominantMode === 'Double') {
      return {
        title: sssCharts > 0 ? 'Current doubles heat' : 'Current doubles push',
        detail: stronghold
          ? `Recent form is concentrating around ${stronghold.label}.`
          : `Recent passing charts are leaning into ${homeLabel || 'Doubles lanes'}.`,
        tone: 'emerald',
      };
    }
    return {
      title: 'Current dual-pad run',
      detail: stronghold
        ? `Recent form is balanced, with the cleanest pocket at ${stronghold.label}.`
        : 'Recent passing charts are spread across both pads.',
      tone: 'sky',
    };
  }

  if (dominantMode === 'Single') {
    if (sssCharts >= 10) {
      return {
        title: 'Singles precision hunter',
        detail: stronghold
          ? `The biggest trophy stack sits in ${stronghold.label}.`
          : `This profile peaks around ${homeLabel || 'Singles folders'}.`,
        tone: 'rose',
      };
    }
    if (passedCharts >= 120) {
      return {
        title: 'Singles route grinder',
        detail: `A deep Singles base built around ${homeLabel || 'core singles folders'}.`,
        tone: 'rose',
      };
    }
    return {
      title: 'Singles builder',
      detail: `Most of the profile’s growth is taking shape on ${homeLabel || 'Singles charts'}.`,
      tone: 'rose',
    };
  }

  if (dominantMode === 'Double') {
    if (sssCharts >= 10) {
      return {
        title: 'Doubles route hunter',
        detail: stronghold
          ? `The cleanest Doubles trophies pile up in ${stronghold.label}.`
          : `This profile peaks around ${homeLabel || 'Doubles folders'}.`,
        tone: 'emerald',
      };
    }
    if (passedCharts >= 120) {
      return {
        title: 'Doubles pad specialist',
        detail: `A deep Doubles base built around ${homeLabel || 'core doubles folders'}.`,
        tone: 'emerald',
      };
    }
    return {
      title: 'Doubles builder',
      detail: `Most of the profile’s growth is taking shape on ${homeLabel || 'Doubles charts'}.`,
      tone: 'emerald',
    };
  }

  if (sssCharts >= 12) {
    return {
      title: 'Dual-pad chart collector',
      detail: stronghold
        ? `The profile stays balanced, but ${stronghold.label} is the brightest trophy pocket.`
        : 'The profile stays balanced across both pads, with a broad high-end spread.',
      tone: 'sky',
    };
  }

  return {
    title: 'Dual-pad all-rounder',
    detail: homeLabel
      ? `Strength is spread across both pads, with home folders around ${homeLabel}.`
      : 'Strength is spread across both pads without a single dominant lane.',
    tone: 'sky',
  };
}

function getIdentityShiftInsight(allSummary, recentSummary) {
  const recentHasData = (recentSummary?.mode_split?.total_strength || 0) > 0
    || (recentSummary?.signature_jackets?.length || 0) > 0
    || (recentSummary?.home_levels?.length || 0) > 0;
  if (!recentHasData) {
    return {
      title: 'Recent window is quiet',
      detail: `No passing charts landed in the last ${recentSummary?.timeframe?.window_days || 90} days.`,
      tone: 'gray',
    };
  }

  const allMode = allSummary?.mode_split?.dominant_mode || 'Balanced';
  const recentMode = recentSummary?.mode_split?.dominant_mode || 'Balanced';
  const allHome = allSummary?.summary?.home_label || '';
  const recentHome = recentSummary?.summary?.home_label || '';
  const allStronghold = allSummary?.sss_strongholds?.[0]?.label || '';
  const recentStronghold = recentSummary?.sss_strongholds?.[0]?.label || '';

  if (allMode !== recentMode) {
    if (recentMode === 'Single') {
      return {
        title: 'Swinging into Singles',
        detail: `Recent form is tilting away from the all-time ${String(allMode).toLowerCase()} profile.`,
        tone: 'rose',
      };
    }
    if (recentMode === 'Double') {
      return {
        title: 'Swinging into Doubles',
        detail: `Recent form is tilting away from the all-time ${String(allMode).toLowerCase()} profile.`,
        tone: 'emerald',
      };
    }
    return {
      title: 'Leveling back out',
      detail: 'Recent form looks more balanced than the all-time profile.',
      tone: 'sky',
    };
  }

  if (allHome && recentHome && allHome !== recentHome) {
    return {
      title: 'Home range is moving',
      detail: `The center of gravity has shifted from ${allHome} to ${recentHome}.`,
      tone: recentMode === 'Double' ? 'emerald' : recentMode === 'Single' ? 'rose' : 'sky',
    };
  }

  if (allStronghold && recentStronghold && allStronghold !== recentStronghold) {
    return {
      title: 'New hot spot',
      detail: `The cleanest recent pocket moved from ${allStronghold} to ${recentStronghold}.`,
      tone: recentMode === 'Double' ? 'emerald' : recentMode === 'Single' ? 'rose' : 'sky',
    };
  }

  return {
    title: 'Holding the same shape',
    detail: 'Recent form still looks a lot like the full long-term profile.',
    tone: recentMode === 'Double' ? 'emerald' : recentMode === 'Single' ? 'rose' : 'sky',
  };
}

function getInsightToneClasses(tone) {
  if (tone === 'rose') {
    return {
      border: 'border-rose-400/30',
      bg: 'bg-rose-500/8',
      text: 'text-rose-100',
      eyebrow: 'text-rose-200/80',
    };
  }
  if (tone === 'emerald') {
    return {
      border: 'border-emerald-400/30',
      bg: 'bg-emerald-500/8',
      text: 'text-emerald-100',
      eyebrow: 'text-emerald-200/80',
    };
  }
  if (tone === 'sky') {
    return {
      border: 'border-sky-400/30',
      bg: 'bg-sky-500/8',
      text: 'text-sky-100',
      eyebrow: 'text-sky-200/80',
    };
  }
  return {
    border: 'border-white/10',
    bg: 'bg-white/[0.03]',
    text: 'text-white',
    eyebrow: 'text-gray-400',
  };
}

function IdentityViewToggle({ view, onChange, meta, loading }) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="inline-flex rounded-full border border-piu-border/60 bg-[#0b1322]/85 p-1">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-display font-black transition-colors ${
              view === option.key
                ? 'bg-piu-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            aria-pressed={view === option.key}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="max-w-[18rem] text-[11px] leading-relaxed text-gray-500 sm:text-right">
        {loading && meta ? 'Refreshing identity snapshot...' : (meta?.description || '')}
      </p>
    </div>
  );
}

function InsightCard({ eyebrow, title, detail, tone = 'gray' }) {
  const toneClasses = getInsightToneClasses(tone);
  return (
    <div className={`rounded-[22px] border px-4 py-3 ${toneClasses.border} ${toneClasses.bg}`}>
      <p className={`text-[10px] font-display font-black uppercase tracking-[0.24em] ${toneClasses.eyebrow}`}>
        {eyebrow}
      </p>
      <p className={`mt-2 text-sm font-display font-black ${toneClasses.text}`}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-400">
        {detail}
      </p>
    </div>
  );
}

function ModeBiasField({ summary }) {
  const singleShare = clamp01(summary?.mode_split?.single_share);
  const doubleShare = clamp01(summary?.mode_split?.double_share);
  const leftWidth = `${Math.max(24, Math.round(singleShare * 100))}%`;
  const rightWidth = `${Math.max(24, Math.round(doubleShare * 100))}%`;
  const dominantMode = summary?.mode_split?.dominant_mode || 'Balanced';

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-piu-border/60 bg-[#09101d] px-4 py-4 sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div
          className="absolute inset-y-3 left-3 rounded-[24px] blur-[1px]"
          style={{
            width: leftWidth,
            background: getModeAccent('Single').fill,
            clipPath: 'polygon(0 12%, 88% 0, 100% 50%, 88% 100%, 0 88%, 12% 50%)',
          }}
        />
        <div
          className="absolute inset-y-3 right-3 rounded-[24px] blur-[1px]"
          style={{
            width: rightWidth,
            background: getModeAccent('Double').fill,
            clipPath: 'polygon(12% 0, 100% 12%, 88% 50%, 100% 88%, 12% 100%, 0 50%)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.16),transparent_48%)]" />
      </div>

      <div className="relative z-10 flex min-h-[220px] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.3em] text-piu-accent/80">
              Arcade DNA
            </p>
            <h3 className="mt-2 text-xl font-display font-black text-white sm:text-2xl">
              {summary?.summary?.dominant_label || 'Player identity'}
            </h3>
            <p className="mt-2 max-w-[22rem] text-xs leading-relaxed text-slate-300 sm:text-sm">
              {summary?.summary?.detail_label || ''}
            </p>
          </div>

          <div className="hidden shrink-0 sm:block text-right">
            <p className="text-[10px] font-display font-black uppercase tracking-[0.22em] text-gray-500">
              SSS charts
            </p>
            <p className="mt-1 text-2xl font-display font-black text-white">
              {formatNumber(summary?.totals?.sss_charts)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 pt-4 sm:grid-cols-3 sm:items-end">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between text-[10px] font-display font-black uppercase tracking-[0.18em] text-gray-300">
              <span className="text-rose-200">Singles {formatPercent(singleShare)}</span>
              <span className="text-emerald-200">Doubles {formatPercent(doubleShare)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
              <div className="flex h-full">
                <div
                  className="h-full bg-gradient-to-r from-rose-300 via-rose-400 to-fuchsia-500"
                  style={{ width: `${Math.max(6, singleShare * 100)}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-500"
                  style={{ width: `${Math.max(6, doubleShare * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-gray-500">
              Signature feel
            </p>
            <p className={`mt-1 text-sm font-display font-black ${
              dominantMode === 'Single'
                ? 'text-rose-200'
                : dominantMode === 'Double'
                  ? 'text-emerald-200'
                  : 'text-sky-200'
            }`}>
              {summary?.summary?.home_label || 'Still taking shape'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeColumn({ title, mode, details, timeframeKey }) {
  const accent = getModeAccent(mode);
  const topLevels = Array.isArray(details?.top_levels) ? details.top_levels : [];
  const compLevel = parseInt(details?.competitive_level?.level, 10) || 0;
  const metricLabel = timeframeKey === 'recent' ? 'Peak' : 'Competitive';
  const metricValue = timeframeKey === 'recent'
    ? (topLevels[0]?.label || '--')
    : (compLevel > 0 ? `${mode === 'Double' ? 'D' : 'S'}${compLevel}` : '--');

  return (
    <section className="border-t border-white/8 pt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`text-[11px] font-display font-black uppercase tracking-[0.22em] ${accent.text}`}>
            {title}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {details?.home_range || 'No established home range yet'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-gray-500">
            {metricLabel}
          </p>
          <p className={`mt-1 text-lg font-display font-black ${accent.text}`}>
            {metricValue}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {topLevels.length > 0 ? topLevels.map((row) => (
          <div key={`${mode}-${row.level}`} className="flex items-center gap-3">
            <div className="w-11 shrink-0">
              <span className={`text-xs font-display font-black ${accent.text}`}>{row.label}</span>
            </div>
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full ${mode === 'Double' ? 'bg-gradient-to-r from-emerald-300 to-teal-500' : 'bg-gradient-to-r from-rose-300 to-fuchsia-500'}`}
                  style={{ width: `${Math.max(10, clamp01(row.share) * 100)}%` }}
                />
              </div>
            </div>
            <div className="w-16 shrink-0 text-right">
              <p className="text-[11px] font-mono text-gray-200">{formatNumber(row.cleared_charts)}</p>
              <p className={`text-[10px] font-display font-black ${getGradeTone(row.average_grade)}`}>
                {row.average_grade || '--'}
              </p>
            </div>
          </div>
        )) : (
          <p className="text-sm text-gray-500">No synced passing charts yet.</p>
        )}
      </div>
    </section>
  );
}

function StrongholdRow({ strongholds, selectedKey, onSelect }) {
  if (!Array.isArray(strongholds) || strongholds.length === 0) {
    return (
      <section className="border-t border-white/8 pt-4">
        <p className="text-[11px] font-display font-black uppercase tracking-[0.22em] text-gray-500">
          SSS Strongholds
        </p>
        <p className="mt-2 text-sm text-gray-500">No SSS cluster has formed yet.</p>
      </section>
    );
  }

  return (
    <section className="border-t border-white/8 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-display font-black uppercase tracking-[0.22em] text-gray-500">
            SSS Strongholds
          </p>
          <p className="mt-1 text-[11px] text-gray-500">Tap a stronghold to inspect the charts behind it</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {strongholds.map((cluster) => {
          const accent = getModeAccent(cluster.mode);
          const isSelected = selectedKey === cluster.key;
          return (
            <button
              key={cluster.key}
              type="button"
              onClick={() => onSelect(cluster.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors ${
                isSelected
                  ? `${accent.border} ${accent.bg} ring-1 ring-white/35`
                  : `${accent.border} ${accent.bg} hover:border-white/40`
              }`}
            >
              <span className={`text-xs font-display font-black ${accent.text}`}>{cluster.label}</span>
              <span className="text-xs font-mono text-gray-200">{cluster.count}</span>
              <span className="text-[10px] text-gray-500">{formatNumber(cluster.average_score)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StrongholdDetailSheet({ cluster, timeframeLabel, onClose }) {
  useEffect(() => {
    if (!cluster) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cluster, onClose]);

  if (!cluster) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <div
          className="w-full max-w-xl overflow-hidden rounded-t-[28px] border border-piu-border bg-[#08111d] shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:rounded-[28px]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-white/8 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-display font-black uppercase tracking-[0.24em] text-gray-500">
                  {timeframeLabel} stronghold
                </p>
                <h3 className={`mt-2 text-xl font-display font-black ${cluster.mode === 'Double' ? 'text-emerald-200' : 'text-rose-100'}`}>
                  {cluster.label}
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  {cluster.count} SSS chart{cluster.count === 1 ? '' : 's'} with an average score of {formatNumber(cluster.average_score)}.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-piu-border/60 px-3 py-1 text-[11px] font-display font-black text-gray-300 transition-colors hover:border-white/35 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-2">
              {(cluster.jackets || []).map((item) => (
                <Link
                  key={item.chart_id}
                  to={item.chart_id ? `/songs/chart/${item.chart_id}` : '#'}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/18 hover:bg-white/[0.05]"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#101726]">
                    {item.jacket_url ? (
                      <img
                        src={item.jacket_url}
                        alt={item.title || 'Song jacket'}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-lg font-black text-gray-500">
                        {(item.title || '?').charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-display font-black text-white">{item.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <span className={item.mode === 'Double' ? 'text-emerald-200' : 'text-rose-200'}>{item.label}</span>
                      <span className={getGradeTone(item.grade)}>{item.grade}</span>
                      <span>{formatNumber(item.score)}</span>
                      {item.date_played ? <span>Played {formatChartDate(item.date_played)}</span> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerIdentityMapPanel({ userId }) {
  const [view, setView] = useState('all');
  const [summaries, setSummaries] = useState({ all: null, recent: null });
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedChartId, setSelectedChartId] = useState('');
  const [selectedStrongholdKey, setSelectedStrongholdKey] = useState('');

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setReady(false);

    Promise.all([
      getPlayerIdentitySummary(userId, { view: 'all' }).catch(() => null),
      getPlayerIdentitySummary(userId, { view: 'recent' }).catch(() => null),
    ])
      .then(([allSummary, recentSummary]) => {
        if (cancelled) return;
        setSummaries({
          all: allSummary || null,
          recent: recentSummary || null,
        });
        if (!recentSummary && view === 'recent') {
          setView('all');
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const data = summaries?.[view] || summaries?.all || summaries?.recent || null;
  const allSummary = summaries?.all || null;
  const recentSummary = summaries?.recent || null;

  useEffect(() => {
    if (!data?.signature_jackets?.length) {
      setSelectedChartId('');
      return;
    }
    setSelectedChartId(String(data.signature_jackets[0].chart_id));
  }, [data]);

  useEffect(() => {
    const firstStronghold = Array.isArray(data?.sss_strongholds) ? data.sss_strongholds[0]?.key || '' : '';
    setSelectedStrongholdKey(firstStronghold);
  }, [data, view]);

  useEffect(() => {
    if (!data) return undefined;
    const handle = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(handle);
  }, [data]);

  const selectedJacket = useMemo(() => {
    const list = Array.isArray(data?.signature_jackets) ? data.signature_jackets : [];
    if (list.length === 0) return null;
    return list.find((item) => String(item.chart_id) === String(selectedChartId)) || list[0];
  }, [data, selectedChartId]);

  const selectedStronghold = useMemo(() => {
    const list = Array.isArray(data?.sss_strongholds) ? data.sss_strongholds : [];
    return list.find((item) => item.key === selectedStrongholdKey) || null;
  }, [data, selectedStrongholdKey]);

  const hasIdentityData = (data?.mode_split?.total_strength || 0) > 0
    || (data?.signature_jackets?.length || 0) > 0
    || (data?.home_levels?.length || 0) > 0;
  const headerTitle = hasIdentityData
    ? (data?.summary?.dominant_label || 'Profile snapshot')
    : (view === 'recent' ? 'Recent form unavailable' : 'Identity map unavailable');
  const headerNarrative = hasIdentityData
    ? (data?.summary?.narrative || 'A visual read on this player profile.')
    : (view === 'recent'
      ? `No passing charts landed inside the current ${data?.timeframe?.window_days || 90}-day window.`
      : 'This profile needs synced passing charts before the identity map can take shape.');
  const archetype = getIdentityArchetype(data, data?.timeframe?.key || view);
  const shiftInsight = getIdentityShiftInsight(allSummary, recentSummary);

  if (!userId) return null;

  return (
    <>
      <div className="card relative overflow-hidden p-0">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-rose-500/12 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>

        <div
          className={`relative p-4 sm:p-5 transition-all duration-500 ease-out motion-reduce:transition-none ${
            ready ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 motion-reduce:translate-y-0'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
            <p className="text-[10px] font-display font-black uppercase tracking-[0.28em] text-piu-accent/80">
              Player Identity Map
            </p>
            <h2 className="mt-2 text-lg font-display font-black text-white sm:text-xl">
              {headerTitle}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              {headerNarrative}
            </p>
          </div>

            <IdentityViewToggle
              view={view}
              onChange={setView}
              meta={data?.timeframe}
              loading={false}
            />
          </div>

          {loading && !data ? (
            <div className="mt-5 animate-pulse space-y-4">
              <div className="h-28 rounded-[28px] bg-white/5" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-24 rounded-2xl bg-white/5" />
                <div className="h-24 rounded-2xl bg-white/5" />
              </div>
              <div className="h-32 rounded-2xl bg-white/5" />
            </div>
          ) : !hasIdentityData ? (
            <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-5">
              <p className="text-sm font-display font-black text-white">
                {view === 'recent' ? 'No recent form snapshot yet.' : 'No identity map data yet.'}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                {view === 'recent'
                  ? `There are no passing charts in the current ${data?.timeframe?.window_days || 90}-day window. Switch back to All-time to see the full profile shape.`
                  : 'This profile needs synced passing charts before the identity map can take shape.'}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 lg:grid-cols-2">
                <InsightCard
                  eyebrow="Archetype"
                  title={archetype.title}
                  detail={archetype.detail}
                  tone={archetype.tone}
                />
                <InsightCard
                  eyebrow="Current Shift"
                  title={shiftInsight.title}
                  detail={shiftInsight.detail}
                  tone={shiftInsight.tone}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <ModeBiasField summary={data} />

                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
                  <ModeColumn
                    title="Singles Field"
                    mode="Single"
                    details={data?.mode_split?.single}
                    timeframeKey={data?.timeframe?.key}
                  />
                  <ModeColumn
                    title="Doubles Field"
                    mode="Double"
                    details={data?.mode_split?.double}
                    timeframeKey={data?.timeframe?.key}
                  />
                </div>

                <StrongholdRow
                  strongholds={data?.sss_strongholds}
                  selectedKey={selectedStrongholdKey}
                  onSelect={setSelectedStrongholdKey}
                />
              </div>

              <div className="border-t border-white/8 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-display font-black uppercase tracking-[0.22em] text-gray-500">
                      SSS Mosaic
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      Signature jackets from the cleanest part of the profile
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-500">{formatNumber(data?.totals?.sss_charts)} total SSS / SSS+</p>
                    {selectedStronghold ? (
                      <p className="mt-1 text-[10px] text-gray-500">
                        Focused on <span className="font-display font-black text-piu-accent">{selectedStronghold.label}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid auto-rows-[56px] grid-cols-4 gap-2 sm:auto-rows-[64px] sm:grid-cols-6">
                  {(data?.signature_jackets || []).map((item, index) => {
                    const isSelected = String(item.chart_id) === String(selectedChartId);
                    const inSelectedStronghold = !selectedStrongholdKey || selectedStrongholdKey === item.stronghold_key;
                    return (
                      <button
                        key={item.chart_id}
                        type="button"
                        onClick={() => setSelectedChartId(String(item.chart_id))}
                        className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ease-out motion-reduce:transition-none ${
                          getTileSpanClass(index)
                        } ${
                          isSelected
                            ? 'border-white/70 ring-1 ring-piu-accent/65'
                            : inSelectedStronghold
                              ? 'border-white/10 hover:border-white/35'
                              : 'border-white/10 opacity-45 hover:opacity-75'
                        }`}
                      >
                        {item.jacket_url ? (
                          <img
                            src={item.jacket_url}
                            alt={item.title || 'Song jacket'}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading={index > 3 ? 'lazy' : 'eager'}
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#141b2f] to-[#090d19] font-display text-xl font-black text-gray-500">
                            {(item.title || '?').charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-display font-black ${
                            item.mode === 'Double'
                              ? 'border-emerald-300/40 bg-emerald-500/18 text-emerald-200'
                              : 'border-rose-300/40 bg-rose-500/18 text-rose-100'
                          }`}>
                            {item.label}
                          </span>
                          <span className={`text-[10px] font-display font-black ${getGradeTone(item.grade)}`}>
                            {item.grade}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedJacket ? (
                  <div className="mt-4 border-t border-white/8 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-display font-black text-white sm:text-base">
                          {selectedJacket.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                          <span className={selectedJacket.mode === 'Double' ? 'text-emerald-200' : 'text-rose-200'}>
                            {selectedJacket.label}
                          </span>
                          <span className={getGradeTone(selectedJacket.grade)}>{selectedJacket.grade}</span>
                          <span>{formatNumber(selectedJacket.score)}</span>
                          {selectedJacket.date_played ? <span>Played {formatChartDate(selectedJacket.date_played)}</span> : null}
                        </div>
                      </div>

                      {selectedJacket.chart_id ? (
                        <Link
                          to={`/songs/chart/${selectedJacket.chart_id}`}
                          className="inline-flex items-center rounded-full border border-piu-border/60 px-3 py-1.5 text-xs font-display font-black text-gray-200 transition-colors hover:border-piu-accent/60 hover:text-white"
                        >
                          Open chart
                        </Link>
                      ) : null}
                    </div>

                    {selectedJacket.stronghold_label ? (
                      <p className="mt-3 text-xs text-gray-400">
                        Stronghold: <span className="font-display font-black text-piu-accent">{selectedJacket.stronghold_label}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          )}
        </div>
      </div>

      <StrongholdDetailSheet
        cluster={selectedStronghold}
        timeframeLabel={data?.timeframe?.label || 'Identity'}
        onClose={() => setSelectedStrongholdKey('')}
      />
    </>
  );
}
