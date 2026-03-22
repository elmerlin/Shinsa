import React from 'react';
import { FORMAT_LABELS, FORMAT_DESCRIPTIONS, FORMAT_ICONS, ADVANCEMENT_TYPES } from '../../utils/tournamentConstants';

const FORMAT_COLORS = {
  round_robin: 'border-sky-400/40 bg-sky-500/8',
  pools: 'border-cyan-400/40 bg-cyan-500/8',
  single_elim: 'border-piu-gold/40 bg-piu-gold/8',
  double_elim: 'border-amber-400/40 bg-amber-500/8',
  gauntlet: 'border-piu-accent/40 bg-piu-accent/8',
  hour_of_power: 'border-emerald-400/40 bg-emerald-500/8',
  b15: 'border-violet-400/40 bg-violet-500/8',
};

const FORMAT_TEXT_COLORS = {
  round_robin: 'text-sky-300',
  pools: 'text-cyan-300',
  single_elim: 'text-piu-gold',
  double_elim: 'text-amber-300',
  gauntlet: 'text-piu-accent',
  hour_of_power: 'text-emerald-300',
  b15: 'text-violet-300',
};

function getConfigSummary(format, config) {
  switch (format) {
    case 'round_robin':
      return `${config.rounds || 3} rounds, Best of ${config.best_of || 3}`;
    case 'pools':
      return `${config.pool_count || 4} pools, ${config.rounds_per_pool || 1} round${(config.rounds_per_pool || 1) > 1 ? 's' : ''} each`;
    case 'single_elim':
      return `Best of ${config.best_of || 3}${config.third_place_match ? ', 3rd place match' : ''}`;
    case 'double_elim':
      return `Best of ${config.best_of || 3}${config.grand_final_reset ? ', grand final reset' : ''}`;
    case 'gauntlet':
      return `S${config.start_single_level || 19}→S${config.final_single_level || 24}`;
    case 'hour_of_power':
      return `${config.duration_minutes || 60} min, cumulative rating`;
    case 'b15':
      return `Best 15 scores, ${config.duration_minutes || 60} min window`;
    default:
      return '';
  }
}

function getAdvancementSummary(advancement) {
  if (!advancement || !advancement.type || advancement.type === 'all') return '';
  switch (advancement.type) {
    case 'top_n':
      return `Top ${advancement.count || 8} advance`;
    case 'per_pool_top_n':
      return `Top ${advancement.count || 2} per pool advance`;
    case 'threshold':
      return `${advancement.points || 0}+ points advance`;
    default:
      return '';
  }
}

export default function PhaseCard({
  phase,
  index,
  total,
  isExpanded,
  onToggle,
  onRemove,
  onMoveUp,
  onMoveDown,
  children,
}) {
  const format = phase.format || 'round_robin';
  const config = phase.config || {};
  const advancement = phase.advancement || {};
  const colorClass = FORMAT_COLORS[format] || FORMAT_COLORS.round_robin;
  const textColor = FORMAT_TEXT_COLORS[format] || FORMAT_TEXT_COLORS.round_robin;
  const configSummary = getConfigSummary(format, config);
  const advancementSummary = getAdvancementSummary(advancement);

  return (
    <div className="relative">
      {/* Connector line */}
      {index > 0 && (
        <div className="absolute left-6 -top-4 w-px h-4 bg-piu-border/60" />
      )}
      {index < total - 1 && (
        <div className="absolute left-6 -bottom-4 w-px h-4 bg-piu-border/60" />
      )}

      <div
        className={`card border ${colorClass} transition-all ${isExpanded ? 'ring-1 ring-piu-accent/30' : 'cursor-pointer hover:border-piu-accent/40'}`}
        onClick={!isExpanded ? onToggle : undefined}
      >
        <div className="flex items-start gap-3">
          {/* Phase number */}
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-piu-border/50 bg-piu-dark font-display text-sm font-bold ${textColor}`}>
            {index + 1}
          </div>

          {/* Phase info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">{FORMAT_ICONS[format] || ''}</span>
              <h3 className={`font-display font-bold text-sm ${textColor}`}>
                {phase.name || FORMAT_LABELS[format] || format}
              </h3>
              {configSummary && (
                <span className="text-[10px] text-gray-500 font-mono">{configSummary}</span>
              )}
            </div>
            {advancementSummary && (
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <span className="text-piu-green">&#9654;</span> {advancementSummary}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                className="p-1 text-gray-500 hover:text-white transition-colors"
                title="Move up"
              >
                &#9650;
              </button>
            )}
            {index < total - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                className="p-1 text-gray-500 hover:text-white transition-colors"
                title="Move down"
              >
                &#9660;
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
              className="p-1 text-gray-500 hover:text-piu-accent transition-colors"
              title="Remove phase"
            >
              &#10005;
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
              className="p-1 text-gray-500 hover:text-white transition-colors"
            >
              {isExpanded ? '&#9660;' : '&#9654;'}
            </button>
          </div>
        </div>

        {/* Expanded config panel */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-piu-border/40 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
