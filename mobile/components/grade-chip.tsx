import { Text, type TextStyle } from 'react-native';
import { getGradeDisplayLabel, getGradeTier, TIER_COLORS } from '@/lib/grades';

interface Props {
  grade: unknown;
  score?: number;
  size?: 'xs' | 'sm';
  /** Override style. */
  style?: TextStyle;
}

/**
 * Renders a grade label colored by its tier (SSS/SS/S/AAA/AA/A/...).
 * Score is used as a fallback for parsing.
 */
export function GradeChip({ grade, score = 0, size = 'sm', style }: Props) {
  const tier = getGradeTier(grade, score);
  const label = getGradeDisplayLabel(grade, score);
  const color = TIER_COLORS[tier];
  const fontSize = size === 'xs' ? 10 : 12;

  return (
    <Text
      style={[{ color, fontSize, fontWeight: '800', letterSpacing: 0.3 }, style]}
      accessibilityLabel={`Grade ${label}`}>
      {label}
    </Text>
  );
}
