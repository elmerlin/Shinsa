import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getShinsaInMotionData } from '../utils/api';

const DURATION_MS = 60000;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hashUnit(v, salt = '') { return (hashStr(`${v}:${salt}`) % 10000) / 10000; }

function makeColor(hue, a = 1) { return `hsla(${Math.round(hue)}, 88%, 62%, ${a})`; }

function roundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function cubicBez(p, t) {
  const u = clamp(t, 0, 1), m = 1 - u;
  return {
    x: m * m * m * p.s.x + 3 * m * m * u * p.c1.x + 3 * m * u * u * p.c2.x + u * u * u * p.e.x,
    y: m * m * m * p.s.y + 3 * m * m * u * p.c1.y + 3 * m * u * u * p.c2.y + u * u * u * p.e.y,
  };
}

function samplePath(path, n = 200) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(cubicBez(path, i / (n - 1)));
  return pts;
}

function countBefore(fracs, p) {
  let lo = 0, hi = fracs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; p >= fracs[m] ? lo = m + 1 : hi = m; }
  return lo;
}

function buildScene(data, w, h) {
  const users = (data?.users || []).filter(u => (parseInt(u?.play_count, 10) || 0) > 0);
  if (!users.length) return null;

  const isMobile = w < 500;
  const rightPad = isMobile ? 6 : 16;
  const barAreaWidth = isMobile ? clamp(w * 0.2, 55, 100) : clamp(w * 0.22, 120, 280);
  const pad = isMobile ? 6 : 20;
  const barX = w - barAreaWidth - rightPad;
  const barW = barAreaWidth - (isMobile ? 24 : 30);

  const originX = pad + 16;
  const originY = h - pad - 16;

  const maxSongs = users.reduce((mx, u) => Math.max(mx, parseInt(u.play_count, 10) || 0), 1);
  const topPad = isMobile ? 48 : 60;
  const botPad = isMobile ? 36 : 44;
  const rowH = Math.max(12, (h - topPad - botPad) / users.length);
  const labelSize = clamp(rowH * 0.32, 7, 13);

  const stars = Array.from({ length: clamp(Math.round(w * h / 14000), 40, 150) }, (_, i) => ({
    x: hashUnit('sx', i) * w,
    y: hashUnit('sy', i) * h,
    r: lerp(0.4, 1.8, hashUnit('sr', i)),
    a: lerp(0.1, 0.7, hashUnit('sa', i)),
    spd: lerp(0.3, 1.2, hashUnit('ss', i)),
    ph: hashUnit('sp', i) * Math.PI * 2,
  }));

  const sceneUsers = users.map((user, idx) => {
    const count = Math.max(0, parseInt(user.play_count, 10) || 0);
    const seed = hashStr(user.id || `${user.username}-${idx}`);
    const hue = (seed * 17 + idx * 61 + 200) % 360;

    const targetY = topPad + rowH * (idx + 0.5);

    const spreadX = lerp(0.2, 0.6, hashUnit(user.id, 'spx'));
    const spreadY = lerp(0.15, 0.85, hashUnit(user.id, 'spy'));
    const path = {
      s: { x: originX + hashUnit(user.id, 'ox') * 30, y: originY - hashUnit(user.id, 'oy') * 30 },
      c1: { x: w * spreadX * 0.4, y: h * spreadY },
      c2: { x: w * 0.55 + hashUnit(user.id, 'c2') * w * 0.2, y: targetY + (hashUnit(user.id, 'c2y') - 0.5) * rowH * 2 },
      e: { x: barX - 12, y: targetY },
    };

    const trail = samplePath(path, 240);
    const plays = Array.isArray(user.plays) ? user.plays : [];
    const eventFracs = plays.map((_, pi) => clamp(0.05 + 0.9 * ((pi + 0.5) / Math.max(1, count)), 0.04, 0.96));

    return {
      ...user,
      play_count: count,
      hue,
      color: {
        solid: makeColor(hue, 0.95),
        soft: makeColor(hue, 0.25),
        dim: makeColor(hue, 0.1),
        glow: makeColor(hue, 0.5),
        bright: makeColor(hue, 0.85),
      },
      targetY,
      path, trail, plays, eventFracs,
      lineW: clamp(rowH * 0.12, 1, isMobile ? 2.5 : 3.5),
      avatarR: clamp(rowH * 0.28, 6, isMobile ? 11 : 16),
    };
  });

  return { w, h, pad, barX, barW, rowH, maxSongs, labelSize, originX, originY, stars, users: sceneUsers, isMobile };
}

