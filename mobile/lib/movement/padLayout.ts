import type { PadCalibration, PanelZone, Point2D, PumpMode, PumpPadSide, PumpPanel } from './types';

export const PUMP_PANELS: PumpPanel[] = [
  'topLeft',
  'topRight',
  'center',
  'bottomLeft',
  'bottomRight',
];

export const PANEL_LABELS: Record<PumpPanel, string> = {
  topLeft: 'Top-left',
  topRight: 'Top-right',
  center: 'Center',
  bottomLeft: 'Bottom-left',
  bottomRight: 'Bottom-right',
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SINGLES_RECTS: Record<PumpPanel, Rect> = {
  topLeft: { x: 0.1, y: 0.05, width: 0.33, height: 0.3 },
  topRight: { x: 0.57, y: 0.05, width: 0.33, height: 0.3 },
  center: { x: 0.36, y: 0.36, width: 0.28, height: 0.28 },
  bottomLeft: { x: 0.1, y: 0.65, width: 0.33, height: 0.3 },
  bottomRight: { x: 0.57, y: 0.65, width: 0.33, height: 0.3 },
};

const SIDE_RECTS: Record<PumpPadSide, Rect> = {
  left: { x: 0.04, y: 0.05, width: 0.42, height: 0.9 },
  right: { x: 0.54, y: 0.05, width: 0.42, height: 0.9 },
};

export function createDefaultPadCalibration(mode: PumpMode): PadCalibration {
  const now = new Date(0).toISOString();
  return {
    id: `default-${mode}`,
    mode,
    zones: createPanelZones(mode),
    createdAt: now,
    updatedAt: now,
    confidence: 0.65,
  };
}

export function createPanelZones(mode: PumpMode): PanelZone[] {
  if (mode === 'singles') {
    return PUMP_PANELS.map((panel) => zoneFromRect(panel, undefined, SINGLES_RECTS[panel]));
  }

  return (['left', 'right'] as PumpPadSide[]).flatMap((side) => {
    const sideRect = SIDE_RECTS[side];
    return PUMP_PANELS.map((panel) => {
      const local = SINGLES_RECTS[panel];
      return zoneFromRect(panel, side, {
        x: sideRect.x + local.x * sideRect.width,
        y: sideRect.y + local.y * sideRect.height,
        width: local.width * sideRect.width,
        height: local.height * sideRect.height,
      });
    });
  });
}

export function panelKey(panel: PumpPanel, side?: PumpPadSide): string {
  return side ? `${side}.${panel}` : panel;
}

export function panelDisplayLabel(panel: PumpPanel, side?: PumpPadSide): string {
  const label = PANEL_LABELS[panel];
  return side ? `${side === 'left' ? 'Left' : 'Right'} ${label}` : label;
}

function zoneFromRect(panel: PumpPanel, side: PumpPadSide | undefined, rect: Rect): PanelZone {
  const polygon = rectToPolygon(rect);
  return {
    id: panelKey(panel, side),
    panel,
    side,
    label: panelDisplayLabel(panel, side),
    polygon,
    center: {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    },
  };
}

function rectToPolygon(rect: Rect): Point2D[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}
