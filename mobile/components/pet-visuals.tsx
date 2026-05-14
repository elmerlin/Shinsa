/**
 * Pet visuals — type anchor + native fallbacks. The actual pixel-art
 * habitat scene + cosmetic previews live in `pet-visuals.web.jsx`,
 * picked at runtime via `Platform.OS === 'web'`.
 *
 * On native we render simple emoji placeholders until the pixel-art
 * renderer is ported to react-native-svg or Skia.
 */
import type { ComponentType } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { petCharacterEmoji, petCharacterGradient } from '@/lib/pets';
import type { Pet } from '@shared/api';

export interface HabitatSceneProps {
  pet: Pet;
  height?: number;
}

export interface CosmeticPreviewProps {
  kind: 'hat' | 'top' | 'belt' | 'shoes';
  id: string;
  color?: string;
  character?: string;
  size?: number;
  weightState?: string;
}

export interface PropMiniProps {
  id: string;
  scale?: number;
}

function NativeHabitatScene({ pet, height = 280 }: HabitatSceneProps) {
  const gradient = petCharacterGradient(pet?.character);
  return (
    <View style={[styles.scene, { height }]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.sceneEmoji}>{petCharacterEmoji(pet?.character)}</Text>
    </View>
  );
}

function NativeCosmeticPreview({ size = 72 }: CosmeticPreviewProps) {
  return (
    <View style={[styles.previewBox, { width: size, height: size }]}>
      <Text style={styles.previewText}>?</Text>
    </View>
  );
}

function NativePropMini({ scale = 4 }: PropMiniProps) {
  const px = scale * 16;
  return (
    <View style={[styles.previewBox, { width: px, height: px }]}>
      <Text style={styles.previewText}>·</Text>
    </View>
  );
}

const HabitatScene: ComponentType<HabitatSceneProps> = (() => {
  if (Platform.OS === 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require('./pet-visuals.web.jsx');
      return (mod?.HabitatScene ?? NativeHabitatScene) as ComponentType<HabitatSceneProps>;
    } catch {
      return NativeHabitatScene;
    }
  }
  return NativeHabitatScene;
})();

const CosmeticPreview: ComponentType<CosmeticPreviewProps> = (() => {
  if (Platform.OS === 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require('./pet-visuals.web.jsx');
      return (mod?.CosmeticPreview ?? NativeCosmeticPreview) as ComponentType<CosmeticPreviewProps>;
    } catch {
      return NativeCosmeticPreview;
    }
  }
  return NativeCosmeticPreview;
})();

const PropMini: ComponentType<PropMiniProps> = (() => {
  if (Platform.OS === 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require('./pet-visuals.web.jsx');
      return (mod?.PropMini ?? NativePropMini) as ComponentType<PropMiniProps>;
    } catch {
      return NativePropMini;
    }
  }
  return NativePropMini;
})();

export { HabitatScene, CosmeticPreview, PropMini };

const styles = StyleSheet.create({
  scene: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06070d',
  },
  sceneEmoji: { fontSize: 84 },
  previewBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
});
