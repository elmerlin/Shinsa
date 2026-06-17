import { computeReactionSamples, detectMovementOnsets } from './analytics';
import { buildMockMovementSession, createDemoStepCues } from './mockMovementAnalyzer';
import { createDefaultPadCalibration } from './padLayout';
import type {
  FootLandmarkFrame,
  FootLandmarkPoint,
  FootMovementEvent,
  MovementSession,
  PadCalibration,
  PumpMode,
  StepCue,
} from './types';

export interface PoseLandmark {
  name: 'leftAnkle' | 'leftHeel' | 'leftFootIndex' | 'rightAnkle' | 'rightHeel' | 'rightFootIndex';
  x: number;
  y: number;
  z?: number;
  confidence: number;
}

export interface PoseFrameResult {
  timestampMs: number;
  landmarks: PoseLandmark[];
  confidence: number;
  frameWidth?: number;
  frameHeight?: number;
}

export interface NativeMovementAnalyzer {
  readonly mode: PumpMode;
  start(stepCues: StepCue[]): Promise<void>;
  stop(): Promise<FootMovementEvent[]>;
  onPoseFrame?(frame: PoseFrameResult): void;
  onLandmarkFrame?(frame: FootLandmarkFrame): void;
}

export interface NativePoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  confidence?: number;
}

export interface NormalizePoseLandmarksOptions {
  minConfidence?: number;
}

export interface BuildMovementSessionFromFramesInput {
  mode: PumpMode;
  frames: FootLandmarkFrame[];
  calibration?: PadCalibration;
  stepCues?: StepCue[];
  startedAt?: string;
  endedAt?: string;
  songId?: string;
  songTitle?: string;
}

export type PoseAnalyzerState = 'disabled' | 'initializing' | 'ready' | 'tracking' | 'waiting' | 'error';

export interface PoseAnalyzerStatus {
  state: PoseAnalyzerState;
  label: string;
  confidence: number;
  frameCount: number;
  message?: string;
}

export interface NativeAnalyzerAvailability {
  available: boolean;
  platform: string;
  reason: string;
  recommendedPackages: string[];
}

const LEFT_ANKLE_INDEX = 27;
const RIGHT_ANKLE_INDEX = 28;
const LEFT_HEEL_INDEX = 29;
const RIGHT_HEEL_INDEX = 30;
const LEFT_FOOT_INDEX = 31;
const RIGHT_FOOT_INDEX = 32;

export function normalizePoseLandmarksToFootFrame(
  landmarks: readonly (NativePoseLandmark | undefined)[],
  timestampMs: number,
  options: NormalizePoseLandmarksOptions = {},
): FootLandmarkFrame {
  const minConfidence = options.minConfidence ?? 0.1;
  const left = compactFootLandmarks({
    ankle: landmarkPoint(landmarks[LEFT_ANKLE_INDEX], minConfidence),
    heel: landmarkPoint(landmarks[LEFT_HEEL_INDEX], minConfidence),
    footIndex: landmarkPoint(landmarks[LEFT_FOOT_INDEX], minConfidence),
  });
  const right = compactFootLandmarks({
    ankle: landmarkPoint(landmarks[RIGHT_ANKLE_INDEX], minConfidence),
    heel: landmarkPoint(landmarks[RIGHT_HEEL_INDEX], minConfidence),
    footIndex: landmarkPoint(landmarks[RIGHT_FOOT_INDEX], minConfidence),
  });

  return {
    timestampMs,
    left,
    right,
  };
}

export function estimateFootFrameConfidence(frame: FootLandmarkFrame): number {
  const points = [
    frame.left?.ankle,
    frame.left?.heel,
    frame.left?.footIndex,
    frame.right?.ankle,
    frame.right?.heel,
    frame.right?.footIndex,
  ].filter((point): point is FootLandmarkPoint => !!point);
  if (points.length === 0) return 0;
  const total = points.reduce((sum, point) => sum + point.confidence, 0);
  return round(total / points.length, 3);
}

export function buildMovementSessionFromFrames({
  mode,
  frames,
  calibration = createDefaultPadCalibration(mode),
  stepCues = createDemoStepCues(mode, 'movement-live'),
  startedAt = new Date().toISOString(),
  endedAt = new Date().toISOString(),
  songId = stepCues[0]?.songId ?? 'movement-live',
  songTitle = 'Movement Lab live session',
}: BuildMovementSessionFromFramesInput): MovementSession {
  const events = detectMovementOnsets(frames, calibration);
  const samples = computeReactionSamples(stepCues, events);
  return {
    id: `movement-live-${Date.parse(startedAt) || Date.now()}`,
    mode,
    songId,
    songTitle,
    startedAt,
    endedAt,
    calibration,
    stepCues,
    events,
    samples,
    isDemo: false,
    notes: 'Live on-device pose landmarks matched against sample step cues until chart timing import is connected.',
  };
}

export function buildLiveMovementSession(input: BuildMovementSessionFromFramesInput): MovementSession {
  return buildMovementSessionFromFrames(input);
}

export function buildDemoFallbackMovementSession(mode: PumpMode): MovementSession {
  return buildMockMovementSession(mode).session;
}

export function getNativeMovementAnalyzerAvailability(platform = getRuntimePlatform()): NativeAnalyzerAvailability {
  if (platform === 'web') {
    return {
      available: false,
      platform,
      reason: 'Movement Lab is native-only because it needs live camera frames and on-device pose analysis.',
      recommendedPackages: [],
    };
  }

  return {
    available: true,
    platform,
    reason: 'Native pose inference is enabled through VisionCamera frame output and an on-device pose bridge. Physical devices are required; demo fallback is used only when no pose frames are received.',
    recommendedPackages: [
      'react-native-vision-camera@5.0.11',
      'react-native-vision-camera-worklets@5.0.11',
      'react-native-nitro-modules@0.35.9',
      'react-native-nitro-image@0.15.1',
      'react-native-nitro-pose-exercises@1.1.18',
      'react-native-vision-camera-resizer@5.0.11',
      'react-native-worklets@0.8.1',
    ],
  };
}

function landmarkPoint(
  landmark: NativePoseLandmark | undefined,
  minConfidence: number,
): FootLandmarkPoint | undefined {
  if (!landmark) return undefined;
  const confidence = typeof landmark.visibility === 'number'
    ? landmark.visibility
    : typeof landmark.confidence === 'number'
      ? landmark.confidence
      : 0;
  if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y) || confidence < minConfidence) {
    return undefined;
  }
  return {
    point: {
      x: clamp01(landmark.x),
      y: clamp01(landmark.y),
    },
    confidence: clamp01(confidence),
  };
}

function compactFootLandmarks<T extends Record<string, FootLandmarkPoint | undefined>>(landmarks: T): T | undefined {
  return Object.values(landmarks).some(Boolean) ? landmarks : undefined;
}

function getRuntimePlatform(): string {
  if (typeof document !== 'undefined') return 'web';
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') return 'native';
  return 'native';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
