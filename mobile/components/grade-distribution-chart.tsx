import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

/** Threshold + display color for each grade bucket. Mirrors web's
 *  `RANK_RANGES` + `GRADE_BARS`. Anything below A goes into the "B-" group. */
interface GradeBucket {
  label: string;
  /** Minimum score for this bucket. Bucket is hit when score >= min. */
  min: number;
  color: string;
}

const GRADE_BUCKETS: GradeBucket[] = [
  { label: 'SSS+', min: 995000, color: '#7dd3fc' },
  { label: 'SSS',  min: 990000, color: '#38bdf8' },
  { label: 'SS+',  min: 985000, color: '#fde047' },
  { label: 'SS',   min: 980000, color: '#facc15' },
  { label: 'S+',   min: 975000, color: '#f59e0b' },
  { label: 'S',    min: 970000, color: '#d97706' },
  { label: 'AAA+', min: 960000, color: '#cbd5e1' },
  { label: 'AAA',  min: 950000, color: '#94a3b8' },
  { label: 'AA+',  min: 925000, color: '#a78bfa' },
  { label: 'AA',   min: 900000, color: '#8b5cf6' },
  { label: 'A+',   min: 825000, color: '#34d399' },
  { label: 'A',    min: 750000, color: '#10b981' },
];

const BELOW_A_BUCKET = { label: 'B-', color: '#9ca3af' };
const NON_CLEAR_BUCKET = { label: 'NC', color: '#dc2626' };

interface ScoreLike {
  score?: number | string | null;
  grade?: string | null;
  is_uncleared?: boolean | number;
  is_stage_break?: boolean | number;
}

/** Web parity for `isNonClearScoreEntry` — F, stage-break, broken-combo
 *  variants (`X-`, `XSSS`, etc.) all read as "non-clear" so they get
 *  their own red NC bar instead of being lumped into B-. */
