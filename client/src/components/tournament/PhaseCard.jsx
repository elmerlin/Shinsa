import React from 'react';
import { FORMAT_LABELS, FORMAT_DESCRIPTIONS, FORMAT_ICONS } from '../../utils/tournamentConstants';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

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

const PHASE_CARD_PERF_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '240px',
};

function getGauntletLevels(config = {}) {
  const start = parseInt(config.start_level ?? config.start_single_level, 10) || 19;
  const explicitFinal = parseInt(config.final_level, 10);
  const legacyFinalUpper = parseInt(config.final_single_level, 10);
  const explicitFinalMax = parseInt(config.final_level_max ?? config.final_single_level_max, 10);
  const final = Number.isFinite(explicitFinal)
    ? explicitFinal
    : Number.isFinite(legacyFinalUpper)
      ? Math.max(1, legacyFinalUpper - 1)
      : 24;
  const finalMax = Math.max(
    final,
    Number.isFinite(explicitFinalMax)
      ? explicitFinalMax
      : Number.isFinite(legacyFinalUpper)
        ? legacyFinalUpper
        : Math.min(final + 1, 28)
  );
  return { start, final, finalMax };
}

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
      return (() => {
        const levels = getGauntletLevels(config);
        const finalBand = levels.finalMax !== levels.final ? `${levels.final}-${levels.finalMax}` : `${levels.final}`;
        return `Lv ${levels.start}→Lv ${finalBand}, mixed S/D, ${parseInt(config.best_of, 10) === 1 ? 'single song' : 'best of 3'}`;
      })();
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
    <div className="relative" style={PHASE_CARD_PERF_STYLE}>
      {/* Connector line */}
      {index > 0 && (
        <div className="absolute left-6 -top-4 w-px h-4 bg-piu-border/60" />
      )}
      {index < total - 1 && (
        <div className="absolute left-6 -bottom-4 w-px h-4 bg-piu-border/60" />
      )}

      <Card
        className={`border ${colorClass} overflow-hidden transition-colors ${isExpanded ? 'ring-1 ring-piu-accent/30' : 'cursor-pointer hover:border-piu-accent/40'}`}
        onClick={!isExpanded ? onToggle : undefined}
      >
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-piu-border/50 bg-piu-dark font-display text-sm font-bold ${textColor}`}>
              {index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  <span aria-hidden="true">{FORMAT_ICONS[format] || ''}</span>
                  <span>{FORMAT_LABELS[format] || format}</span>
                </Badge>
                {advancementSummary ? <Badge variant="default">{advancementSummary}</Badge> : null}
              </div>
              <h3 className={`mt-3 font-display text-lg font-bold ${textColor}`}>
                {phase.name || FORMAT_LABELS[format] || format}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {configSummary || FORMAT_DESCRIPTIONS[format] || 'Configure this phase.'}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {index > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                  className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                  title="Move up"
                >
                  &#9650;
                </button>
              )}
              {index < total - 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                  className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                  title="Move down"
                >
                  &#9660;
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
                className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-piu-accent"
                title="Remove phase"
              >
                &#10005;
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
                className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                title={isExpanded ? 'Collapse phase' : 'Expand phase'}
              >
                {isExpanded ? '\u25BC' : '\u25B6'}
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="border-t border-piu-border/40 pt-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
              {children}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
