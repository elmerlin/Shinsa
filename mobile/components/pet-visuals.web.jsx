/**
 * Pet visuals — web only.
 *
 * Centralizes all the per-cosmetic / per-habitat / per-prop pixel-art
 * + gradient backdrops that the web client uses on PetPage.jsx so the
 * mobile-web hub renders the same imagery instead of generic emojis.
 *
 * Three exports:
 *   <HabitatScene pet />         — backdrop + floor + wall + prop +
 *                                  the SpritePet, composited into a
 *                                  single tile-able card.
 *   <CosmeticPreview kind id     — small SpritePet showing only that
 *                  character     cosmetic equipped, used in the shop
 *                  color />      and the Outfits equip grid.
 *   <PropMini id />              — just the pixel-prop sprite (no
 *                                  backdrop) for thumbnail listings.
 *
 * The .web.jsx extension means this file is web-only by Metro
 * resolution; the matching `.tsx` provides typed stubs for native.
 */
import React from 'react';
import SpritePet from './sprite-pet.web.jsx';

// ─── Backdrop gradients ────────────────────────────────────────────
// 1:1 with HabitatBackdrop in client/src/pages/PetPage.jsx.
const HABITAT_BACKDROPS = {
  'dojo-night':       'radial-gradient(circle at 50% 18%, rgba(88,196,255,0.16), transparent 42%), linear-gradient(180deg, rgba(18,48,80,0.18) 0%, rgba(3,7,18,0.6) 72%)',
  'sunset-arcade':    'radial-gradient(circle at 50% 16%, rgba(255,158,88,0.18), transparent 42%), linear-gradient(180deg, rgba(129,45,74,0.22) 0%, rgba(3,7,18,0.6) 72%)',
  'moon-festival':    'radial-gradient(circle at 50% 18%, rgba(255,220,130,0.14), transparent 42%), linear-gradient(180deg, rgba(86,42,108,0.22) 0%, rgba(3,7,18,0.6) 72%)',
  'inferno-stage':    'radial-gradient(circle at 50% 18%, rgba(255,98,72,0.16), transparent 42%), linear-gradient(180deg, rgba(112,22,22,0.26) 0%, rgba(3,7,18,0.6) 72%)',
  'neon-alley':       'radial-gradient(circle at 30% 20%, rgba(255,80,180,0.14), transparent 38%), radial-gradient(circle at 70% 25%, rgba(80,200,255,0.12), transparent 35%), linear-gradient(180deg, rgba(30,10,50,0.26) 0%, rgba(3,7,18,0.6) 72%)',
  'sakura-garden':    'radial-gradient(circle at 50% 15%, rgba(255,180,200,0.16), transparent 40%), linear-gradient(180deg, rgba(120,50,80,0.18) 0%, rgba(3,7,18,0.6) 72%)',
  'thunderdome':      'radial-gradient(circle at 50% 20%, rgba(120,180,255,0.18), transparent 40%), radial-gradient(circle at 50% 60%, rgba(255,200,60,0.08), transparent 40%), linear-gradient(180deg, rgba(15,20,60,0.28) 0%, rgba(3,7,18,0.6) 72%)',
  'celestial-shrine': 'radial-gradient(circle at 50% 15%, rgba(255,230,180,0.12), transparent 35%), radial-gradient(circle at 50% 50%, rgba(200,160,255,0.08), transparent 40%), linear-gradient(180deg, rgba(40,20,60,0.24) 0%, rgba(3,7,18,0.6) 72%)',
};

