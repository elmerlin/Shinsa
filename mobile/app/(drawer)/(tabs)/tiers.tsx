import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef as captureViewRef } from 'react-native-view-shot';
import { TopBar } from '@/components/top-bar';
import { TierGradeOverlay } from '@/components/tier-grade-overlay';
import { TierSettingsSheet } from '@/components/tier-settings-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { getGradeDisplayLabel, getGradeTier } from '@/lib/grades';
import { fullImageUrl } from '@/lib/images';
import { useTierSettings } from '@/lib/tier-settings';
import type { ThemeColors } from '@/constants/theme';
import type { TierChart, TierGroup } from '@shared/api';

type Mode = 'Single' | 'Double' | 'CoOp';

const MODE_ORDER: Mode[] = ['Single', 'Double', 'CoOp'];
const MODE_LABEL: Record<Mode, string> = {
  Single: 'SINGLES',
  Double: 'DOUBLES',
  CoOp: 'CO-OP',
};
const MODE_PREFIX: Record<Mode, string> = { Single: 'S', Double: 'D', CoOp: 'C' };

// Pump It Up convention: red singles / green doubles / amber co-op.
const MODE_ACCENT: Record<Mode, string> = {
  Single: '#ef4444',
  Double: '#10b981',
  CoOp: '#f59e0b',
};

interface TierStyle {
  label: string;
  /** Colored stripe + tinted background hue (matches the web TIER_STYLE map). */
  accent: string;
  /** Soft tinted background (rgba) behind the section header. */
  tint: string;
  /** Body background color behind the chart grid for that section. */
  body: string;
}

const TIER_STYLES: Record<string, TierStyle> = {
  Overrated:  { label: 'Overrated',  accent: '#818cf8', tint: 'rgba(99, 102, 241, 0.10)', body: '#0d1426' },
  VeryEasy:   { label: 'Very easy',  accent: '#22d3ee', tint: 'rgba(34, 211, 238, 0.10)', body: '#06182a' },
  Easy:       { label: 'Easy',       accent: '#34d399', tint: 'rgba(16, 185, 129, 0.10)', body: '#06182a' },
  Medium:     { label: 'Medium',     accent: '#facc15', tint: 'rgba(234, 179, 8, 0.12)',  body: '#0d1426' },
  Hard:       { label: 'Hard',       accent: '#fb923c', tint: 'rgba(249, 115, 22, 0.12)', body: '#0d1426' },
  VeryHard:   { label: 'Very hard',  accent: '#fb7185', tint: 'rgba(244, 63, 94, 0.12)',  body: '#0d1426' },
  Underrated: { label: 'Underrated', accent: '#ef4444', tint: 'rgba(239, 68, 68, 0.16)',  body: '#1a0a0a' },
  Unrecorded: { label: 'Unrecorded', accent: '#64748b', tint: 'rgba(100, 116, 139, 0.10)', body: '#0d1426' },
};

const TIER_FALLBACK: TierStyle = {
  label: 'Other',
  accent: '#94a3b8',
  tint: 'rgba(148, 163, 184, 0.08)',
  body: '#0d1426',
};

const ROW_GAP = 4;
const HORIZONTAL_PADDING = 8;

function nearestLevel(levels: number[], target: number | null): number | null {
  if (!levels.length) return null;
  if (target == null) return levels[0];
  if (levels.includes(target)) return target;
  return levels.reduce((best, lvl) =>
    Math.abs(lvl - target) < Math.abs(best - target) ? lvl : best,
  levels[0]);
}

