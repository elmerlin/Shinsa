import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { mapReactionDeltaToY, summarizeMovementSession } from '@/lib/movement/analytics';
import type { ReactionSample } from '@/lib/movement/types';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  samples: ReactionSample[];
  selectedCueId?: string | null;
  onSelectSample?: (sample: ReactionSample) => void;
  height?: number;
}

const PADDING = { top: 18, right: 14, bottom: 30, left: 34 };

export function MovementTimelineChart({
  samples,
  selectedCueId,
  onSelectSample,
  height = 190,
}: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(320);

  const summary = useMemo(() => summarizeMovementSession({ samples, events: [] }), [samples]);
  const meanReactionMs = summary.meanReactionMs ?? 0;
  const centerY = height / 2;
  const innerWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const maxDelta = Math.max(40, ...samples.map((sample) => Math.abs(sample.reactionMs - meanReactionMs)));
  const msPerPixel = maxDelta / Math.max(1, (height - PADDING.top - PADDING.bottom) * 0.42);

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && Math.abs(nextWidth - width) > 1) setWidth(nextWidth);
  };

  const points = samples.map((sample, index) => {
    const x = samples.length === 1
      ? PADDING.left + innerWidth / 2
      : PADDING.left + (index / (samples.length - 1)) * innerWidth;
    const y = mapReactionDeltaToY({
      reactionMs: sample.reactionMs,
      meanReactionMs,
      centerY,
      msPerPixel,
      minY: PADDING.top,
      maxY: height - PADDING.bottom,
    });
    return { sample, x, y };
  });

  return (
    <View style={s.wrap} onLayout={onLayout}>
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>REACTION TIMELINE</Text>
          <Text style={s.title}>Dots above the line are slower than your mean.</Text>
        </View>
        <Text style={s.meanText}>{meanReactionMs ? `${Math.round(meanReactionMs)} ms mean` : 'No samples'}</Text>
      </View>

      {samples.length === 0 ? (
        <View style={[s.empty, { height }]}>
          <Text style={s.emptyTitle}>No matched steps yet</Text>
          <Text style={s.emptyBody}>Run a demo or live session to plot reaction samples.</Text>
        </View>
      ) : (
        <Svg width={width} height={height} accessibilityLabel="Movement reaction timeline chart">
          <Line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={centerY}
            y2={centerY}
            stroke={theme.accent}
            strokeWidth={1.5}
          />
          <Line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={PADDING.top}
            y2={PADDING.top}
            stroke={theme.border}
            strokeWidth={0.5}
            strokeDasharray="3 5"
          />
          <Line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={height - PADDING.bottom}
            y2={height - PADDING.bottom}
            stroke={theme.border}
            strokeWidth={0.5}
            strokeDasharray="3 5"
          />
          <SvgText x={PADDING.left - 8} y={PADDING.top + 4} fontSize="9" fill={theme.textDim} textAnchor="end">
            slower
          </SvgText>
          <SvgText x={PADDING.left - 8} y={centerY + 3} fontSize="9" fill={theme.textDim} textAnchor="end">
            mean
          </SvgText>
          <SvgText x={PADDING.left - 8} y={height - PADDING.bottom + 3} fontSize="9" fill={theme.textDim} textAnchor="end">
            faster
          </SvgText>

          {points.map(({ sample, x, y }, index) => {
            const selected = selectedCueId === sample.cueId;
            const color = sample.isOutlier ? theme.danger : sample.reactionMs > meanReactionMs ? '#facc15' : '#4ade80';
            return (
              <G key={sample.cueId}>
                <Circle
                  cx={x}
                  cy={y}
                  r={selected ? 7 : 5}
                  fill={color}
                  opacity={sample.confidence < 0.65 ? 0.55 : 0.95}
                  stroke={selected ? theme.text : theme.bg}
                  strokeWidth={selected ? 2 : 1}
                  onPress={() => onSelectSample?.(sample)}
                />
                {samples.length <= 10 ? (
                  <SvgText x={x} y={height - 12} fontSize="9" fill={theme.textDim} textAnchor="middle">
                    {index + 1}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

export function MovementTimelineSelection({
  sample,
  onClear,
}: {
  sample: ReactionSample | null;
  onClear?: () => void;
}) {
  const s = useThemedStyles(makeStyles);
  if (!sample) {
    return (
      <View style={s.selection}>
        <Text style={s.selectionMuted}>Tap a dot for panel, foot, confidence, and song time.</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onClear} style={({ pressed }) => [s.selection, pressed && { opacity: 0.85 }]}>
      <Text style={s.selectionLabel}>STEP {sample.cueId}</Text>
      <Text style={s.selectionTitle}>
        {sample.side ? `${sample.side}.` : ''}{sample.panel} · {sample.reactionMs} ms · {sample.foot}
      </Text>
      <Text style={s.selectionMuted}>
        {Math.round(sample.confidence * 100)}% confidence at {(sample.cueTimeMs / 1000).toFixed(2)}s
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: {
    backgroundColor: t.card,
    borderColor: t.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingTop: 14,
    overflow: 'hidden' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  eyebrow: {
    color: t.textDim,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
  },
  title: {
    color: t.text,
    fontSize: 13,
    fontWeight: '700' as const,
    marginTop: 3,
  },
  meanText: {
    color: t.accent,
    fontSize: 12,
    fontWeight: '900' as const,
    fontVariant: ['tabular-nums' as const],
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: t.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  emptyBody: {
    color: t.textMuted,
    fontSize: 12,
    textAlign: 'center' as const,
    marginTop: 5,
  },
  selection: {
    backgroundColor: t.surface,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 3,
  },
  selectionLabel: {
    color: t.textDim,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
  },
  selectionTitle: {
    color: t.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  selectionMuted: {
    color: t.textMuted,
    fontSize: 12,
  },
});