// Floor styles per id — repeating gradient + tints.
const HABITAT_FLOORS = {
  'tatami-mat': {
    background: 'repeating-linear-gradient(0deg, rgba(180,150,100,0.12) 0px, rgba(180,150,100,0.12) 2px, transparent 2px, transparent 8px)',
    borderTop: '1px solid rgba(180,150,100,0.18)',
  },
  'led-tiles': {
    background: 'repeating-linear-gradient(90deg, rgba(80,200,255,0.10) 0px, rgba(80,200,255,0.10) 12px, rgba(255,80,180,0.10) 12px, rgba(255,80,180,0.10) 24px)',
    boxShadow: 'inset 0 -2px 16px rgba(80,200,255,0.10)',
  },
  'cherry-petals': {
    background: 'radial-gradient(circle at 20% 40%, rgba(255,150,180,0.16) 0%, transparent 25%), radial-gradient(circle at 70% 60%, rgba(255,180,200,0.14) 0%, transparent 20%), radial-gradient(circle at 45% 30%, rgba(255,160,190,0.12) 0%, transparent 18%)',
  },
  'galaxy-floor': {
    background: 'radial-gradient(circle at 30% 50%, rgba(120,80,200,0.14) 0%, transparent 30%), radial-gradient(circle at 60% 40%, rgba(80,120,255,0.12) 0%, transparent 25%), radial-gradient(circle at 80% 70%, rgba(200,100,255,0.10) 0%, transparent 20%)',
    boxShadow: 'inset 0 0 20px rgba(120,80,200,0.10)',
  },
};

// Pixel art props (16×16). Strict subset of what the web has — easy to extend.
const PIXEL_PROP_ART = {
  'training-dummy': {
    width: 16,
    pixels: ['________________','______aa________','_____abca_______','_____adda_______','_____adda_______','_____adda_______','_____adda_______','_____adda_______','_____aeea_______','______ff________','______ff________','______ff________','_____ghhg_______','____giiiig______','____giiiig______','________________'],
    colors: { a: '#4d2c18', b: '#f3d295', c: '#b56a3f', d: '#8a4d27', e: '#d49d52', f: '#5a341c', g: '#31252b', h: '#67515e', i: '#40333d' },
  },
  'lucky-banner': {
    width: 16,
    pixels: ['_______aa_______','_______aa_______','_______aa_______','_____bbbbbb_____','_____bccdcb_____','_____beeeeb_____','_____beeeeb_____','_____beeeeb_____','_____beeeeb_____','_____bffffb_____','______fggf______','_______hh_______','_______hh_______','______iiii______','_____ijjjji_____','________________'],
    colors: { a: '#d8c79a', b: '#70402e', c: '#f1d37e', d: '#f7efc0', e: '#bb2f5c', f: '#f0b44e', g: '#ffd87a', h: '#bb7a2a', i: '#7a2d48', j: '#e7a63c' },
  },
  boombox: {
    width: 16,
    pixels: ['________________','________________','___aaaaaaaaaa___','__abbbbbbbbbbca_','__abdddeeeddbca_','__abdfggggfdbca_','__abdfghhgfdbca_','__abdfggggfdbca_','__abdddeeeddbca_','__abbiijjiibbca_','__abbbbbbbbbbca_','___akkkkkkkkla__','____mmmmmmmm____','________________','________________','________________'],
    colors: { a: '#233246', b: '#162233', c: '#49647b', d: '#31455d', e: '#587697', f: '#0e1622', g: '#1c2636', h: '#7fd5ff', i: '#2e475e', j: '#88bfe0', k: '#0f1724', l: '#3a556d', m: '#273243' },
  },
  'trophy-stand': {
    width: 16,
    pixels: ['_______aa_______','______abca______','_____abddca_____','_____aefgea_____','______ahha______','_______ii_______','_______ii_______','______ajka______','______ajka______','______ajka______','_____alllla_____','_____ammmma_____','____annnnnna____','___aoooooooa___','___apppppppa___','________________'],
    colors: { a: '#5f4b36', b: '#e7c56b', c: '#fff1b7', d: '#f0b14a', e: '#f9e0a1', f: '#d7962f', g: '#f8f2c9', h: '#d58f2c', i: '#7b5928', j: '#7a5737', k: '#c9993f', l: '#4a3943', m: '#352936', n: '#5a4651', o: '#2f2530', p: '#453541' },
  },
  'punching-bag': {
    width: 16,
    pixels: ['______aaa_______','_____abbba______','_____abbba______','______bbb_______','_____cdddc______','____cddddc______','____cddddc______','____cdeedc______','____cddddc______','____cddddc______','____cddddc______','_____cdddc______','______ccc_______','______fff_______','_____fffff______','________________'],
    colors: { a: '#8a8a8a', b: '#b0b0b0', c: '#5a2a1a', d: '#8b4513', e: '#d4a574', f: '#3d3d3d' },
  },
  'arcade-cab': {
    width: 16,
    pixels: ['___aaaaaaaaa____','___abbbbbba_____','___abcccba______','___abcdcba______','___abcccba______','___abbbbbba_____','___aeeeeea______','___aeffea_______','___aeeeeea______','___aaaaaa_______','____affa________','____affa________','___affffa_______','___affffa_______','___agggga_______','________________'],
    colors: { a: '#1a1a2e', b: '#0f0f23', c: '#2a4a8a', d: '#5ac8fa', e: '#2d2d44', f: '#3a3a55', g: '#151525' },
  },
  'medal-rack': {
    width: 16,
    pixels: ['__aaaaaaaaaa____','__abbbbbbbba____','__aaaaaaaaaa____','___cd__ef__g____','___cd__ef__g____','___hh__ii__jj___','___hkh_ili_jmj__','___hhh_iii_jjj__','____h___i___j___','________________','________________','________________','________________','________________','________________','________________'],
    colors: { a: '#5a3a2a', b: '#8a6a4a', c: '#d4a017', d: '#ffd700', e: '#c0c0c0', f: '#e8e8e8', g: '#cd7f32', h: '#ffd700', i: '#c0c0c0', j: '#cd7f32', k: '#fff8dc', l: '#f0f0f0', m: '#deb887' },
  },
  'spirit-lantern': {
    width: 16,
    pixels: ['______aa________','______aa________','_____abba_______','____abccba______','____acdca_______','____abccba______','_____abba_______','______ee________','______ee________','_____efffe______','_____efffe______','_____efffe______','______eee_______','______gg________','______gg________','________________'],
    colors: { a: '#4a3060', b: '#8a60b0', c: '#e0c0ff', d: '#ffffff', e: '#3a2040', f: '#6040a0', g: '#2a1530' },
  },
};

