import React, { useEffect, useRef, useState, useMemo } from 'react';

/**
 * SVG "paper doll" pet renderer.
 * - Dynamic fat/thin body morphing based on weight state
 * - Multiple facial expressions per mood
 * - Clothing overlays (hat, belt, shoes) with custom colors
 * - Idle breathing, eating bounce, trick animations
 */

// ─── Character palettes ───────────────────────────────────────────
const PALETTES = {
  dojocat: { body: '#f5a623', dark: '#d4841a', light: '#ffe082', belly: '#fff3d0', eyes: '#2d2d2d', nose: '#ff6b9d', blush: '#ff9eb5', earInner: '#ffcdd2', whiskers: '#d4841a' },
  buu:     { body: '#e8b4d9', dark: '#c98bbd', light: '#f3d1eb', belly: '#fce4ec', eyes: '#2d2d2d', nose: '#d4679a', blush: '#f48fb1', antenna: '#c98bbd', cape: '#9c27b0' },
  devit:   { body: '#f5f5f5', dark: '#e0e0e0', light: '#ffffff', belly: '#fafafa', eyes: '#e53935', nose: '#ffcdd2', blush: '#ffcdd2', horns: '#e53935', tail: '#e53935' },
  pixiu:   { body: '#fff9c4', dark: '#ffd54f', light: '#fffde7', belly: '#ffffff', eyes: '#5d4037', nose: '#ffab91', blush: '#ffccbc', mane: '#ff8f00', horn: '#ffca28', wings: '#ffe082' },
};

// ─── Body dimensions per weight state ─────────────────────────────
const BODY_SHAPES = {
  starving: { bodyW: 28, bodyH: 22, headScale: 1, limbW: 5 },
  thin:     { bodyW: 32, bodyH: 25, headScale: 1, limbW: 6 },
  normal:   { bodyW: 38, bodyH: 30, headScale: 1, limbW: 7 },
  chubby:   { bodyW: 46, bodyH: 35, headScale: 1.02, limbW: 8 },
  fat:      { bodyW: 56, bodyH: 40, headScale: 1.05, limbW: 10 },
};

// ─── Eye shapes per mood ──────────────────────────────────────────
const EYE_STYLES = {
  desperate: 'teary',
  hungry: 'sad',
  happy: 'open',
  content: 'half',
  stuffed: 'closed',
};

const MOUTH_STYLES = {
  desperate: 'frown',
  hungry: 'pout',
  happy: 'smile',
  content: 'smirk',
  stuffed: 'full',
};

