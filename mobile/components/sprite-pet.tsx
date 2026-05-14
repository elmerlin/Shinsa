/**
 * SpritePet — animated CSS box-shadow pixel art renderer ported from
 * `client/src/components/SpritePet.jsx`. The full pixel-art component
 * lives in `sprite-pet.web.jsx` and is the file Metro picks for web
 * platforms (the `.web.jsx` extension wins over this `.tsx` only on
 * `Platform.OS === 'web'`).
 *
 * Why two files?
 * - On web (RN-Web): we render raw `<div>` + `box-shadow` strings to
 *   get crisp pixel art with frame-based pose animation. This is the
 *   2,000-line port of the web SpritePet.
 * - On native (iOS/Android): there's no DOM, no `<div>`, no
 *   `box-shadow` text-rendering hack. Until we port the renderer to
 *   `react-native-svg` or a Skia canvas, native falls back to an
 *   emoji on a tinted gradient circle so the screens still look
 *   intentional.
 *
 * This file is the type-system anchor and the native fallback.
 * Both variants must export a default function with the same prop
 * shape so `<SpritePet character="dojocat" mood="happy" />` works
 * unconditionally.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
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
  /** True while the eat-food animation should play. */
  isEating?: boolean;
  /** True while the trick-perform animation should play. */
  isTricking?: boolean;
  /** Trigger a one-shot reaction (`'praise' | 'cuddle' | 'tease' | 'tap' | 'happy'`...). */
  reaction?: string;
  /** Override the face: `'pout' | 'excited' | 'love' | …`. Empty = mood-derived. */
  expression?: string;
  /** Food id from PET_FOODS (`'pump-chow'`, `'beat-bites'`, …). Drives the eat animation sprite. */
  foodId?: string;
  /** Action being performed (free-text label). Used for occasional pose overrides. */
  actionState?: string;
  /** Pixel-perfect rendered size in CSS px. */
  size?: number;
  className?: string;
  onClick?: () => void;
}

/** Native fallback. The web file overrides with the real pixel art. */
export default function SpritePet({ character = 'dojocat', size = 140 }: SpritePetProps) {
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

const styles = StyleSheet.create({
  fallback: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    // Centered via parent flex.
    textAlign: 'center',
  },
});
