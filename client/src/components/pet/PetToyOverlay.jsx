import React, { useEffect, useState } from 'react';

const TOY_OVERLAYS = {
  'mini-pad': {
    width: 28, height: 8,
    render: (phase) => (
      <div className="relative" style={{ width: 28, height: 8 }}>
        <div className="absolute inset-0 rounded-sm bg-gradient-to-r from-gray-600 to-gray-500 border border-gray-400/30" />
        {phase === 'loop' && (
          <>
            <div className="absolute top-0 left-1 w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse" />
            <div className="absolute top-0 left-3.5 w-1.5 h-1.5 rounded-full bg-pink-400/70 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="absolute top-0 right-3.5 w-1.5 h-1.5 rounded-full bg-yellow-400/70 animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="absolute top-0 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" style={{ animationDelay: '450ms' }} />
          </>
        )}
      </div>
    ),
    position: 'bottom-center',
  },
  'laser-dot': {
    width: 6, height: 6,
    render: (phase) => (
      <div style={{ width: 6, height: 6 }} className="relative">
        <div className={`absolute inset-0 rounded-full bg-red-500 ${phase === 'loop' ? 'animate-ping' : ''}`} style={{ boxShadow: '0 0 6px rgba(239,68,68,0.6), 0 0 12px rgba(239,68,68,0.3)' }} />
        <div className="absolute inset-0.5 rounded-full bg-red-300" />
      </div>
    ),
    position: 'ground-wander',
  },
  'lantern': {
    width: 12, height: 16,
    render: (phase) => (
      <div style={{ width: 12, height: 16 }} className="relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-2 bg-amber-800/60 rounded-t-sm" />
        <div className="absolute top-2 left-0 right-0 bottom-0 rounded-b-lg overflow-hidden" style={{
          background: 'linear-gradient(180deg, rgba(255,180,50,0.7) 0%, rgba(255,120,30,0.5) 100%)',
          boxShadow: phase === 'loop' ? '0 0 8px rgba(255,180,50,0.4), 0 0 16px rgba(255,150,30,0.2)' : 'none',
        }}>
          {phase === 'loop' && <div className="absolute inset-0 bg-white/10 animate-pulse" />}
        </div>
      </div>
    ),
    position: 'beside-pet',
  },
  'mitts': {
    width: 14, height: 10,
    render: (phase) => (
      <div style={{ width: 14, height: 10 }} className="relative flex gap-0.5">
        <div className={`w-[6px] h-[9px] rounded-lg bg-red-700 border border-red-600/50 ${phase === 'loop' ? 'animate-bounce' : ''}`} style={{ animationDuration: '400ms' }} />
        <div className={`w-[6px] h-[9px] rounded-lg bg-red-700 border border-red-600/50 ${phase === 'loop' ? 'animate-bounce' : ''}`} style={{ animationDuration: '400ms', animationDelay: '200ms' }} />
      </div>
    ),
    position: 'beside-pet',
  },
};

const POSITION_CLASSES = {
  'bottom-center': 'absolute bottom-0 left-1/2 -translate-x-1/2',
  'ground-wander': 'absolute bottom-2',
  'beside-pet': 'absolute bottom-4 -right-2',
};

export default function PetToyOverlay({ overlayId, active, durationMs = 2000 }) {
  const [phase, setPhase] = useState('start');
  const [wanderX, setWanderX] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase('start');
      return;
    }

    setPhase('start');
    const loopTimer = setTimeout(() => setPhase('loop'), 200);
    const resolveTimer = setTimeout(() => setPhase('resolve'), durationMs - 400);
    const endTimer = setTimeout(() => setPhase('done'), durationMs);

    // Wander effect for laser dot
    let wanderInterval;
    if (overlayId === 'laser-dot') {
      wanderInterval = setInterval(() => {
        setWanderX(Math.round((Math.random() - 0.5) * 40));
      }, 350);
    }

    return () => {
      clearTimeout(loopTimer);
      clearTimeout(resolveTimer);
      clearTimeout(endTimer);
      if (wanderInterval) clearInterval(wanderInterval);
    };
  }, [active, durationMs, overlayId]);

  if (!active || phase === 'done') return null;

  const overlay = TOY_OVERLAYS[overlayId];
  if (!overlay) return null;

  const posClass = POSITION_CLASSES[overlay.position] || POSITION_CLASSES['beside-pet'];

  return (
    <div
      className={`${posClass} pointer-events-none z-20 transition-all duration-200`}
      style={{
        opacity: phase === 'start' ? 0 : phase === 'resolve' ? 0.3 : 1,
        transform: `${phase === 'start' ? 'scale(0.5)' : phase === 'resolve' ? 'scale(0.8) translateY(-4px)' : 'scale(1)'}${overlayId === 'laser-dot' ? ` translateX(${wanderX}px)` : ''}`,
      }}
    >
      {overlay.render(phase)}
    </div>
  );
}
