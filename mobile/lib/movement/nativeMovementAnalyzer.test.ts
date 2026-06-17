import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoFallbackMovementSession,
  buildMovementSessionFromFrames,
  normalizePoseLandmarksToFootFrame,
} from './nativeMovementAnalyzer';
import { createDefaultPadCalibration } from './padLayout';
import type { FootLandmarkFrame, StepCue } from './types';

describe('native movement pose landmark adapter', () => {
  it('maps MediaPipe-compatible foot landmark indices into Shinsa foot frames', () => {
    const frame = normalizePoseLandmarksToFootFrame(mediaPipeFootLandmarks(), 1_234);

    assert.equal(frame.timestampMs, 1_234);
    assert.deepEqual(frame.left?.ankle?.point, { x: 0.22, y: 0.74 });
    assert.deepEqual(frame.left?.heel?.point, { x: 0.2, y: 0.78 });
    assert.deepEqual(frame.left?.footIndex?.point, { x: 0.24, y: 0.8 });
    assert.deepEqual(frame.right?.ankle?.point, { x: 0.72, y: 0.74 });
    assert.deepEqual(frame.right?.heel?.point, { x: 0.7, y: 0.78 });
    assert.deepEqual(frame.right?.footIndex?.point, { x: 0.74, y: 0.8 });
    assert.equal(frame.left?.footIndex?.confidence, 0.84);
    assert.equal(frame.right?.footIndex?.confidence, 0.79);
  });

  it('omits low-confidence foot landmarks instead of emitting false points', () => {
    const landmarks = mediaPipeFootLandmarks();
    landmarks[28] = { x: 0.72, y: 0.74, z: 0, visibility: 0.05 };
    landmarks[30] = { x: 0.7, y: 0.78, z: 0, visibility: 0.04 };
    landmarks[32] = { x: 0.74, y: 0.8, z: 0, visibility: 0.03 };

    const frame = normalizePoseLandmarksToFootFrame(landmarks, 2_000, { minConfidence: 0.2 });

    assert.ok(frame.left);
    assert.equal(frame.right, undefined);
  });
});

describe('native movement live session builder', () => {
  it('builds a non-demo MovementSession from live foot landmark frames', () => {
    const calibration = createDefaultPadCalibration('singles');
    const stepCues: StepCue[] = [
      { id: 'cue-top-left', timeMs: 1_000, panel: 'topLeft' },
    ];
    const frames: FootLandmarkFrame[] = [
      footFrame(1_000, 0.18, 0.18),
      footFrame(1_120, 0.33, 0.2),
      footFrame(1_240, 0.34, 0.21),
    ];

    const session = buildMovementSessionFromFrames({
      mode: 'singles',
      calibration,
      stepCues,
      frames,
      startedAt: '2026-06-17T10:00:00.000Z',
      endedAt: '2026-06-17T10:00:05.000Z',
    });

    assert.equal(session.isDemo, false);
    assert.equal(session.mode, 'singles');
    assert.equal(session.events.length, 1);
    assert.equal(session.samples.length, 1);
    assert.equal(session.samples[0].cueId, 'cue-top-left');
    assert.equal(session.samples[0].reactionMs, 120);
    assert.equal(session.notes?.includes('Live on-device pose landmarks'), true);
  });

  it('keeps the fallback session explicitly labelled as demo data', () => {
    const session = buildDemoFallbackMovementSession('doubles');

    assert.equal(session.isDemo, true);
    assert.equal(session.mode, 'doubles');
    assert.ok(session.events.length > 0);
    assert.equal(session.notes?.includes('Deterministic simulator data'), true);
  });
});

function mediaPipeFootLandmarks() {
  const landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }> = [];
  landmarks[27] = { x: 0.22, y: 0.74, z: 0.01, visibility: 0.82 };
  landmarks[28] = { x: 0.72, y: 0.74, z: 0.02, visibility: 0.8 };
  landmarks[29] = { x: 0.2, y: 0.78, z: 0.01, visibility: 0.86 };
  landmarks[30] = { x: 0.7, y: 0.78, z: 0.02, visibility: 0.78 };
  landmarks[31] = { x: 0.24, y: 0.8, z: 0.01, visibility: 0.84 };
  landmarks[32] = { x: 0.74, y: 0.8, z: 0.02, visibility: 0.79 };
  return landmarks;
}

function footFrame(timestampMs: number, x: number, y: number): FootLandmarkFrame {
  return {
    timestampMs,
    left: {
      ankle: { point: { x, y }, confidence: 0.85 },
      heel: { point: { x: x - 0.02, y: y + 0.02 }, confidence: 0.82 },
      footIndex: { point: { x: x + 0.02, y: y + 0.02 }, confidence: 0.88 },
    },
  };
}
