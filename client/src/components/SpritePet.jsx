import React, { useState, useEffect, useRef } from 'react';

/**
 * High-resolution sprite pet renderer using actual character emoji assets.
 * Maps character + mood/weight state to the correct sprite image.
 * Supports trick animations with CSS keyframe transitions.
 */

// Map character + mood → emoji image path
const SPRITE_MAP = {
  dojocat: {
    desperate: '/emojis/dojocat/7-0.png',
    hungry: '/emojis/dojocat/5-0.png',
    happy: '/emojis/dojocat/1-0.png',
    content: '/emojis/dojocat/4-0.png',
    stuffed: '/emojis/dojocat/6-0.png',
    // Trick sprites
    pose: '/emojis/dojocat/1-5.png',
    flex: '/emojis/dojocat/6-0.png',
    science: '/emojis/dojocat/3-0.png',
    rage: '/emojis/dojocat/2-0.png',
    // Eating animation sprite
    eat: '/emojis/dojocat/6-5.png',
  },
  buu: {
    desperate: '/emojis/buu/buu-9.png',
    hungry: '/emojis/buu/buu-3.png',
    happy: '/emojis/buu/buu-0.png',
    content: '/emojis/buu/buu-5.png',
    stuffed: '/emojis/buu/buu-0.png',
    smile: '/emojis/buu/buu-5.png',
    dressup: '/emojis/buu_hop_dressup/buu-hop-dressup-0.png',
    ranger: '/emojis/buu_hop_power_rangers/buu-hop-power-rangers-0.png',
    wizard: '/emojis/buu/buu-9.png',
    eat: '/emojis/buu/buu-5.png',
  },
  devit: {
    desperate: '/emojis/devit/idle.png',
    hungry: '/emojis/devit/grin.png',
    happy: '/emojis/devit/hop.png',
    content: '/emojis/devit/prance.png',
    stuffed: '/emojis/devit/cheer.png',
    idle: '/emojis/devit/idle.png',
    scamper: '/emojis/devit/scamper.png',
    prance: '/emojis/devit/prance.png',
    cheer: '/emojis/devit/cheer.png',
    eat: '/emojis/devit/cheer.png',
  },
  pixiu: {
    desperate: '/emojis/dojocat_pixiu/dojocat-pixiu-0.png',
    hungry: '/emojis/dojocat_pixiu/dojocat-pixiu-2.png',
    happy: '/emojis/dojocat_pixiu/dojocat-pixiu-5.png',
    content: '/emojis/dojocat_pixiu/dojocat-pixiu-8.png',
    stuffed: '/emojis/dojocat_pixiu/dojocat-pixiu-12.png',
    greet: '/emojis/dojocat_pixiu/dojocat-pixiu-0.png',
    laugh: '/emojis/dojocat_pixiu/dojocat-pixiu-5.png',
    dance: '/emojis/dojocat_pixiu/dojocat-pixiu-10.png',
    fortune: '/emojis/dojocat_pixiu/dojocat-pixiu-15.png',
    eat: '/emojis/dojocat_pixiu/dojocat-pixiu-5.png',
  },
};

