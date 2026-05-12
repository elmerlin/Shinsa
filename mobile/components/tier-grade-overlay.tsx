import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { getGradeDisplayLabel, getGradeTier, type GradeTier } from '@/lib/grades';

/**
 * Per-tier vertical gradient stops (top highlight → mid body → bottom shadow)
 * that recreate the metallic chrome look in the reference Pump-Stat tier
 * grid: gold for S/SS, sky for SSS, silver for AAA, bronze for AA, dark
 * amber for A. The "+" glyph reuses the SAME tier gradient — never red.
 */
interface GradientStops {
  top: string;
  mid: string;
  bottom: string;
}

const GRADE_GRADIENT: Record<GradeTier, GradientStops> = {
  sss: { top: '#FFFFFF', mid: '#22A7E0', bottom: '#0A3A6B' }, // sky chrome
  ss:  { top: '#FFF1A3', mid: '#FF9612', bottom: '#6B1F00' }, // gold chrome
  s:   { top: '#FFF1A3', mid: '#FF9612', bottom: '#6B1F00' }, // gold chrome
  aaa: { top: '#FFFFFF', mid: '#A3A3A3', bottom: '#2D2D2D' }, // silver chrome
  aa:  { top: '#FCD8A8', mid: '#A8631C', bottom: '#3A1A05' }, // bronze chrome
  a:   { top: '#E8B86B', mid: '#754B1A', bottom: '#1A0E03' }, // dark amber
  b:   { top: '#E5E5E5', mid: '#888888', bottom: '#2D2D2D' },
  c:   { top: '#E5E5E5', mid: '#888888', bottom: '#2D2D2D' },
  d:   { top: '#A3A3A3', mid: '#5A5A5A', bottom: '#0F0F0F' },
  f:   { top: '#A3A3A3', mid: '#5A5A5A', bottom: '#0F0F0F' },
};

const STROKE = 'rgba(15, 8, 0, 0.95)';

/**
 * Horizontal advance between adjacent letters as a fraction of fontSize.
 * Reference renders ~50-60% overlap, so each next letter sits at +0.42em.
 * Tweak this to make the stacking tighter (smaller value) or looser (bigger).
 */
const LETTER_ADVANCE = 0.42;

/**
 * Approximate glyph width as a fraction of fontSize (italic font-weight-900
 * S takes ~0.62em horizontally). Used to size the canvas and center the
 * cluster.
 */
const GLYPH_WIDTH_RATIO = 0.62;

interface Props {
  /** Raw grade string (SSS+, SS, A, etc). Falls back to `score` if absent. */
  grade?: string | null;
  score?: number;
  /** Width of the SVG canvas. */
  width: number;
  /** Height of the SVG canvas. */
  height: number;
  /** Crossed-out look for "broken" combo grades. */
  isBroken?: boolean;
  /** Width % the letter cluster spans within the canvas (20-100, default 94).
   *  Mirrors the web's `tiers_overlay_size` slider — shrinking lets more of
   *  the jacket art show through. */
  overlaySize?: number;
}

/**
 * Chunky italic 3D grade letter overlaid on song jackets in the tier grid.
 *
 * Mirrors the reference Pump-Stat app: each letter is rendered as its own
 * SVG element with its own complete black outline, and the rightmost letter
 * is drawn FIRST so the leftmost ends up on top — creating the visible
 * layered-stack look where each S clearly occludes the next.
 *
 * The "+" glyph (when present) is also a separate stacked element pinned
 * to the upper-right corner, sharing the tier's metallic gradient.
 */
