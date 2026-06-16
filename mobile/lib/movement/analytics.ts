import type {
  FootId,
  FootLandmarkFrame,
  FootLandmarks,
  FootMovementEvent,
  MovementSession,
  MovementSummary,
  PadCalibration,
  PanelMatch,
  PanelZone,
  Point2D,
  ReactionMatchReason,
  ReactionSample,
  StepCue,
} from './types';

interface MapPointOptions {
  includeNearest?: boolean;
  maxNearestDistance?: number;
}

interface ReactionOptions {
  windowMs?: number;
  allowAnticipatoryMs?: number;
  allowNearPanel?: boolean;
  minConfidence?: number;
}

interface MovementDetectionOptions {
  velocityThreshold?: number;
  minConfidence?: number;
}

interface SummaryInput {
  samples: ReactionSample[];
  events: FootMovementEvent[];
}

interface TimelineYInput {
  reactionMs: number;
  meanReactionMs: number;
  centerY: number;
  msPerPixel: number;
  minY?: number;
  maxY?: number;
}

export function computeVelocity(
  previous: { timestampMs: number; point: Point2D },
  current: { timestampMs: number; point: Point2D },
) {
  const dtMs = current.timestampMs - previous.timestampMs;
  if (dtMs <= 0) {
    return { dtMs, vx: 0, vy: 0, speed: 0 };
  }
  const seconds = dtMs / 1000;
  const vx = (current.point.x - previous.point.x) / seconds;
  const vy = (current.point.y - previous.point.y) / seconds;
  return {
    dtMs,
    vx,
    vy,
    speed: Math.hypot(vx, vy),
  };
}

export function detectMovementOnsets(
  frames: FootLandmarkFrame[],
  calibration: PadCalibration,
  options: MovementDetectionOptions = {},
): FootMovementEvent[] {
  const velocityThreshold = options.velocityThreshold ?? 0.8;
  const minConfidence = options.minConfidence ?? 0.35;
  const events: FootMovementEvent[] = [];
  const previousByFoot: Partial<Record<Exclude<FootId, 'unknown'>, { timestampMs: number; point: Point2D; speed: number }>> = {};

  for (const frame of [...frames].sort((a, b) => a.timestampMs - b.timestampMs)) {
    for (const foot of ['left', 'right'] as const) {
      const anchor = footAnchor(frame[foot]);
      if (!anchor || anchor.confidence < minConfidence) continue;
      const previous = previousByFoot[foot];
      if (!previous) {
        previousByFoot[foot] = { timestampMs: frame.timestampMs, point: anchor.point, speed: 0 };
        continue;
      }

      const velocity = computeVelocity(previous, { timestampMs: frame.timestampMs, point: anchor.point });
      const panelMatch = mapPointToPanel(anchor.point, calibration, { includeNearest: true });
      if (velocity.speed >= velocityThreshold && previous.speed < velocityThreshold && panelMatch) {
        events.push({
          id: `${foot}-${frame.timestampMs}`,
          timestampMs: frame.timestampMs,
          foot,
          panel: panelMatch.panel,
          side: panelMatch.side,
          velocity: velocity.speed,
          confidence: clamp01(anchor.confidence * panelMatch.confidence),
          point: anchor.point,
          rawLandmarks: frame[foot],
        });
      }

      previousByFoot[foot] = { timestampMs: frame.timestampMs, point: anchor.point, speed: velocity.speed };
    }
  }

  return events;
}

export function mapPointToPanel(
  point: Point2D,
  calibration: PadCalibration,
  options: MapPointOptions = {},
): PanelMatch | null {
  const scored = calibration.zones
    .map((zone) => scoreZone(point, zone))
    .sort((a, b) => b.insideScore - a.insideScore || a.distanceToCenter - b.distanceToCenter);

  const bestInside = scored.find((score) => score.inside);
  if (bestInside) {
    const secondInside = scored.find((score) => score.inside && score.zone.id !== bestInside.zone.id);
    const uniqueness = secondInside
      ? Math.max(0.45, Math.min(1, (secondInside.distanceToCenter - bestInside.distanceToCenter) * 6 + 0.55))
      : 1;
    return panelMatch(bestInside.zone, {
      confidence: clamp01((0.72 + bestInside.insideScore * 0.28) * uniqueness),
      reason: secondInside && uniqueness < 0.62 ? 'ambiguous' : 'inside-zone',
      distanceToCenter: bestInside.distanceToCenter,
    });
  }

  if (!options.includeNearest) return null;

  const nearest = scored[0];
  const maxNearestDistance = options.maxNearestDistance ?? 0.18;
  if (!nearest || nearest.distanceToCenter > maxNearestDistance) return null;

  return panelMatch(nearest.zone, {
    confidence: clamp01(0.35 * (1 - nearest.distanceToCenter / maxNearestDistance)),
    reason: 'nearest-zone',
    distanceToCenter: nearest.distanceToCenter,
  });
}

