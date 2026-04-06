import React, { useEffect, useState } from 'react';

/**
 * Pixel art pet renderer using CSS grid pixels.
 * Each character has 5 weight states: starving, thin, normal, chubby, fat.
 * Sprites are 16x16 pixel grids rendered at configurable scale.
 */

const PIXEL_SIZE = 4;
const GRID = 16;

// Color palettes per character
const PALETTES = {
  dojocat: {
    body: '#f5a623',
    dark: '#d4841a',
    accent: '#ffffff',
    eyes: '#2d2d2d',
    nose: '#ff6b9d',
    belt: '#1a1a2e',
    ears: '#f5a623',
    earInner: '#ffcdd2',
  },
  buu: {
    body: '#e8b4d9',
    dark: '#c98bbd',
    accent: '#ffffff',
    eyes: '#2d2d2d',
    nose: '#d4679a',
    cape: '#9c27b0',
    belly: '#f3d1eb',
    antenna: '#e8b4d9',
  },
  devit: {
    body: '#e53935',
    dark: '#b71c1c',
    accent: '#ffeb3b',
    eyes: '#ffffff',
    pupils: '#2d2d2d',
    horns: '#d32f2f',
    tail: '#e53935',
    belly: '#ff8a80',
  },
  pixiu: {
    body: '#ffd54f',
    dark: '#ffb300',
    accent: '#ffffff',
    eyes: '#2d2d2d',
    mane: '#ff8f00',
    belly: '#fff9c4',
    wings: '#ffe082',
    horn: '#ffca28',
  },
};

// _ = empty, b = body, d = dark, a = accent, e = eyes, n = nose/special,
// x = extra1, y = extra2, z = extra3, w = extra4
// Each sprite is a 16x16 grid encoded as a string array of rows.

function getColorMap(character) {
  const p = PALETTES[character];
  if (!p) return {};
  switch (character) {
    case 'dojocat':
      return {
        b: p.body, d: p.dark, a: p.accent, e: p.eyes, n: p.nose,
        x: p.belt, y: p.ears, z: p.earInner,
      };
    case 'buu':
      return {
        b: p.body, d: p.dark, a: p.accent, e: p.eyes, n: p.nose,
        x: p.cape, y: p.belly, z: p.antenna,
      };
    case 'devit':
      return {
        b: p.body, d: p.dark, a: p.accent, e: p.eyes, n: p.pupils,
        x: p.horns, y: p.tail, z: p.belly,
      };
    case 'pixiu':
      return {
        b: p.body, d: p.dark, a: p.accent, e: p.eyes, n: p.mane,
        x: p.belly, y: p.wings, z: p.horn,
      };
    default:
      return {};
  }
}

