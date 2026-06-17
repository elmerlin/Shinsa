import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { runOnJS } from 'react-native-worklets';
import {
  Camera,
  useAsyncRunner,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { nitroPoseExercises } from 'react-native-nitro-pose-exercises';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  estimateFootFrameConfidence,
  normalizeCameraFrameTimestampMs,
  normalizePoseLandmarksToFootFrame,
  startMovementPoseSession,
} from '@/lib/movement/nativeMovementAnalyzer';
import type {
  NativePoseLandmark,
  PoseAnalyzerStatus,
} from '@/lib/movement/nativeMovementAnalyzer';
import type { FootLandmarkFrame } from '@/lib/movement/types';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  isActive?: boolean;
  children?: React.ReactNode;
  onPermissionChange?: (granted: boolean) => void;
  enablePoseInference?: boolean;
  onLandmarkFrame?: (frame: FootLandmarkFrame) => void;
  onPoseStatusChange?: (status: PoseAnalyzerStatus) => void;
}

export function MovementCameraView({
  isActive = true,
  children,
  onPermissionChange,
  enablePoseInference = false,
  onLandmarkFrame,
  onPoseStatusChange,
}: Props) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const focused = useIsFocused();
  const s = useThemedStyles(makeStyles);
  const asyncRunner = useAsyncRunner();
  const [poseReady, setPoseReady] = useState(false);
  const frameCountRef = useRef(0);
  const lastStatusAtRef = useRef(0);
  const platform = Platform.OS;
  const cameraActive = isActive && focused && permission.hasPermission && !!device;

  const emitStatus = useCallback((status: PoseAnalyzerStatus, force = false) => {
    const now = Date.now();
    if (!force && now - lastStatusAtRef.current < 250) return;
    lastStatusAtRef.current = now;
    onPoseStatusChange?.(status);
  }, [onPoseStatusChange]);

  const handlePoseLandmarks = useCallback((
    landmarks: NativePoseLandmark[],
    rawFrameTimestamp: number,
    capturedAtMs: number,
  ) => {
    const timestampMs = normalizeCameraFrameTimestampMs(rawFrameTimestamp, platform, capturedAtMs);
    const frame = normalizePoseLandmarksToFootFrame(landmarks, timestampMs, { minConfidence: 0.15 });
    const confidence = estimateFootFrameConfidence(frame);
    if (confidence <= 0) {
      emitStatus({
        state: 'waiting',
        label: 'Waiting for pose',
        confidence: 0,
        frameCount: frameCountRef.current,
        message: 'Keep your full body in frame so on-device pose detection can lock on.',
      });
      return;
    }

    frameCountRef.current += 1;
    onLandmarkFrame?.(frame);
    emitStatus({
      state: 'tracking',
      label: 'Pose tracking',
      confidence,
      frameCount: frameCountRef.current,
    });
  }, [emitStatus, onLandmarkFrame, platform]);

  const handleNoPoseFrame = useCallback(() => {
    emitStatus({
      state: 'waiting',
      label: 'Waiting for pose',
      confidence: 0,
      frameCount: frameCountRef.current,
      message: 'No body landmarks from the latest camera frames yet.',
    });
  }, [emitStatus]);

  const handlePoseFrameError = useCallback((message: string) => {
    emitStatus({
      state: 'error',
      label: 'Pose frame error',
      confidence: 0,
      frameCount: frameCountRef.current,
      message,
    }, true);
  }, [emitStatus]);

  const frameOutput = useFrameOutput({
    targetResolution: { width: 480, height: 640 },
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (!enablePoseInference || !poseReady) {
        frame.dispose();
        return;
      }

      const accepted = asyncRunner.runAsync(() => {
        'worklet';
        try {
          const rawFrameTimestamp = frame.timestamp;
          const capturedAtMs = Date.now();
          if (platform === 'android') {
            nitroPoseExercises.processFrameAndroid(frame);
          } else {
            nitroPoseExercises.processFrameIOS(frame);
          }

          const landmarks = nitroPoseExercises.landmarks as NativePoseLandmark[];
          if (landmarks.length > 0) {
            runOnJS(handlePoseLandmarks)(landmarks, rawFrameTimestamp, capturedAtMs);
          } else {
            runOnJS(handleNoPoseFrame)();
          }
        } catch (error) {
          runOnJS(handlePoseFrameError)(String(error));
        } finally {
          frame.dispose();
        }
      });

      if (!accepted) {
        frame.dispose();
      }
    },
  });

  const outputs = useMemo(
    () => enablePoseInference && poseReady ? [frameOutput] : [],
    [enablePoseInference, frameOutput, poseReady],
  );

  useEffect(() => {
    onPermissionChange?.(permission.hasPermission);
  }, [onPermissionChange, permission.hasPermission]);

  useEffect(() => {
    frameCountRef.current = 0;
    if (!enablePoseInference) {
      setPoseReady(false);
      emitStatus({
        state: 'disabled',
        label: 'Pose disabled',
        confidence: 0,
        frameCount: 0,
      }, true);
      return;
    }
    if (!permission.hasPermission || !device) {
      setPoseReady(false);
      return;
    }

    let mounted = true;
    setPoseReady(false);
    emitStatus({
      state: 'initializing',
      label: 'Starting pose',
      confidence: 0,
      frameCount: 0,
      message: 'Preparing on-device pose inference.',
    }, true);

    nitroPoseExercises.initialize('')
      .then(() => {
        if (!mounted) return;
        startMovementPoseSession(nitroPoseExercises);
        setPoseReady(true);
        emitStatus({
          state: 'ready',
          label: 'Pose ready',
          confidence: 0,
          frameCount: 0,
          message: 'Move into frame to begin landmark tracking.',
        }, true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setPoseReady(false);
        emitStatus({
          state: 'error',
          label: 'Pose unavailable',
          confidence: 0,
          frameCount: 0,
          message: error instanceof Error ? error.message : 'Native pose inference could not start.',
        }, true);
      });

    return () => {
      mounted = false;
      setPoseReady(false);
      try {
        nitroPoseExercises.stopSession();
      } catch {
        // The package throws/ignores stop depending on the current native state.
      }
      try {
        nitroPoseExercises.release();
      } catch {
        // Native release can throw if initialization failed before the module allocated resources.
      }
    };
  }, [device, emitStatus, enablePoseInference, permission.hasPermission]);

  if (!permission.hasPermission) {
    const canRequestPermission = permission.canRequestPermission;
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackTitle}>Camera access</Text>
        <Text style={s.fallbackBody}>
          {canRequestPermission
            ? 'Movement Lab needs the rear camera for on-device foot tracking.'
            : 'Camera permission is blocked. Open system Settings and allow Shinsa to use the camera.'}
        </Text>
        <Pressable
          onPress={() => canRequestPermission ? permission.requestPermission() : Linking.openSettings()}
          style={({ pressed }) => [s.primaryButton, pressed && { opacity: 0.85 }]}>
          <Text style={s.primaryButtonText}>{canRequestPermission ? 'Allow camera' : 'Open Settings'}</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackTitle}>No camera found</Text>
        <Text style={s.fallbackBody}>Use a physical iOS or Android phone with a rear camera to run live analysis.</Text>
      </View>
    );
  }

  return (
    <View style={s.preview}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        outputs={outputs}
        onError={(error) => {
          emitStatus({
            state: 'error',
            label: 'Camera error',
            confidence: 0,
            frameCount: frameCountRef.current,
            message: error.message,
          }, true);
        }}
      />
      <View style={s.overlay}>{children}</View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  preview: {
    minHeight: 390,
    borderRadius: 8,
    overflow: 'hidden' as const,
    backgroundColor: '#000',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  fallback: {
    minHeight: 390,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
    backgroundColor: '#000',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
    gap: 10,
  },
  fallbackTitle: {
    color: t.text,
    fontSize: 20,
    fontWeight: '900' as const,
  },
  fallbackBody: {
    color: t.textMuted,
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: t.accent,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: t.textOnAccent,
    fontSize: 13,
    fontWeight: '900' as const,
  },
});
