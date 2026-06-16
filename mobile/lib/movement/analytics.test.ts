import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPadCalibration } from './padLayout';
import {
  computeReactionSamples,
  mapPointToPanel,
  mapReactionDeltaToY,
  markOutliers,
  summarizeMovementSession,
} from './analytics';
import type { FootMovementEvent, ReactionSample, StepCue } from './types';

describe('movement pad mapping', () => {
  it('maps normalized points into Singles panels', () => {
    const calibration = createDefaultPadCalibration('singles');

    const match = mapPointToPanel({ x: 0.22, y: 0.18 }, calibration);

    assert.equal(match?.panel, 'topLeft');
    assert.equal(match?.side, undefined);
    assert.equal(match?.reason, 'inside-zone');
  });

  it('maps normalized points into Doubles side-specific panels', () => {
    const calibration = createDefaultPadCalibration('doubles');

    const match = mapPointToPanel({ x: 0.74, y: 0.5 }, calibration);

    assert.equal(match?.side, 'right');
    assert.equal(match?.panel, 'center');
    assert.equal(match?.zoneId, 'right.center');
  });
});

describe('movement reaction matching', () => {
  it('matches the earliest movement after a cue on the exact panel', () => {
    const cues: StepCue[] = [
      { id: 'cue-1', timeMs: 1_000, panel: 'topLeft' },
    ];
    const events: FootMovementEvent[] = [
      event({ id: 'before', timestampMs: 950, panel: 'topLeft' }),
      event({ id: 'wrong-panel', timestampMs: 1_110, panel: 'center' }),
      event({ id: 'first-match', timestampMs: 1_180, panel: 'topLeft', velocity: 1.6 }),
      event({ id: 'later-match', timestampMs: 1_260, panel: 'topLeft', velocity: 2.2 }),
    ];

    const samples = computeReactionSamples(cues, events);

    assert.equal(samples.length, 1);
    assert.equal(samples[0].cueId, 'cue-1');
    assert.equal(samples[0].movementEventId, 'first-match');
    assert.equal(samples[0].reactionMs, 180);
    assert.equal(samples[0].matchReason, 'exact-panel');
  });

  it('ignores events before the cue unless anticipatory matching is enabled', () => {
    const cues: StepCue[] = [
      { id: 'cue-1', timeMs: 1_000, panel: 'center' },
    ];
    const events: FootMovementEvent[] = [
      event({ id: 'too-early', timestampMs: 980, panel: 'center' }),
    ];

    assert.equal(computeReactionSamples(cues, events).length, 0);

    const anticipatory = computeReactionSamples(cues, events, { allowAnticipatoryMs: 50 });
    assert.equal(anticipatory.length, 1);
    assert.equal(anticipatory[0].reactionMs, -20);
    assert.equal(anticipatory[0].matchReason, 'anticipatory');
  });
});

describe('movement summary statistics', () => {
  it('computes mean, median, standard deviation, and speed metrics', () => {
    const samples: ReactionSample[] = [
      sample('a', 100, 0.9, 2),
      sample('b', 200, 0.7, 4),
      sample('c', 300, 0.8, 6),
    ];

    const summary = summarizeMovementSession({ samples, events: [] });

    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.meanReactionMs, 200);
    assert.equal(summary.medianReactionMs, 200);
    assert.equal(Math.round(summary.standardDeviationMs ?? 0), 82);
    assert.equal(summary.fastestReactionMs, 100);
    assert.equal(summary.slowestReactionMs, 300);
    assert.equal(summary.averageFootSpeed, 4);
    assert.equal(summary.peakFootSpeed, 6);
    assert.equal(summary.detectionConfidence, 0.8);
  });

  it('returns honest empty-data summaries', () => {
    const summary = summarizeMovementSession({ samples: [], events: [] });

    assert.equal(summary.sampleCount, 0);
    assert.equal(summary.meanReactionMs, null);
    assert.equal(summary.medianReactionMs, null);
    assert.equal(summary.standardDeviationMs, null);
    assert.equal(summary.averageFootSpeed, null);
    assert.equal(summary.peakFootSpeed, null);
    assert.equal(summary.detectionConfidence, 0);
  });

  it('marks outliers without deleting them', () => {
    const marked = markOutliers([
      sample('a', 100),
      sample('b', 105),
      sample('c', 110),
      sample('d', 600),
    ]);

    assert.equal(marked.length, 4);
    assert.equal(marked[3].isOutlier, true);
    assert.equal(marked[0].isOutlier, false);
  });
});

describe('movement timeline coordinate mapping', () => {
  it('places slower-than-mean reaction dots above the mean line', () => {
    const centerY = 80;
    const slowerY = mapReactionDeltaToY({ reactionMs: 260, meanReactionMs: 200, centerY, msPerPixel: 10 });
    const fasterY = mapReactionDeltaToY({ reactionMs: 140, meanReactionMs: 200, centerY, msPerPixel: 10 });

    assert.ok(slowerY < centerY);
    assert.ok(fasterY > centerY);
  });
});

function event(overrides: Partial<FootMovementEvent>): FootMovementEvent {
  return {
    id: overrides.id ?? 'event',
    timestampMs: overrides.timestampMs ?? 0,
    foot: overrides.foot ?? 'unknown',
    panel: overrides.panel ?? 'center',
    side: overrides.side,
    velocity: overrides.velocity ?? 1,
    confidence: overrides.confidence ?? 0.8,
    point: overrides.point ?? { x: 0.5, y: 0.5 },
  };
}

function sample(
  cueId: string,
  reactionMs: number,
  confidence = 0.8,
  velocity = 1,
): ReactionSample {
  return {
    cueId,
    cueTimeMs: 1_000,
    panel: 'center',
    movementEventId: `${cueId}-event`,
    movementTimeMs: 1_000 + reactionMs,
    reactionMs,
    foot: 'unknown',
    velocity,
    confidence,
    matchReason: 'exact-panel',
    isOutlier: false,
  };
}