const SPRITES = {
  dojocat: {
    starving: [
      '________________',
      '____y__y________',
      '___yz_yz________',
      '___bbbb_________',
      '___beeb_________',
      '___bnnb_________',
      '___bbbb_________',
      '____bb__________',
      '___xbbx_________',
      '____bb__________',
      '____bb__________',
      '____bb__________',
      '___b__b_________',
      '___b__b_________',
      '________________',
      '________________',
    ],
    thin: [
      '________________',
      '___y____y_______',
      '___yz__yz_______',
      '___bbbbb________',
      '___beeeb________',
      '___bnnbb________',
      '____bbb_________',
      '___xbbbx________',
      '____bbb_________',
      '____bbb_________',
      '____bbb_________',
      '___bb_bb________',
      '___b___b________',
      '________________',
      '________________',
      '________________',
    ],
    normal: [
      '________________',
      '___y____y_______',
      '___yz__yz_______',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '___xbbbbx_______',
      '___xbbbbx_______',
      '____bbbb________',
      '____bbbb________',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
      '________________',
    ],
    chubby: [
      '________________',
      '___y____y_______',
      '___yz__yz_______',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '__xbbbbbbx______',
      '__xbbbbbbx______',
      '___bbbbbb_______',
      '___bbbbbb_______',
      '___bbbbbb_______',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
    ],
    fat: [
      '________________',
      '___y____y_______',
      '___yz__yz_______',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '_xbbbbbbbbx_____',
      '_xbbbbbbbbx_____',
      '__xbbbbbbx______',
      '__bbbbbbbb______',
      '__bbbbbbbb______',
      '__bbb__bbb______',
      '__bb____bb______',
      '________________',
      '________________',
    ],
  },
  buu: {
    starving: [
      '______z_________',
      '______z_________',
      '____bbbb________',
      '____beeb________',
      '____bnnb________',
      '____bbbb________',
      '_____bb_________',
      '____xbbx________',
      '_____bb_________',
      '_____yb_________',
      '_____bb_________',
      '____b__b________',
      '____b__b________',
      '________________',
      '________________',
      '________________',
    ],
    thin: [
      '______z_________',
      '______z_________',
      '___bbbbb________',
      '___beeeb________',
      '___bnnbb________',
      '____bbb_________',
      '___xbbbx________',
      '____bbb_________',
      '____yyb_________',
      '____bbb_________',
      '___bb_bb________',
      '___b___b________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    normal: [
      '_____zz_________',
      '______z_________',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '___xbbbbx_______',
      '___xbbbbx_______',
      '____yyyy________',
      '____bbbb________',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    chubby: [
      '_____zz_________',
      '______z_________',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '__xbbbbbbx______',
      '__xbbbbbbx______',
      '___yyyyyy_______',
      '___bbbbbb_______',
      '___bbbbbb_______',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
      '________________',
    ],
    fat: [
      '_____zz_________',
      '______z_________',
      '___bbbbbb_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '_xbbbbbbbbx_____',
      '_xbbbbbbbbx_____',
      '__yyyyyyyy______',
      '__bbbbbbbb______',
      '__bbbbbbbb______',
      '__bbb__bbb______',
      '__bb____bb______',
      '________________',
      '________________',
      '________________',
    ],
  },
  devit: {
    starving: [
      '________________',
      '___x____x_______',
      '___xbbbbx_______',
      '___beeeb________',
      '___bnnnb________',
      '____bbb_________',
      '____zb__________',
      '___dzbdy________',
      '____bb__y_______',
      '____bb_y________',
      '____bb__________',
      '___b__b_________',
      '___b__b_________',
      '________________',
      '________________',
      '________________',
    ],
    thin: [
      '________________',
      '___x____x_______',
      '___xbbbbx_______',
      '___beeeb________',
      '___bnnnb________',
      '____bbb_________',
      '___dzbbdy_______',
      '____bbb_y_______',
      '____bbb__y______',
      '____bbb_________',
      '___bb_bb________',
      '___b___b________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    normal: [
      '________________',
      '___x____x_______',
      '___xbbbbx_______',
      '___beebb_________',
      '___bnnnb________',
      '____bbbb________',
      '___dzbbbdy______',
      '___dzbbbdy______',
      '____zzzz________',
      '____bbbb________',
      '___bb__bb_______',
      '___b____by______',
      '_________y______',
      '________________',
      '________________',
      '________________',
    ],
    chubby: [
      '________________',
      '___x____x_______',
      '___xbbbbx_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '__dzbbbbbbdy____',
      '__dzbbbbbbdy____',
      '___zzzzzz_______',
      '___bbbbbb_______',
      '___bb__bb__y____',
      '___b____b_y_____',
      '__________y_____',
      '________________',
      '________________',
      '________________',
    ],
    fat: [
      '________________',
      '___x____x_______',
      '___xbbbbx_______',
      '___beeebb_______',
      '___bnnbbb_______',
      '____bbbb________',
      '_dzbbbbbbbbdy___',
      '_dzbbbbbbbbdy___',
      '__zzzzzzzz______',
      '__bbbbbbbb______',
      '__bbb__bbb_y____',
      '__bb____bb_y____',
      '___________y____',
      '________________',
      '________________',
      '________________',
    ],
  },
  pixiu: {
    starving: [
      '______z_________',
      '____nnnn________',
      '___nbbbbn_______',
      '___nbeeb________',
      '____bbb_________',
      '____bb__________',
      '___ybby_________',
      '____xb__________',
      '____bb__________',
      '____bb__________',
      '___b__b_________',
      '___b__b_________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    thin: [
      '______z_________',
      '____nnnn________',
      '___nbbbbn_______',
      '___nbeebb_______',
      '____bbbb________',
      '___ybbby________',
      '___ybxby________',
      '____bbb_________',
      '____bbb_________',
      '___bb_bb________',
      '___b___b________',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    normal: [
      '______z_________',
      '____nnnn________',
      '___nbbbbbn______',
      '___nbeebbn______',
      '____bbbbb_______',
      '___ybbbbby______',
      '___ybbxbby______',
      '____bxxbb_______',
      '____bbbb________',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    chubby: [
      '______z_________',
      '____nnnn________',
      '___nbbbbbn______',
      '___nbeebbn______',
      '____bbbbb_______',
      '__ybbbbbbby_____',
      '__ybbbbbbby_____',
      '___bxxxxbb______',
      '___bbbbbb_______',
      '___bb__bb_______',
      '___b____b_______',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
    fat: [
      '______z_________',
      '____nnnn________',
      '___nbbbbbn______',
      '___nbeebbn______',
      '____bbbbb_______',
      '_ybbbbbbbbby____',
      '_ybbbbbbbbby____',
      '__bbxxxxxxbb____',
      '__bbbbbbbbbb____',
      '__bbb____bbb____',
      '__bb______bb____',
      '________________',
      '________________',
      '________________',
      '________________',
      '________________',
    ],
  },
};

// Idle animation: slight bounce effect
function useIdleBounce() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame = (frame + 1) % 60;
      setOffset(frame < 30 ? 0 : -1);
    }, 80);
    return () => clearInterval(interval);
  }, []);
  return offset;
}

function PixelPet({ character = 'dojocat', weightState = 'normal', size = PIXEL_SIZE, className = '' }) {
  const bounceOffset = useIdleBounce();
  const sprite = SPRITES[character]?.[weightState] || SPRITES.dojocat.normal;
  const colorMap = getColorMap(character);

  const pixels = [];
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char === '_') continue;
      const color = colorMap[char];
      if (!color) continue;
      pixels.push(
        <rect
          key={`${row}-${col}`}
          x={col * size}
          y={(row + bounceOffset) * size}
          width={size}
          height={size}
          fill={color}
        />
      );
    }
  }

  const svgWidth = GRID * size;
  const svgHeight = GRID * size;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {pixels}
    </svg>
  );
}

export default PixelPet;
export { SPRITES, PALETTES, VALID_CHARACTERS };
