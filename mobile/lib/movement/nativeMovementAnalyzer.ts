import { Platform } from 'react-native';
import type { FootLandmarkFrame, FootMovementEvent, PumpMode, StepCue } from './types';

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

export interface NativeAnalyzerAvailability {
  available: boolean;
  platform: typeof Platform.OS;
  reason: string;
  recommendedPackages: string[];
}

export function getNativeMovementAnalyzerAvailability(): NativeAnalyzerAvailability {
  if (Platform.OS === 'web') {
    return {
      available: false,
      platform: Platform.OS,
      reason: 'Movement Lab is native-only because it needs live camera frames and on-device pose analysis.',
      recommendedPackages: [],
    };
  }

  return {
    available: false,
    platform: Platform.OS,
    reason: 'Native pose inference is scaffolded. This build uses deterministic analyzer data until the VisionCamera frame-output bridge is proven on devices.',
    recommendedPackages: [
      'react-native-vision-camera@5.0.11',
      'react-native-vision-camera-worklets@5.0.11',
      'react-native-nitro-modules@0.35.9',
      'react-native-nitro-image@0.15.1',
      'react-native-worklets@0.5.1',
    ],
  };
}
