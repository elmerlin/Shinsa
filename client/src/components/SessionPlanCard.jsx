import React, { useState } from 'react';

const FEELING_META = {
  ambitious: { emoji: '\uD83D\uDD25', label: 'Ambitious', color: 'bg-red-500/20 border-red-500/40 text-red-300' },
  normal: { emoji: '\uD83D\uDE0E', label: 'Normal', color: 'bg-blue-500/20 border-blue-500/40 text-blue-300' },
  lethargic: { emoji: '\uD83D\uDE34', label: 'Lethargic', color: 'bg-purple-500/20 border-purple-500/40 text-purple-300' },
};

const MODE_META = {
  single: { label: 'Singles', color: 'bg-red-500/20 border-red-500/40 text-red-300' },
  double: { label: 'Doubles', color: 'bg-green-500/20 border-green-500/40 text-green-300' },
  both: { label: 'Both', color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' },
};

function SongRow({ song, index }) {
  const isSingle = song.mode === 'Single';
  const badgeColor = isSingle ? 'bg-red-600' : 'bg-green-600';

  return (
    <div className="flex items-start gap-2 rounded-lg border border-piu-border/30 bg-piu-dark/30 p-2">
      <div className="text-[10px] text-gray-500 font-mono w-4 pt-1 shrink-0">{index + 1}</div>
      <div className="relative shrink-0">
        {song.jacket_url ? (
          <img src={song.jacket_url} alt="" className="w-9 h-9 rounded object-cover" />
        ) : (
          <div className="w-9 h-9 rounded bg-piu-dark flex items-center justify-center font-display font-bold text-xs text-gray-500">
            {(song.title || '?')[0]}
          </div>
        )}
        <span className={`absolute -bottom-1 -right-1 min-w-[16px] h-[14px] px-1 rounded text-[8px] flex items-center justify-center font-display font-bold text-white leading-none ${badgeColor}`}>
          {song.level}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-display font-bold leading-tight text-gray-200 line-clamp-1">{song.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-display font-bold ${isSingle ? 'text-red-400' : 'text-green-400'}`}>
            {isSingle ? 'S' : 'D'}{song.level}
          </span>
          {song.best_score != null && (
            <span className="text-[10px] text-gray-400 font-mono">
              Best: {parseInt(song.best_score, 10).toLocaleString()}
              {song.best_grade ? ` (${song.best_grade})` : ''}
            </span>
          )}
          {song.best_score == null && (
            <span className="text-[10px] text-yellow-400/80 font-display">New!</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, subtitle, songs, borderColor, bgGradient, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!songs || songs.length === 0) return null;

  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${bgGradient} via-transparent to-transparent overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="text-left">
          <p className="text-[11px] font-display font-bold uppercase tracking-wider text-cyan-300">{title}</p>
          {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-display font-bold uppercase tracking-wide text-cyan-300/90">
          <span>{songs.length} charts</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="space-y-1 px-3 pb-2.5">
          {songs.map((song, idx) => (
            <SongRow key={`${song.title}-${song.mode}-${song.level}-${idx}`} song={song} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionPlanCard({ plan, className = '', defaultScoringExpanded = true, defaultPassingExpanded = true }) {
  if (!plan) return null;

  const feelingMeta = FEELING_META[plan.feeling] || FEELING_META.normal;
  const modeMeta = MODE_META[plan.chartMode] || MODE_META.both;
  const dateLabel = plan.generatedAt
    ? new Date(plan.generatedAt).toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div className={`rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-cyan-500/5 to-transparent p-3 space-y-2.5 ${className}`.trim()}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-display font-bold uppercase tracking-wider text-amber-300">Session Plan</p>
          {dateLabel && <p className="text-[10px] text-gray-400 mt-0.5">{dateLabel}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-display font-bold border ${feelingMeta.color}`}>
            {feelingMeta.emoji} {feelingMeta.label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-display font-bold border ${modeMeta.color}`}>
            {modeMeta.label}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2 py-1.5">
          <p className="text-[9px] text-gray-500 font-display uppercase tracking-wide">Pumbility</p>
          <p className="text-xs font-display font-bold text-gray-100">{(plan.pumbility || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2 py-1.5">
          <p className="text-[9px] text-gray-500 font-display uppercase tracking-wide">Scoring Lv</p>
          <p className="text-xs font-display font-bold text-amber-300">{plan.adjustedScoringLevel}</p>
        </div>
        <div className="rounded-lg border border-piu-border/30 bg-piu-dark/50 px-2 py-1.5">
          <p className="text-[9px] text-gray-500 font-display uppercase tracking-wide">Passing Lv</p>
          <p className="text-xs font-display font-bold text-emerald-300">{plan.adjustedPassingLevel}</p>
        </div>
      </div>

      {/* Skills */}
      {plan.skillsTrain.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {plan.skillsTrain.map((slug) => (
            <span key={slug} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-display">
              {slug.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Activation - always expanded */}
      <CollapsibleSection
        title="Activation"
        subtitle="Get your body moving"
        songs={plan.activation}
        borderColor="border-amber-400/20"
        bgGradient="from-amber-500/5"
        defaultExpanded
      />

      {/* Scoring - collapsible */}
      <CollapsibleSection
        title="Scoring"
        subtitle="Push for higher scores"
        songs={plan.scoring}
        borderColor="border-cyan-400/20"
        bgGradient="from-cyan-500/5"
        defaultExpanded={defaultScoringExpanded}
      />

      {/* Passing - collapsible */}
      <CollapsibleSection
        title="Passing"
        subtitle="Challenge yourself to clear"
        songs={plan.passing}
        borderColor="border-emerald-400/20"
        bgGradient="from-emerald-500/5"
        defaultExpanded={defaultPassingExpanded}
      />
    </div>
  );
}