// Per-prop position inside the habitat scene (Tailwind-style absolute pos).
const PROP_POSITIONS = {
  'training-dummy': { right: 16, bottom: 16 },
  'lucky-banner':   { left: 16, top: 24 },
  boombox:          { left: 16, bottom: 16 },
  'trophy-stand':   { right: 16, top: 36 },
  'punching-bag':   { right: 24, bottom: 24 },
  'arcade-cab':     { left: 12, bottom: 12 },
  'medal-rack':     { right: 12, top: 48 },
  'spirit-lantern': { left: 24, top: 36 },
};

// Wall mini-glyphs.
const WALL_RENDERERS = {
  'dojo-scroll': () => (
    <div style={{ position: 'absolute', top: 32, right: 16, opacity: 0.85, pointerEvents: 'none' }}>
      <div style={{ width: 12, height: 36, borderRadius: 2, background: 'linear-gradient(180deg, #d4c4a0 0%, #b8a882 50%, #a89470 100%)', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>
        <div style={{ width: '100%', height: 2, background: 'rgba(120,72,16,0.32)', marginTop: 4 }} />
        <div style={{ width: '100%', height: 2, background: 'rgba(120,72,16,0.22)', marginTop: 4 }} />
        <div style={{ width: '100%', height: 2, background: 'rgba(120,72,16,0.22)', marginTop: 4 }} />
      </div>
    </div>
  ),
  'neon-sign': () => (
    <div style={{ position: 'absolute', top: 28, left: 18, pointerEvents: 'none' }}>
      <div style={{
        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 900, letterSpacing: 1,
        color: '#ff80d0',
        textShadow: '0 0 6px rgba(255,80,200,0.55), 0 0 12px rgba(255,80,200,0.32)',
        border: '1px solid rgba(255,80,200,0.35)', background: 'rgba(255,80,200,0.08)',
      }}>STOMP</div>
    </div>
  ),
  'photo-wall': () => (
    <div style={{ position: 'absolute', top: 30, left: 16, opacity: 0.78, pointerEvents: 'none', display: 'flex', gap: 2 }}>
      <div style={{ width: 12, height: 10, borderRadius: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.10)' }} />
      <div style={{ width: 10, height: 12, borderRadius: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 4 }} />
      <div style={{ width: 12, height: 8, borderRadius: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.10)', marginTop: 2 }} />
    </div>
  ),
  'champion-banner': () => (
    <div style={{ position: 'absolute', top: 24, right: 18, pointerEvents: 'none', opacity: 0.9 }}>
      <div style={{
        width: 20, height: 28, position: 'relative',
        background: 'linear-gradient(180deg, #8b0000 0%, #cc2200 100%)',
        clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)',
        boxShadow: '0 2px 8px rgba(140,0,0,0.32)',
      }}>
        <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: 'rgba(250,200,40,0.7)' }} />
      </div>
    </div>
  ),
};

export function PropMini({ id, scale = 4 }) {
  const art = PIXEL_PROP_ART[id];
  if (!art) return null;
  const cols = art.width;
  const rows = art.pixels.length;
  const pixels = [];
  for (let y = 0; y < rows; y++) {
    const row = art.pixels[y] || '';
    for (let x = 0; x < cols; x++) {
      const k = row[x] || '_';
      pixels.push(k === '_' ? 'transparent' : (art.colors[k] || 'transparent'));
    }
  }
  return (
    <div style={{
      width: cols * scale,
      height: rows * scale,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))',
    }}>
      {pixels.map((color, i) => (
        <span key={i} style={{ background: color, display: 'block', aspectRatio: '1 / 1' }} />
      ))}
    </div>
  );
}

