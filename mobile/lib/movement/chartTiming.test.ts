import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chartMatchesPumpMode,
  chartTimingToMovementStepCues,
  formatChartTimingTitle,
  rebaseFootLandmarkFrame,
  shouldApplyChartTimingResponse,
} from './chartTiming';
import type { ChartTimingResponse } from '@shared/api';

describe('movement chart timing adapter', () => {
  it('matches chart modes to Movement Lab pump modes', () => {
    assert.equal(chartMatchesPumpMode({ mode: 'Single' }, 'singles'), true);
    assert.equal(chartMatchesPumpMode({ mode: 'Double' }, 'doubles'), true);
    assert.equal(chartMatchesPumpMode({ mode: 'Double' }, 'singles'), false);
    assert.equal(chartMatchesPumpMode({ mode: 'CoOp' }, 'doubles'), false);
  });

  it('converts shared chart timing cues into local Movement Lab step cues', () => {
    const timing = chartTiming();

    const cues = chartTimingToMovementStepCues(timing);

    assert.deepEqual(cues, [
      {
        id: 'cue-1',
        songId: '321',
        timeMs: 1000,
        panel: 'topLeft',
      },
      {
        id: 'cue-2',
        songId: '321',
        timeMs: 1500,
        panel: 'bottomRight',
        side: 'right',
      },
    ]);
  });

  it('formats selected chart timing for session titles', () => {
    assert.equal(formatChartTimingTitle(chartTiming()), 'Test Song S17');
  });

  it('rejects stale or mode-mismatched chart timing responses', () => {
    const timing = chartTiming();

    assert.equal(shouldApplyChartTimingResponse({
      requestId: 2,
      activeRequestId: 2,
      mode: 'singles',
      timing,
    }), true);
    assert.equal(shouldApplyChartTimingResponse({
      requestId: 1,
      activeRequestId: 2,
      mode: 'singles',
      timing,
    }), false);
    assert.equal(shouldApplyChartTimingResponse({
      requestId: 2,
      activeRequestId: 2,
      mode: 'doubles',
      timing,
    }), false);
  });

  it('rebases landmark frame timestamps to the live run origin', () => {
    const frame = {
      timestampMs: 10_500,
      left: {
        footIndex: { point: { x: 0.5, y: 0.5 }, confidence: 0.8 },
      },
    };

    assert.deepEqual(rebaseFootLandmarkFrame(frame, 10_000), {
      ...frame,
      timestampMs: 500,
    });
    assert.deepEqual(rebaseFootLandmarkFrame(frame, 11_000), {
      ...frame,
      timestampMs: 0,
    });
  });
});

function chartTiming(): ChartTimingResponse {
  return {
    chart: {
      chart_id: 321,
      title: 'Test Song',
      artist: 'Artist',
      mode: 'Single',
      level: 17,
    },
    source: {
      type: 'chart-editor-preset',
      file: 'PHOENIX/Test Song.ssc',
      title: 'Test Song',
      artist: 'Artist',
    },
    stepCues: [
      {
        id: 'cue-1',
        chartId: 321,
        timeMs: 1000,
        panel: 'topLeft',
      },
      {
        id: 'cue-2',
        chartId: 321,
        timeMs: 1500,
        panel: 'bottomRight',
        side: 'right',
      },
    ],
  };
}
