// PIU panel colors (pump-single: 5 columns, pump-double: 10 columns)
// DL=0, UL=1, Center=2, UR=3, DR=4 (repeated for P2 side in double)
export const PANEL_COLORS = [
  '#4488ff', // DL - Blue
  '#ff3366', // UL - Red
  '#ffd700', // Center - Yellow
  '#ff3366', // UR - Red
  '#4488ff', // DR - Blue
  '#4488ff', // P2 DL - Blue
  '#ff3366', // P2 UL - Red
  '#ffd700', // P2 Center - Yellow
  '#ff3366', // P2 UR - Red
  '#4488ff', // P2 DR - Blue
];

export const PANEL_LABELS = [
  'DL', 'UL', 'C', 'UR', 'DR',
  'DL', 'UL', 'C', 'UR', 'DR',
];

// Arrow directions (degrees rotation from default up-pointing arrow)
// DL=225, UL=135, Center=0(special), UR=45, DR=315
export const PANEL_ROTATIONS = [
  225, 135, 0, 45, 315,
  225, 135, 0, 45, 315,
];

export const NOTE_TYPES = {
  EMPTY: '0',
  TAP: '1',
  HOLD_HEAD: '2',
  HOLD_TAIL: '3',
  ROLL_HEAD: '4',
  MINE: 'M',
  FAKE: 'F',
  LIFT: 'L',
};

export const NOTE_TYPE_NAMES = {
  tap: 'Tap',
  hold: 'Hold',
  roll: 'Roll',
  mine: 'Mine',
};

// Snap divisions: denominator of a whole note (4 beats)
export const SNAP_DIVISIONS = [4, 8, 12, 16, 24, 32, 48, 64, 192];

// Colors for beat grid lines by subdivision
export const SNAP_COLORS = {
  1: '#ff3333',   // whole note (measure) - red
  2: '#ff3333',   // half note
  4: '#ff3333',   // quarter note (beat) - red
  8: '#3366ff',   // 8th note - blue
  12: '#9933ff',  // 12th note (triplet) - purple
  16: '#ffcc00',  // 16th note - yellow
  24: '#ff66cc',  // 24th note - pink
  32: '#ff8833',  // 32nd note - orange
  48: '#66ccff',  // 48th note - cyan
  64: '#33cc33',  // 64th note - green
  192: '#888888', // 192nd - gray
};

export const GAME_TYPES = {
  'pump-single': { columns: 5, label: 'Pump Single' },
  'pump-double': { columns: 10, label: 'Pump Double' },
  'pump-halfdouble': { columns: 6, label: 'Pump Half-Double' },
  'dance-single': { columns: 4, label: 'Dance Single' },
  'dance-double': { columns: 8, label: 'Dance Double' },
};

// Canvas rendering constants
export const BEAT_HEIGHT = 80;        // pixels per beat at zoom 1.0
export const COLUMN_WIDTH = 48;       // pixels per column
export const RECEPTOR_Y = 60;         // receptor line Y position from top
export const NOTE_SIZE = 40;          // note circle/arrow size
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;
