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
import { useBreakpoint } from '@/hooks/use-breakpoint';
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
  const { isDesktop } = useBreakpoint();
  // Desktop only: tapping a chart opens a right-rail context panel instead
  // of navigating to /song/[id]. Mobile keeps the existing drill-down.
  const [railChart, setRailChart] = useState<TierChart | null>(null);
  // Desktop only: hovering a cell previews the chart in the rail without
  // committing. Tap pins it (becomes `railChart`); leaving the cell while
  // unpinned clears the preview.
  const [hoverChart, setHoverChart] = useState<TierChart | null>(null);
  // Desktop density picker — 8 / 10 / 12 cols. Stored locally so it doesn't
  // overwrite the mobile songsPerRow preference, which is calibrated for
  // narrow viewports (4 / 5 / 6).
  const [deskDensity, setDeskDensity] = useState<8 | 10 | 12>(10);
  // The chart whose detail panel is currently showing. Pinned wins over hover.
  const displayChart = railChart ?? hoverChart;

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
  const onChartPress = (c: TierChart) => {
    if (isDesktop) {
      setRailChart(c);
    } else {
      router.push({ pathname: '/song/[id]', params: { id: String(c.chart_id) } });
    }
  };

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

      {isDesktop ? (
        <DesktopToolbar
          mode={mode}
          setMode={setMode}
          availableModes={availableModes}
          level={level}
          levels={levels}
          setLevel={setLevel}
          density={deskDensity}
          setDensity={setDeskDensity}
          showUnplayed={settings.showUnplayed}
          onToggleShowUnplayed={() => updateSettings({ showUnplayed: !settings.showUnplayed })}
          onShare={handleCapture}
          captureBusy={captureBusy}
          canShare={tiersForRender.length > 0}
          accent={accentColor}
          s={s}
        />
      ) : (
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
      )}

      <View style={isDesktop ? s.deskBody : { flex: 1 }}>
      <ScrollView
        style={isDesktop ? s.deskScroll : { flex: 1 }}
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
              songsPerRow={isDesktop ? deskDensity : settings.songsPerRow}
              jacketOpacity={settings.jacketOpacity}
              overlaySize={settings.overlaySize}
              displayMode={settings.displayMode}
              s={s}
              onChartPress={onChartPress}
              onHoverChart={isDesktop ? setHoverChart : undefined}
            />
          ))}
          {captureMode && tiersForRender.length > 0 ? (
            <Text style={s.captureFooter}>
              {user?.username ? `@${user.username} · ` : ''}via Shinsa
            </Text>
          ) : null}
        </ViewShot>
      </ScrollView>
      {isDesktop ? (
        <TierChartRailV2
          chart={displayChart}
          pinned={!!railChart}
          mode={mode}
          accent={accentColor}
          onClose={() => { setRailChart(null); setHoverChart(null); }}
          onOpenFull={() =>
            displayChart && router.push({ pathname: '/song/[id]', params: { id: String(displayChart.chart_id) } })
          }
          s={s}
        />
      ) : null}
      </View>

      <TierSettingsSheet
        visible={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}

