import type { Chart, ChartTimingResponse } from '@shared/api';
import type { FootLandmarkFrame, PumpMode, StepCue } from './types';

type ChartModeLike = Pick<Chart, 'mode'> | Pick<ChartTimingResponse['chart'], 'mode'>;

interface ShouldApplyChartTimingResponseInput {
  requestId: number;
  activeRequestId: number;
  mode: PumpMode;
  timing: ChartTimingResponse;
}

export function chartMatchesPumpMode(chart: ChartModeLike, mode: PumpMode): boolean {
  const chartMode = String(chart.mode || '').toLowerCase();
  if (mode === 'singles') return chartMode === 'single';
  return chartMode === 'double';
}

export function shouldApplyChartTimingResponse(input: ShouldApplyChartTimingResponseInput): boolean {
  return input.requestId === input.activeRequestId && chartMatchesPumpMode(input.timing.chart, input.mode);
}

export function chartTimingToMovementStepCues(timing: ChartTimingResponse): StepCue[] {
  const songId = String(timing.chart.chart_id);
  return timing.stepCues.map((cue) => ({
    id: cue.id,
    songId: cue.songId ?? songId,
    timeMs: cue.timeMs,
    panel: cue.panel,
    ...(cue.side ? { side: cue.side } : {}),
    ...(cue.expectedFoot ? { expectedFoot: cue.expectedFoot } : {}),
  }));
}

export function formatChartTimingTitle(timing: ChartTimingResponse): string {
  return formatChartLabel(timing.chart);
}

export function formatChartLabel(chart: Pick<Chart, 'title' | 'mode' | 'level'>): string {
  const modePrefix = String(chart.mode || '').toLowerCase() === 'double' ? 'D' : 'S';
  const level = Number(chart.level || 0);
  return `${chart.title} ${modePrefix}${level || '?'}`;
}

export function rebaseFootLandmarkFrame(frame: FootLandmarkFrame, originTimestampMs: number): FootLandmarkFrame {
  const timestampMs = Math.max(0, frame.timestampMs - originTimestampMs);
  return {
    ...frame,
    timestampMs,
  };
}