export default function TiersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const s = useThemedStyles(makeStyles);
  const { settings, update: updateSettings, hydrated } = useTierSettings();

  const [mode, setMode] = useState<Mode>('Double');
  const [level, setLevel] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const metaQuery = useQuery({
    queryKey: ['tiers-meta'],
    queryFn: () => songsApi.tiersMeta({ tier_list_type: 'Pass' }),
  });

  const levelsByMode = useMemo(() => metaQuery.data?.levels_by_mode || {}, [metaQuery.data]);
  const availableModes = useMemo<Mode[]>(
    () => MODE_ORDER.filter((m) => {
      if (!settings.showCoOp && m === 'CoOp') return false;
      return Array.isArray(levelsByMode[m]) && levelsByMode[m].length > 0;
    }),
    [levelsByMode, settings.showCoOp],
  );
  const levels = useMemo(
    () => (levelsByMode[mode] || []).map((entry) => entry.level).filter((n) => Number.isFinite(n)),
    [levelsByMode, mode],
  );

  // Restore the user's last mode/level from prefs once they hydrate. Falls
  // back to the user's saved default mode → server default level → mid-pack.
  useEffect(() => {
    if (!hydrated || !metaQuery.data || availableModes.length === 0) return;
    // Already on a valid mode — no-op.
    if (availableModes.includes(mode)) return;
    const candidates: (Mode | null)[] = [
      settings.lastMode,
      settings.defaultMode as Mode,
      (metaQuery.data.default_mode as Mode | undefined) ?? null,
      availableModes[0],
    ];
    const next = candidates.find((c): c is Mode => !!c && availableModes.includes(c));
    if (next && next !== mode) setMode(next);
  }, [hydrated, metaQuery.data, availableModes, mode, settings.lastMode, settings.defaultMode]);

  useEffect(() => {
    if (!hydrated || !levels.length) return;
    if (level != null && levels.includes(level)) return;
    const serverDefault = metaQuery.data?.default_level;
    const guess = settings.lastLevel
      ?? (serverDefault && serverDefault > 8 ? serverDefault : (mode === 'Single' ? 16 : 18));
    setLevel(nearestLevel(levels, guess));
  }, [hydrated, levels, level, metaQuery.data, mode, settings.lastLevel]);

  // Persist the current selection so reopening the tab snaps back to where
  // the user left off. Debounced inside useTierSettings.
  useEffect(() => {
    if (!hydrated || level == null) return;
    if (settings.lastMode === mode && settings.lastLevel === level) return;
    updateSettings({ lastMode: mode, lastLevel: level });
  }, [hydrated, mode, level, settings.lastMode, settings.lastLevel, updateSettings]);

  const tiersQuery = useQuery({
    queryKey: ['tiers', mode, level, user?.id || 'anon'],
    queryFn: () => songsApi.tiers({
      mode,
      level: level as number,
      user_id: user?.id,
      tier_list_type: 'Pass',
    }),
    enabled: !!level && !!mode,
  });

  const handleModeCycle = () => {
    if (availableModes.length < 2) return;
    const idx = availableModes.indexOf(mode);
    setMode(availableModes[(idx + 1) % availableModes.length]);
  };

  const goPrevLevel = () => {
    if (level == null) return;
    const idx = levels.indexOf(level);
    if (idx > 0) setLevel(levels[idx - 1]);
  };

  const goNextLevel = () => {
    if (level == null) return;
    const idx = levels.indexOf(level);
    if (idx >= 0 && idx < levels.length - 1) setLevel(levels[idx + 1]);
  };

  const canGoPrev = level != null && levels.indexOf(level) > 0;
  const canGoNext = level != null && levels.indexOf(level) >= 0 && levels.indexOf(level) < levels.length - 1;

  // Apply filters: drop unplayed charts unless the user wants them, then
  // optionally drop tiers that ended up empty.
  const tiersForRender = useMemo(() => {
    const raw = tiersQuery.data?.tiers ?? [];
    const filtered = raw.map((tier) => ({
      ...tier,
      charts: settings.showUnplayed
        ? tier.charts
        : tier.charts.filter((c) => c.is_pass && (c.best_score || 0) > 0),
    }));
    return settings.showEmptyTiers ? filtered : filtered.filter((t) => t.charts.length > 0);
  }, [tiersQuery.data, settings.showUnplayed, settings.showEmptyTiers]);

  const accentColor = MODE_ACCENT[mode];
  const onChartPress = (c: TierChart) =>
    router.push({ pathname: '/song/[id]', params: { id: String(c.chart_id) } });

  // Capture-as-PNG state. The ref points at the ViewShot wrapping the
  // tier grid; tapping the capture button rasterizes it via
  // `react-native-view-shot` and hands the file URI to the native share
  // sheet via `expo-sharing`. Web parity feature (TiersPage.jsx#captureTierImage).
  // `captureMode` flips on only while we're rasterizing — that's what gates
  // the mode/level banner + footer credit inside the ViewShot so they
  // appear in the exported PNG but never in the live UI (where the picker
  // above already shows the same info).
  const captureRef = useRef<ViewShot | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);

  const handleCapture = async () => {
    if (captureBusy || !captureRef.current || !user) return;
    setCaptureBusy(true);
    setCaptureMode(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'Your device doesn\'t expose a share sheet.');
        return;
      }
      // Wait one frame so the capture-only banner has a chance to mount
      // before we rasterize. Without this delay the PNG snapshots the
      // pre-flip render where the banner is still hidden.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      const uri = await captureViewRef(captureRef as React.RefObject<ViewShot>, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${MODE_LABEL[mode]} ${level ?? ''} tiers`,
        UTI: 'public.png',
      });
    } catch (err) {
      Alert.alert(
        'Capture failed',
        err instanceof Error ? err.message : 'Could not render the tier image.',
      );
    } finally {
      setCaptureMode(false);
      setCaptureBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={
            <Pressable
              onPress={handleCapture}
              disabled={captureBusy || tiersForRender.length === 0}
              hitSlop={8}
              style={({ pressed }) => [
                s.iconBtn,
                pressed && { opacity: 0.6 },
                (captureBusy || tiersForRender.length === 0) && { opacity: 0.4 },
              ]}
              accessibilityLabel="Share tier image">
              {captureBusy ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : (
                <IconSymbol name="square.and.arrow.up" size={22} color={theme.textMuted} />
              )}
            </Pressable>
          }
        />
      </View>

      <View style={s.pickerCard}>
        <Pressable
          onPress={goPrevLevel}
          disabled={!canGoPrev}
          hitSlop={6}
          style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }, !canGoPrev && { opacity: 0.25 }]}
          accessibilityLabel="Previous level">
          <IconSymbol name="chevron.left" size={24} color={theme.textMuted} />
        </Pressable>

        <Pressable
          onPress={handleModeCycle}
          hitSlop={6}
          style={({ pressed }) => [s.modePill, { backgroundColor: `${accentColor}1f` }, pressed && { opacity: 0.7 }]}>
          <View style={[s.modeStripe, { backgroundColor: accentColor }]} />
          <Text style={[s.modeLabel, { color: accentColor }]}>{MODE_LABEL[mode]}</Text>
          <Text style={s.levelNumber}>{level ?? '—'}</Text>
        </Pressable>

        <Pressable
          onPress={goNextLevel}
          disabled={!canGoNext}
          hitSlop={6}
          style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }, !canGoNext && { opacity: 0.25 }]}
          accessibilityLabel="Next level">
          <IconSymbol name="chevron.right" size={24} color={theme.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => setSettingsOpen(true)}
          hitSlop={6}
          style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Tier settings">
          <IconSymbol name="slider.horizontal.3" size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}>
        {(metaQuery.isLoading || tiersQuery.isLoading) && (
          <View style={s.center}>
            <ActivityIndicator color={theme.spinner} />
          </View>
        )}

        {!metaQuery.isLoading && !tiersQuery.isLoading && tiersForRender.length === 0 && level != null && (
          <View style={s.empty}>
            <Text style={s.emptyText}>
              {settings.showUnplayed
                ? `No tier rows for ${MODE_PREFIX[mode]}${level}.`
                : `No passed charts for ${MODE_PREFIX[mode]}${level}. Toggle “Show unplayed” in settings to see all charts.`}
            </Text>
          </View>
        )}

        {/* ViewShot wraps every tier section. When the user taps the share
            icon we call `captureRef(captureRef, ...)` which rasterises this
            subtree (regardless of scroll position) into a PNG and hands it
            to the native share sheet. The screen background is forced to the
            theme bg so the captured image isn't transparent. */}
        <ViewShot
          ref={captureRef}
          options={{ format: 'png', quality: 1 }}
          style={{ backgroundColor: theme.bg }}>
          {/* Capture-only header + footer: rendered ONLY while a capture is
              in flight, so the exported PNG carries the mode/level context
              and a "@username · via Shinsa" credit, without doubling-up the
              info that the live picker bar already shows above. */}
          {captureMode && tiersForRender.length > 0 ? (
            <View style={s.captureHeader}>
              <Text style={[s.captureHeaderMode, { color: accentColor }]}>
                {MODE_LABEL[mode]}
              </Text>
              <Text style={s.captureHeaderLevel}>{level ?? '—'}</Text>
              <Text style={s.captureHeaderSuffix}>· Tier breakdown</Text>
            </View>
          ) : null}
          {tiersForRender.map((tier) => (
            <TierSection
              key={tier.name}
              tier={tier}
              songsPerRow={settings.songsPerRow}
              jacketOpacity={settings.jacketOpacity}
              overlaySize={settings.overlaySize}
              displayMode={settings.displayMode}
              s={s}
              onChartPress={onChartPress}
            />
          ))}
          {captureMode && tiersForRender.length > 0 ? (
            <Text style={s.captureFooter}>
              {user?.username ? `@${user.username} · ` : ''}via Shinsa
            </Text>
          ) : null}
        </ViewShot>
      </ScrollView>

      <TierSettingsSheet
        visible={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

function TierSection({
  tier,
  songsPerRow,
  jacketOpacity,
  overlaySize,
  displayMode,
  s,
  onChartPress,
}: {
  tier: TierGroup;
  songsPerRow: number;
  jacketOpacity: number;
  overlaySize: number;
  displayMode: 'grade' | 'score';
  s: Styles;
  onChartPress: (c: TierChart) => void;
}) {
  const style = TIER_STYLES[tier.name] || TIER_FALLBACK;
  const [bodyWidth, setBodyWidth] = useState(0);
  const cellWidth = bodyWidth > 0
    ? Math.floor((bodyWidth - HORIZONTAL_PADDING * 2 - ROW_GAP * (songsPerRow - 1)) / songsPerRow)
    : 0;
  const cellHeight = Math.round(cellWidth * 0.625); // 16:10 aspect, matches web

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w !== bodyWidth) setBodyWidth(w);
  };

  return (
    <View style={s.tierSection}>
      <View style={[s.tierHeader, { backgroundColor: style.tint }]}>
        <View style={[s.tierStripe, { backgroundColor: style.accent }]} />
        <Text style={[s.tierLabel, { color: style.accent }]}>{style.label.toUpperCase()}</Text>
        <Text style={s.tierCount}>{tier.charts.length}</Text>
      </View>
      <View style={[s.tierBody, { backgroundColor: style.body }]} onLayout={handleLayout}>
        {tier.charts.length === 0 ? (
          <Text style={s.tierEmpty}>—</Text>
        ) : (
          <View style={s.grid}>
            {tier.charts.map((chart) => (
              <ChartCell
                key={chart.chart_id}
                chart={chart}
                width={cellWidth}
                height={cellHeight}
                jacketOpacity={jacketOpacity}
                overlaySize={overlaySize}
                displayMode={displayMode}
                s={s}
                onPress={() => onChartPress(chart)}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function formatScoreOverlay(score: number | undefined | null): string {
  const value = parseInt(String(score ?? 0), 10) || 0;
  return (value / 10000).toFixed(1);
}

/**
 * Color the score number takes when "Score" display mode is active. Mirrors
 * the gradient family of the equivalent grade letter so the cell still reads
 * at a glance — gold for SS-range, sky for SSS-range, silver for AAA, etc.
 */
const SCORE_COLOR_BY_TIER: Record<string, string> = {
  sss: '#5DBFFC',
  ss:  '#FFB024',
  s:   '#FFB024',
  aaa: '#BFBFBF',
  aa:  '#A8631C',
  a:   '#754B1A',
  b:   '#888888',
  c:   '#888888',
  d:   '#5A5A5A',
  f:   '#5A5A5A',
};

function getScoreFill(grade: string | undefined | null, score: number | undefined | null): string {
  const tier = getGradeTier(grade, score || 0);
  return SCORE_COLOR_BY_TIER[tier] || SCORE_COLOR_BY_TIER.b;
}

function ScoreOverlay({
  label,
  width,
  height,
  color,
  s,
}: {
  label: string;
  width: number;
  height: number;
  color: string;
  s: Styles;
}) {
  const fontSize = Math.min(height * 0.55, width * 0.32);
  return (
    <View style={[StyleSheet.absoluteFill, s.scoreOverlayWrap]} pointerEvents="none">
      <Text
        numberOfLines={1}
        style={[
          s.scoreOverlay,
          { fontSize, color, textShadowRadius: Math.max(2, fontSize * 0.15) },
        ]}>
        {label}
      </Text>
    </View>
  );
}

function ChartCell({
  chart,
  width,
  height,
  jacketOpacity,
  overlaySize,
  displayMode,
  s,
  onPress,
}: {
  chart: TierChart;
  width: number;
  height: number;
  jacketOpacity: number;
  overlaySize: number;
  displayMode: 'grade' | 'score';
  s: Styles;
  onPress: () => void;
}) {
  if (width <= 0) return null;
  const jacket = chart.jacket_url ? fullImageUrl(chart.jacket_url) : undefined;
  const passed = chart.is_pass && (chart.best_score || 0) > 0;

  // Unplayed charts dim further so they read as "not done yet" without
  // hiding the jacket entirely.
  const unplayedDim = 0.35;
  const opacity = passed ? jacketOpacity / 100 : unplayedDim;
  // Score-mode label uses the fake "S" tier so it picks up the gold gradient
  // (matches the web's getGradeColor fallback for non-grade overlays).
  const scoreLabel = passed ? formatScoreOverlay(chart.best_score) : '';
  const gradeLabel = passed ? getGradeDisplayLabel(chart.best_grade, chart.best_score) : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.cell, { width, height }, pressed && { opacity: 0.75 }]}>
      {jacket ? (
        <Image
          source={{ uri: jacket }}
          style={{ width: '100%', height: '100%', opacity }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={jacket}
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.cellPlaceholder]} />
      )}
      {passed && displayMode === 'grade' && gradeLabel ? (
        <TierGradeOverlay
          grade={gradeLabel}
          score={chart.best_score}
          width={width}
          height={height}
          overlaySize={overlaySize}
        />
      ) : null}
      {passed && displayMode === 'score' && scoreLabel ? (
        <ScoreOverlay
          label={scoreLabel}
          width={width}
          height={height}
          color={getScoreFill(chart.best_grade, chart.best_score)}
          s={s}
        />
      ) : null}
    </Pressable>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  heading: { flex: 1, fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },

  // Capture-only header overlay rendered inside ViewShot. Shows up in the
  // exported PNG so the recipient knows which mode/level the breakdown is for.
  captureHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  captureHeaderMode: { fontSize: 12, fontWeight: '900' as const, letterSpacing: 2.5, textTransform: 'uppercase' as const },
  captureHeaderLevel: { fontSize: 28, fontWeight: '900' as const, color: t.text, letterSpacing: 1, fontVariant: ['tabular-nums' as const] },
  captureHeaderSuffix: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  captureFooter: {
    textAlign: 'center' as const,
    fontSize: 10,
    color: t.textDim,
    paddingVertical: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },

  pickerCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.card,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modePill: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'center' as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    overflow: 'hidden' as const,
  },
  modeStripe: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  modeLabel: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 2.4 },
  levelNumber: { fontSize: 24, fontWeight: '900' as const, color: t.text, letterSpacing: -0.5 },

  scroll: { paddingHorizontal: 12, gap: 10 },
  center: { padding: 32, alignItems: 'center' as const },
  empty: { padding: 24, alignItems: 'center' as const },
  emptyText: { fontSize: 13, color: t.textMuted },

  tierSection: {
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  tierHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 14,
    overflow: 'hidden' as const,
  },
  tierStripe: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  tierLabel: { flex: 1, fontSize: 11, fontWeight: '800' as const, letterSpacing: 2.4 },
  tierCount: { fontSize: 11, fontWeight: '700' as const, color: t.textDim, fontVariant: ['tabular-nums' as const] },
  tierBody: { padding: HORIZONTAL_PADDING },
  tierEmpty: { padding: 12, color: t.textDim, textAlign: 'center' as const, fontSize: 12 },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: ROW_GAP,
  },
  cell: {
    overflow: 'hidden' as const,
    borderRadius: 4,
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  cellPlaceholder: { backgroundColor: '#0a0f1c' },

  scoreOverlayWrap: { alignItems: 'center' as const, justifyContent: 'center' as const },
  scoreOverlay: {
    fontWeight: '900' as const,
    fontStyle: 'italic' as const,
    fontVariant: ['tabular-nums' as const],
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
  },
});