// Sprite animation cycle for idle breathing
function useIdleBreath() {
  const [scale, setScale] = useState(1);
  const frameRef = useRef(0);

  useEffect(() => {
    let raf;
    let lastTime = 0;
    const animate = (time) => {
      if (time - lastTime > 50) {
        frameRef.current = (frameRef.current + 1) % 120;
        // Gentle breathing: sine wave 0.97 to 1.03
        const t = frameRef.current / 120;
        setScale(1 + Math.sin(t * Math.PI * 2) * 0.025);
        lastTime = time;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return scale;
}

export default function SpritePet({
  character = 'dojocat',
  mood = 'happy',
  trickId = null,
  isEating = false,
  isTricking = false,
  size = 160,
  className = '',
  onClick,
}) {
  const breathScale = useIdleBreath();
  const [loaded, setLoaded] = useState(false);
  const [trickFrame, setTrickFrame] = useState(0);

  // Determine which sprite to show
  const sprites = SPRITE_MAP[character] || SPRITE_MAP.dojocat;
  let spriteKey = mood;
  if (isEating) spriteKey = 'eat';
  if (isTricking && trickId) spriteKey = trickId;
  const src = sprites[spriteKey] || sprites.happy;

  // Trick animation cycle (cycle between trick and mood sprite)
  useEffect(() => {
    if (!isTricking) { setTrickFrame(0); return; }
    const interval = setInterval(() => {
      setTrickFrame(f => (f + 1) % 8);
    }, 200);
    return () => clearInterval(interval);
  }, [isTricking]);

  // Compute transform
  let transform = `scale(${breathScale})`;
  if (isEating) {
    transform = `scale(${1.08 + Math.sin(Date.now() / 100) * 0.04}) translateY(-4px)`;
  }
  if (isTricking) {
    const bounce = Math.sin(trickFrame * Math.PI / 4) * 12;
    const spin = trickFrame < 4 ? trickFrame * 5 : (8 - trickFrame) * 5;
    transform = `translateY(${-Math.abs(bounce)}px) rotate(${spin}deg) scale(1.05)`;
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size * 1.3 }}
      onClick={onClick}
    >
      {/* Glow effect behind pet */}
      <div
        className="absolute inset-0 rounded-full blur-2xl opacity-30 transition-all duration-1000"
        style={{
          background: getMoodGlow(character, mood),
          transform: `scale(${breathScale * 0.7})`,
        }}
      />

      {/* Shadow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-black/20 blur-sm transition-all duration-300"
        style={{
          width: size * 0.5,
          height: size * 0.08,
          transform: `translateX(-50%) scale(${isTricking ? 0.6 : breathScale})`,
          opacity: isTricking ? 0.15 : 0.25,
        }}
      />

      {/* The pet sprite */}
      <img
        src={src}
        alt={`${character} pet`}
        className="relative z-10 transition-transform select-none pointer-events-none"
        style={{
          width: size,
          height: 'auto',
          maxHeight: size * 1.3,
          objectFit: 'contain',
          imageRendering: 'auto',
          transform,
          transitionDuration: isEating ? '0ms' : isTricking ? '150ms' : '600ms',
          filter: loaded ? 'none' : 'blur(4px)',
          opacity: loaded ? 1 : 0.5,
        }}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />

      {/* Sparkle particles on eating */}
      {isEating && <EatParticles size={size} />}

      {/* Trick fireworks */}
      {isTricking && <TrickParticles size={size} character={character} />}
    </div>
  );
}

function getMoodGlow(character, mood) {
  const glows = {
    dojocat: { desperate: '#ff4444', hungry: '#ff8844', happy: '#f5a623', content: '#44cc88', stuffed: '#44aaff' },
    buu: { desperate: '#cc44cc', hungry: '#dd66aa', happy: '#e8b4d9', content: '#bb88dd', stuffed: '#9944cc' },
    devit: { desperate: '#ff2222', hungry: '#ff5544', happy: '#ff6644', content: '#ffaa44', stuffed: '#ffcc44' },
    pixiu: { desperate: '#cc8800', hungry: '#ddaa22', happy: '#ffd54f', content: '#ffee88', stuffed: '#fff4cc' },
  };
  return glows[character]?.[mood] || '#ffffff22';
}

function EatParticles({ size }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * size * 0.8,
      y: -Math.random() * size * 0.3,
      delay: Math.random() * 300,
      duration: 500 + Math.random() * 400,
      emoji: ['✨', '⭐', '💫', '🌟'][Math.floor(Math.random() * 4)],
      size: 10 + Math.random() * 8,
    }));
    setParticles(newParticles);
  }, [size]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-visible">
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2"
          style={{
            fontSize: p.size,
            transform: `translate(${p.x}px, ${p.y}px)`,
            animation: `eat-sparkle ${p.duration}ms ease-out ${p.delay}ms both`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

function TrickParticles({ size, character }) {
  const colors = {
    dojocat: ['#f5a623', '#ff6b9d', '#ffffff'],
    buu: ['#e8b4d9', '#9c27b0', '#ffffff'],
    devit: ['#e53935', '#ffeb3b', '#ffffff'],
    pixiu: ['#ffd54f', '#ff8f00', '#ffffff'],
  };
  const palette = colors[character] || colors.dojocat;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-visible">
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = size * 0.5 + Math.random() * size * 0.2;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 4 + Math.random() * 4,
              height: 4 + Math.random() * 4,
              background: palette[i % palette.length],
              animation: `trick-burst 800ms ease-out ${i * 50}ms both`,
              '--tx': `${Math.cos(angle) * dist}px`,
              '--ty': `${Math.sin(angle) * dist}px`,
            }}
          />
        );
      })}
    </div>
  );
}

export { SPRITE_MAP };
