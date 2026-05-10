import { Text, View } from 'react-native';
import LogoIcon from '@/assets/brand/pump-shinsa-icon.svg';
import { useTheme } from '@/contexts/theme-context';

type Variant = 'horizontal' | 'icon' | 'wordmark';

interface Props {
  variant?: Variant;
  /** Icon size in points; for `horizontal` this drives both icon + text size. */
  size?: number;
}

/**
 * Per the Pump Shinsa brand guide, the logo is a separated system: a standalone
 * octagonal PS icon + a separate `PUMP SHINSA` wordmark. The horizontal variant
 * composes both with native Text so the wordmark always picks up the theme.
 */
export function PumpShinsaLogo({ variant = 'horizontal', size = 48 }: Props) {
  const { theme } = useTheme();

  if (variant === 'icon') {
    return <LogoIcon width={size} height={size} />;
  }

  if (variant === 'wordmark') {
    return (
      <Text
        style={{
          fontSize: size * 0.5,
          fontWeight: '900',
          letterSpacing: 3,
          color: theme.text,
        }}>
        PUMP <Text style={{ color: theme.accent }}>SHINSA</Text>
      </Text>
    );
  }

  // horizontal: icon + wordmark, both following the theme
  const textSize = Math.round(size * 0.42);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.22 }}>
      <LogoIcon width={size} height={size} />
      <Text
        style={{
          fontSize: textSize,
          fontWeight: '900',
          letterSpacing: textSize * 0.08,
          color: theme.text,
        }}>
        PUMP <Text style={{ color: theme.accent }}>SHINSA</Text>
      </Text>
    </View>
  );
}
