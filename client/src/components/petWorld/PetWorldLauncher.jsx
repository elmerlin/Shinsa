import React, { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

/* ── Drawing helpers (inlined from petWorldSprites.js for self-containment) ── */

function px(ctx, x, y, w, h, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}

function tri(ctx, x1, y1, x2, y2, x3, y3, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function circ(ctx, cx, cy, r, fill, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ── Palette ── */

const P = {
  sky1:     '#0c1b2e',
  sky2:     '#162d45',
  stars:    '#ffffff',
  ground:   '#1a3a1a',
  groundLt: '#245a24',
  path:     '#5c4a32',
  pathLt:   '#7a6548',
  water:    '#1a5c7a',
  waterLt:  '#3ab4d4',
  waterHi:  '#8aeaff',
  trunk:    '#5a3a1e',
  trunkDk:  '#3e2810',
  leaf1:    '#22a54b',
  leaf2:    '#16803c',
  leaf3:    '#2dd66a',
  house1:   '#c4956a',
  house1dk: '#a07550',
  roof1:    '#b04a12',
  roof1dk:  '#8a3a0c',
  house2:   '#7a8aa0',
  house2dk: '#5a6a80',
  roof2:    '#4a5a7a',
  roof2dk:  '#3a4a6a',
  house3:   '#d4b89a',
  house3dk: '#b09878',
  roof3:    '#8a3030',
  roof3dk:  '#6a2020',
  door:     '#3a2010',
  window:   '#fde68a',
  windowOff:'#6a6040',
  pet1:     '#f0c080',
  pet2:     '#e08060',
  pet3:     '#80c0e0',
  chimney:  '#6a5040',
  smoke:    '#aabbcc',
  fence:    '#8a7a60',
};

/* ── Animated Village Diorama (200x100 canvas, pixel-scaled 2x) ── */

function VillageDiorama() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const W = 200;
    const H = 100;
    const s = 1; // pixel unit

    ctx.clearRect(0, 0, W, H);

    /* --- sky gradient --- */
    const grad = ctx.createLinearGradient(0, 0, 0, 50);
    grad.addColorStop(0, P.sky1);
    grad.addColorStop(1, P.sky2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 55);

    /* --- twinkling stars --- */
    const starPositions = [
      [12, 6], [35, 10], [58, 4], [82, 12], [110, 7],
      [135, 5], [158, 11], [175, 3], [148, 15], [25, 14],
      [68, 16], [190, 9], [95, 8], [122, 3], [45, 18],
    ];
    for (const [sx, sy] of starPositions) {
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.002 + sx * 0.7 + sy * 1.3));
      circ(ctx, sx, sy, 0.5 + twinkle * 0.4, P.stars, twinkle * 0.8);
    }

    /* --- ground --- */
    px(ctx, 0, 50, W, 50, P.ground);
    // subtle grass variation
    for (let gx = 0; gx < W; gx += 4) {
      const gy = 50 + ((gx * 7 + 13) % 5);
      px(ctx, gx, gy, 3, 1, P.groundLt, 0.25);
    }

    /* --- water pond (right side) --- */
    const waterX = 145, waterY = 60, waterW = 40, waterH = 14;
    // pond body
    px(ctx, waterX, waterY, waterW, waterH, P.water);
    // rounded edges
    px(ctx, waterX + 1, waterY - 1, waterW - 2, 1, P.water, 0.5);
    px(ctx, waterX + 1, waterY + waterH, waterW - 2, 1, P.water, 0.3);
    // shimmer bands
    const shimPhase = (time * 0.0008) % 1;
    for (let i = 0; i < 3; i++) {
      const bandY = waterY + 3 + i * 4 + Math.sin(time * 0.002 + i * 2) * 1;
      const bandX = waterX + 4 + Math.sin(time * 0.0015 + i * 3) * 3;
      const bandW = 12 + Math.sin(time * 0.001 + i) * 4;
      px(ctx, bandX, bandY, bandW, 1, P.waterLt, 0.35 + shimPhase * 0.15);
    }
    // sparkle
    const sparkX = waterX + 8 + Math.sin(time * 0.003) * 12;
    const sparkY = waterY + 3 + Math.cos(time * 0.0025) * 4;
    const sparkAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.005));
    circ(ctx, sparkX, sparkY, 0.8, P.waterHi, sparkAlpha);
    circ(ctx, sparkX + 15, sparkY + 5, 0.6, P.waterHi, sparkAlpha * 0.6);

    /* --- winding path --- */
    const pathPoints = [
      [0, 72, 18, 6],
      [14, 68, 12, 6],
      [22, 64, 14, 5],
      [32, 62, 16, 5],
      [44, 60, 14, 5],
      [54, 58, 16, 5],
      [66, 56, 12, 5],
      [74, 55, 18, 5],
      [88, 54, 14, 5],
      [98, 55, 16, 5],
      [110, 57, 14, 5],
      [120, 60, 12, 5],
      [128, 63, 14, 5],
      [138, 66, 12, 5],
    ];
    for (const [ppx, ppy, pw, ph] of pathPoints) {
      px(ctx, ppx, ppy, pw, ph, P.path);
      px(ctx, ppx + 1, ppy + 1, pw - 2, 1, P.pathLt, 0.3);
    }

    /* --- tree helper --- */
    function drawTree(tx, ty, sway, variant = 0) {
      const swayAmt = Math.sin(time * 0.0015 + sway) * 1.2;

      // shadow
      circ(ctx, tx + 1, ty + 2, 5, '#000000', 0.12);

      // trunk
      px(ctx, tx - 1, ty - 12, 3, 14, P.trunk);
      px(ctx, tx - 1, ty - 12, 1, 14, P.trunkDk, 0.3);

      // canopy layers with sway
      const leafColor = variant === 0 ? P.leaf1 : P.leaf2;
      const leafHi = variant === 0 ? P.leaf3 : P.leaf1;
      circ(ctx, tx + swayAmt, ty - 16, 7, leafColor);
      circ(ctx, tx - 3 + swayAmt * 0.8, ty - 14, 5, P.leaf2);
      circ(ctx, tx + 3 + swayAmt * 1.1, ty - 14, 5, leafColor);
      circ(ctx, tx + swayAmt * 0.5, ty - 19, 4.5, leafHi, 0.7);
    }

    /* --- fence segments --- */
    const fenceSegments = [[2, 68], [6, 68], [10, 68], [130, 62], [134, 62], [138, 62]];
    for (const [fx, fy] of fenceSegments) {
      px(ctx, fx, fy, 1, 5, P.fence);
      px(ctx, fx + 3, fy, 1, 5, P.fence);
      px(ctx, fx, fy + 1, 4, 1, P.fence, 0.8);
      px(ctx, fx, fy + 3, 4, 1, P.fence, 0.8);
    }

    /* --- buildings --- */

    // Building 1: cottage (left)
    const b1x = 24, b1y = 38;
    px(ctx, b1x, b1y, 22, 18, P.house1);             // body
    px(ctx, b1x, b1y, 22, 2, P.house1dk, 0.4);       // top shadow
    px(ctx, b1x, b1y, 2, 18, P.house1dk, 0.2);       // left shadow
    tri(ctx, b1x - 2, b1y, b1x + 11, b1y - 10, b1x + 24, b1y, P.roof1);  // roof
    px(ctx, b1x + 2, b1y - 8, 18, 1, P.roof1dk, 0.5);                      // roof shadow
    px(ctx, b1x + 8, b1y + 10, 5, 8, P.door);         // door
    px(ctx, b1x + 9, b1y + 13, 1, 1, P.window);       // doorknob
    const w1flicker = Math.sin(time * 0.003) > 0.2;
    px(ctx, b1x + 3, b1y + 4, 4, 4, w1flicker ? P.window : P.windowOff);   // window L
    px(ctx, b1x + 15, b1y + 4, 4, 4, w1flicker ? P.window : P.windowOff);  // window R
    // window frames
    px(ctx, b1x + 4.5, b1y + 4, 1, 4, P.house1dk, 0.4);
    px(ctx, b1x + 3, b1y + 5.5, 4, 1, P.house1dk, 0.4);
    px(ctx, b1x + 16.5, b1y + 4, 1, 4, P.house1dk, 0.4);
    px(ctx, b1x + 15, b1y + 5.5, 4, 1, P.house1dk, 0.4);
    // chimney + smoke
    px(ctx, b1x + 16, b1y - 10, 4, 6, P.chimney);
    const smokeT = (time * 0.001) % 6;
    circ(ctx, b1x + 18, b1y - 12 - smokeT, 2, P.smoke, Math.max(0, 0.25 - smokeT * 0.04));
    circ(ctx, b1x + 17, b1y - 15 - smokeT * 0.8, 1.5, P.smoke, Math.max(0, 0.18 - smokeT * 0.03));

    // Building 2: tower (center)
    const b2x = 72, b2y = 30;
    px(ctx, b2x, b2y, 16, 26, P.house2);             // body
    px(ctx, b2x, b2y, 16, 2, P.house2dk, 0.4);       // top shadow
    px(ctx, b2x, b2y, 2, 26, P.house2dk, 0.25);      // left shadow
    tri(ctx, b2x - 1, b2y, b2x + 8, b2y - 8, b2x + 17, b2y, P.roof2);   // roof
    px(ctx, b2x + 2, b2y - 6, 12, 1, P.roof2dk, 0.4);
    // flag on top
    const flagWave = Math.sin(time * 0.003) * 1.5;
    px(ctx, b2x + 8, b2y - 14, 1, 7, P.fence);
    tri(ctx, b2x + 9, b2y - 14, b2x + 9, b2y - 10, b2x + 14 + flagWave, b2y - 12, '#e04040');
    // windows (3 rows)
    for (let row = 0; row < 3; row++) {
      const wy = b2y + 4 + row * 7;
      const wOn = Math.sin(time * 0.002 + row * 1.5) > -0.3;
      px(ctx, b2x + 3, wy, 3, 3, wOn ? P.window : P.windowOff);
      px(ctx, b2x + 10, wy, 3, 3, wOn ? P.window : P.windowOff);
    }
    px(ctx, b2x + 5, b2y + 19, 6, 7, P.door);  // door
    // arch over door
    circ(ctx, b2x + 8, b2y + 19, 3.5, P.house2dk, 0.3);
    px(ctx, b2x + 5, b2y + 19, 6, 7, P.door);

    // Building 3: shop (right of center)
    const b3x = 104, b3y = 42;
    px(ctx, b3x, b3y, 20, 14, P.house3);              // body
    px(ctx, b3x, b3y, 20, 2, P.house3dk, 0.35);       // top shadow
    px(ctx, b3x, b3y, 2, 14, P.house3dk, 0.2);        // left shadow
    px(ctx, b3x - 1, b3y - 1, 22, 3, P.roof3);        // flat roof
    px(ctx, b3x, b3y - 1, 20, 1, P.roof3dk, 0.4);
    // awning
    for (let aw = 0; aw < 5; aw++) {
      const awX = b3x + 1 + aw * 4;
      tri(ctx, awX, b3y + 2, awX + 2, b3y + 5, awX + 4, b3y + 2, aw % 2 === 0 ? '#d04040' : '#f0f0f0');
    }
    px(ctx, b3x + 3, b3y + 6, 5, 4, P.window);        // big window
    px(ctx, b3x + 13, b3y + 7, 4, 7, P.door);          // door
    const shopSign = Math.sin(time * 0.0015) > 0 ? 0.9 : 0.6;
    px(ctx, b3x + 3, b3y + 6, 5, 4, P.window, shopSign); // lit shop window

    /* --- trees --- */
    drawTree(10, 55, 0, 0);
    drawTree(55, 52, 2.5, 1);
    drawTree(96, 50, 5, 0);
    drawTree(150, 54, 1.2, 1);
    drawTree(175, 58, 3.8, 0);
    drawTree(190, 52, 6, 1);

    /* --- animated pixel pets --- */
    function drawPet(baseX, baseY, color, speed, offset, dir) {
      const bounce = Math.abs(Math.sin(time * speed + offset)) * 2;
      const walkX = baseX + Math.sin(time * speed * 0.4 + offset) * 8 * dir;
      const py = baseY - bounce;

      // body (4x3 blob)
      px(ctx, walkX, py, 4, 3, color);
      // head
      px(ctx, walkX + (dir > 0 ? 3 : -1), py - 1, 2, 2, color);
      // eye
      circ(ctx, walkX + (dir > 0 ? 4.5 : -0.5), py - 0.5, 0.5, '#ffffff', 0.9);
      // legs (alternating)
      const legPhase = Math.sin(time * speed * 2 + offset) > 0;
      px(ctx, walkX + (legPhase ? 0 : 1), py + 3, 1, 1, color, 0.8);
      px(ctx, walkX + (legPhase ? 3 : 2), py + 3, 1, 1, color, 0.8);
      // tail
      const tailWag = Math.sin(time * 0.006 + offset) * 1;
      px(ctx, walkX + (dir > 0 ? -1 : 4), py + tailWag, 1, 1, color, 0.7);
    }

    drawPet(38, 62, P.pet1, 0.004, 0, 1);
    drawPet(80, 68, P.pet2, 0.003, 2, -1);
    drawPet(160, 72, P.pet3, 0.0035, 4, 1);

    /* --- small flowers / details --- */
    const flowerSpots = [
      [16, 64], [48, 60], [62, 64], [115, 62], [142, 70], [168, 66],
    ];
    for (const [fx, fy] of flowerSpots) {
      const bloom = 0.6 + 0.4 * Math.sin(time * 0.002 + fx);
      circ(ctx, fx, fy, 1.2, '#e060a0', bloom);
      circ(ctx, fx + 0.5, fy - 0.5, 0.5, '#f0a0c0', bloom * 0.8);
    }

    frameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={100}
      className="w-full rounded-lg"
      style={{ imageRendering: 'pixelated', aspectRatio: '2/1' }}
    />
  );
}