function renderBg(scene, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(scene.w * dpr);
  c.height = Math.round(scene.h * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = ctx.createLinearGradient(0, 0, 0, scene.h);
  bg.addColorStop(0, '#030612');
  bg.addColorStop(0.5, '#051121');
  bg.addColorStop(1, '#03070f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, scene.w, scene.h);

  const nebulas = [
    { x: scene.w * 0.15, y: scene.h * 0.2, r: Math.max(scene.w, scene.h) * 0.3, c: 'rgba(20,158,202,0.12)' },
    { x: scene.w * 0.6, y: scene.h * 0.75, r: Math.max(scene.w, scene.h) * 0.35, c: 'rgba(255,136,56,0.1)' },
  ];
  for (const n of nebulas) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.globalAlpha = 0.12;
  for (const s of scene.stars) {
    ctx.fillStyle = '#dceaff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const u of scene.users) {
    ctx.beginPath();
    ctx.moveTo(u.trail[0].x, u.trail[0].y);
    for (let i = 1; i < u.trail.length; i++) ctx.lineTo(u.trail[i].x, u.trail[i].y);
    ctx.strokeStyle = u.color.dim;
    ctx.lineWidth = u.lineW;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  for (const u of scene.users) {
    const th = clamp(scene.rowH * 0.16, 4, 10);
    roundedRect(ctx, scene.barX, u.targetY - th / 2, scene.barW, th, th / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
  }

  return c;
}

export default function ShinsaInMotionSection() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const bgRef = useRef(null);
  const elapsedRef = useRef(0);
  const avatarCache = useRef(new Map());

  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [looping, setLooping] = useState(true);
  const [tick, setTick] = useState(0);

  const drawAvatar = useCallback((ctx, user, x, y, r) => {
    const key = user.id || user.username;
    const cached = avatarCache.current.get(key);
    const cr = clamp(r, 6, 18);

    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.clip();
    if (cached?.ok && cached.img) {
      ctx.drawImage(cached.img, x - cr, y - cr, cr * 2, cr * 2);
    } else {
      const g = ctx.createLinearGradient(x - cr, y - cr, x + cr, y + cr);
      g.addColorStop(0, makeColor(user.hue, 0.85));
      g.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(x - cr, y - cr, cr * 2, cr * 2);
      ctx.fillStyle = '#081020';
      ctx.font = `700 ${Math.max(8, cr)}px "Segoe UI",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((user.username || '?')[0].toUpperCase(), x, y + 1);
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.shadowColor = user.color.glow;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }, []);

  const drawFrame = useCallback((rawP) => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    const bg = bgRef.current;
    if (!canvas || !scene || !bg) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, scene.w, scene.h);
    ctx.drawImage(bg, 0, 0, scene.w, scene.h);

    const p = easeInOutCubic(clamp(rawP, 0, 1));
    const now = performance.now() * 0.001;

    for (const s of scene.stars) {
      const i = 0.3 + 0.7 * ((Math.sin(now * s.spd + s.ph) + 1) * 0.5);
      ctx.fillStyle = `rgba(220,234,255,${s.a * i})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }

    for (const u of scene.users) {
      const tidx = Math.max(1, Math.round(p * (u.trail.length - 1)));
      const vis = u.trail.slice(0, tidx + 1);

      ctx.beginPath();
      ctx.moveTo(vis[0].x, vis[0].y);
      for (let i = 1; i < vis.length; i++) ctx.lineTo(vis[i].x, vis[i].y);
      ctx.strokeStyle = u.color.glow;
      ctx.lineWidth = u.lineW * 2.5;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.save();
      ctx.shadowColor = u.color.glow;
      ctx.shadowBlur = u.lineW * 6;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(vis[0].x, vis[0].y);
      for (let i = 1; i < vis.length; i++) ctx.lineTo(vis[i].x, vis[i].y);
      ctx.strokeStyle = u.color.solid;
      ctx.lineWidth = u.lineW;
      ctx.stroke();

      const head = vis[vis.length - 1];
      ctx.save();
      ctx.shadowColor = u.color.bright;
      ctx.shadowBlur = 18;
      ctx.fillStyle = u.color.bright;
      ctx.beginPath(); ctx.arc(head.x, head.y, clamp(scene.rowH * 0.18, 2.5, 5), 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      const passed = countBefore(u.eventFracs, p);
      for (let ei = Math.max(0, passed - 2); ei < Math.min(u.eventFracs.length, passed + 2); ei++) {
        const frac = u.eventFracs[ei];
        const delta = Math.abs(p - frac);
        const pulse = 1 - clamp(delta / 0.04, 0, 1);
        if (pulse <= 0) continue;
        const pt = cubicBez(u.path, frac);
        ctx.save();
        ctx.shadowColor = u.color.bright;
        ctx.shadowBlur = 14 + pulse * 12;
        ctx.fillStyle = u.color.bright;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 2 + pulse * 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      const th = clamp(scene.rowH * 0.16, 4, 10);
      const nextFrac = u.eventFracs[passed] ?? 1;
      const prevFrac = passed > 0 ? u.eventFracs[passed - 1] : 0;
      const segP = nextFrac > prevFrac ? clamp((p - prevFrac) / (nextFrac - prevFrac), 0, 1) : 1;
      const animVal = Math.min(u.play_count, passed + segP * 0.9);
      const fillW = scene.barW * (animVal / scene.maxSongs);

      const fg = ctx.createLinearGradient(scene.barX, u.targetY, scene.barX + fillW, u.targetY);
      fg.addColorStop(0, u.color.soft);
      fg.addColorStop(1, u.color.solid);
      roundedRect(ctx, scene.barX, u.targetY - th / 2, Math.max(1, fillW), th, th / 2);
      ctx.fillStyle = fg;
      ctx.fill();

      const ax = clamp(scene.barX + fillW, scene.barX + u.avatarR, scene.barX + scene.barW);
      drawAvatar(ctx, u, ax, u.targetY, u.avatarR);

      if (scene.rowH >= 28 && !scene.isMobile) {
        ctx.fillStyle = 'rgba(230,240,255,0.8)';
        ctx.font = `600 ${scene.labelSize}px "Segoe UI",sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxChars = Math.floor(scene.barW / (scene.labelSize * 0.65));
        const name = u.username.length > maxChars ? u.username.slice(0, maxChars - 1) + '..' : u.username;
        ctx.fillText(name, scene.barX, u.targetY - scene.rowH * 0.32);

        ctx.fillStyle = 'rgba(250,252,255,0.95)';
        ctx.font = `700 ${scene.labelSize}px "Segoe UI",sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.min(u.play_count, passed)), scene.barX + scene.barW, u.targetY - scene.rowH * 0.32);
      } else if (scene.rowH >= 18) {
        ctx.fillStyle = 'rgba(250,252,255,0.9)';
        ctx.font = `700 ${clamp(scene.labelSize, 7, 10)}px "Segoe UI",sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.min(u.play_count, passed)), scene.barX + scene.barW, u.targetY);
      }
    }

    const pbH = 2;
    const pbY = scene.h - pbH;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, pbY, scene.w, pbH);
    ctx.fillStyle = 'rgba(100,200,255,0.4)';
    ctx.fillRect(0, pbY, scene.w * rawP, pbH);
  }, [drawAvatar]);

  const rebuild = useCallback(() => {
    const host = containerRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !data) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const scene = buildScene(data, rect.width, rect.height);
    sceneRef.current = scene;
    if (scene) {
      bgRef.current = renderBg(scene, dpr);
      for (const u of scene.users) {
        const key = u.id || u.username;
        if (!u.avatar || avatarCache.current.has(key)) continue;
        const img = new Image();
        avatarCache.current.set(key, { ok: false, img });
        img.crossOrigin = 'anonymous';
        img.onload = () => { avatarCache.current.set(key, { ok: true, img }); };
        img.onerror = () => { avatarCache.current.set(key, { ok: false, img: null }); };
        img.src = u.avatar;
      }
    }
    drawFrame(elapsedRef.current / DURATION_MS);
  }, [data, drawFrame]);

  useEffect(() => {
    let dead = false;
    setState('loading');
    getShinsaInMotionData()
      .then(d => { if (!dead) { setData(d); setState('playing'); } })
      .catch(e => { if (!dead) { setError(e?.message || 'Failed to load'); setState('paused'); } });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!data) return;
    rebuild();
    let timer = 0;
    const onResize = () => { clearTimeout(timer); timer = setTimeout(rebuild, 50); };
    let obs = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      obs = new ResizeObserver(onResize);
      obs.observe(containerRef.current);
    } else {
      window.addEventListener('resize', onResize);
    }
    return () => { clearTimeout(timer); obs ? obs.disconnect() : window.removeEventListener('resize', onResize); };
  }, [data, rebuild]);

  useEffect(() => {
    if (!data) return;
    let raf = 0;
    const startE = elapsedRef.current;
    const startT = performance.now();

    const frame = (now) => {
      const elapsed = state === 'playing'
        ? Math.min(DURATION_MS, startE + (now - startT))
        : elapsedRef.current;
      elapsedRef.current = elapsed;
      drawFrame(elapsed / DURATION_MS);

      if (state === 'playing' && elapsed < DURATION_MS) {
        raf = requestAnimationFrame(frame);
      } else if (state === 'playing' && elapsed >= DURATION_MS) {
        if (looping) {
          elapsedRef.current = 0;
          setTick(v => v + 1);
        } else {
          setState('ended');
        }
      }
    };

    if (state === 'playing') {
      raf = requestAnimationFrame(frame);
    } else {
      drawFrame(elapsedRef.current / DURATION_MS);
    }
    return () => cancelAnimationFrame(raf);
  }, [data, state, tick, looping, drawFrame]);

  const hasData = data && (data.totals?.active_users || 0) > 0;

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full bg-[#030712]"
        style={{ height: '100dvh', minHeight: 400 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 pointer-events-none">
        <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] text-cyan-200/40 font-display">Cinematic replay</p>
        <h2 className="text-base sm:text-lg font-black tracking-[0.06em] text-white/50 font-display">SHINSA IN MOTION</h2>
      </div>

      <div className="absolute bottom-3 right-2 sm:bottom-4 sm:right-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setLooping(v => !v)}
          className={`
            rounded-full px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-[0.15em]
            border backdrop-blur-sm transition-colors
            ${looping
              ? 'border-cyan-400/30 bg-cyan-900/40 text-cyan-200'
              : 'border-white/10 bg-black/40 text-slate-400'
            }
          `}
          title={looping ? 'Looping on' : 'Looping off'}
        >
          {looping ? 'Loop \u221E' : 'Loop off'}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!hasData) return;
            setState(s => {
              if (s === 'playing') return 'paused';
              if (s === 'ended') { elapsedRef.current = 0; setTick(v => v + 1); return 'playing'; }
              return 'playing';
            });
          }}
          className="rounded-full border border-cyan-300/20 bg-[#081323]/80 backdrop-blur-sm px-3 py-1 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:border-cyan-200/40 hover:text-white"
        >
          {state === 'playing' ? '\u23F8' : state === 'ended' ? '\u21BB' : '\u25B6'}
        </button>
      </div>

      {hasData && (
        <div className="absolute bottom-3 left-2 sm:bottom-4 sm:left-3 flex items-center gap-1.5 pointer-events-none">
          <span className="rounded-full border border-white/8 bg-black/30 px-2 py-0.5 text-[9px] font-display uppercase tracking-[0.12em] text-slate-300/60 backdrop-blur-sm">
            {data.totals.active_users} players
          </span>
          <span className="rounded-full border border-white/8 bg-black/30 px-2 py-0.5 text-[9px] font-display uppercase tracking-[0.12em] text-slate-300/60 backdrop-blur-sm">
            {data.totals.total_plays} songs
          </span>
        </div>
      )}

      {state === 'loading' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/80 backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60 font-display">Loading...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/80 backdrop-blur-sm p-4">
          <div className="max-w-xs text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/60 font-display">Error</p>
            <p className="mt-2 text-sm text-slate-200">{error}</p>
          </div>
        </div>
      )}

      {!state.includes('load') && !error && !hasData && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#040a14]/70 backdrop-blur-sm p-4">
          <div className="max-w-xs text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/60 font-display">No data yet</p>
            <p className="mt-2 text-sm text-slate-200">Complete some tournament matches to see the animation.</p>
          </div>
        </div>
      )}
    </div>
  );
}
