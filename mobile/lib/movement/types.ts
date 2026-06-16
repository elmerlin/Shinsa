export type PumpMode = 'singles' | 'doubles';
export type PumpPadSide = 'left' | 'right';
export type PumpPanel = 'topLeft' | 'topRight' | 'center' | 'bottomLeft' | 'bottomRight';
export type FootId = 'left' | 'right' | 'unknown';

export interface Point2D {
  x: number;
  y: number;
}

export interface PanelZone {
  id: string;
  panel: PumpPanel;
  side?: PumpPadSide;
  label: string;
  polygon: Point2D[];
  center: Point2D;
}

export interface PadCalibration {
  id: string;
  mode: PumpMode;
  zones: PanelZone[];
  createdAt: string;
  updatedAt: string;
  confidence: number;
}

export interface FootLandmarkPoint {
  point: Point2D;
  confidence: number;
}

export interface FootLandmarks {
  ankle?: FootLandmarkPoint;
  heel?: FootLandmarkPoint;
  footIndex?: FootLandmarkPoint;
}

export interface FootLandmarkFrame {
  timestampMs: number;
  left?: FootLandmarks;
  right?: FootLandmarks;
}

export interface PanelMatch {
  zoneId: string;
  panel: PumpPanel;
  side?: PumpPadSide;
  confidence: number;
  reason: 'inside-zone' | 'nearest-zone' | 'ambiguous' | 'off-pad';
  distanceToCenter: number;
}

export interface FootMovementEvent {
  id: string;
  timestampMs: number;
  foot: FootId;
  panel?: PumpPanel;
  side?: PumpPadSide;
  velocity: number;
  confidence: number;
  point?: Point2D;
  rawLandmarks?: FootLandmarks;
}

export interface StepCue {
  id: string;
  songId?: string;
  timeMs: number;
  panel: PumpPanel;
  side?: PumpPadSide;
  expectedFoot?: Exclude<FootId, 'unknown'>;
}

export type ReactionMatchReason = 'exact-panel' | 'near-panel' | 'anticipatory';

export interface ReactionSample {
  cueId: string;
  songId?: string;
  cueTimeMs: number;
  panel: PumpPanel;
  side?: PumpPadSide;
  movementEventId: string;
  movementTimeMs: number;
  reactionMs: number;
  foot: FootId;
  velocity: number;
  confidence: number;
  matchReason: ReactionMatchReason;
  isOutlier: boolean;
  outlierReason?: string;
}

export interface MovementSession {
  id: string;
  mode: PumpMode;
  songId?: string;
  songTitle?: string;
  startedAt: string;
  endedAt?: string;
  calibration?: PadCalibration;
  stepCues: StepCue[];
  events: FootMovementEvent[];
  samples: ReactionSample[];
  isDemo?: boolean;
  notes?: string;
}

export interface MovementSummary {
  sampleCount: number;
  meanReactionMs: number | null;
  medianReactionMs: number | null;
  standardDeviationMs: number | null;
  madReactionMs: number | null;
  fastestReactionMs: number | null;
  slowestReactionMs: number | null;
  averageFootSpeed: number | null;
  peakFootSpeed: number | null;
  detectionConfidence: number;
  outlierCount: number;
}
