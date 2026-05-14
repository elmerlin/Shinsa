/**
 * SpritePet — animated CSS box-shadow pixel art renderer.
 *
 * On web (RN-Web): renders the full 2,049-line pixel-art component
 * ported from `client/src/components/SpritePet.jsx`, with frame-based
 * pose / blink / tail-wag animations and full cosmetic + mood +
 * reaction support. See `./sprite-pet.web.jsx`.
 *
 * On native (iOS/Android): there's no `<div>` and no `box-shadow`
 * text-rendering hack — fall back to a character emoji on a tinted
 * gradient circle. We'll port the renderer to react-native-svg or
 * Skia in a follow-up.
 *
 * Implementation note: we pick the variant at runtime via
 * `Platform.OS === 'web'` + require(). That's intentional — Metro's
 * platform-extension resolution (`.web.jsx` vs `.tsx`) wasn't reliably
 * preferring the web variant for this module (both files bundled,
 * but the .tsx default kept winning the import). Explicit Platform
 * check sidesteps Metro's resolver ordering entirely.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { petCharacterEmoji, petCharacterGradient } from '@/lib/pets';

export interface SpritePetProps {
  character?: 'dojocat' | 'buu' | 'devit' | 'pixiu' | string;
  /** 'starving' | 'thin' | 'normal' | 'chubby' | 'fat' */
  weightState?: string;
  /** 'desperate' | 'sad' | 'hungry' | 'tired' | 'grumpy' | 'happy' | 'content' | 'excited' | 'love' */
  mood?: string;
  equippedHat?: string;
  equippedBelt?: string;
  equippedShoes?: string;
  equippedTop?: string;
  hatColor?: string;
  beltColor?: string;
  shoesColor?: string;
  topColor?: string;
  isEating?: boolean;
  isTricking?: boolean;
  reaction?: string;
  expression?: string;
  foodId?: string;
  actionState?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}

function NativeFallback({ character = 'dojocat', size = 140 }: SpritePetProps) {
  const gradient = petCharacterGradient(character);
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <Text style={[styles.emoji, { fontSize: size * 0.55 }]}>
        {petCharacterEmoji(character)}
      </Text>
    </View>
  );
}

// Pick the implementation at module load time so React's reconciler
// sees a stable component identity.
const SpritePet: ComponentType<SpritePetProps> = (() => {
  if (Platform.OS === 'web') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const mod = require('./sprite-pet.web.jsx');
      return (mod?.default ?? NativeFallback) as ComponentType<SpritePetProps>;
    } catch {
      // If the web bundle is missing somehow, don't crash — drop back
      // to the emoji rather than throwing in render.
      return NativeFallback;
    }
  }
  return NativeFallback;
})();

export default SpritePet;

const styles = StyleSheet.create({
  fallback: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
});