export function matchMovementToStepCue(
  cue: StepCue,
  events: FootMovementEvent[],
  options: ReactionOptions = {},
): { event: FootMovementEvent; reactionMs: number; matchReason: ReactionMatchReason; confidence: number } | null {
  const windowMs = options.windowMs ?? 700;
  const allowAnticipatoryMs = options.allowAnticipatoryMs ?? 0;
  const minConfidence = options.minConfidence ?? 0.1;

  const candidates = events
    .filter((event) => event.confidence >= minConfidence)
    .map((event) => {
      const reactionMs = event.timestampMs - cue.timeMs;
      if (reactionMs < -allowAnticipatoryMs || reactionMs > windowMs) return null;
      const exactPanel = event.panel === cue.panel && (!cue.side || event.side === cue.side);
      const samePanelAnySide = event.panel === cue.panel && !cue.side;
      if (!exactPanel && !(options.allowNearPanel && samePanelAnySide)) return null;
      const matchReason: ReactionMatchReason = reactionMs < 0
        ? 'anticipatory'
        : exactPanel
          ? 'exact-panel'
          : 'near-panel';
      const panelWeight = matchReason === 'near-panel' ? 0.7 : 1;
      const timingWeight = reactionMs < 0 ? 0.8 : 1;
      return {
        event,
        reactionMs,
        matchReason,
        confidence: clamp01(event.confidence * panelWeight * timingWeight),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => {
      const aAfter = a.reactionMs >= 0 ? 0 : 1;
      const bAfter = b.reactionMs >= 0 ? 0 : 1;
      return aAfter - bAfter || a.event.timestampMs - b.event.timestampMs || b.confidence - a.confidence;
    });

  return candidates[0] ?? null;
}

export function computeReactionSamples(
  cues: StepCue[],
  events: FootMovementEvent[],
  options: ReactionOptions = {},
): ReactionSample[] {
  const orderedEvents = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  const samples = [...cues]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((cue) => {
      const match = matchMovementToStepCue(cue, orderedEvents, options);
      if (!match) return null;
      const sample: ReactionSample = {
        cueId: cue.id,
        cueTimeMs: cue.timeMs,
        panel: cue.panel,
        movementEventId: match.event.id,
        movementTimeMs: match.event.timestampMs,
        reactionMs: match.reactionMs,
        foot: match.event.foot,
        velocity: match.event.velocity,
        confidence: match.confidence,
        matchReason: match.matchReason,
        isOutlier: false,
      };
      if (cue.songId) sample.songId = cue.songId;
      if (cue.side) sample.side = cue.side;
      return sample;
    })
    .filter((sample): sample is ReactionSample => sample !== null);

  return markOutliers(samples);
}

export function summarizeMovementSession(session: MovementSession | SummaryInput): MovementSummary {
  const samples = session.samples ?? [];
  const usableSamples = samples.filter((sample) => Number.isFinite(sample.reactionMs) && !sample.isOutlier);
  const reactionSamples = usableSamples.length > 0 ? usableSamples : samples.filter((sample) => Number.isFinite(sample.reactionMs));
  const reactionValues = reactionSamples.map((sample) => sample.reactionMs);
  const speedValues = samples
    .map((sample) => sample.velocity)
    .filter((speed) => Number.isFinite(speed) && speed >= 0);
  const confidenceValues = samples
    .map((sample) => sample.confidence)
    .filter((confidence) => Number.isFinite(confidence));

  return {
    sampleCount: samples.length,
    meanReactionMs: reactionValues.length ? round(mean(reactionValues), 1) : null,
    medianReactionMs: reactionValues.length ? round(median(reactionValues), 1) : null,
    standardDeviationMs: reactionValues.length ? round(standardDeviation(reactionValues), 1) : null,
    madReactionMs: reactionValues.length ? round(mad(reactionValues), 1) : null,
    fastestReactionMs: reactionValues.length ? Math.min(...reactionValues) : null,
    slowestReactionMs: reactionValues.length ? Math.max(...reactionValues) : null,
    averageFootSpeed: speedValues.length ? round(mean(speedValues), 2) : null,
    peakFootSpeed: speedValues.length ? round(Math.max(...speedValues), 2) : null,
    detectionConfidence: confidenceValues.length ? round(mean(confidenceValues), 3) : 0,
    outlierCount: samples.filter((sample) => sample.isOutlier).length,
  };
}

export function markOutliers(samples: ReactionSample[], threshold = 3.5): ReactionSample[] {
  if (samples.length < 4) {
    return samples.map((sample) => ({ ...sample, isOutlier: false, outlierReason: undefined }));
  }

  const values = samples.map((sample) => sample.reactionMs);
  const medianValue = median(values);
  const madValue = mad(values);
  const scaledMad = madValue * 1.4826;
  const std = standardDeviation(values);
  const divisor = scaledMad > 0 ? scaledMad : std;

  if (divisor <= 0) {
    return samples.map((sample) => ({ ...sample, isOutlier: false, outlierReason: undefined }));
  }

  return samples.map((sample) => {
    const score = Math.abs(sample.reactionMs - medianValue) / divisor;
    const isOutlier = score > threshold;
    return {
      ...sample,
      isOutlier,
      outlierReason: isOutlier ? `Reaction is ${round(score, 1)} robust deviations from median` : undefined,
    };
  });
}

export function rejectOutliers(samples: ReactionSample[], threshold = 3.5): ReactionSample[] {
  return markOutliers(samples, threshold).filter((sample) => !sample.isOutlier);
}

export function mapReactionDeltaToY({
  reactionMs,
  meanReactionMs,
  centerY,
  msPerPixel,
  minY,
  maxY,
}: TimelineYInput): number {
  const scale = msPerPixel > 0 ? msPerPixel : 1;
  const y = centerY - (reactionMs - meanReactionMs) / scale;
  if (typeof minY === 'number' && y < minY) return minY;
  if (typeof maxY === 'number' && y > maxY) return maxY;
  return y;
}

function scoreZone(point: Point2D, zone: PanelZone) {
  const distanceToCenter = distance(point, zone.center);
  const inside = pointInPolygon(point, zone.polygon);
  return {
    zone,
    inside,
    distanceToCenter,
    insideScore: inside ? 1 / Math.max(0.001, distanceToCenter + 0.08) : 0,
  };
}

function panelMatch(
  zone: PanelZone,
  data: Pick<PanelMatch, 'confidence' | 'reason' | 'distanceToCenter'>,
): PanelMatch {
  return {
    zoneId: zone.id,
    panel: zone.panel,
    side: zone.side,
    confidence: data.confidence,
    reason: data.reason,
    distanceToCenter: data.distanceToCenter,
  };
}

function footAnchor(landmarks?: FootLandmarks): { point: Point2D; confidence: number } | null {
  if (!landmarks) return null;
  const weighted = [
    { landmark: landmarks.footIndex, weight: 0.5 },
    { landmark: landmarks.heel, weight: 0.3 },
    { landmark: landmarks.ankle, weight: 0.2 },
  ].filter((item): item is { landmark: NonNullable<typeof item.landmark>; weight: number } => !!item.landmark);

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight * item.landmark.confidence, 0);
  if (totalWeight <= 0) return null;

  return {
    point: {
      x: weighted.reduce((sum, item) => sum + item.landmark.point.x * item.weight * item.landmark.confidence, 0) / totalWeight,
      y: weighted.reduce((sum, item) => sum + item.landmark.point.y * item.weight * item.landmark.confidence, 0) / totalWeight,
    },
    confidence: clamp01(totalWeight / weighted.reduce((sum, item) => sum + item.weight, 0)),
  };
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (pointOnSegment(point, a, b)) return true;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: Point2D, a: Point2D, b: Point2D): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < 0) return false;
  const squaredLength = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= squaredLength;
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