function isNonClear(entry: ScoreLike): boolean {
  if (entry.is_uncleared || entry.is_stage_break) return true;
  const score = parseInt(String(entry.score ?? 0), 10) || 0;
  if (score <= 0) return true;
  const raw = String(entry.grade || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return false;
  return raw === 'F'
    || raw === 'STAGEBREAK'
    || raw === 'STAGE_BREAK'
    || /^X(?:[_-]|$)/.test(raw);
}

interface Bar {
  label: string;
  color: string;
  count: number;
  /** Score threshold for the bucket. Only set on the per-grade buckets;
   *  the synthetic NC and B- bars don't have a min (they're catchalls). */
  min?: number;
}

interface Props {
  /** Plays/scores to bucket. Order doesn't matter; we filter to the same
   *  selection upstream before passing in. */
  scores: ScoreLike[];
  /** Optional caption shown above the chart (e.g. "S25 · 42 charts"). */
  caption?: string;
}

/**
 * Horizontal bar chart for the grade distribution of a set of scores.
 * Buckets the input into A through SSS+ plus an "NC" bar on the far left
 * (non-clears) and a "B-" bar on the right that groups B/C/D/F together.
 * Bars are sized relative to the largest bucket — the chart is
 * horizontally scrollable so it stays readable on narrow screens.
 */
export function GradeDistributionChart({ scores, caption }: Props) {
  const s = useThemedStyles(makeStyles);

  const buckets: Bar[] = GRADE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let nonClearCount = 0;
  let belowACount = 0;

  for (const entry of scores) {
    if (isNonClear(entry)) {
      nonClearCount++;
      continue;
    }
    const score = parseInt(String(entry.score ?? 0), 10) || 0;
    let placed = false;
    for (const b of buckets) {
      // Every entry in `buckets` came from GRADE_BUCKETS so `min` is always set,
      // but the type widens to Bar above so we guard for safety.
      if (typeof b.min === 'number' && score >= b.min) {
        b.count++;
        placed = true;
        break;
      }
    }
    if (!placed) belowACount++;
  }

  // Left-to-right display order: NC → B- → A → A+ → … → SSS+
  // i.e. worst on the left, best on the right (matches the web chart).
  // Trim leading + trailing empty per-grade buckets so a player with only
  // high-end scores (e.g. AA+ through SSS+) doesn't get the populated range
  // pushed off-screen by a string of empty A/A+/AA columns. Gaps inside the
  // populated range stay visible — those are meaningful ("I have AAA but
  // skipped AAA+"). NC and B- only show when they have data, same as before.
  const perGrade: Bar[] = [];
  for (let i = buckets.length - 1; i >= 0; i--) perGrade.push(buckets[i]);
  const firstFilled = perGrade.findIndex((b) => b.count > 0);
  const lastFilled = perGrade.length - 1
    - [...perGrade].reverse().findIndex((b) => b.count > 0);
  const trimmedPerGrade = firstFilled >= 0 && lastFilled >= 0
    ? perGrade.slice(firstFilled, lastFilled + 1)
    : [];

  const display: Bar[] = [];
  if (nonClearCount > 0) display.push({ ...NON_CLEAR_BUCKET, count: nonClearCount });
  if (belowACount > 0) display.push({ ...BELOW_A_BUCKET, count: belowACount });
  display.push(...trimmedPerGrade);

  const total = display.reduce((sum, b) => sum + b.count, 0);
  const maxCount = Math.max(1, ...display.map((b) => b.count));
  const barAreaHeight = 96;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.eyebrow}>GRADE DISTRIBUTION</Text>
        <Text style={s.totalLabel}>{caption ? `${caption} · ` : ''}{total} score{total === 1 ? '' : 's'}</Text>
      </View>
      {/* Bars row: flex columns auto-size to fill the card. The previous
          ScrollView pattern let the right-most bar (SSS+) get clipped when
          the chart ran wider than the screen — and ScrollView scroll-to-end
          felt awkward inside a vertical-scrolling tab. Flex columns guarantee
          every bar is visible regardless of how many buckets there are. */}
      <View style={s.barsRow}>
        {display.map((b) => {
          // Bar height is proportional to its share of the largest bucket.
          // Empty bars render as 0-height (count "·" placeholder appears
          // below) so the column still claims its share of width and the
          // labels underneath stay aligned across the row.
          const fillPx = b.count > 0
            ? Math.max(4, Math.round((b.count / maxCount) * barAreaHeight))
            : 0;
          return (
            <View key={b.label} style={s.column}>
              <View style={[s.barTrack, { height: barAreaHeight }]}>
                <View
                  style={[
                    s.barFill,
                    { height: fillPx, backgroundColor: b.color },
                  ]}
                />
              </View>
              <Text style={s.barCount} numberOfLines={1}>{b.count > 0 ? b.count : '·'}</Text>
              <Text style={s.barLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  headerRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: 8 },
  eyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase' as const },
  totalLabel: { fontSize: 10, fontWeight: '700' as const, color: t.textDim, letterSpacing: 0.4 },

  barsRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 4, paddingTop: 4 },
  // flex:1 + minWidth:0 lets columns shrink uniformly so even a 13-bar chart
  // fits within the card width. Per-bar label uses `adjustsFontSizeToFit` so
  // 4-char labels like "SSS+" stay legible at the narrowest column width.
  column: { flex: 1, minWidth: 0, alignItems: 'center' as const, gap: 4 },
  // Empty space the bar fills from the bottom up — gives every bar the
  // same total height so the labels underneath align across the row.
  barTrack: { width: '100%' as const, justifyContent: 'flex-end' as const },
  barFill: { width: '100%' as const, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barCount: { fontSize: 9, color: t.textMuted, fontVariant: ['tabular-nums' as const] },
  barLabel: { fontSize: 9, fontWeight: '800' as const, color: t.textDim, letterSpacing: 0.3 },
});
