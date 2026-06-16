import { computeReactionSamples, summarizeMovementSession } from './analytics';
import { createDefaultPadCalibration } from './padLayout';
import type {
  FootMovementEvent,
  MovementSession,
  MovementSummary,
  PumpMode,
  PumpPanel,
  PumpPadSide,
  StepCue,
} from './types';

const SINGLES_SEQUENCE: PumpPanel[] = [
  'topLeft',
  'center',
  'bottomRight',
  'topRight',
  'bottomLeft',
  'center',
  'topLeft',
  'bottomRight',
];

const DOUBLES_SEQUENCE: { panel: PumpPanel; side: PumpPadSide }[] = [
  { side: 'left', panel: 'topLeft' },
  { side: 'left', panel: 'center' },
  { side: 'right', panel: 'center' },
  { side: 'right', panel: 'bottomRight' },
  { side: 'left', panel: 'bottomLeft' },
  { side: 'right', panel: 'topRight' },
  { side: 'left', panel: 'topRight' },
  { side: 'right', panel: 'bottomLeft' },
];

const REACTION_PATTERN = [142, 188, 221, 176, 248, 164, 302, 196];
const VELOCITY_PATTERN = [2.2, 2.8, 2.5, 3.1, 2.1, 3.4, 2.6, 2.9];

export interface MockMovementRun {
  session: MovementSession;
  summary: MovementSummary;
}

export function createDemoStepCues(mode: PumpMode, songId = 'movement-demo'): StepCue[] {
  const baseTime = 1_000;
  const gap = 520;
  if (mode === 'singles') {
    return SINGLES_SEQUENCE.map((panel, index) => ({
      id: `cue-${index + 1}`,
      songId,
      timeMs: baseTime + index * gap,
      panel,
      expectedFoot: index % 2 === 0 ? 'left' : 'right',
    }));
  }

  return DOUBLES_SEQUENCE.map((cue, index) => ({
    id: `cue-${index + 1}`,
    songId,
    timeMs: baseTime + index * gap,
    panel: cue.panel,
    side: cue.side,
    expectedFoot: index % 2 === 0 ? 'left' : 'right',
  }));
}

export function createMockMovementEvents(cues: StepCue[]): FootMovementEvent[] {
  return cues.map((cue, index) => {
    const reactionMs = REACTION_PATTERN[index % REACTION_PATTERN.length];
    const velocity = VELOCITY_PATTERN[index % VELOCITY_PATTERN.length];
    return {
      id: `mock-event-${index + 1}`,
      timestampMs: cue.timeMs + reactionMs,
      foot: cue.expectedFoot ?? (index % 2 === 0 ? 'left' : 'right'),
      panel: cue.panel,
      side: cue.side,
      velocity,
      confidence: index === 6 ? 0.58 : 0.78 + (index % 3) * 0.05,
      point: mockPointForPanel(cue.panel, cue.side),
    };
  });
}

export function buildMockMovementSession(mode: PumpMode): MockMovementRun {
  const stepCues = createDemoStepCues(mode);
  const events = createMockMovementEvents(stepCues);
  const samples = computeReactionSamples(stepCues, events);
  const now = new Date().toISOString();
  const session: MovementSession = {
    id: `mock-${mode}-${Date.now()}`,
    mode,
    songId: 'movement-demo',
    songTitle: mode === 'singles' ? 'Demo Singles Drill' : 'Demo Doubles Drill',
    startedAt: now,
    endedAt: now,
    calibration: createDefaultPadCalibration(mode),
    stepCues,
    events,
    samples,
    isDemo: true,
    notes: 'Deterministic simulator data. Not a production movement result.',
  };

  return {
    session,
    summary: summarizeMovementSession(session),
  };
}

function mockPointForPanel(panel: PumpPanel, side?: PumpPadSide) {
  const local = {
    topLeft: { x: 0.25, y: 0.2 },
    topRight: { x: 0.75, y: 0.2 },
    center: { x: 0.5, y: 0.5 },
    bottomLeft: { x: 0.25, y: 0.8 },
    bottomRight: { x: 0.75, y: 0.8 },
  }[panel];

  if (!side) return local;
  return {
    x: side === 'left' ? local.x * 0.46 : 0.54 + local.x * 0.42,
    y: local.y,
  };
}