/** Right-rail context panel for a tapped chart on desktop. */
function TierChartRail({
  chart,
  onClose,
  onOpen,
  s,
}: {
  chart: TierChart;
  onClose: () => void;
  onOpen: () => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  const jacket = chart.jacket_url ? fullImageUrl(chart.jacket_url) : undefined;
  const passed = chart.is_pass && (chart.best_score || 0) > 0;
  const gradeLabel = passed ? getGradeDisplayLabel(chart.best_grade, chart.best_score) : '';

  // Esc closes the rail. Web only — keydown isn't a thing on native.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <View style={s.rail}>
      <View style={s.railHeader}>
        <Text style={s.railEyebrow}>CHART</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [s.railClose, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Close chart panel">
          <IconSymbol name="xmark" size={16} color={theme.textMuted} />
        </Pressable>
      </View>
      {jacket ? (
        <Image source={{ uri: jacket }} style={s.railJacket} contentFit="cover" />
      ) : (
        <View style={[s.railJacket, { backgroundColor: theme.surfaceMuted }]} />
      )}
      <Text style={s.railTitle} numberOfLines={2}>{chart.title}</Text>
      <Text style={s.railMeta}>
        {chart.mode} · Lv {chart.level}
      </Text>

      <View style={s.railSection}>
        <Text style={s.railSectionLabel}>Your best</Text>
        {passed ? (
          <View style={s.railBestRow}>
            <Text style={s.railBestScore}>{Number(chart.best_score || 0).toLocaleString()}</Text>
            {gradeLabel ? <Text style={s.railBestGrade}>{gradeLabel}</Text> : null}
          </View>
        ) : (
          <Text style={s.railEmpty}>No clear yet — keep grinding.</Text>
        )}
      </View>

      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.railPrimary, pressed && { opacity: 0.85 }]}>
        <Text style={s.railPrimaryText}>Open full chart →</Text>
      </Pressable>
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
  onHoverChart,
}: {
  tier: TierGroup;
  songsPerRow: number;
  jacketOpacity: number;
  overlaySize: number;
  displayMode: 'grade' | 'score';
  s: Styles;
  onChartPress: (c: TierChart) => void;
  /** Desktop only — fires when the cursor enters/leaves a cell. Null on leave. */
  onHoverChart?: (c: TierChart | null) => void;
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
                onHover={onHoverChart ? (hovered) => onHoverChart(hovered ? chart : null) : undefined}
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
  onHover,
}: {
  chart: TierChart;
  width: number;
  height: number;
  jacketOpacity: number;
  overlaySize: number;
  displayMode: 'grade' | 'score';
  s: Styles;
  onPress: () => void;
  /** Desktop only. Fires with `true` on cursor enter, `false` on leave. */
  onHover?: (hovered: boolean) => void;
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
      onHoverIn={onHover ? () => onHover(true) : undefined}
      onHoverOut={onHover ? () => onHover(false) : undefined}
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

/* -------------------------------------------------------------------------- */
/* Desktop-only components: top toolbar + rich chart rail.                    */
/* -------------------------------------------------------------------------- */

/**
 * Inline toolbar for the desktop Tiers screen. Replaces the tight mobile
 * pickerCard with explicit controls — mode pills, level chevrons, density
 * picker, show-unplayed toggle, and share — so users don't have to dig into
 * the settings sheet for the high-frequency knobs.
 */
function DesktopToolbar({
  mode,
  setMode,
  availableModes,
  level,
  levels,
  setLevel,
  density,
  setDensity,
  showUnplayed,
  onToggleShowUnplayed,
  onShare,
  captureBusy,
  canShare,
  accent,
  s,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  availableModes: Mode[];
  level: number | null;
  levels: number[];
  setLevel: (n: number) => void;
  density: 8 | 10 | 12;
  setDensity: (d: 8 | 10 | 12) => void;
  showUnplayed: boolean;
  onToggleShowUnplayed: () => void;
  onShare: () => void;
  captureBusy: boolean;
  canShare: boolean;
  accent: string;
  s: Styles;
}) {
  const { theme } = useTheme();
  const idx = level != null ? levels.indexOf(level) : -1;
  const canGoPrev = idx > 0;
  const canGoNext = idx >= 0 && idx < levels.length - 1;
  return (
    <View style={s.deskToolbar}>
      {/* Mode pills */}
      <View style={s.deskModeRow}>
        {availableModes.map((m) => {
          const active = m === mode;
          const c = MODE_ACCENT[m];
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              onHoverIn={() => undefined}
              onHoverOut={() => undefined}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                s.deskModePill,
                active && { backgroundColor: `${c}1f`, borderColor: c },
                hovered && !active && { backgroundColor: theme.surfaceMuted },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[s.deskModePillText, { color: active ? c : theme.textMuted }]}>
                {MODE_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Level chevrons + display */}
      <View style={s.deskLevelGroup}>
        <Pressable
          onPress={() => canGoPrev && setLevel(levels[idx - 1])}
          disabled={!canGoPrev}
          hitSlop={6}
          style={({ pressed }) => [s.deskIconBtn, pressed && { opacity: 0.6 }, !canGoPrev && { opacity: 0.25 }]}
          accessibilityLabel="Easier level">
          <IconSymbol name="chevron.left" size={20} color={theme.textMuted} />
        </Pressable>
        <Text style={[s.deskLevelNum, { color: accent }]}>{level ?? '—'}</Text>
        <Pressable
          onPress={() => canGoNext && setLevel(levels[idx + 1])}
          disabled={!canGoNext}
          hitSlop={6}
          style={({ pressed }) => [s.deskIconBtn, pressed && { opacity: 0.6 }, !canGoNext && { opacity: 0.25 }]}
          accessibilityLabel="Harder level">
          <IconSymbol name="chevron.right" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      <View style={s.deskToolbarSpacer} />

      {/* Density picker */}
      <View style={s.deskDensityRow}>
        <Text style={s.deskToolbarLabel}>Density</Text>
        {([8, 10, 12] as const).map((d) => {
          const active = d === density;
          return (
            <Pressable
              key={d}
              onPress={() => setDensity(d)}
              style={({ pressed }) => [
                s.deskDensityBtn,
                active && s.deskDensityBtnActive,
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[s.deskDensityBtnText, active && s.deskDensityBtnTextActive]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Show unplayed toggle */}
      <Pressable
        onPress={onToggleShowUnplayed}
        style={({ pressed }) => [
          s.deskCheckRow,
          showUnplayed && s.deskCheckRowOn,
          pressed && { opacity: 0.85 },
        ]}>
        <View style={[s.deskCheckBox, showUnplayed && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
          {showUnplayed ? <IconSymbol name="checkmark" size={11} color={theme.bg} /> : null}
        </View>
        <Text style={s.deskCheckLabel}>Show unplayed</Text>
      </Pressable>

      {/* Share */}
      <Pressable
        onPress={onShare}
        disabled={captureBusy || !canShare}
        hitSlop={6}
        style={({ pressed }) => [
          s.deskShareBtn,
          pressed && { opacity: 0.7 },
          (captureBusy || !canShare) && { opacity: 0.4 },
        ]}
        accessibilityLabel="Share tier image">
        {captureBusy ? (
          <ActivityIndicator size="small" color={theme.textMuted} />
        ) : (
          <>
            <IconSymbol name="square.and.arrow.up" size={14} color={theme.text} />
            <Text style={s.deskShareBtnText}>Share</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Right-rail context panel for the desktop Tiers screen. Replaces the
 * compact V1 with: bigger jacket, your best, mini friend leaderboard
 * (via `songsApi.chartDetail`), replay link, and an "open full chart"
 * primary. Driven by hover OR pinned tap; pinned beats hover.
 */
function TierChartRailV2({
  chart,
  pinned,
  mode,
  accent,
  onClose,
  onOpenFull,
  s,
}: {
  chart: TierChart | null;
  pinned: boolean;
  mode: Mode;
  accent: string;
  onClose: () => void;
  onOpenFull: () => void;
  s: Styles;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  // Esc clears the pinned chart. Web only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pinned) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, onClose]);

  // Only fetch friend records / replay when a chart is actually selected.
  // The query is cheap (~50 ms server-side) and shared with `/song/[id]`,
  // so it warms the song-detail route too.
  const detail = useQuery({
    queryKey: ['chart', chart?.chart_id ?? 0, user?.id ?? null],
    queryFn: () => chart
      ? songsApi.chartDetail(chart.chart_id, user?.id
          ? { user_id: user.id, follow_from_user_id: user.id }
          : {})
      : Promise.resolve(null),
    enabled: !!chart?.chart_id,
    staleTime: 30_000,
  });

  if (!chart) {
    return (
      <View style={s.railV2Empty}>
        <Text style={s.railV2EmptyTitle}>Hover or tap a chart</Text>
        <Text style={s.railV2EmptyHint}>
          The right panel previews any chart your cursor lands on. Tap to pin it.
        </Text>
      </View>
    );
  }

  const jacket = chart.jacket_url ? fullImageUrl(chart.jacket_url) : undefined;
  const passed = chart.is_pass && (chart.best_score || 0) > 0;
  const gradeLabel = passed ? getGradeDisplayLabel(chart.best_grade, chart.best_score) : '';
  const userBest = detail.data?.user_summary?.best;
  const friends = detail.data?.friend_records ?? [];
  const replayUrl = detail.data?.user_youtube_url
    || detail.data?.user_summary?.highest_replay?.url
    || '';

  return (
    <View style={s.railV2}>
      <View style={s.railHeader}>
        <View style={s.railHeaderText}>
          <Text style={s.railEyebrow}>{pinned ? 'CHART · PINNED' : 'CHART · PREVIEW'}</Text>
          <Text style={s.railV2Mode}>{mode} · Lv {chart.level}</Text>
        </View>
        {pinned ? (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [s.railClose, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Close chart panel">
            <IconSymbol name="xmark" size={16} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {jacket ? (
        <Image source={{ uri: jacket }} style={s.railV2Jacket} contentFit="cover" />
      ) : (
        <View style={[s.railV2Jacket, { backgroundColor: theme.surfaceMuted }]} />
      )}
      <Text style={s.railTitle} numberOfLines={2}>{chart.title}</Text>

      <View style={s.railSection}>
        <Text style={s.railSectionLabel}>Your best</Text>
        {passed || userBest ? (
          <View style={s.railBestRow}>
            <Text style={s.railBestScore}>
              {Number(userBest?.score ?? chart.best_score ?? 0).toLocaleString()}
            </Text>
            {gradeLabel ? <Text style={[s.railBestGrade, { color: accent }]}>{gradeLabel}</Text> : null}
          </View>
        ) : (
          <Text style={s.railEmpty}>No clear yet — keep grinding.</Text>
        )}
      </View>

      <View style={s.railSection}>
        <Text style={s.railSectionLabel}>Friends on this chart</Text>
        {detail.isLoading ? (
          <ActivityIndicator size="small" color={theme.spinner} />
        ) : friends.length === 0 ? (
          <Text style={s.railEmpty}>None yet — invite some.</Text>
        ) : (
          <View style={s.railFriendList}>
            {friends.slice(0, 6).map((fr, i) => {
              const avatarUrl = fr.user.avatar ? fullImageUrl(fr.user.avatar) : undefined;
              return (
                <Pressable
                  key={fr.user.id}
                  onPress={() => router.push({ pathname: '/profile/[id]', params: { id: fr.user.id } })}
                  style={({ pressed }) => [s.railFriendRow, pressed && { opacity: 0.7 }]}>
                  <Text style={s.railFriendRank}>{i + 1}</Text>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.railFriendAvatar} contentFit="cover" />
                  ) : (
                    <View style={[s.railFriendAvatar, { backgroundColor: theme.surfaceMuted }]} />
                  )}
                  <Text style={s.railFriendName} numberOfLines={1}>{fr.user.username}</Text>
                  <Text style={s.railFriendScore}>
                    {Number(fr.best?.score || 0).toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {replayUrl ? (
        <Pressable
          onPress={onOpenFull}
          style={({ pressed }) => [s.railSecondary, pressed && { opacity: 0.85 }]}>
          <IconSymbol name="play.rectangle.fill" size={14} color={theme.accent} />
          <Text style={[s.railSecondaryText, { color: theme.accent }]}>Watch replay</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onOpenFull}
        style={({ pressed }) => [s.railPrimary, pressed && { opacity: 0.85 }]}>
        <Text style={s.railPrimaryText}>Open full chart →</Text>
      </Pressable>
    </View>
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

  // Desktop: grid scrolls in the left column, optional right rail for the
  // selected chart pinned at 360 px.
  deskBody: { flex: 1, flexDirection: 'row' as const },
  deskScroll: { flex: 1 },
  rail: {
    width: 360,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 18,
    gap: 12,
  },
  railHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  railEyebrow: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.8,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  railClose: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  railJacket: { width: '100%' as const, aspectRatio: 1, borderRadius: 10 },
  railTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  railMeta: { fontSize: 12, color: t.textMuted, letterSpacing: 0.4 },
  railSection: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  railSectionLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  railBestRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  railBestScore: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: t.text,
    fontVariant: ['tabular-nums' as const],
  },
  railBestGrade: { fontSize: 14, fontWeight: '800' as const, color: t.accent, letterSpacing: 0.5 },
  railEmpty: { fontSize: 12, color: t.textMuted },
  railPrimary: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  railPrimaryText: { color: t.textOnAccent, fontSize: 13, fontWeight: '800' as const, letterSpacing: 0.5 },

  // Desktop toolbar — inline replacement for the mobile pickerCard.
  deskToolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
    backgroundColor: t.surface,
    flexWrap: 'wrap' as const,
  },
  deskToolbarSpacer: { flex: 1 },
  deskToolbarLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.4,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  deskModeRow: { flexDirection: 'row' as const, gap: 4 },
  deskModePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  deskModePillText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.4 },
  deskLevelGroup: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
  },
  deskIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deskLevelNum: {
    fontSize: 18,
    fontWeight: '900' as const,
    minWidth: 28,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums' as const],
  },
  deskDensityRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  deskDensityBtn: {
    width: 30,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surfaceMuted,
  },
  deskDensityBtnActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  deskDensityBtnText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  deskDensityBtnTextActive: { color: t.accent },
  deskCheckRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deskCheckRowOn: {},
  deskCheckBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: t.borderStrong,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  deskCheckLabel: { fontSize: 12, fontWeight: '700' as const, color: t.text },
  deskShareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  deskShareBtnText: { fontSize: 12, fontWeight: '700' as const, color: t.text },

  // Desktop rail V2.
  railV2: {
    width: 380,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 16,
    gap: 12,
  },
  railV2Empty: {
    width: 380,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 24,
    gap: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  railV2EmptyTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: t.text,
    textAlign: 'center' as const,
  },
  railV2EmptyHint: {
    fontSize: 12,
    color: t.textMuted,
    textAlign: 'center' as const,
    maxWidth: 280,
  },
  railHeaderText: { flex: 1, gap: 2 },
  railV2Mode: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textMuted,
    letterSpacing: 0.4,
  },
  railV2Jacket: { width: '100%' as const, aspectRatio: 1, borderRadius: 10 },
  railFriendList: { gap: 4 },
  railFriendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 4,
  },
  railFriendRank: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.textDim,
    minWidth: 16,
    fontVariant: ['tabular-nums' as const],
  },
  railFriendAvatar: { width: 22, height: 22, borderRadius: 11 },
  railFriendName: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: t.text },
  railFriendScore: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  railSecondary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: t.accent,
    backgroundColor: t.accentTint,
  },
  railSecondaryText: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 0.4 },
});
