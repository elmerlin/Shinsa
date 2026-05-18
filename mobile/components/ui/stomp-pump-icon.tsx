import Svg, { Circle, G, Path } from 'react-native-svg';

/**
 * "Pump" reaction icon — a stylised PIU dance pad. Octagonal frame with
 * a halftone dot grid inside, calling back to the dance cabinet's
 * stomp-pad geometry instead of a generic up-arrow. Reads as "stomp
 * this" at action-footer size (14–22 px) and as a proper logo mark when
 * scaled up.
 *
 * Two visual states:
 *   - `filled = false`  (default, not yet pumped): just an outline + dots
 *     in the muted color, blending with the row's other action icons.
 *   - `filled = true`   (user has pumped): outline + a full black-fill
 *     interior with bright accent-colored dots — distinct enough to
 *     read across a scrolling feed.
 */
interface Props {
  /** Box size in px — square. Defaults to 16 to slot into ActionFooter. */
  size?: number;
  /** Toggles the active visual treatment. */
  filled?: boolean;
  /** Stroke / fill color for the icon strokes + dots. */
  color?: string;
}

// Regular octagon vertices in a 100×100 viewBox. Cut at (100−s)/2 where
// s = 100/(1+√2) ≈ 41.42, so the corners land at 29.29 / 70.71.
const OCTAGON_PATH =
  'M29.29 0 L70.71 0 L100 29.29 L100 70.71 L70.71 100 L29.29 100 L0 70.71 L0 29.29 Z';

// 4×4 dot grid spaced to fill the inside of the octagon without the
// corner dots clipping the bevels. Coordinates are centers; radius 4.
const DOT_COORDS: Array<[number, number]> = [
  [24, 24], [44, 24], [56, 24], [76, 24],
  [24, 44], [44, 44], [56, 44], [76, 44],
  [24, 56], [44, 56], [56, 56], [76, 56],
  [24, 76], [44, 76], [56, 76], [76, 76],
];

export function StompPumpIcon({ size = 16, filled = false, color = '#fbbf24' }: Props) {
  const innerFill = filled ? '#000000' : 'transparent';
  const dotColor = filled ? color : color;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d={OCTAGON_PATH}
        stroke={color}
        strokeWidth={filled ? 9 : 6}
        strokeLinejoin="round"
        fill={innerFill}
      />
      <G fill={dotColor}>
        {DOT_COORDS.map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={4} />
        ))}
      </G>
    </Svg>
  );
}