// ─── Clothing SVG shapes ──────────────────────────────────────────
const HAT_SHAPES = {
  'chicken-hat': (color, headCx) => (
    <g transform={`translate(${headCx}, -2)`}>
      {/* Chicken body */}
      <ellipse cx="0" cy="-8" rx="10" ry="7" fill={color} stroke="#00000020" strokeWidth="0.5" />
      {/* Comb */}
      <circle cx="-2" cy="-16" r="2.5" fill="#e53935" />
      <circle cx="1" cy="-17" r="2" fill="#e53935" />
      <circle cx="4" cy="-16" r="2.5" fill="#e53935" />
      {/* Beak */}
      <polygon points="8,-9 13,-8 8,-6" fill="#FF9800" />
      {/* Eye */}
      <circle cx="5" cy="-9" r="1.2" fill="#2d2d2d" />
      <circle cx="5.3" cy="-9.3" r="0.4" fill="white" />
    </g>
  ),
  'headband': (color, cx) => (
    <rect x={cx - 14} y={-5} width="28" height="4" rx="2" fill={color} stroke="#00000015" strokeWidth="0.4" />
  ),
  'crown': (color, cx) => (
    <g transform={`translate(${cx}, -6)`}>
      <polygon points="-10,3 -10,-3 -6,-1 -3,-6 0,-1 3,-6 6,-1 10,-3 10,3" fill={color} stroke="#B8860B" strokeWidth="0.5" />
      <circle cx="-3" cy="-1" r="1" fill="#E53935" />
      <circle cx="3" cy="-1" r="1" fill="#1E88E5" />
      <circle cx="0" cy="-3" r="1" fill="#43A047" />
    </g>
  ),
  'beanie': (color, cx) => (
    <g transform={`translate(${cx}, -4)`}>
      <ellipse cx="0" cy="0" rx="13" ry="6" fill={color} stroke="#00000015" strokeWidth="0.4" />
      <rect x="-13" y="-1" width="26" height="3" rx="1.5" fill={color} style={{ filter: 'brightness(0.85)' }} />
      <circle cx="0" cy="-6" r="2.5" fill={color} style={{ filter: 'brightness(1.1)' }} />
    </g>
  ),
  'wizard-hat': (color, cx) => (
    <g transform={`translate(${cx}, -4)`}>
      <polygon points="-12,4 0,-18 12,4" fill={color} stroke="#00000015" strokeWidth="0.4" />
      <ellipse cx="0" cy="4" rx="14" ry="3" fill={color} style={{ filter: 'brightness(0.8)' }} />
      <circle cx="2" cy="-5" r="1" fill="#FFD700" />
      <circle cx="-3" cy="0" r="0.8" fill="#FFD700" />
      <circle cx="5" cy="-10" r="1.2" fill="#FFD700" />
    </g>
  ),
  'party-hat': (color, cx) => (
    <g transform={`translate(${cx}, -3)`}>
      <polygon points="-8,4 0,-14 8,4" fill={color} stroke="#00000015" strokeWidth="0.4" />
      <circle cx="0" cy="-14" r="2" fill="#FFD700" />
      <line x1="-4" y1="-2" x2="-2" y2="2" stroke="#ffffff50" strokeWidth="1" />
      <line x1="4" y1="-5" x2="6" y2="-1" stroke="#ffffff50" strokeWidth="1" />
    </g>
  ),
};

const BELT_SHAPES = {
  'stomp-belt': (color, w) => (
    <g>
      <rect x={-w/2 - 2} y={-2} width={w + 4} height="5" rx="1" fill={color} />
      <rect x={-3} y={-2.5} width="6" height="6" rx="1" fill="#B0BEC5" stroke="#78909C" strokeWidth="0.4" />
      <text x="0" y="2.5" textAnchor="middle" fontSize="3" fontWeight="bold" fill="#37474F">S</text>
    </g>
  ),
  'chain-belt': (color, w) => (
    <g>
      {Array.from({ length: Math.floor(w / 4) + 2 }, (_, i) => (
        <circle key={i} cx={-w/2 + i * 4} cy="0" r="2" fill="none" stroke={color} strokeWidth="1" />
      ))}
    </g>
  ),
  'ribbon': (color, w) => (
    <g>
      <path d={`M${-w/2 - 3},0 Q0,-4 ${w/2 + 3},0`} fill="none" stroke={color} strokeWidth="2.5" />
      <polygon points={`${w/2 + 2},-1 ${w/2 + 8},-4 ${w/2 + 6},0 ${w/2 + 8},4 ${w/2 + 2},1`} fill={color} />
    </g>
  ),
  'sash': (color, w) => (
    <g>
      <path d={`M${-w/2 - 1},-3 L${w/2 + 1},3`} stroke={color} strokeWidth="4" strokeLinecap="round" />
      <circle cx={w/2 - 2} cy="2" r="3" fill="#FFD700" stroke="#B8860B" strokeWidth="0.4" />
    </g>
  ),
};

