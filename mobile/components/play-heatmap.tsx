import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  /**
   * Date strings (`YYYY-MM-DD` or any `Date.parse`-compatible string) — one per
   * play. Days outside the trailing window are ignored.
   */
  dates: (string | undefined | null)[];
  /** How many trailing weeks to render. Default fits ~6 months. */
  weeks?: number;
  /** Currently-selected day cell (`YYYY-MM-DD` UTC). Cell gets a highlight border. */
  selectedDayKey?: string | null;
  /** Tap handler. Cells with no plays are still tappable so the user can clear the selection. */
  onDayPress?: (dayKey: string, count: number) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_LABEL_WIDTH = 26;
const CELL_GAP = 3;
const COL_LABEL_HEIGHT = 14;

function dayKey(d: Date): string {
  // UTC day key so the same play maps to the same cell regardless of TZ.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function PlayHeatmap({ dates, weeks = 26, selectedDayKey, onDayPress }: Props) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);

  const cellSize = useMemo(() => {
    if (width <= 0) return 12;
    const usable = width - ROW_LABEL_WIDTH;
    const raw = (usable - (weeks - 1) * CELL_GAP) / weeks;
    return Math.max(6, Math.floor(raw));
  }, [width, weeks]);

  const { grid, max, monthMarkers } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const raw of dates) {
      if (!raw) continue;
      const d = new Date(typeof raw === 'string' && /T|\s/.test(raw) ? raw : `${raw}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      counts.set(k, (counts.get(k) || 0) + 1);
    }

    // End on today (UTC), pad forward to end of current week (Saturday).
    const today = new Date();
    const endUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const endDow = endUtc.getUTCDay();
    const padForward = 6 - endDow;
    const lastCell = new Date(endUtc.getTime() + padForward * DAY_MS);
    const totalDays = weeks * 7;
    const cells: { key: string; count: number; date: Date }[] = [];
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const d = new Date(lastCell.getTime() - i * DAY_MS);
      const k = dayKey(d);
      const c = counts.get(k) || 0;
      cells.push({ key: k, count: c, date: d });
    }

    // 7-row × N-col grid (columns left→right are weeks oldest→newest).
    const grid: { key: string; count: number; date: Date }[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < cells.length; i += 1) {
      const row = i % 7;
      grid[row].push(cells[i]);
    }
    const max = cells.reduce((m, c) => Math.max(m, c.count), 0);

    // Month markers — for each column, record the month of the first cell
    // (Sunday). When the month changes, we'll print its label above.
    const monthMarkers: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let col = 0; col < weeks; col += 1) {
      const sundayCell = grid[0][col];
      if (!sundayCell) continue;
      const m = sundayCell.date.getUTCMonth();
      if (m !== prevMonth) {
        monthMarkers.push({ col, label: MONTH_LABELS[m] });
        prevMonth = m;
      }
    }

    return { grid, max, monthMarkers };
  }, [dates, weeks]);

  const intensity = (count: number): string => {
    if (count <= 0) return theme.surfaceMuted;
    if (max <= 0) return theme.accent;
    const ratio = count / max;
    if (ratio < 0.25) return `${theme.accent}40`;
    if (ratio < 0.5) return `${theme.accent}80`;
    if (ratio < 0.75) return `${theme.accent}c0`;
    return theme.accent;
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const colWidth = cellSize + CELL_GAP;

  return (
    <View style={s.wrap} onLayout={onLayout}>
      {/* Month labels along the top */}
      <View style={[s.monthRow, { paddingLeft: ROW_LABEL_WIDTH }]}>
        {monthMarkers.map((m) => (
          <Text
            key={`${m.col}-${m.label}`}
            style={[s.monthLabel, { left: m.col * colWidth }]}>
            {m.label}
          </Text>
        ))}
      </View>

      {/* Grid: each row is a weekday with its label on the left */}
      <View style={s.body}>
        <View style={s.dayLabels}>
          {DAY_LABELS.map((d, i) => (
            <Text key={d} style={[s.dayLabel, { height: cellSize, lineHeight: cellSize }]}>
              {/* Show every other label so they don't crowd at small cell sizes */}
              {i % 2 === 1 ? d : ''}
            </Text>
          ))}
        </View>
        <View style={[s.grid, { gap: CELL_GAP }]}>
          {grid.map((row, i) => (
            <View key={i} style={[s.row, { gap: CELL_GAP, height: cellSize }]}>
              {row.map((cell) => {
                const isSelected = selectedDayKey === cell.key;
                const cellStyle = {
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 2,
                  backgroundColor: intensity(cell.count),
                };
                const inner = isSelected ? (
                  <View style={[cellStyle, { borderWidth: 1, borderColor: '#fff' }]} />
                ) : (
                  <View style={cellStyle} />
                );
                if (!onDayPress) {
                  return <View key={cell.key} accessibilityLabel={`${cell.count} plays on ${cell.key}`}>{inner}</View>;
                }
                return (
                  <Pressable
                    key={cell.key}
                    onPress={() => onDayPress(cell.key, cell.count)}
                    accessibilityLabel={`${cell.count} plays on ${cell.key}`}
                    style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                    {inner}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      <View style={s.legendRow}>
        <Text style={s.legendText}>Less</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <View
            key={r}
            style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: intensity(Math.ceil(r * Math.max(1, max))) }}
          />
        ))}
        <Text style={s.legendText}>More</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  wrap: { gap: 6, width: '100%' as const },
  monthRow: { height: COL_LABEL_HEIGHT, position: 'relative' as const },
  monthLabel: {
    position: 'absolute' as const,
    top: 0,
    fontSize: 10,
    color: t.textDim,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  body: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  dayLabels: { width: ROW_LABEL_WIDTH, gap: CELL_GAP, paddingRight: 4 },
  dayLabel: { fontSize: 9, color: t.textDim, textAlign: 'right' as const },
  grid: { flex: 1, flexDirection: 'column' as const },
  row: { flexDirection: 'row' as const },
  legendRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingTop: 4, alignSelf: 'flex-end' as const },
  legendText: { fontSize: 9, color: t.textDim, letterSpacing: 0.5 },
});
