import React from 'react';
import './petWorldCfUi.css';

function Pill({ label, value, tone = 'neutral', onClick, title }) {
  const tones = {
    neutral: 'cf-pill',
    accent: 'cf-pill cf-pill-accent',
    happy: 'cf-pill cf-pill-happy',
    warn: 'cf-pill cf-pill-warn',
  };
  const className = tones[tone] || tones.neutral;
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      >
        <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55 }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 800 }}>{value}</span>
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800 }}>{value}</span>
    </span>
  );
}

function StatusDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={label}>
      <span className="cf-dot" style={{ backgroundColor: color }} />
    </span>
  );
}

export default function PetWorldHUD({
  world,
  population,
  populationCap,
  happiness,
  phaseCap,
  activeEvents,
  collapsed,
  onToggle,
  onExplain,
}) {
  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const food = world.food ?? 0;
  const combos = Math.floor(world.combo_balance || 0);
  const currentEvent = activeEvents?.[0] || null;

  const moodColor = happy >= 70 ? '#5eb85e' : happy >= 45 ? '#e8a540' : '#d45050';
  const foodColor = food <= pop * 2 ? '#d45050' : '#8b7a60';

  if (collapsed) {
    return (
      <div className="pointer-events-auto flex items-center gap-1.5" style={{ maxHeight: 28 }}>
        <span className="cf-pill cf-pill-accent" style={{ fontSize: 9 }}>
          {pop}/{popCap}
        </span>
        <StatusDot color={moodColor} label={`Mood ${Math.round(happy)}`} />
        <StatusDot color={foodColor} label={`Food ${Math.floor(food)}`} />
        {currentEvent && <StatusDot color="#5eb85e" label={currentEvent.name} />}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="cf-btn cf-btn-ghost"
            style={{ width: 18, height: 18, padding: 0, borderRadius: '50%' }}
            aria-label="Expand HUD"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 10, height: 10 }}>
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto scrollbar-none" style={{ maxHeight: 36 }}>
      <Pill
        label="Village"
        value={`${pop}/${popCap}`}
        tone="accent"
        onClick={onExplain ? () => onExplain('population') : undefined}
        title="Population and housing"
      />
      <Pill
        label="Mood"
        value={Math.round(happy)}
        tone={happy >= 70 ? 'happy' : happy >= 45 ? 'neutral' : 'warn'}
        onClick={onExplain ? () => onExplain('mood') : undefined}
        title="Village happiness"
      />
      <Pill
        label="Food"
        value={Math.floor(food)}
        tone={food <= pop * 2 ? 'warn' : 'neutral'}
        onClick={onExplain ? () => onExplain('food') : undefined}
        title="Food stores"
      />
      <Pill
        label="Combos"
        value={combos.toLocaleString()}
        tone="neutral"
        onClick={onExplain ? () => onExplain('combos') : undefined}
        title="Combo currency"
      />
      {currentEvent ? (
        <Pill
          label="Event"
          value={currentEvent.name}
          tone="happy"
          onClick={onExplain ? () => onExplain('event') : undefined}
          title={currentEvent.description || currentEvent.name}
        />
      ) : null}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="cf-btn cf-btn-ghost"
          style={{ width: 18, height: 18, padding: 0, borderRadius: '50%' }}
          aria-label="Collapse HUD"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style={{ width: 10, height: 10 }}>
            <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}
