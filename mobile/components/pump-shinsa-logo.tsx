import { Image } from 'expo-image';

type Variant = 'horizontal' | 'icon' | 'wordmark';

interface Props {
  variant?: Variant;
  /** Height in points (also full size for `icon`). Width auto-scales by aspect. */
  size?: number;
}

const SOURCES: Record<Variant, ReturnType<typeof require>> = {
  horizontal: require('@/assets/brand/both.png'),
  icon: require('@/assets/brand/icon.png'),
  wordmark: require('@/assets/brand/text.png'),
};

const ASPECT: Record<Variant, number> = {
  horizontal: 1024 / 280,
  icon: 1,
  wordmark: 1024 / 146,
};

export function PumpShinsaLogo({ variant = 'horizontal', size = 48 }: Props) {
  const width = variant === 'icon' ? size : Math.round(size * ASPECT[variant]);
  return (
    <Image
      source={SOURCES[variant]}
      style={{ width, height: size }}
      contentFit="contain"
    />
  );
}