export function TierGradeOverlay({ grade, score = 0, width, height, isBroken = false, overlaySize = 94 }: Props) {
  const label = getGradeDisplayLabel(grade, score);
  if (!label) return null;
  const tier = getGradeTier(grade, score);
  const gradient = GRADE_GRADIENT[tier] || GRADE_GRADIENT.b;

  const hasPlus = label.endsWith('+') && label.length > 1;
  const mainText = hasPlus ? label.slice(0, -1) : label;
  const letters = mainText.split('');

  // Total horizontal extent of the stacked cluster, in fontSize units:
  //   first letter takes GLYPH_WIDTH_RATIO, every additional letter adds
  //   LETTER_ADVANCE on top of that.
  const clusterWidthRatio = GLYPH_WIDTH_RATIO + (letters.length - 1) * LETTER_ADVANCE;

  // Pick fontSize so the cluster fills the configured % of the cell width
  // (and never exceeds 95% of the cell height — for tall thin cells we cap
  // by height). `overlaySize` comes from the user's tier settings; default
  // 94% matches the previous hard-coded value.
  const widthBudget = Math.min(1, Math.max(0.2, overlaySize / 100));
  const heightBudget = 0.95;
  const fontSize = Math.min(
    height * heightBudget,
    (width * widthBudget) / clusterWidthRatio,
  );

  // Heavy outline — ~10% of font size for the big letters, scales down for "+"
  const strokeWidth = Math.max(2, fontSize * 0.10);
  const plusFontSize = fontSize * 0.55;
  const plusStroke = Math.max(1.5, plusFontSize * 0.13);

  // Center the cluster horizontally. With italic, the rightmost letter
  // visually pokes a bit further right than its baseline x-coord, so leave
  // a small right margin baked in.
  const clusterPx = clusterWidthRatio * fontSize;
  const startX = (width - clusterPx) / 2 + GLYPH_WIDTH_RATIO * fontSize * 0.5;
  const centerY = height / 2 + fontSize * 0.05;

  // Plus position: anchor to top-right corner with a small inset.
  const plusX = width - 2;
  const plusY = strokeWidth + plusFontSize * 0.45;

  const gradientId = `g-${tier}-${Math.round(width)}-${Math.round(height)}`;

  // Letter render order: right-to-left so leftmost ends up on top of the
  // SVG painter's stack. Each letter is rendered TWICE — stroke pass first,
  // then fill pass on top — so its own outline is visible against neighbours.
  const letterIndices = letters.map((_, i) => i);
  const drawOrder = [...letterIndices].reverse();

  const letterFontProps = {
    fontSize,
    fontWeight: '900' as const,
    fontStyle: 'italic' as const,
    fontFamily: 'System',
    textAnchor: 'middle' as const,
    alignmentBaseline: 'central' as const,
    opacity: isBroken ? 0.55 : 1,
  };
  const plusFontProps = {
    fontSize: plusFontSize,
    fontWeight: '900' as const,
    fontStyle: 'italic' as const,
    fontFamily: 'System',
    textAnchor: 'end' as const,
    alignmentBaseline: 'middle' as const,
    opacity: isBroken ? 0.55 : 1,
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {/* userSpaceOnUse with explicit pixel y-coords — anchors to the
              actual canvas instead of the per-glyph bbox so the gradient
              spans the full cell height reliably across RN-SVG backends. */}
          <LinearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={0}
            y2={height}>
            <Stop offset="0" stopColor={gradient.top} />
            <Stop offset="0.28" stopColor={gradient.top} />
            <Stop offset="0.45" stopColor={gradient.mid} />
            <Stop offset="0.7" stopColor={gradient.mid} />
            <Stop offset="1" stopColor={gradient.bottom} />
          </LinearGradient>
        </Defs>

        {/* Per-letter back-to-front render. For each letter we draw the
            STROKE pass first (a black-on-black silhouette wider than the
            glyph) followed immediately by the FILL pass (the colored
            gradient with no stroke, so it sits cleanly inside the outline).
            Doing this per-letter means the next letter's stroke draws on
            top of the previous letter's fill, leaving its boundary visible
            — that's what produces the layered-stack look in the reference. */}
        {drawOrder.map((i) => {
          const letterX = startX + i * LETTER_ADVANCE * fontSize;
          return (
            <SvgText
              key={`outline-${i}`}
              {...letterFontProps}
              x={letterX}
              y={centerY}
              fill={STROKE}
              stroke={STROKE}
              strokeWidth={strokeWidth}
              strokeLinejoin="round">
              {letters[i]}
            </SvgText>
          );
        }).flatMap((outlineEl, idx) => {
          const i = drawOrder[idx];
          const letterX = startX + i * LETTER_ADVANCE * fontSize;
          return [
            outlineEl,
            <SvgText
              key={`body-${i}`}
              {...letterFontProps}
              x={letterX}
              y={centerY}
              fill={`url(#${gradientId})`}>
              {letters[i]}
            </SvgText>,
          ];
        })}

        {hasPlus ? (
          <>
            <SvgText
              {...plusFontProps}
              x={plusX}
              y={plusY}
              fill={STROKE}
              stroke={STROKE}
              strokeWidth={plusStroke}
              strokeLinejoin="round">
              +
            </SvgText>
            <SvgText {...plusFontProps} x={plusX} y={plusY} fill={`url(#${gradientId})`}>
              +
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