/* ── PetWorldLauncher ── */

export default function PetWorldLauncher({ world, onPlay }) {
  const hasWorld = !!world;
  const population = world?.population ?? 0;
  const biome = world?.biome || null;
  const expansions = world?.expansions ?? 0;

  const Wrapper = onPlay ? 'button' : Link;
  const wrapperProps = onPlay
    ? { onClick: onPlay, type: 'button' }
    : { to: '/pet/world' };

  return (
    <Wrapper
      {...wrapperProps}
      className="w-full group relative block rounded-xl border border-white/[0.08] bg-gradient-to-br from-emerald-950/60 via-green-950/40 to-black/20 text-left transition-all hover:border-emerald-500/25 active:scale-[0.98] overflow-hidden"
    >
      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/12 to-transparent rounded-bl-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-green-500/8 to-transparent rounded-tr-full pointer-events-none" />

      {/* Hero diorama */}
      <div className="relative px-3 pt-3">
        <div className="rounded-lg overflow-hidden border border-white/[0.06] bg-black/30">
          <VillageDiorama />
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 pt-2.5">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-bold text-white/90 tracking-tight">Pet World</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300/85 border border-emerald-400/10">
            Idle Sim
          </span>
        </div>

        {/* Description */}
        <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
          Build a persistent village, grow your population, and trade with friends.
        </p>

        {/* Stats line */}
        <div className="flex items-center gap-2 mb-2.5">
          {hasWorld ? (
            <>
              <span className="text-[9px] text-emerald-300/90 font-semibold">{population} pop</span>
              {biome && (
                <span className="text-[9px] text-gray-500 capitalize flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                  {biome}
                </span>
              )}
              {expansions > 0 && (
                <span className="text-[9px] text-gray-600">{expansions} expansion{expansions !== 1 ? 's' : ''}</span>
              )}
            </>
          ) : (
            <span className="text-[9px] text-emerald-400/70 font-semibold">Create your world</span>
          )}
        </div>

        {/* CTA Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/12 group-hover:bg-emerald-500/25 group-hover:border-emerald-400/20 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400/80 group-hover:text-emerald-300 transition-colors">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            <span className="text-[11px] font-bold text-emerald-300/90 group-hover:text-emerald-200 transition-colors tracking-wide">
              Enter Village
            </span>
          </div>

          <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover:bg-white/10 transition-colors shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-colors">
              <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
