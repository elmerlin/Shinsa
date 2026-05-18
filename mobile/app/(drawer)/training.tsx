import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { GradeChip } from '@/components/grade-chip';
import { TopBar } from '@/components/top-bar';
import { HelpButton, HelpSheet } from '@/components/help-sheet';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { piugameApi } from '@/lib/api';
import { resolveJacketSource } from '@/lib/jacket';
import { TRAINING_HELP, type HelpKey } from '@/lib/training-help';
import type { ThemeColors } from '@/constants/theme';
import type {
  TrainingEwmaHistoryRow,
  TrainingModeProfile,
  TrainingPopulationProfile,
  TrainingZone,
} from '@shared/api';

type DisplayMode = 'overall' | 'single' | 'double';

const MODE_LABEL: Record<DisplayMode, string> = {
  overall: 'OVERALL',
  single: 'SINGLES',
  double: 'DOUBLES',
};

const MODE_ACCENT: Record<DisplayMode, string> = {
  overall: '#a78bfa', // violet — the union of the two
  single: '#ef4444',  // singles red
  double: '#10b981',  // doubles green
};

/**
 * Maps the server's training-status string onto a quick-read emoji. Falls
 * back to a generic dumbbell so unknown statuses still render something.
 */
const STATUS_ICON: Record<string, string> = {
  'Overclocked': '🔥',
  'In The Zone': '⚡',
  'Cruising': '🎯',
  'Warming Up': '📈',
  'Cooling Down': '❄️',
  'Resting': '💤',
  'Calibrating': '📡',
};
function statusIcon(status: string): string {
  return STATUS_ICON[status] || '🏋️';
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtSyncedAt(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function TrainingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [mode, setMode] = useState<DisplayMode>('single');
  const [helpKey, setHelpKey] = useState<HelpKey | null>(null);
  const openHelp = (key: HelpKey) => setHelpKey(key);
  const { isDesktop } = useBreakpoint();

  const loadQuery = useQuery({
    queryKey: ['training-load', user?.id || 'anon'],
    queryFn: () => piugameApi.trainingLoad(user!.id),
    enabled: !!user?.id,
  });

  const popQuery = useQuery({
    queryKey: ['training-population', user?.id || 'anon'],
    queryFn: () => piugameApi.trainingPopulation(user!.id),
    enabled: !!user?.id,
  });

  const data = loadQuery.data;
  const profile = data
    ? (data[mode] as TrainingZone & Partial<TrainingModeProfile>)
    : null;
  const population: TrainingPopulationProfile | undefined =
    mode === 'overall' ? undefined : popQuery.data?.[mode];
  const ewmaSeries = useMemo(() => buildEwmaSeries(data?.ewma_history ?? [], mode), [data, mode]);

  const onRefresh = () => {
    loadQuery.refetch();
    popQuery.refetch();
  };

  // Desktop: clicking a metric pins its help content in the right rail
  // instead of opening the HelpSheet modal. Defaults to the zone help
  // when nothing is pinned so the rail never goes empty.
  const handleHelp = (key: HelpKey) => {
    if (isDesktop) {
      setHelpKey(key);
    } else {
      openHelp(key);
    }
  };
  const railHelpKey: HelpKey = (helpKey ?? 'zone');

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar />
      </View>

      {!user ? (
        <View style={s.center}>
          <Text style={s.emptyText}>Sign in to see your training profile.</Text>
        </View>
      ) : (
        <View style={isDesktop ? s.deskRow : { flex: 1 }}>
        {isDesktop ? (
          <View style={s.deskNavRail}>
            <Text style={s.deskNavLabel}>MODE</Text>
            {(['overall', 'single', 'double'] as DisplayMode[]).map((m) => {
              const active = m === mode;
              const accent = MODE_ACCENT[m];
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  onHoverIn={() => undefined}
                  onHoverOut={() => undefined}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    s.deskNavRow,
                    hovered && !active && { backgroundColor: theme.surfaceMuted },
                    active && { backgroundColor: `${accent}1f`, borderColor: accent },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <View style={[s.deskNavStripe, { backgroundColor: active ? accent : 'transparent' }]} />
                  <Text style={[s.deskNavText, { color: active ? accent : theme.text }]}>
                    {MODE_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ScrollView
          style={isDesktop ? { flex: 1 } : undefined}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
          refreshControl={
            <RefreshControl
              refreshing={loadQuery.isRefetching || popQuery.isRefetching}
              onRefresh={onRefresh}
              tintColor={theme.spinner}
            />
          }>
          {data?.sync_stale ? (
            <View style={s.syncWarn}>
              <Text style={s.syncWarnText}>
                Last sync was {fmtSyncedAt(data.last_synced_at)} — pull to refresh, or sync again from Account.
              </Text>
            </View>
          ) : null}

          {!isDesktop ? (
          <View style={s.modePill}>
            {(['overall', 'single', 'double'] as DisplayMode[]).map((m) => {
              const active = m === mode;
              const accent = MODE_ACCENT[m];
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={({ pressed }) => [
                    s.modeBtn,
                    active && { backgroundColor: theme.card, borderColor: accent },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={[s.modeLabel, { color: active ? accent : theme.textMuted }]}>
                    {MODE_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          ) : null}

          {loadQuery.isLoading ? (
            <View style={s.center}><ActivityIndicator color={theme.spinner} /></View>
          ) : loadQuery.isError ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>
                {loadQuery.error instanceof Error ? loadQuery.error.message : 'Failed to load training data'}
              </Text>
            </View>
          ) : profile ? (
            <>
              <ZoneBadge profile={profile} s={s} onHelp={handleHelp} />
              <StatGrid profile={profile} s={s} onHelp={handleHelp} isDesktop={isDesktop} />
              {ewmaSeries.length > 1 ? (
                <EwmaSparklineCard series={ewmaSeries} s={s} accent={MODE_ACCENT[mode]} onHelp={handleHelp} />
              ) : null}
              {profile.likely_pass ? (
                <LikelyPassCard profile={profile} s={s} theme={theme} onHelp={handleHelp} />
              ) : null}
              {profile.grade_predictions ? (
                <GradePredictionsCard predictions={profile.grade_predictions} s={s} onHelp={handleHelp} />
              ) : null}
              {population ? (
                <PopulationSection population={population} s={s} onHelp={handleHelp} />
              ) : null}
            </>
          ) : null}

          {data?.last_synced_at ? (
            <Text style={s.footerSync}>Synced {fmtSyncedAt(data.last_synced_at)}</Text>
          ) : null}
        </ScrollView>

        {isDesktop ? (
          <ScrollView style={s.deskHelpRail} contentContainerStyle={s.deskHelpScroll}>
            <Text style={s.deskHelpEyebrow}>EXPLAINER</Text>
            <Text style={s.deskHelpTitle}>{TRAINING_HELP[railHelpKey].title}</Text>
            {TRAINING_HELP[railHelpKey].subtitle ? (
              <Text style={s.deskHelpSubtitle}>{TRAINING_HELP[railHelpKey].subtitle}</Text>
            ) : null}
            {TRAINING_HELP[railHelpKey].sections.map((sec, i) => (
              <View key={`${railHelpKey}-${i}`} style={s.deskHelpSection}>
                <Text style={s.deskHelpSectionLabel}>{sec.label}</Text>
                <Text style={s.deskHelpSectionBody}>{sec.body}</Text>
              </View>
            ))}
            {!helpKey ? (
              <Text style={s.deskHelpHint}>Tap any metric to swap this in.</Text>
            ) : null}
          </ScrollView>
        ) : null}
        </View>
      )}

      {/* Mobile keeps the bottom-sheet explainer. Desktop has its own
          persistent rail instead and never opens this. */}
      <HelpSheet
        visible={!isDesktop && helpKey !== null}
        content={helpKey ? TRAINING_HELP[helpKey] : null}
        onClose={() => setHelpKey(null)}
      />
    </View>
  );
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function ZoneBadge({
  profile,
  s,
  onHelp,
}: {
  profile: TrainingZone;
  s: Styles;
  onHelp: (key: HelpKey) => void;
}) {
  const accent = profile.training_color || '#94a3b8';
  const ratio = profile.training_ratio;
  const hasRatio = typeof ratio === 'number' && Number.isFinite(ratio);
  const tint = hexToRgba(accent, 0.12);
  return (
    <View style={[s.zoneCard, { borderColor: hexToRgba(accent, 0.5), backgroundColor: tint }]}>
      <View style={[s.zoneStripe, { backgroundColor: accent }]} />
      <View style={s.zoneRow}>
        <Text style={s.zoneIcon}>{statusIcon(profile.training_status)}</Text>
        <View style={s.zoneText}>
          <View style={s.zoneEyebrowRow}>
            <Text style={s.zoneEyebrow}>TRAINING STATUS</Text>
            <HelpButton onPress={() => onHelp('zone')} color={accent} />
          </View>
          <Text style={[s.zoneStatus, { color: accent }]}>
            {profile.calibrating ? 'Calibrating' : (profile.training_status || '—')}
          </Text>
        </View>
        {hasRatio ? (
          <Pressable onPress={() => onHelp('training_ratio')} hitSlop={6} style={({ pressed }) => [s.zoneRatio, pressed && { opacity: 0.7 }]}>
            <Text style={[s.zoneRatioVal, { color: accent }]}>
              {ratio.toFixed(0)}<Text style={s.zoneRatioPct}>%</Text>
            </Text>
            <Text style={s.zoneRatioLabel}>FORM / BASE ?</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function StatGrid({
  profile,
  s,
  onHelp,
  isDesktop,
}: {
  profile: TrainingZone & Partial<TrainingModeProfile>;
  s: Styles;
  onHelp: (key: HelpKey) => void;
  isDesktop?: boolean;
}) {
  // Desktop lays the 4 tiles flush in a single row instead of 2x2.
  const tileStyle = isDesktop ? s.statTileDesktop : undefined;
  return (
    <View style={s.statGrid}>
      <StatTile label="BASE SKILL" value={fmtNum(profile.base_skill, 0)} sub="long-term load" s={s} extraStyle={tileStyle} onPress={() => onHelp('base_skill')} />
      <StatTile label="CURRENT FORM" value={fmtNum(profile.current_form, 0)} sub="last ~7 days" s={s} extraStyle={tileStyle} onPress={() => onHelp('current_form')} />
      <StatTile label="PLAY DAYS" value={String(profile.play_days || 0)} sub="distinct days" s={s} extraStyle={tileStyle} onPress={() => onHelp('play_days')} />
      {typeof profile.avg_play_load === 'number' ? (
        <StatTile label="AVG LOAD" value={fmtNum(profile.avg_play_load, 0)} sub="per play" s={s} extraStyle={tileStyle} onPress={() => onHelp('avg_play_load')} />
      ) : (
        <StatTile label="CHRONIC CLEARS" value={fmtNum(profile.chronic_clear_count, 1)} sub="last 7d" s={s} extraStyle={tileStyle} onPress={() => onHelp('chronic_clears')} />
      )}
    </View>
  );
}

function StatTile({
  label,
  value,
  sub,
  s,
  onPress,
  extraStyle,
}: {
  label: string;
  value: string;
  sub?: string;
  s: Styles;
  onPress?: () => void;
  extraStyle?: object;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.statTile, extraStyle, pressed && onPress && { opacity: 0.85 }]}>
      <View style={s.statLabelRow}>
        <Text style={s.statLabel}>{label}</Text>
        {onPress ? <Text style={s.statHelpGlyph}>?</Text> : null}
      </View>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </Pressable>
  );
}

function buildEwmaSeries(rows: TrainingEwmaHistoryRow[], mode: DisplayMode): { x: number; form: number; base: number }[] {
  return rows
    .map((row, i) => {
      const m = row[mode];
      if (!m) return null;
      return {
        x: i,
        form: Number(m.current_form) || 0,
        base: Number(m.base_skill) || 0,
      };
    })
    .filter((p): p is { x: number; form: number; base: number } => !!p);
}

function EwmaSparklineCard({
  series,
  s,
  accent,
  onHelp,
}: {
  series: { x: number; form: number; base: number }[];
  s: Styles;
  accent: string;
  onHelp: (key: HelpKey) => void;
}) {
  // Fixed canvas — looks identical across phone widths because we letterbox
  // inside the card. The data is already a smooth EWMA so we don't bother
  // with axis labels or tooltips, just the trend lines.
  const w = 320;
  const h = 80;
  const pad = 6;
  const xs = series.map((p) => p.x);
  const allVals = series.flatMap((p) => [p.form, p.base]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const sx = (x: number) => pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);
  const sy = (y: number) => h - pad - ((y - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);
  const formPath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.form).toFixed(1)}`).join(' ');
  const basePath = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.base).toFixed(1)}`).join(' ');
  const formArea = `${formPath} L ${sx(maxX).toFixed(1)} ${(h - pad).toFixed(1)} L ${sx(minX).toFixed(1)} ${(h - pad).toFixed(1)} Z`;

  const last = series[series.length - 1];
  const first = series[0];
  const formArrow = last.form > first.form ? '↑' : last.form < first.form ? '↓' : '→';
  const baseArrow = last.base > first.base ? '↑' : last.base < first.base ? '↓' : '→';

  return (
    <View style={s.sparkCard}>
      <View style={s.sparkHeader}>
        <View style={s.sparkTitleRow}>
          <Text style={s.sparkTitle}>FORM vs BASE · last {series.length}d</Text>
          <HelpButton onPress={() => onHelp('sparkline')} />
        </View>
        <View style={s.sparkLegend}>
          <View style={s.sparkLegendItem}>
            <View style={[s.sparkLegendDot, { backgroundColor: accent }]} />
            <Text style={s.sparkLegendText}>Form {formArrow}</Text>
          </View>
          <View style={s.sparkLegendItem}>
            <View style={[s.sparkLegendDot, { backgroundColor: '#64748b' }]} />
            <Text style={s.sparkLegendText}>Base {baseArrow}</Text>
          </View>
        </View>
      </View>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={accent} stopOpacity={0.45} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={formArea} fill="url(#sparkFill)" />
        <Path
          d={basePath}
          fill="none"
          stroke="#64748b"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <Path d={formPath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function LikelyPassCard({
  profile,
  s,
  theme,
  onHelp,
}: {
  profile: TrainingZone & Partial<TrainingModeProfile>;
  s: Styles;
  theme: ThemeColors;
  onHelp: (key: HelpKey) => void;
}) {
  const lp = profile.likely_pass!;
  const confidence = lp.confidence || 'Low';
  const confidenceColor =
    confidence === 'High' ? '#34d399' : confidence === 'Medium' ? '#facc15' : '#94a3b8';

  // Pull a couple of best clears from the target level for context.
  const sampleClears = (lp.target?.clears || []).slice(0, 2);
  // Server hands back a few short strings explaining WHY this level was
  // picked (e.g. "3 recent clears at Lv.21" / "2 high-score near-passes
  // at Lv.22"). Web shows these as bullets — match that here so the
  // card actually justifies its prediction.
  const reasons = (lp.reasons || []).slice(0, 3);

  return (
    <View style={s.section}>
      <View style={s.sectionTitleRow}>
        <Text style={s.sectionTitle}>NEXT TARGET</Text>
        <HelpButton onPress={() => onHelp('likely_pass')} />
      </View>
      <View style={s.predictCard}>
        <View style={s.predictTopRow}>
          <View style={s.predictLevelBlock}>
            <Text style={s.predictLevelEyebrow}>LIKELY PASS</Text>
            <Text style={s.predictLevelNum}>{lp.level}</Text>
            {typeof profile.comfortable_level === 'number' ? (
              <Text style={s.predictComfort}>comfortable at {profile.comfortable_level}</Text>
            ) : null}
          </View>
          <View style={s.predictRight}>
            <View style={[s.confidencePill, { borderColor: confidenceColor, backgroundColor: hexToRgba(confidenceColor, 0.12) }]}>
              <Text style={[s.confidencePillText, { color: confidenceColor }]}>
                {confidence} confidence
              </Text>
            </View>
            {lp.predicted_grade ? (
              <View style={s.predictGradeRow}>
                <Text style={s.predictGradeLabel}>predicted</Text>
                <GradeChip grade={lp.predicted_grade} score={0} size="sm" />
              </View>
            ) : null}
          </View>
        </View>

        {lp.target ? (
          <View style={s.predictMetaRow}>
            <Text style={s.predictMetaText}>
              <Text style={s.predictMetaNum}>{lp.target.clear_count}</Text> clear{lp.target.clear_count === 1 ? '' : 's'} of <Text style={s.predictMetaNum}>{lp.target.attempt_count}</Text> attempt{lp.target.attempt_count === 1 ? '' : 's'} at L{lp.target.level}
            </Text>
          </View>
        ) : null}

        {reasons.length > 0 ? (
          <View style={s.predictReasons}>
            {reasons.map((reason, i) => (
              <View key={i} style={s.predictReasonRow}>
                <Text style={s.predictReasonDot}>•</Text>
                <Text style={s.predictReasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {sampleClears.length > 0 ? (
          <View style={s.clearsList}>
            {sampleClears.map((clr, i) => {
              // Prefer the APK-bundled jacket; falls back to network URL.
              const clrSource = resolveJacketSource((clr as { jacket_url?: string }).jacket_url);
              return (
              <View key={`${clr.song_title}-${i}`} style={s.clearRow}>
                {clrSource ? (
                  <Image source={clrSource as never} style={s.clearJacket} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.clearJacket, { backgroundColor: theme.surfaceMuted }]} />
                )}
                <Text style={s.clearTitle} numberOfLines={1}>{clr.song_title}</Text>
                <Text style={s.clearScore}>{fmtNum(clr.score)}</Text>
                <GradeChip grade={clr.grade} score={clr.score} size="sm" />
              </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function GradePredictionsCard({
  predictions,
  s,
  onHelp,
}: {
  predictions: Record<string, string>;
  s: Styles;
  onHelp: (key: HelpKey) => void;
}) {
  const entries = Object.entries(predictions)
    .map(([level, grade]) => ({ level: Number(level), grade }))
    .filter((e) => Number.isFinite(e.level))
    .sort((a, b) => a.level - b.level);
  if (entries.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.sectionTitleRow}>
        <Text style={s.sectionTitle}>GRADE PREDICTIONS</Text>
        <HelpButton onPress={() => onHelp('grade_predictions')} />
      </View>
      {/* Wrap onto multiple rows instead of horizontal-scrolling so
          higher-level predictions don't disappear off the right edge
          when the column is narrow. Each tile is fixed-width so the
          row packs cleanly. */}
      <View style={s.predRow}>
        {entries.map((e) => (
          <View key={e.level} style={s.predTile}>
            <Text style={s.predLevel}>{e.level}</Text>
            <GradeChip grade={e.grade} score={0} size="sm" />
          </View>
        ))}
      </View>
    </View>
  );
}

function PopulationSection({
  population,
  s,
  onHelp,
}: {
  population: TrainingPopulationProfile;
  s: Styles;
  onHelp: (key: HelpKey) => void;
}) {
  const pct = population.percentile;
  const ms = population.milestone;
  const ceil = population.ceiling;
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>HOW YOU STACK UP</Text>
      <View style={s.popGrid}>
        <Pressable onPress={() => onHelp('percentile')} style={({ pressed }) => [s.popTile, pressed && { opacity: 0.85 }]}>
          <View style={s.popEyebrowRow}>
            <Text style={s.popEyebrow}>PERCENTILE</Text>
            <Text style={s.popHelpGlyph}>?</Text>
          </View>
          <Text style={s.popHeadline}>
            {pct.percentile}<Text style={s.popHeadlineSub}>th</Text>
          </Text>
          <Text style={s.popMeta}>#{pct.rank} of {pct.total_users}</Text>
        </Pressable>

        <Pressable onPress={() => onHelp('milestone')} style={({ pressed }) => [s.popTile, pressed && { opacity: 0.85 }]}>
          <View style={s.popEyebrowRow}>
            <Text style={s.popEyebrow}>NEXT MILESTONE</Text>
            <Text style={s.popHelpGlyph}>?</Text>
          </View>
          <Text style={s.popHeadline}>L{ms.target_level}</Text>
          <Text style={s.popMeta}>
            {ms.already_met ? 'cleared the bar' : `${ms.gap_percent.toFixed(0)}% load to go`}
          </Text>
        </Pressable>

        <Pressable onPress={() => onHelp('ceiling')} style={({ pressed }) => [s.popTile, pressed && { opacity: 0.85 }]}>
          <View style={s.popEyebrowRow}>
            <Text style={s.popEyebrow}>CEILING</Text>
            <Text style={s.popHelpGlyph}>?</Text>
          </View>
          <Text style={s.popHeadline}>L{ceil.ceiling_level}</Text>
          <Text style={s.popMeta}>+{ceil.delta} from comfort</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Tiny helper for hex+alpha used by the gradient borders. Accepts #rgb or
 *  #rrggbb input — anything else falls back to a neutral white tint. */
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f0-9]{3}|[a-f0-9]{6})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' as const, color: t.text, letterSpacing: 1 },

  // Middle column gets a touch more breathing room on desktop so the
  // 4-up KPI tiles + 2-up likely-pass / grade-predictions cards don't
  // butt up against the rails on the left/right.
  scroll: { paddingHorizontal: 16, gap: 14 },
  center: { padding: 32, alignItems: 'center' as const },
  emptyText: { color: t.textMuted, fontSize: 14 },
  errorBox: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: t.dangerBg,
    borderWidth: 1,
    borderColor: t.dangerBorder,
  },
  errorText: { color: t.danger, fontSize: 14 },
  footerSync: { fontSize: 11, color: t.textDim, textAlign: 'center' as const, marginTop: 8 },

  syncWarn: {
    backgroundColor: 'rgba(250, 204, 21, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(250, 204, 21, 0.4)',
    borderRadius: 10,
    padding: 12,
  },
  syncWarnText: { fontSize: 12, color: '#fbbf24', fontWeight: '600' as const },

  modePill: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeLabel: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6 },

  // Zone badge
  zoneCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden' as const,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  zoneStripe: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 3 },
  zoneRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  zoneIcon: { fontSize: 32 },
  zoneText: { flex: 1, gap: 2 },
  zoneEyebrowRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  zoneEyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  zoneStatus: { fontSize: 18, fontWeight: '900' as const, letterSpacing: 0.5 },
  zoneRatio: { alignItems: 'flex-end' as const, gap: 1 },
  zoneRatioVal: { fontSize: 26, fontWeight: '900' as const, fontVariant: ['tabular-nums' as const] },
  zoneRatioPct: { fontSize: 14 },
  zoneRatioLabel: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },

  // Stat grid
  statGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  statTile: {
    flexBasis: '48%' as const,
    flexGrow: 1,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 4,
  },
  statLabelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  statLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  statHelpGlyph: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, opacity: 0.6 },
  statValue: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statSub: { fontSize: 10, color: t.textDim },

  // Section wrapper
  section: { gap: 8 },
  sectionTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 4, gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim, paddingHorizontal: 4 },

  // Sparkline
  sparkCard: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 12,
    gap: 8,
  },
  sparkHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  sparkTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  sparkTitle: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  sparkLegend: { flexDirection: 'row' as const, gap: 10 },
  sparkLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  sparkLegendDot: { width: 8, height: 8, borderRadius: 4 },
  sparkLegendText: { fontSize: 10, fontWeight: '700' as const, color: t.textMuted },

  // Likely pass
  predictCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  predictTopRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 16 },
  predictLevelBlock: { flex: 1, gap: 2 },
  predictLevelEyebrow: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.6, color: t.textDim },
  predictLevelNum: { fontSize: 42, fontWeight: '900' as const, color: t.text, letterSpacing: -1, lineHeight: 44 },
  predictComfort: { fontSize: 11, color: t.textMuted, marginTop: 2 },
  predictRight: { alignItems: 'flex-end' as const, gap: 8 },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confidencePillText: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 0.5 },
  predictGradeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  predictGradeLabel: { fontSize: 10, color: t.textDim, letterSpacing: 0.5 },
  predictMetaRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  predictMetaText: { fontSize: 12, color: t.textMuted },
  predictMetaNum: { fontWeight: '800' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  // "Why this level?" bullet list — server hands us strings like
  // "3 recent clears at Lv.21" or "2 high-score near-passes at Lv.22"
  // explaining why the prediction landed where it did.
  predictReasons: { gap: 4, paddingTop: 4 },
  predictReasonRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 6 },
  predictReasonDot: { fontSize: 13, color: t.accent, lineHeight: 17, marginTop: -1 },
  predictReasonText: { flex: 1, fontSize: 12, color: t.text, lineHeight: 17 },

  clearsList: { gap: 6 },
  clearRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  clearJacket: { width: 32, height: 20, borderRadius: 3 },
  clearTitle: { flex: 1, fontSize: 12, color: t.text, fontWeight: '700' as const },
  clearScore: { fontSize: 11, color: t.textMuted, fontVariant: ['tabular-nums' as const] },

  // Grade predictions row — flex-wraps so high-level tiles always show
  // (no horizontal scroll, nothing clipped off the right).
  predRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    paddingHorizontal: 2,
  },
  predTile: {
    width: 56,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
    gap: 6,
  },
  predLevel: { fontSize: 14, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },

  // Population
  popGrid: { flexDirection: 'row' as const, gap: 8 },
  popTile: {
    flex: 1,
    backgroundColor: t.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 10,
    gap: 4,
  },
  popEyebrowRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  popEyebrow: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim },
  popHelpGlyph: { fontSize: 9, fontWeight: '900' as const, color: t.textDim, opacity: 0.6 },
  popHeadline: { fontSize: 22, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  popHeadlineSub: { fontSize: 13 },
  popMeta: { fontSize: 10, color: t.textMuted },

  // Desktop overrides — 4-col KPI row, tiles grow to fill width so the row
  // doesn't leave dead space on the right. Likely-pass / grade-predictions
  // stack vertically on desktop too: when they were side-by-side the short
  // grade-predictions card left a tall empty gutter next to the taller
  // likely-pass card.
  statTileDesktop: { flex: 1, minWidth: 120 },

  // Desktop 3-col layout: nav rail (left), metrics (center), help rail (right).
  // Both side rails are kept tight to their content so the middle column
  // gets every pixel it can — the metrics stack (KPI row, sparkline,
  // likely-pass, grade-predictions, how-you-stack-up) is content-heavy.
  deskRow: { flex: 1, flexDirection: 'row' as const, alignItems: 'stretch' as const },
  deskNavRail: {
    // Tight to text width — mode labels (Overall / Singles / Doubles)
    // are short, and the middle column needs every pixel for the KPI
    // row and grade-predictions tiles.
    width: 144,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: t.border,
    backgroundColor: t.surface,
    padding: 12,
    gap: 4,
  },
  deskNavLabel: {
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.textDim,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  deskNavRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 8,
  },
  deskNavStripe: { width: 3, height: 18, borderRadius: 2 },
  deskNavText: { fontSize: 13, fontWeight: '800' as const, letterSpacing: 0.5 },
  deskHelpRail: {
    // Tight column — explainer copy still reads at this width (paragraphs
    // wrap a bit more, but the labels stay one line). Middle column keeps
    // the freed-up pixels for the KPI row and grade-predictions tiles.
    width: 160,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
  },
  deskHelpScroll: { padding: 12, gap: 8, paddingBottom: 60 },
  deskHelpEyebrow: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.6,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },
  deskHelpTitle: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: t.text,
    letterSpacing: 0.5,
  },
  deskHelpSubtitle: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  deskHelpSection: { gap: 4, paddingTop: 8 },
  deskHelpSectionLabel: {
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
    color: t.textDim,
    textTransform: 'uppercase' as const,
  },
  deskHelpSectionBody: { fontSize: 13, color: t.text, lineHeight: 18 },
  deskHelpHint: { fontSize: 11, color: t.textDim, paddingTop: 12, fontStyle: 'italic' as const },
});
