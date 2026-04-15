import React from 'react';
import { RESOURCE_SPRITES } from './petWorldUtils';
import './petWorldCfUi.css';

// Render a 16×16 cell from a Cute Fantasy icon atlas at `size` px.
// backgroundSize scales the whole sheet so the target cell lines up to the
// requested display size, keeping pixels crisp via image-rendering.
function ResourceIcon({ sprite, size = 14, title }) {
  if (!sprite) return null;
  const scale = size / 16;
  return (
    <span
      aria-hidden
      title={title}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundImage: `url(${sprite.src})`,
        backgroundSize: `${sprite.sheetW * scale}px ${sprite.sheetH * scale}px`,
        backgroundPosition: `-${sprite.sx * scale}px -${sprite.sy * scale}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  );
}

function ResourcePill({ resource, value, tone = 'neutral', capacity }) {
  const tones = {
    neutral: 'cf-pill',
    accent: 'cf-pill cf-pill-accent',
    happy: 'cf-pill cf-pill-happy',
    warn: 'cf-pill cf-pill-warn',
  };
  const label = resource.charAt(0).toUpperCase() + resource.slice(1);
  const title = capacity != null ? `${label} ${value}/${capacity}` : `${label} ${value}`;
  return (
    <span
      className={`${tones[tone] || tones.neutral} shrink-0`}
      style={{ gap: 2, padding: '1px 5px' }}
      title={title}
    >
      <ResourceIcon sprite={RESOURCE_SPRITES[resource]} size={14} title={label} />
      <span style={{ fontSize: 9, fontWeight: 800 }}>{value}</span>
    </span>
  );
}

function Pill({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: 'cf-pill',
    accent: 'cf-pill cf-pill-accent',
    happy: 'cf-pill cf-pill-happy',
    warn: 'cf-pill cf-pill-warn',
  };
  return (
    <span className={tones[tone] || tones.neutral}>
      <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800 }}>{value}</span>
    </span>
  );
}

// Resource keys rendered in the HUD, in display order.
const RESOURCE_ORDER = ['food', 'wood', 'stone', 'cloth', 'gold'];

// Pick a tone based on how full the stockpile is — runs warn when food falls
// below the rough population demand, and for the others when they're empty so
// the player notices when production is stalled.
function resourceTone(resource, value, capacity, pop) {
  if (resource === 'food') return value <= pop * 2 ? 'warn' : 'neutral';
  if (value <= 0) return 'warn';
  if (capacity && value >= capacity * 0.95) return 'happy';
  return 'neutral';
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
}) {
  if (!world) return null;

  const pop = population ?? world.population ?? 0;
  const popCap = populationCap ?? phaseCap ?? world.housing_capacity ?? 50;
  const happy = happiness ?? world.happiness ?? 0;
  const combos = Math.floor(world.combo_balance || 0);
  const currentEvent = activeEvents?.[0] || null;

  const resourceValues = RESOURCE_ORDER.map((key) => ({
    key,
    value: Math.floor(world[key] ?? 0),
    capacity: world[`${key}_capacity`],
  }));

  const resourcePills = resourceValues.map(({ key, value, capacity }) => (
    <ResourcePill
      key={key}
      resource={key}
      value={value}
      capacity={capacity}
      tone={resourceTone(key, value, capacity, pop)}
    />
  ));

  const moodColor = happy >= 70 ? '#5eb85e' : happy >= 45 ? '#e8a540' : '#d45050';

  if (collapsed) {
    return (
      <div
        className="pointer-events-auto flex items-center gap-0.5 overflow-x-auto scrollbar-none"
        style={{ maxHeight: 30, overscrollBehavior: 'contain', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
      >
        <span
          className="cf-pill cf-pill-accent shrink-0"
          style={{ fontSize: 9, padding: '1px 5px', gap: 3 }}
          title={`Pets ${pop}/${popCap} · Mood ${Math.round(happy)}`}
        >
          <span className="cf-dot" style={{ backgroundColor: moodColor, width: 6, height: 6 }} />
          {pop}/{popCap}
        </span>
        {resourcePills}
        {currentEvent && (
          <span
            className="cf-dot shrink-0"
            style={{ backgroundColor: '#5eb85e', marginLeft: 2 }}
            title={currentEvent.name}
          />
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="cf-btn cf-btn-ghost shrink-0"
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
    <div
      className="pointer-events-auto flex items-center gap-1 overflow-x-auto scrollbar-none"
      style={{ maxHeight: 36, overscrollBehavior: 'contain', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
    >
      <Pill label="Pets" value={`${pop}/${popCap}`} tone="accent" />
      <Pill label="Mood" value={Math.round(happy)} tone={happy >= 70 ? 'happy' : happy >= 45 ? 'neutral' : 'warn'} />
      {resourcePills}
      <Pill label="Combos" value={combos.toLocaleString()} tone="neutral" />
      {currentEvent ? (
        <Pill label="Event" value={currentEvent.name} tone="happy" />
      ) : null}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="cf-btn cf-btn-ghost shrink-0"
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
