import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  isActive?: boolean;
  children?: React.ReactNode;
  onPermissionChange?: (granted: boolean) => void;
}

export function MovementCameraView({ isActive = true, children, onPermissionChange }: Props) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const focused = useIsFocused();
  const s = useThemedStyles(makeStyles);
  const cameraActive = isActive && focused && permission.hasPermission && !!device;

  useEffect(() => {
    onPermissionChange?.(permission.hasPermission);
  }, [onPermissionChange, permission.hasPermission]);

  if (!permission.hasPermission) {
    return (
      <View style={s.fallback}>
        <Text style={s.fallbackTitle}>Camera access</Text>
        <Text style={s.fallbackBody}>Movement Lab needs the rear camera for on-device foot tracking.</Text>
        <Pressable onPress={() => permission.requestPermission()} style={({ pressed }) => [s.primaryButton, pressed && { opacity: 0.85 }]}>
          <Text style={s.primaryButtonText}>Allow camera</Text>
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