const SHOE_SHAPES = {
  'sneakers': (color, lx, rx) => (
    <>
      <ellipse cx={lx} cy="0" rx="5" ry="3" fill={color} stroke="#00000015" strokeWidth="0.4" />
      <line x1={lx - 3} y1="-1" x2={lx + 3} y2="-1" stroke="#e0e0e0" strokeWidth="0.6" />
      <ellipse cx={rx} cy="0" rx="5" ry="3" fill={color} stroke="#00000015" strokeWidth="0.4" />
      <line x1={rx - 3} y1="-1" x2={rx + 3} y2="-1" stroke="#e0e0e0" strokeWidth="0.6" />
    </>
  ),
  'boots': (color, lx, rx) => (
    <>
      <path d={`M${lx - 4},-5 L${lx - 4},1 Q${lx - 4},3 ${lx - 2},3 L${lx + 4},3 Q${lx + 6},3 ${lx + 6},1 L${lx + 4},-5 Z`} fill={color} stroke="#00000020" strokeWidth="0.4" />
      <path d={`M${rx - 4},-5 L${rx - 4},1 Q${rx - 4},3 ${rx - 2},3 L${rx + 4},3 Q${rx + 6},3 ${rx + 6},1 L${rx + 4},-5 Z`} fill={color} stroke="#00000020" strokeWidth="0.4" />
    </>
  ),
  'sandals': (color, lx, rx) => (
    <>
      <ellipse cx={lx} cy="1" rx="5" ry="2" fill={color} />
      <line x1={lx - 2} y1="-1" x2={lx} y2="1" stroke={color} strokeWidth="1" style={{ filter: 'brightness(0.7)' }} />
      <line x1={lx + 2} y1="-1" x2={lx} y2="1" stroke={color} strokeWidth="1" style={{ filter: 'brightness(0.7)' }} />
      <ellipse cx={rx} cy="1" rx="5" ry="2" fill={color} />
      <line x1={rx - 2} y1="-1" x2={rx} y2="1" stroke={color} strokeWidth="1" style={{ filter: 'brightness(0.7)' }} />
      <line x1={rx + 2} y1="-1" x2={rx} y2="1" stroke={color} strokeWidth="1" style={{ filter: 'brightness(0.7)' }} />
    </>
  ),
  'dance-shoes': (color, lx, rx) => (
    <>
      <ellipse cx={lx} cy="0" rx="5" ry="3" fill={color} stroke="#00000020" strokeWidth="0.4" />
      <ellipse cx={lx} cy="-1" rx="3" ry="1" fill="white" opacity="0.3" />
      <ellipse cx={rx} cy="0" rx="5" ry="3" fill={color} stroke="#00000020" strokeWidth="0.4" />
      <ellipse cx={rx} cy="-1" rx="3" ry="1" fill="white" opacity="0.3" />
    </>
  ),
};

// ─── Breathing animation hook ─────────────────────────────────────
function useBreath() {
  const [t, setT] = useState(0);
  const raf = useRef();
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame++;
      setT(frame * 0.02);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  return t;
}