function FloorOverlay({ id }) {
  const style = HABITAT_FLOORS[id];
  if (!style) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: '40%', pointerEvents: 'none', opacity: 0.95,
      ...style,
    }} />
  );
}

function PropOverlay({ id }) {
  if (!id) return null;
  const pos = PROP_POSITIONS[id] || { right: 16, bottom: 16 };
  return (
    <div style={{ position: 'absolute', pointerEvents: 'none', ...pos }}>
      <PropMini id={id} scale={3} />
    </div>
  );
}

function WallOverlay({ id }) {
  const renderer = WALL_RENDERERS[id];
  if (!renderer) return null;
  return renderer();
}

/**
 * Composes the full habitat scene: gradient backdrop + floor + wall +
 * prop + the live SpritePet centered at the bottom. Used in the right
 * rail on desktop and as a hero block on mobile.
 */
export function HabitatScene({ pet, height = 280 }) {
  const habitat = pet?.habitat || {};
  const bgId = habitat.active_background || 'dojo-night';
  const propId = habitat.active_prop || '';
  const floorId = habitat.active_floor || '';
  const wallId = habitat.active_wall || '';
  const backdrop = HABITAT_BACKDROPS[bgId] || HABITAT_BACKDROPS['dojo-night'];

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height,
      borderRadius: 14,
      overflow: 'hidden',
      background: '#06070d',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: backdrop }} />
      <FloorOverlay id={floorId} />
      <WallOverlay id={wallId} />
      <PropOverlay id={propId} />
      <div style={{
        position: 'absolute',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
      }}>
        <SpritePet
          character={pet?.character || 'dojocat'}
          weightState={pet?.weight_state}
          mood={pet?.mood}
          equippedHat={pet?.equipped_hat}
          equippedBelt={pet?.equipped_belt}
          equippedShoes={pet?.equipped_shoes}
          equippedTop={pet?.equipped_top}
          hatColor={pet?.hat_color}
          beltColor={pet?.belt_color}
          shoesColor={pet?.shoes_color}
          topColor={pet?.top_color}
          size={140}
        />
      </div>
    </div>
  );
}

/**
 * Renders a small SpritePet showing only the cosmetic in question
 * (hat / top / belt / shoes / toy if relevant), at a tile size
 * suitable for shop / equip grids.
 */
export function CosmeticPreview({ kind, id, color, character = 'dojocat', size = 72, weightState = 'normal' }) {
  // Show only the requested slot; clear everything else so the sprite
  // foregrounds the cosmetic the user is comparing.
  const props = {
    character,
    weightState,
    mood: 'happy',
    size,
    equippedHat: kind === 'hat' ? id : '',
    equippedBelt: kind === 'belt' ? id : '',
    equippedShoes: kind === 'shoes' ? id : '',
    equippedTop: kind === 'top' ? id : '',
    hatColor: kind === 'hat' ? color : '',
    beltColor: kind === 'belt' ? color : '',
    shoesColor: kind === 'shoes' ? color : '',
    topColor: kind === 'top' ? color : '',
  };
  return (
    <div style={{ width: size, height: size + 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <SpritePet {...props} />
    </div>
  );
}