// ─── Eyes renderer ────────────────────────────────────────────────
function Eyes({ style, eyeColor, blushColor, x, y, headScale }) {
  const s = headScale || 1;
  const ex = 5 * s;
  switch (style) {
    case 'teary':
      return (
        <g transform={`translate(${x}, ${y})`}>
          <ellipse cx={-ex} cy="0" rx={2.2 * s} ry={2.8 * s} fill={eyeColor} />
          <ellipse cx={ex} cy="0" rx={2.2 * s} ry={2.8 * s} fill={eyeColor} />
          <ellipse cx={-ex + 0.6} cy={-0.8} rx={0.8 * s} ry={0.6 * s} fill="white" opacity="0.7" />
          <ellipse cx={ex + 0.6} cy={-0.8} rx={0.8 * s} ry={0.6 * s} fill="white" opacity="0.7" />
          {/* Tears */}
          <ellipse cx={-ex + 2.5} cy={3} rx={1} ry={1.5} fill="#64B5F6" opacity="0.6" />
          <ellipse cx={ex + 2.5} cy={3.5} rx={0.8} ry={1.2} fill="#64B5F6" opacity="0.5" />
        </g>
      );
    case 'sad':
      return (
        <g transform={`translate(${x}, ${y})`}>
          <ellipse cx={-ex} cy="0" rx={2 * s} ry={2.5 * s} fill={eyeColor} />
          <ellipse cx={ex} cy="0" rx={2 * s} ry={2.5 * s} fill={eyeColor} />
          <ellipse cx={-ex + 0.5} cy={-0.6} rx={0.7 * s} ry={0.5 * s} fill="white" opacity="0.6" />
          <ellipse cx={ex + 0.5} cy={-0.6} rx={0.7 * s} ry={0.5 * s} fill="white" opacity="0.6" />
          {/* Worried brows */}
          <line x1={-ex - 2} y1={-4} x2={-ex + 2} y2={-3} stroke={eyeColor} strokeWidth="0.8" strokeLinecap="round" />
          <line x1={ex - 2} y1={-3} x2={ex + 2} y2={-4} stroke={eyeColor} strokeWidth="0.8" strokeLinecap="round" />
        </g>
      );
    case 'half':
      return (
        <g transform={`translate(${x}, ${y})`}>
          <ellipse cx={-ex} cy="0" rx={2.2 * s} ry={1.3 * s} fill={eyeColor} />
          <ellipse cx={ex} cy="0" rx={2.2 * s} ry={1.3 * s} fill={eyeColor} />
          <ellipse cx={-ex + 0.4} cy={-0.3} rx={0.6 * s} ry={0.4 * s} fill="white" opacity="0.5" />
          <ellipse cx={ex + 0.4} cy={-0.3} rx={0.6 * s} ry={0.4 * s} fill="white" opacity="0.5" />
          {/* Blush */}
          <ellipse cx={-ex - 3} cy={2.5} rx={2.5} ry={1.5} fill={blushColor} opacity="0.3" />
          <ellipse cx={ex + 3} cy={2.5} rx={2.5} ry={1.5} fill={blushColor} opacity="0.3" />
        </g>
      );
    case 'closed':
      return (
        <g transform={`translate(${x}, ${y})`}>
          <path d={`M${-ex - 2.5},0 Q${-ex},${-2 * s} ${-ex + 2.5},0`} fill="none" stroke={eyeColor} strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M${ex - 2.5},0 Q${ex},${-2 * s} ${ex + 2.5},0`} fill="none" stroke={eyeColor} strokeWidth="1.2" strokeLinecap="round" />
          {/* Heavy blush */}
          <ellipse cx={-ex - 3} cy={2.5} rx={3} ry={1.8} fill={blushColor} opacity="0.35" />
          <ellipse cx={ex + 3} cy={2.5} rx={3} ry={1.8} fill={blushColor} opacity="0.35" />
        </g>
      );
    default: // open
      return (
        <g transform={`translate(${x}, ${y})`}>
          <ellipse cx={-ex} cy="0" rx={2.5 * s} ry={2.8 * s} fill={eyeColor} />
          <ellipse cx={ex} cy="0" rx={2.5 * s} ry={2.8 * s} fill={eyeColor} />
          <ellipse cx={-ex + 0.7} cy={-0.8} rx={1 * s} ry={0.8 * s} fill="white" opacity="0.7" />
          <ellipse cx={ex + 0.7} cy={-0.8} rx={1 * s} ry={0.8 * s} fill="white" opacity="0.7" />
        </g>
      );
  }
}

// ─── Mouth renderer ───────────────────────────────────────────────
function Mouth({ style, color, x, y }) {
  switch (style) {
    case 'frown':
      return <path d={`M${x - 3},${y + 1} Q${x},${y - 2} ${x + 3},${y + 1}`} fill="none" stroke={color || '#5D4037'} strokeWidth="0.8" strokeLinecap="round" />;
    case 'pout':
      return <ellipse cx={x} cy={y} rx="2" ry="1.5" fill={color || '#e57373'} />;
    case 'smirk':
      return <path d={`M${x - 2},${y} Q${x + 1},${y + 3} ${x + 3},${y}`} fill="none" stroke={color || '#5D4037'} strokeWidth="0.8" strokeLinecap="round" />;
    case 'full':
      return (
        <g>
          <path d={`M${x - 3},${y} Q${x},${y + 2} ${x + 3},${y}`} fill="none" stroke={color || '#5D4037'} strokeWidth="0.8" strokeLinecap="round" />
          <line x1={x - 1} y1={y + 1} x2={x + 1} y2={y + 1} stroke={color || '#5D4037'} strokeWidth="0.5" opacity="0.4" />
        </g>
      );
    default: // smile
      return <path d={`M${x - 3},${y} Q${x},${y + 4} ${x + 3},${y}`} fill="none" stroke={color || '#5D4037'} strokeWidth="1" strokeLinecap="round" />;
  }
}

// ─── Character-specific features ──────────────────────────────────
function CharacterFeatures({ character, palette, headCx, headCy, headR }) {
  switch (character) {
    case 'dojocat':
      return (
        <g>
          {/* Ears */}
          <polygon points={`${headCx - 11},${headCy - 8} ${headCx - 14},${headCy - 20} ${headCx - 3},${headCy - 13}`} fill={palette.body} stroke={palette.dark} strokeWidth="0.4" />
          <polygon points={`${headCx + 11},${headCy - 8} ${headCx + 14},${headCy - 20} ${headCx + 3},${headCy - 13}`} fill={palette.body} stroke={palette.dark} strokeWidth="0.4" />
          <polygon points={`${headCx - 10},${headCy - 10} ${headCx - 12},${headCy - 18} ${headCx - 5},${headCy - 13}`} fill={palette.earInner} />
          <polygon points={`${headCx + 10},${headCy - 10} ${headCx + 12},${headCy - 18} ${headCx + 5},${headCy - 13}`} fill={palette.earInner} />
          {/* Nose */}
          <ellipse cx={headCx} cy={headCy + 3} rx="2" ry="1.5" fill={palette.nose} />
          {/* Whiskers */}
          <line x1={headCx - 5} y1={headCy + 3} x2={headCx - 14} y2={headCy + 1} stroke={palette.whiskers} strokeWidth="0.4" opacity="0.5" />
          <line x1={headCx - 5} y1={headCy + 4} x2={headCx - 14} y2={headCy + 5} stroke={palette.whiskers} strokeWidth="0.4" opacity="0.5" />
          <line x1={headCx + 5} y1={headCy + 3} x2={headCx + 14} y2={headCy + 1} stroke={palette.whiskers} strokeWidth="0.4" opacity="0.5" />
          <line x1={headCx + 5} y1={headCy + 4} x2={headCx + 14} y2={headCy + 5} stroke={palette.whiskers} strokeWidth="0.4" opacity="0.5" />
        </g>
      );
    case 'buu':
      return (
        <g>
          {/* Antenna */}
          <line x1={headCx} y1={headCy - headR} x2={headCx + 2} y2={headCy - headR - 12} stroke={palette.antenna} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx={headCx + 2} cy={headCy - headR - 13} r="2.5" fill={palette.body} stroke={palette.dark} strokeWidth="0.4" />
          {/* Rosy cheeks (always visible for Buu) */}
          <ellipse cx={headCx - 8} cy={headCy + 3} rx="3" ry="2" fill={palette.blush} opacity="0.3" />
          <ellipse cx={headCx + 8} cy={headCy + 3} rx="3" ry="2" fill={palette.blush} opacity="0.3" />
          {/* Small nose */}
          <ellipse cx={headCx} cy={headCy + 2} rx="1.5" ry="1" fill={palette.nose} />
        </g>
      );
    case 'devit':
      return (
        <g>
          {/* Horns */}
          <polygon points={`${headCx - 9},${headCy - 6} ${headCx - 13},${headCy - 18} ${headCx - 5},${headCy - 10}`} fill={palette.horns} />
          <polygon points={`${headCx + 9},${headCy - 6} ${headCx + 13},${headCy - 18} ${headCx + 5},${headCy - 10}`} fill={palette.horns} />
          {/* Blush dots */}
          <ellipse cx={headCx - 7} cy={headCy + 3} rx="2.5" ry="1.5" fill={palette.blush} opacity="0.4" />
          <ellipse cx={headCx + 7} cy={headCy + 3} rx="2.5" ry="1.5" fill={palette.blush} opacity="0.4" />
          {/* Tiny smile nose */}
          <ellipse cx={headCx} cy={headCy + 2} rx="1" ry="0.7" fill={palette.nose} opacity="0.5" />
        </g>
      );
    case 'pixiu':
      return (
        <g>
          {/* Mane */}
          {[-20, -12, 0, 12, 20].map((angle, i) => (
            <ellipse
              key={i}
              cx={headCx + Math.sin(angle * Math.PI / 180) * (headR + 3)}
              cy={headCy - Math.cos(angle * Math.PI / 180) * (headR + 1)}
              rx="3.5" ry="3"
              fill={palette.mane}
              opacity="0.8"
            />
          ))}
          {/* Horn */}
          <polygon points={`${headCx - 2},${headCy - headR + 1} ${headCx},${headCy - headR - 10} ${headCx + 2},${headCy - headR + 1}`}
            fill={palette.horn} stroke={palette.dark} strokeWidth="0.3" />
          {/* Small wings */}
          <ellipse cx={headCx - 18} cy={headCy + 15} rx="6" ry="4" fill={palette.wings} opacity="0.7" transform={`rotate(-20, ${headCx - 18}, ${headCy + 15})`} />
          <ellipse cx={headCx + 18} cy={headCy + 15} rx="6" ry="4" fill={palette.wings} opacity="0.7" transform={`rotate(20, ${headCx + 18}, ${headCy + 15})`} />
          {/* Nose */}
          <ellipse cx={headCx} cy={headCy + 2} rx="1.5" ry="1" fill={palette.nose} />
        </g>
      );
    default:
      return null;
  }
}

// ─── Tail (devit only) ────────────────────────────────────────────
function Tail({ character, palette, bodyX, bodyY, bodyW, t }) {
  if (character !== 'devit') return null;
  const sway = Math.sin(t * 2) * 5;
  return (
    <path
      d={`M${bodyX + bodyW / 2},${bodyY} Q${bodyX + bodyW / 2 + 12 + sway},${bodyY - 8} ${bodyX + bodyW / 2 + 8 + sway},${bodyY - 16}`}
      fill="none" stroke={palette.tail} strokeWidth="2" strokeLinecap="round"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function SpritePet({
  character = 'dojocat',
  weightState = 'normal',
  mood = 'happy',
  equippedHat = '',
  equippedBelt = '',
  equippedShoes = '',
  hatColor = '',
  beltColor = '',
  shoesColor = '',
  isEating = false,
  isTricking = false,
  size = 140,
  className = '',
  onClick,
}) {
  const t = useBreath();
  const palette = PALETTES[character] || PALETTES.dojocat;
  const shape = BODY_SHAPES[weightState] || BODY_SHAPES.normal;
  const eyeStyle = EYE_STYLES[mood] || 'open';
  const mouthStyle = MOUTH_STYLES[mood] || 'smile';

  // Layout constants (coordinate space: 100x120)
  const cx = 50;
  const headCy = 28;
  const headR = 14 * shape.headScale;
  const bodyCy = 60;
  const bodyW = shape.bodyW;
  const bodyH = shape.bodyH;
  const legY = bodyCy + bodyH / 2;
  const legSpread = bodyW * 0.3;

  // Breathing oscillation
  const breathY = Math.sin(t * 1.5) * 1.2;
  const breathScale = 1 + Math.sin(t * 1.5) * 0.012;

  // Eating bounce
  const eatBounce = isEating ? Math.abs(Math.sin(t * 8)) * 4 : 0;
  // Trick spin
  const trickRotate = isTricking ? Math.sin(t * 6) * 8 : 0;
  const trickY = isTricking ? -Math.abs(Math.sin(t * 4)) * 10 : 0;

  const transform = `translate(0, ${breathY - eatBounce + trickY}) rotate(${trickRotate}, ${cx}, 60)`;

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      className={className}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', overflow: 'visible' }}
    >
      <g transform={transform}>
        {/* Shadow */}
        <ellipse cx={cx} cy={legY + 10} rx={bodyW * 0.4} ry={3}
          fill="black" opacity={0.1 + (isTricking ? -0.05 : 0)} />

        {/* Tail */}
        <Tail character={character} palette={palette} bodyX={cx - bodyW / 2} bodyY={bodyCy} bodyW={bodyW} t={t} />

        {/* Legs */}
        <rect x={cx - legSpread - shape.limbW / 2} y={legY - 2} width={shape.limbW} height={12} rx={shape.limbW / 2} fill={palette.dark} />
        <rect x={cx + legSpread - shape.limbW / 2} y={legY - 2} width={shape.limbW} height={12} rx={shape.limbW / 2} fill={palette.dark} />

        {/* Shoes */}
        {equippedShoes && SHOE_SHAPES[equippedShoes] && (
          <g transform={`translate(0, ${legY + 9})`}>
            {SHOE_SHAPES[equippedShoes](shoesColor || '#888', cx - legSpread, cx + legSpread)}
          </g>
        )}

        {/* Arms */}
        <ellipse cx={cx - bodyW / 2 - 2} cy={bodyCy + 2} rx={shape.limbW * 0.6} ry={8}
          fill={palette.body} stroke={palette.dark} strokeWidth="0.3" transform={`rotate(${10 + Math.sin(t * 2) * 3}, ${cx - bodyW / 2 - 2}, ${bodyCy + 2})`} />
        <ellipse cx={cx + bodyW / 2 + 2} cy={bodyCy + 2} rx={shape.limbW * 0.6} ry={8}
          fill={palette.body} stroke={palette.dark} strokeWidth="0.3" transform={`rotate(${-10 - Math.sin(t * 2) * 3}, ${cx + bodyW / 2 + 2}, ${bodyCy + 2})`} />

        {/* Body */}
        <ellipse cx={cx} cy={bodyCy} rx={bodyW / 2} ry={bodyH / 2}
          fill={palette.body} stroke={palette.dark} strokeWidth="0.5" />
        {/* Belly patch */}
        <ellipse cx={cx} cy={bodyCy + 2} rx={bodyW * 0.32} ry={bodyH * 0.35}
          fill={palette.belly} opacity="0.6" />

        {/* Belt */}
        {equippedBelt && BELT_SHAPES[equippedBelt] && (
          <g transform={`translate(${cx}, ${bodyCy - bodyH * 0.05})`}>
            {BELT_SHAPES[equippedBelt](beltColor || '#888', bodyW * 0.9)}
          </g>
        )}

        {/* Buu cape */}
        {character === 'buu' && (
          <path
            d={`M${cx - bodyW * 0.35},${bodyCy - bodyH * 0.3}
                Q${cx - bodyW * 0.5},${bodyCy + bodyH * 0.3} ${cx - bodyW * 0.3},${legY + 4}
                L${cx + bodyW * 0.3},${legY + 4}
                Q${cx + bodyW * 0.5},${bodyCy + bodyH * 0.3} ${cx + bodyW * 0.35},${bodyCy - bodyH * 0.3}`}
            fill={palette.cape} opacity="0.3"
          />
        )}

        {/* Head */}
        <g transform={`scale(${breathScale})`} style={{ transformOrigin: `${cx}px ${headCy}px` }}>
          <circle cx={cx} cy={headCy} r={headR} fill={palette.body} stroke={palette.dark} strokeWidth="0.5" />

          {/* Character-specific features (ears, horns, antenna, mane) */}
          <CharacterFeatures character={character} palette={palette} headCx={cx} headCy={headCy} headR={headR} />

          {/* Hat */}
          {equippedHat && HAT_SHAPES[equippedHat] && (
            <g transform={`translate(0, ${headCy - headR - 1})`}>
              {HAT_SHAPES[equippedHat](hatColor || '#888', cx)}
            </g>
          )}

          {/* Eyes */}
          <Eyes style={eyeStyle} eyeColor={palette.eyes} blushColor={palette.blush} x={cx} y={headCy - 1} headScale={shape.headScale} />

          {/* Mouth */}
          <Mouth style={isEating ? 'smile' : mouthStyle} color={palette.nose} x={cx} y={headCy + 6} />
        </g>
      </g>
    </svg>
  );
}

export { PALETTES, BODY_SHAPES };
