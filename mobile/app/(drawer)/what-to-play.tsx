import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { songsApi } from '@/lib/api';
import { fullImageUrl } from '@/lib/images';
import type { ThemeColors } from '@/constants/theme';
import type {
  AddListItemPayload,
  ChartFeedback,
  GoalRecommendation,
  GoalRecommendationsResponse,
  PumbilityGoalSummary,
  TitleGoalSummary,
  UserList,
} from '@shared/api';

type Goal = 'title' | 'pumbility';
type ModeChoice = 'single' | 'double' | 'both';

const RECS_QUERY_KEY = (goal: Goal, mode: ModeChoice, seed: number) => ['recommendations', goal, mode, seed] as const;
const LISTS_QUERY_KEY = ['user-lists'] as const;

// Reason chip color map — matches web's REASON_COLORS palette intent.
const REASON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  easy_tier: { bg: 'rgba(16,185,129,0.16)', text: '#34d399', border: 'rgba(16,185,129,0.45)' },
  high_fail: { bg: 'rgba(245,158,11,0.16)', text: '#fbbf24', border: 'rgba(245,158,11,0.45)' },
  skill_fit: { bg: 'rgba(56,189,248,0.16)', text: '#7dd3fc', border: 'rgba(56,189,248,0.45)' },
  unpassed: { bg: 'rgba(148,163,184,0.16)', text: '#cbd5e1', border: 'rgba(148,163,184,0.4)' },
  easiest: { bg: 'rgba(16,185,129,0.16)', text: '#34d399', border: 'rgba(16,185,129,0.45)' },
  easiest_and_best_impact: { bg: 'rgba(255,196,0,0.18)', text: '#FFE06B', border: 'rgba(255,196,0,0.55)' },
  best_impact: { bg: 'rgba(255,196,0,0.18)', text: '#FFE06B', border: 'rgba(255,196,0,0.55)' },
  impact_ranked: { bg: 'rgba(167,139,250,0.16)', text: '#c4b5fd', border: 'rgba(167,139,250,0.45)' },
};

const PASSABILITY_OPTIONS: { value: 1 | 2 | 3 | 4 | 5; label: string; tint: string }[] = [
  { value: 1, label: 'Ready', tint: '#34d399' },
  { value: 2, label: 'Soon', tint: '#a3e635' },
  { value: 3, label: 'Stretch', tint: '#fbbf24' },
  { value: 4, label: 'Hard', tint: '#fb923c' },
  { value: 5, label: 'Not yet', tint: '#fb7185' },
];

function formatScore(value: number | null | undefined): string {
  const n = parseInt(String(value ?? 0), 10) || 0;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString();
}

function getReasonStyle(reasonType: string | undefined) {
  return REASON_COLORS[reasonType ?? 'unpassed'] ?? REASON_COLORS.unpassed;
}

function isSingleMode(mode: string): boolean {
  return String(mode || '').toLowerCase().startsWith('s');
}

const GRADE_THRESHOLDS: { min: number; grade: string }[] = [
  { min: 0, grade: 'F' }, { min: 450000, grade: 'D' }, { min: 550000, grade: 'C' },
  { min: 650000, grade: 'B' }, { min: 750000, grade: 'A' }, { min: 825000, grade: 'A+' },
  { min: 900000, grade: 'AA' }, { min: 925000, grade: 'AA+' }, { min: 950000, grade: 'AAA' },
  { min: 960000, grade: 'AAA+' }, { min: 970000, grade: 'S' }, { min: 975000, grade: 'S+' },
  { min: 980000, grade: 'SS' }, { min: 985000, grade: 'SS+' }, { min: 990000, grade: 'SSS' },
  { min: 995000, grade: 'SSS+' },
];
function gradeFromScore(score: number): string {
  for (let i = GRADE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= GRADE_THRESHOLDS[i].min) return GRADE_THRESHOLDS[i].grade;
  }
  return 'F';
}
function nextGradeUp(grade: string | undefined | null): string {
  const idx = GRADE_THRESHOLDS.findIndex((g) => g.grade === grade);
  if (idx >= 0 && idx < GRADE_THRESHOLDS.length - 1) return GRADE_THRESHOLDS[idx + 1].grade;
  return grade || 'PASS';
}

function buildListItemPayload(rec: GoalRecommendation): AddListItemPayload {
  const isPumbility = rec.current_score != null;
  if (isPumbility) {
    return {
      chartId: rec.chart_id,
      songTitle: rec.song_title,
      artist: rec.artist || '',
      mode: rec.mode,
      level: rec.level,
      jacketUrl: rec.jacket_url || '',
      originalScore: rec.current_score || 0,
      originalGrade: rec.current_grade || '',
      hadPass: true,
      target: rec.next_grade || nextGradeUp(rec.current_grade),
      addedAt: Date.now(),
    };
  }
  return {
    chartId: rec.chart_id,
    songTitle: rec.song_title,
    artist: rec.artist || '',
    mode: rec.mode,
    level: rec.level,
    jacketUrl: rec.jacket_url || '',
    originalScore: rec.best_score || rec.fail_score || 0,
    originalGrade: rec.best_grade || (rec.best_score ? gradeFromScore(rec.best_score) : ''),
    hadPass: false,
    target: 'PASS',
    addedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Goal summary cards
// ---------------------------------------------------------------------------
function TitleSummary({ summary }: { summary: TitleGoalSummary | null | undefined }) {
  const s = useThemedStyles(makeSummaryStyles);
  const { theme } = useTheme();
  if (!summary) return null;

  const pointsRemaining = summary.points_remaining ?? 0;
  const requiredPoints = summary.next_title?.required_points ?? 0;
  const progress = requiredPoints > 0
    ? Math.max(0, Math.min(100, 100 - (pointsRemaining / requiredPoints) * 100))
    : 100;

  return (
    <View style={s.box}>
      <View style={s.titleRow}>
        <Text style={s.fromLabel} numberOfLines={1}>
          {summary.current_title?.skill_title || summary.current_title?.name || '—'}
        </Text>
        <IconSymbol name="chevron.right" size={12} color={theme.textDim} />
        <Text style={s.toLabel} numberOfLines={1}>
          {summary.next_title?.skill_title || summary.next_title?.name || '—'}
        </Text>
      </View>

      <View style={s.bar}>
        <LinearGradient
          colors={[theme.accentMuted, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.barFill, { width: `${progress}%` }]}
        />
      </View>

      <View style={s.bigRow}>
        <Text style={s.bigNum}>{formatNumber(pointsRemaining)}</Text>
        <Text style={s.bigCaption}>points to go</Text>
      </View>

      {summary.estimate_label ? (
        <Text style={s.foot}>{summary.estimate_label}</Text>
      ) : null}
    </View>
  );
}

function PumbilitySummary({ summary }: { summary: PumbilityGoalSummary | null | undefined }) {
  const s = useThemedStyles(makeSummaryStyles);
  if (!summary) return null;
  return (
    <View style={s.box}>
      <View style={s.bigRow}>
        <Text style={s.bigNum}>{formatNumber(summary.current_pumbility ?? 0)}</Text>
        <Text style={s.bigCaption}>pumbility</Text>
      </View>
      <View style={s.frontierRow}>
        <Text style={s.frontierBadge}>{summary.frontier_size ?? 0} upgradeable</Text>
      </View>
      {summary.selection_note ? <Text style={s.foot}>{summary.selection_note}</Text> : null}
    </View>
  );
}

function StatusCard({
  status,
  goal,
  onSwitchGoal,
}: {
  status: 'needs_import' | 'all_completed';
  goal: Goal;
  onSwitchGoal?: () => void;
}) {
  const { theme } = useTheme();
  const s = useThemedStyles(makeStatusStyles);
  if (status === 'needs_import') {
    return (
      <View style={[s.box, { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)' }]}>
        <View style={[s.iconWrap, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
          <IconSymbol name="info.circle" size={20} color="#fbbf24" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: '#fbbf24' }]}>Import your scores</Text>
          <Text style={s.body}>Sync your best scores from PIU Game to unlock recommendations.</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.box, { backgroundColor: theme.accentTint, borderColor: theme.accent }]}>
      <View style={[s.iconWrap, { backgroundColor: theme.accentTint }]}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.accent }]}>
          {goal === 'title' ? 'All titles earned!' : 'Frontier cleared'}
        </Text>
        <Text style={s.body}>
          {goal === 'title'
            ? 'Switch to Pumbility to keep pushing your scores higher.'
            : 'Nothing to upgrade right now — try a different mode or refresh.'}
        </Text>
        {onSwitchGoal ? (
          <Pressable
            onPress={onSwitchGoal}
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
            <Text style={s.ctaText}>{goal === 'title' ? 'Switch to Pumbility' : 'Switch to Title'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recommendation Card
// ---------------------------------------------------------------------------
function RecommendationCard({
  rec,
  goal,
  onPress,
  onTrack,
  index,
  animTrigger,
  cardWidth,
}: {
  rec: GoalRecommendation;
  goal: Goal;
  onPress: () => void;
  onTrack: () => void;
  index: number;
  animTrigger: number;
  cardWidth?: number;
}) {
  const s = useThemedStyles(makeCardStyles);
  const { theme } = useTheme();
  const reason = getReasonStyle(rec.reason_type);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const liftAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    liftAnim.setValue(8);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay: index * 40,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(liftAnim, {
        toValue: 0,
        duration: 320,
        delay: index * 40,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [animTrigger, index, fadeAnim, liftAnim]);

  const single = isSingleMode(rec.mode);
  const jacketSrc = fullImageUrl(rec.jacket_url || rec.background_url);
  const fb = rec.player_feedback;
  const hasNote = !!fb?.note;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: liftAnim }],
      }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          s.card,
          cardWidth ? { width: cardWidth } : null,
          pressed && { transform: [{ scale: 0.98 }] },
        ]}>
        {/* Jacket */}
        <View style={s.jacketWrap}>
          {jacketSrc ? (
            <Image source={{ uri: jacketSrc }} style={s.jacket} contentFit="cover" transition={120} />
          ) : (
            <View style={[s.jacket, s.jacketFallback]}>
              <Text style={s.jacketFallbackText}>{(rec.song_title || '?').charAt(0)}</Text>
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* Level badge */}
          <View style={[s.levelBadge, single ? s.levelBadgeSingle : s.levelBadgeDouble]}>
            <Text style={s.levelBadgeText}>{single ? 'S' : 'D'}{rec.level}</Text>
          </View>
          {/* Pumbility gain — top right */}
          {goal === 'pumbility' && (rec.pumbility_gain ?? 0) > 0 ? (
            <View style={s.gainPill}>
              <Text style={s.gainPillText}>+{rec.pumbility_gain}</Text>
            </View>
          ) : null}
          {/* Bookmark */}
          <Pressable
            onPress={(e) => { e.stopPropagation(); onTrack(); }}
            hitSlop={8}
            style={({ pressed }) => [s.bookmark, pressed && { opacity: 0.7 }]}>
            <IconSymbol name="square.and.arrow.up" size={14} color={theme.text} />
          </Pressable>

          {/* Title overlay at bottom */}
          <View style={s.titleOverlay}>
            <Text style={s.titleText} numberOfLines={1}>{rec.song_title}</Text>
            {rec.artist ? <Text style={s.artistText} numberOfLines={1}>{rec.artist}</Text> : null}
          </View>
        </View>

        {/* Body */}
        <View style={s.body}>
          {/* Reason chip */}
          {rec.reason_label ? (
            <View style={[s.reasonChip, { backgroundColor: reason.bg, borderColor: reason.border }]}>
              <Text style={[s.reasonChipText, { color: reason.text }]} numberOfLines={1}>{rec.reason_label}</Text>
            </View>
          ) : null}

          {/* Score state */}
          <ScoreState rec={rec} goal={goal} />

          {/* Tier chip + feedback indicators */}
          <View style={s.indicatorRow}>
            {rec.tier_name && rec.tier_name !== 'Unrated' ? (
              <View style={s.tierChip}>
                <Text style={s.tierChipText} numberOfLines={1}>{rec.tier_name}</Text>
              </View>
            ) : null}
            {fb?.passability_rating ? (
              <View style={[s.readChip, { borderColor: PASSABILITY_OPTIONS.find((o) => o.value === fb.passability_rating)?.tint || theme.textDim }]}>
                <Text style={[s.readChipText, { color: PASSABILITY_OPTIONS.find((o) => o.value === fb.passability_rating)?.tint || theme.textDim }]}>
                  {fb.passability_label || PASSABILITY_OPTIONS.find((o) => o.value === fb.passability_rating)?.label}
                </Text>
              </View>
            ) : null}
            {hasNote ? <IconSymbol name="square.and.pencil" size={12} color={theme.textDim} /> : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ScoreState({ rec, goal }: { rec: GoalRecommendation; goal: Goal }) {
  const s = useThemedStyles(makeCardStyles);
  if (goal === 'pumbility') {
    return (
      <Text style={s.scoreState} numberOfLines={1}>
        {rec.current_grade ? <Text style={s.scoreCurr}>{rec.current_grade}</Text> : null}
        {rec.score_needed != null ? (
          <Text style={s.scoreNeeded}> +{formatScore(rec.score_needed)} → {rec.next_grade}</Text>
        ) : null}
      </Text>
    );
  }
  if (rec.fail_score) {
    return <Text style={[s.scoreState, s.failText]}>Best fail {formatScore(rec.fail_score)}</Text>;
  }
  if (rec.best_score) {
    return (
      <Text style={s.scoreState}>
        Best {formatScore(rec.best_score)} {rec.best_grade || ''}
      </Text>
    );
  }
  return <Text style={[s.scoreState, s.unplayedText]}>Unplayed</Text>;
}

// ---------------------------------------------------------------------------
// Detail modal (tap a card)
// ---------------------------------------------------------------------------
function DetailModal({
  rec,
  goal,
  visible,
  onClose,
  onTrack,
}: {
  rec: GoalRecommendation | null;
  goal: Goal;
  visible: boolean;
  onClose: () => void;
  onTrack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeDetailStyles);

  if (!rec) return null;
  const reason = getReasonStyle(rec.reason_type);
  const single = isSingleMode(rec.mode);
  const jacketSrc = fullImageUrl(rec.jacket_url || rec.background_url);
  const fb = rec.player_feedback;
  const ph = rec.play_history;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {/* Hero */}
          <View style={s.hero}>
            {jacketSrc ? (
              <Image source={{ uri: jacketSrc }} style={s.heroImage} contentFit="cover" />
            ) : (
              <View style={[s.heroImage, { backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={s.heroFallback}>{(rec.song_title || '?').charAt(0)}</Text>
              </View>
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <View style={[s.heroLevelBadge, single ? s.singleBg : s.doubleBg]}>
              <Text style={s.heroLevelText}>{single ? 'S' : 'D'}{rec.level}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.heroClose, pressed && { opacity: 0.7 }]}>
              <IconSymbol name="xmark" size={16} color={theme.text} />
            </Pressable>
            <View style={s.heroFooter}>
              <Text style={s.heroTitle} numberOfLines={2}>{rec.song_title}</Text>
              {rec.artist ? <Text style={s.heroArtist} numberOfLines={1}>{rec.artist}</Text> : null}
            </View>
          </View>

          <ScrollView contentContainerStyle={s.body}>
            <View style={s.chipRow}>
              {rec.reason_label ? (
                <View style={[s.detailChip, { backgroundColor: reason.bg, borderColor: reason.border }]}>
                  <Text style={[s.detailChipText, { color: reason.text }]}>{rec.reason_label}</Text>
                </View>
              ) : null}
              {rec.tier_name && rec.tier_name !== 'Unrated' ? (
                <View style={s.detailTier}>
                  <Text style={s.detailTierText}>{rec.tier_name}</Text>
                </View>
              ) : null}
            </View>

            {/* Numbers grid */}
            <View style={s.statsList}>
              {goal === 'pumbility' ? (
                <>
                  {rec.current_score != null ? (
                    <StatLine label="Current" value={`${formatNumber(rec.current_score)} ${rec.current_grade || ''}`} />
                  ) : null}
                  {rec.next_grade ? <StatLine label="Target" value={rec.next_grade} highlight /> : null}
                  {rec.score_needed != null ? (
                    <StatLine label="Score needed" value={`+${formatNumber(rec.score_needed)}`} amber />
                  ) : null}
                  {rec.pumbility_gain != null && rec.pumbility_gain > 0 ? (
                    <StatLine label="Pumbility gain" value={`+${rec.pumbility_gain}`} success />
                  ) : null}
                </>
              ) : (
                <>
                  {rec.fail_score ? (
                    <StatLine label="Best fail" value={formatNumber(rec.fail_score)} amber />
                  ) : rec.best_score ? (
                    <StatLine label="Best score" value={`${formatNumber(rec.best_score)} ${rec.best_grade || ''}`} />
                  ) : (
                    <StatLine label="Status" value="No attempts yet" muted />
                  )}
                </>
              )}
              {ph?.logged_plays ? (
                <StatLine label="Logged plays" value={String(ph.logged_plays)} muted />
              ) : null}
              {ph?.logged_passes ? (
                <StatLine label="Logged passes" value={String(ph.logged_passes)} success />
              ) : null}
            </View>

            {/* Your read */}
            {fb?.passability_rating ? (
              <View style={s.readBox}>
                <Text style={s.sectionLabel}>Your read</Text>
                <Text style={[s.readBoxValue, { color: PASSABILITY_OPTIONS.find((o) => o.value === fb.passability_rating)?.tint || theme.text }]}>
                  {fb.passability_label || PASSABILITY_OPTIONS.find((o) => o.value === fb.passability_rating)?.label}
                </Text>
              </View>
            ) : null}

            {/* Reasoning */}
            {rec.reasoning ? (
              <View style={s.reasoningBox}>
                <Text style={s.reasoningText}>{rec.reasoning}</Text>
              </View>
            ) : null}

            {/* Skill tags */}
            {(rec.skills?.length ?? 0) > 0 ? (
              <View style={s.skillRow}>
                {rec.skills!.map((sk) => (
                  <View key={sk} style={s.skillTag}>
                    <Text style={s.skillTagText}>{sk}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={() => { onClose(); onTrack(); }}
            style={({ pressed }) => [s.trackBtn, pressed && { opacity: 0.85 }]}>
            <IconSymbol name="square.and.pencil" size={16} color={theme.bg} />
            <Text style={s.trackBtnText}>Track this chart</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatLine({
  label,
  value,
  highlight,
  amber,
  success,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  amber?: boolean;
  success?: boolean;
  muted?: boolean;
}) {
  const s = useThemedStyles(makeDetailStyles);
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <Text
        style={[
          s.statValue,
          highlight && s.statHighlight,
          amber && s.statAmber,
          success && s.statSuccess,
          muted && s.statMuted,
        ]}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Track sheet
// ---------------------------------------------------------------------------
interface TrackSheetState {
  saving: boolean;
  selectedListId: number | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  note: string;
  showCreate: boolean;
  newListName: string;
  toast: { kind: 'success' | 'error'; text: string } | null;
}

function TrackSheet({
  rec,
  goal,
  visible,
  onClose,
  onFeedbackSaved,
}: {
  rec: GoalRecommendation | null;
  goal: Goal;
  visible: boolean;
  onClose: () => void;
  onFeedbackSaved: (chartId: number, feedback: ChartFeedback) => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useThemedStyles(makeTrackStyles);
  const queryClient = useQueryClient();

  const initial: TrackSheetState = {
    saving: false,
    selectedListId: null,
    rating: rec?.player_feedback?.passability_rating ?? null,
    note: rec?.player_feedback?.note ?? '',
    showCreate: false,
    newListName: '',
    toast: null,
  };
  const [state, setState] = useState<TrackSheetState>(initial);

  // Reset on visible/rec change
  useEffect(() => {
    if (!visible || !rec) return;
    setState({
      saving: false,
      selectedListId: null,
      rating: rec.player_feedback?.passability_rating ?? null,
      note: rec.player_feedback?.note ?? '',
      showCreate: false,
      newListName: '',
      toast: null,
    });
  }, [visible, rec?.chart_id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const listsQuery = useQuery({
    queryKey: LISTS_QUERY_KEY,
    queryFn: () => songsApi.lists(),
    enabled: visible,
  });

  if (!rec) return null;

  const lists = listsQuery.data?.lists ?? [];
  const isAlreadyInList = (list: UserList) => list.items.some((i) => i.chartId === rec.chart_id);
  const single = isSingleMode(rec.mode);
  const jacketSrc = fullImageUrl(rec.jacket_url || rec.background_url);
  const contextLabel = goal === 'pumbility' ? 'Pumbility push' : 'Title push';
  const hasSavedFeedback = (rec.player_feedback?.passability_rating != null) || !!rec.player_feedback?.note;

  const setStateField = <K extends keyof TrackSheetState>(key: K, val: TrackSheetState[K]) =>
    setState((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (state.saving) return;
    setStateField('saving', true);
    try {
      let targetListId = state.selectedListId;

      // 1. Create list inline if requested
      if (state.showCreate && state.newListName.trim()) {
        try {
          const newList = await songsApi.createList(state.newListName.trim());
          targetListId = newList.id;
        } catch {
          setStateField('toast', { kind: 'error', text: 'Failed to create list' });
          setStateField('saving', false);
          return;
        }
      }

      const labels: string[] = [];
      const errors: string[] = [];

      // 2. Add to list (skip if already in it)
      if (targetListId) {
        const list = lists.find((l) => l.id === targetListId);
        if (list && !isAlreadyInList(list)) {
          try {
            await songsApi.addListItem(targetListId, buildListItemPayload(rec));
            labels.push(`Added to "${list.name}"`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to add';
            if (msg.includes('already')) labels.push('Already in list');
            else errors.push(msg);
          }
        } else if (list) {
          labels.push('Already in list');
        }
      }

      // 3. Save feedback if changed
      const orig = rec.player_feedback ?? {};
      const ratingChanged = state.rating !== (orig.passability_rating ?? null);
      const noteChanged = state.note !== (orig.note ?? '');
      let updatedFeedback = orig as ChartFeedback;
      if (ratingChanged || noteChanged) {
        try {
          const res = await songsApi.saveChartFeedback(rec.chart_id, {
            passability_rating: state.rating,
            note: state.note,
          });
          updatedFeedback = res.feedback;
          if (ratingChanged && noteChanged) labels.push('Saved read + note');
          else if (ratingChanged) labels.push('Saved read');
          else labels.push('Saved note');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to save feedback';
          errors.push(msg);
        }
      }

      // 4. Refresh local state
      queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });

      if (errors.length > 0) {
        setStateField('toast', { kind: 'error', text: errors[0] });
        setStateField('saving', false);
        return;
      }

      if (ratingChanged || noteChanged) {
        onFeedbackSaved(rec.chart_id, updatedFeedback);
      }

      if (labels.length > 0) {
        setStateField('toast', { kind: 'success', text: labels.join(' · ') });
        setTimeout(() => onClose(), 700);
      } else {
        onClose();
      }
    } finally {
      setStateField('saving', false);
    }
  };

  const handleClear = async () => {
    if (state.saving) return;
    setStateField('saving', true);
    try {
      const res = await songsApi.saveChartFeedback(rec.chart_id, {
        passability_rating: null,
        note: '',
      });
      onFeedbackSaved(rec.chart_id, res.feedback);
      setStateField('toast', { kind: 'success', text: 'Cleared your read' });
      setTimeout(() => onClose(), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear';
      setStateField('toast', { kind: 'error', text: msg });
    } finally {
      setStateField('saving', false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.sheetWrap}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.handle} />

            {/* Header */}
            <View style={s.header}>
              {jacketSrc ? (
                <Image source={{ uri: jacketSrc }} style={s.headerImg} contentFit="cover" />
              ) : (
                <View style={[s.headerImg, { backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={s.headerFallback}>{(rec.song_title || '?').charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle} numberOfLines={1}>{rec.song_title}</Text>
                <Text style={s.headerMeta}>
                  <Text style={[s.headerLevel, single ? s.headerSingle : s.headerDouble]}>
                    {single ? 'S' : 'D'}{rec.level}
                  </Text>
                  <Text> </Text>
                  <Text style={s.headerCtx}>{contextLabel}</Text>
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}>
                <IconSymbol name="xmark" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Dimensions.get('window').height * 0.55 }}>
              {/* Lists */}
              <Text style={s.sectionLabel}>Add to list</Text>
              {listsQuery.isLoading ? (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.spinner} />
                </View>
              ) : (
                <View style={{ gap: 4 }}>
                  {lists.map((list) => {
                    const already = isAlreadyInList(list);
                    const selected = state.selectedListId === list.id;
                    return (
                      <Pressable
                        key={list.id}
                        onPress={() => {
                          if (already) return;
                          setStateField('selectedListId', selected ? null : list.id);
                        }}
                        disabled={already}
                        style={({ pressed }) => [
                          s.listRow,
                          selected && s.listRowSelected,
                          already && { opacity: 0.5 },
                          pressed && !already && !selected && { opacity: 0.7 },
                        ]}>
                        {already ? (
                          <IconSymbol name="checkmark.circle.fill" size={18} color="#34d399" />
                        ) : selected ? (
                          <View style={s.checkOn}>
                            <IconSymbol name="checkmark" size={12} color={theme.bg} />
                          </View>
                        ) : (
                          <View style={s.checkOff} />
                        )}
                        <Text style={s.listName} numberOfLines={1}>{list.name}</Text>
                        {already ? <Text style={s.listMeta}>Already added</Text> : null}
                      </Pressable>
                    );
                  })}

                  {state.showCreate ? (
                    <View style={s.createBox}>
                      <TextInput
                        style={s.createInput}
                        value={state.newListName}
                        onChangeText={(v) => setStateField('newListName', v)}
                        placeholder="List name"
                        placeholderTextColor={theme.textDim}
                        autoFocus
                        maxLength={60}
                        editable={!state.saving}
                      />
                      <View style={s.createBtnRow}>
                        <Pressable
                          onPress={() => { setStateField('showCreate', false); setStateField('newListName', ''); }}
                          style={({ pressed }) => [s.createSecondary, pressed && { opacity: 0.7 }]}>
                          <Text style={s.createSecondaryText}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setStateField('showCreate', true)}
                      style={({ pressed }) => [s.newListRow, pressed && { opacity: 0.7 }]}>
                      <IconSymbol name="plus" size={16} color={theme.accent} />
                      <Text style={s.newListText}>New list</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Your read */}
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>Your read</Text>
              <Text style={s.sectionHint}>How doable is this for you right now?</Text>
              <View style={s.passRow}>
                {PASSABILITY_OPTIONS.map((opt) => {
                  const active = state.rating === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setStateField('rating', active ? null : opt.value)}
                      style={({ pressed }) => [
                        s.passChip,
                        { borderColor: active ? opt.tint : theme.border, backgroundColor: active ? opt.tint + '22' : 'transparent' },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={[s.passChipNum, { color: opt.tint }]}>{opt.value}</Text>
                      <Text style={[s.passChipLabel, { color: active ? opt.tint : theme.textMuted }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Note */}
              <Text style={[s.sectionLabel, { marginTop: 14 }]}>Private note</Text>
              <TextInput
                style={s.noteInput}
                value={state.note}
                onChangeText={(v) => setStateField('note', v)}
                placeholder="What worked, what didn't, what to try next…"
                placeholderTextColor={theme.textDim}
                multiline
                maxLength={1000}
                editable={!state.saving}
              />
              <Text style={s.noteHint}>Only you can see this.</Text>
            </ScrollView>

            {state.toast ? (
              <View style={[s.toast, state.toast.kind === 'error' ? s.toastError : s.toastOk]}>
                <Text style={[s.toastText, state.toast.kind === 'error' ? s.toastTextErr : s.toastTextOk]}>
                  {state.toast.text}
                </Text>
              </View>
            ) : null}

            {/* Footer */}
            <View style={s.footer}>
              {hasSavedFeedback ? (
                <Pressable
                  onPress={handleClear}
                  disabled={state.saving}
                  style={({ pressed }) => [s.clearBtn, pressed && { opacity: 0.7 }, state.saving && { opacity: 0.5 }]}>
                  <Text style={s.clearText}>Clear</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSave}
                disabled={state.saving}
                style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, state.saving && { opacity: 0.6 }]}>
                {state.saving ? (
                  <ActivityIndicator color={theme.bg} size="small" />
                ) : (
                  <Text style={s.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function WhatToPlayScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { isDesktop, width: winW } = useBreakpoint();
  // Desktop: 3-col grid. Subtract sidebar (max 240) + container padding (~48).
  // Clamp to a sane minimum so very narrow desktop windows still render.
  const desktopCardWidth = isDesktop
    ? Math.max(220, Math.floor((Math.min(winW - 288, 1200) - 24) / 3))
    : undefined;

  const [goal, setGoal] = useState<Goal>('title');
  const [mode, setMode] = useState<ModeChoice>('double');
  const [seed, setSeed] = useState(() => Date.now());
  const [animTrigger, setAnimTrigger] = useState(0);
  const [detailRec, setDetailRec] = useState<GoalRecommendation | null>(null);
  const [trackRec, setTrackRec] = useState<GoalRecommendation | null>(null);
  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const refreshSpin = useRef(new Animated.Value(0)).current;

  const recsQuery = useQuery({
    queryKey: RECS_QUERY_KEY(goal, mode, seed),
    queryFn: () => songsApi.goalRecommendations({ goal, mode, seed, limit: 12 }),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Animate cards in when data arrives or seed changes
  useEffect(() => {
    if (recsQuery.data) setAnimTrigger((k) => k + 1);
  }, [recsQuery.data, seed]);

  const handleGoalChange = (next: Goal) => {
    if (next === goal) return;
    const defaultMode: ModeChoice = next === 'title' ? 'double' : 'both';
    setGoal(next);
    setMode(defaultMode);
    setSeed(Date.now());
  };

  const handleRefresh = () => {
    setSeed(Date.now());
    setRefreshSpinning(true);
    Animated.sequence([
      Animated.timing(refreshSpin, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(refreshSpin, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(() => setRefreshSpinning(false));
  };

  const handleFeedbackSaved = (chartId: number, feedback: ChartFeedback) => {
    queryClient.setQueryData<GoalRecommendationsResponse>(
      RECS_QUERY_KEY(goal, mode, seed),
      (prev) => prev ? {
        ...prev,
        recommendations: (prev.recommendations ?? []).map((r) =>
          r.chart_id === chartId ? { ...r, player_feedback: feedback } : r,
        ),
      } : prev,
    );
  };

  const data = recsQuery.data;
  const recommendations = data?.recommendations ?? [];
  const status = data?.status ?? null;

  const refreshTransform = refreshSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const modeOptions: { value: ModeChoice; label: string }[] = goal === 'title'
    ? [{ value: 'double', label: 'Doubles' }, { value: 'single', label: 'Singles' }]
    : [{ value: 'both', label: 'Both' }, { value: 'single', label: 'Singles' }];

  if (!user) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <TopBar />
        </View>
        <View style={s.centered}>
          <Text style={s.emptyTitle}>Sign in to see recommendations</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TopBar
          rightExtra={
            <Pressable
              onPress={handleRefresh}
              disabled={refreshSpinning || recsQuery.isFetching}
              hitSlop={6}
              style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.7 }]}>
              <Animated.View style={{ transform: [{ rotate: refreshTransform }] }}>
                <IconSymbol name="arrow.up" size={16} color={theme.text} />
              </Animated.View>
            </Pressable>
          }
        />
      </View>

      <View style={isDesktop ? s.deskRow : { flex: 1 }}>
      <ScrollView
        style={isDesktop ? { flex: 1 } : undefined}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={s.subtitle}>Charts picked for your goal. Refresh for new picks.</Text>

        {/* Goal segmented */}
        <View style={s.segmented}>
          {([
            { value: 'title', label: 'Next Skill Title' },
            { value: 'pumbility', label: 'Pumbility' },
          ] as { value: Goal; label: string }[]).map((opt) => {
            const active = goal === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleGoalChange(opt.value)}
                style={({ pressed }) => [
                  s.segment,
                  active && s.segmentActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Mode chips */}
        <View style={s.modeRow}>
          {modeOptions.map((opt) => {
            const active = mode === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setMode(opt.value)}
                style={({ pressed }) => [
                  s.modeChip,
                  active && s.modeChipActive,
                  pressed && !active && { opacity: 0.7 },
                ]}>
                <Text style={[s.modeChipText, active && s.modeChipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
          {recsQuery.isFetching ? (
            <ActivityIndicator color={theme.spinner} size="small" style={{ marginLeft: 8 }} />
          ) : null}
        </View>

        {/* Status / summary — on desktop, the summary lives in the right
            rail so the center column is mostly the pick grid. */}
        {status === 'needs_import' || status === 'all_completed' ? (
          <StatusCard
            status={status}
            goal={goal}
            onSwitchGoal={status === 'all_completed' ? () => handleGoalChange(goal === 'title' ? 'pumbility' : 'title') : undefined}
          />
        ) : !isDesktop ? (
          goal === 'title'
            ? <TitleSummary summary={data?.summary as TitleGoalSummary | null} />
            : <PumbilitySummary summary={data?.summary as PumbilityGoalSummary | null} />
        ) : null}

        {/* Loading */}
        {recsQuery.isLoading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={theme.spinner} />
            <Text style={s.loadingText}>Curating picks…</Text>
          </View>
        ) : null}

        {/* Recommendations grid */}
        {recommendations.length > 0 ? (
          <View style={s.grid}>
            {recommendations.map((rec, i) => (
              <RecommendationCard
                key={rec.chart_id || `${rec.song_title}-${rec.mode}-${rec.level}`}
                rec={rec}
                goal={goal}
                index={i}
                animTrigger={animTrigger}
                onPress={() => setDetailRec(rec)}
                onTrack={() => setTrackRec(rec)}
                cardWidth={desktopCardWidth}
              />
            ))}
          </View>
        ) : null}

        {/* Empty after success */}
        {!recsQuery.isLoading && status === 'ok' && recommendations.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No picks for this combo</Text>
            <Text style={s.emptyBody}>Try a different mode, or refresh to reroll the seed.</Text>
            <Pressable onPress={handleRefresh} style={({ pressed }) => [s.refreshCta, pressed && { opacity: 0.85 }]}>
              <Text style={s.refreshCtaText}>Refresh</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {isDesktop ? (
        <View style={s.deskGoalRail}>
          {status === 'needs_import' || status === 'all_completed' ? (
            <Text style={s.deskGoalRailEmpty}>
              {status === 'all_completed' ? 'All picks cleared — swap the goal for a fresh set.' : 'Sync your scores to get personalized picks.'}
            </Text>
          ) : goal === 'title' ? (
            <TitleSummary summary={data?.summary as TitleGoalSummary | null} />
          ) : (
            <PumbilitySummary summary={data?.summary as PumbilityGoalSummary | null} />
          )}
        </View>
      ) : null}
      </View>

      <DetailModal
        rec={detailRec}
        goal={goal}
        visible={!!detailRec}
        onClose={() => setDetailRec(null)}
        onTrack={() => detailRec && setTrackRec(detailRec)}
      />
      <TrackSheet
        rec={trackRec}
        goal={goal}
        visible={!!trackRec}
        onClose={() => setTrackRec(null)}
        onFeedbackSaved={handleFeedbackSaved}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 1 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surfaceMuted,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: 32 },
  scroll: { paddingHorizontal: 12, gap: 12 },
  subtitle: { fontSize: 12, color: t.textDim, marginBottom: 4 },

  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 3,
    gap: 2,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' as const },
  segmentActive: { backgroundColor: t.accent },
  segmentText: { fontSize: 12, fontWeight: '800' as const, color: t.textMuted, letterSpacing: 0.4 },
  segmentTextActive: { color: t.bg },

  modeRow: { flexDirection: 'row' as const, gap: 6, alignItems: 'center' as const },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  modeChipActive: { backgroundColor: t.accentTint, borderColor: t.accent },
  modeChipText: { fontSize: 12, fontWeight: '700' as const, color: t.textMuted },
  modeChipTextActive: { color: t.accent },

  loadingCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 16,
    justifyContent: 'center' as const,
    backgroundColor: t.card,
    borderRadius: 12,
  },
  loadingText: { color: t.textMuted, fontSize: 13 },

  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },

  emptyCard: {
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center' as const,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.borderStrong,
  },
  emptyTitle: { fontSize: 15, fontWeight: '900' as const, color: t.text },
  emptyBody: { fontSize: 12, color: t.textMuted, textAlign: 'center' as const },
  refreshCta: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  refreshCtaText: { color: t.bg, fontSize: 13, fontWeight: '900' as const },

  // Desktop: center column + sticky right rail with the goal summary.
  deskRow: { flex: 1, flexDirection: 'row' as const, alignItems: 'stretch' as const },
  deskGoalRail: {
    width: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: t.border,
    backgroundColor: t.surface,
    padding: 16,
    gap: 12,
  },
  deskGoalRailEmpty: {
    fontSize: 13,
    color: t.textMuted,
    lineHeight: 18,
  },
});

const makeSummaryStyles = (t: ThemeColors) => ({
  box: {
    backgroundColor: t.card,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  fromLabel: { flex: 1, fontSize: 12, fontWeight: '800' as const, color: t.textMuted },
  toLabel: { flex: 1, fontSize: 12, fontWeight: '800' as const, color: t.accent, textAlign: 'right' as const },
  bar: { height: 5, borderRadius: 3, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  barFill: { height: '100%' as const, borderRadius: 3 },
  bigRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 6 },
  bigNum: { fontSize: 22, fontWeight: '900' as const, color: t.text, letterSpacing: 0.5 },
  bigCaption: { fontSize: 11, color: t.textDim },
  foot: { fontSize: 11, color: t.textDim },
  frontierRow: { flexDirection: 'row' as const },
  frontierBadge: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: t.accent,
    backgroundColor: t.accentTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
});

const makeStatusStyles = (t: ThemeColors) => ({
  box: {
    flexDirection: 'row' as const,
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: { fontSize: 14, fontWeight: '900' as const },
  body: { fontSize: 12, color: t.textMuted, marginTop: 4 },
  cta: {
    marginTop: 10,
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.accent,
  },
  ctaText: { color: t.bg, fontSize: 12, fontWeight: '900' as const },
});

const makeCardStyles = (t: ThemeColors) => ({
  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    width: (Dimensions.get('window').width - 12 * 2 - 8) / 2,
  },
  jacketWrap: { width: '100%' as const, aspectRatio: 16 / 10, backgroundColor: t.surfaceMuted },
  jacket: { width: '100%' as const, height: '100%' as const },
  jacketFallback: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
  jacketFallbackText: { fontSize: 32, fontWeight: '900' as const, color: t.textDim },
  levelBadge: {
    position: 'absolute' as const,
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 28,
    alignItems: 'center' as const,
  },
  levelBadgeSingle: { backgroundColor: 'rgba(217,61,98,0.85)' },
  levelBadgeDouble: { backgroundColor: 'rgba(22,183,127,0.85)' },
  levelBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.3 },
  gainPill: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.4)',
  },
  gainPillText: { color: '#34d399', fontSize: 10, fontWeight: '900' as const },
  bookmark: {
    position: 'absolute' as const,
    bottom: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  titleOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 8,
  },
  titleText: { fontSize: 11, fontWeight: '900' as const, color: '#fff' },
  artistText: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  body: { padding: 8, gap: 5 },
  reasonChip: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  reasonChipText: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 0.2 },
  scoreState: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const },
  scoreCurr: { color: t.text },
  scoreNeeded: { color: t.textMuted },
  failText: { color: '#fbbf24' },
  unplayedText: { color: t.textDim, fontStyle: 'italic' as const },

  indicatorRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, flexWrap: 'wrap' as const, marginTop: 2 },
  tierChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  tierChipText: { fontSize: 8, color: t.textMuted, fontWeight: '800' as const, letterSpacing: 0.2 },
  readChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  readChipText: { fontSize: 8, fontWeight: '900' as const, letterSpacing: 0.2 },
});

const makeDetailStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: t.border,
    maxHeight: '88%' as const,
  },
  hero: { aspectRatio: 16 / 9, width: '100%' as const, position: 'relative' as const, overflow: 'hidden' as const, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  heroImage: { width: '100%' as const, height: '100%' as const },
  heroFallback: { fontSize: 64, fontWeight: '900' as const, color: t.textDim },
  heroLevelBadge: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  singleBg: { backgroundColor: 'rgba(217,61,98,0.9)' },
  doubleBg: { backgroundColor: 'rgba(22,183,127,0.9)' },
  heroLevelText: { color: '#fff', fontSize: 12, fontWeight: '900' as const },
  heroClose: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  heroFooter: { position: 'absolute' as const, bottom: 12, left: 14, right: 14 },
  heroTitle: { fontSize: 16, fontWeight: '900' as const, color: '#fff', letterSpacing: 0.3 },
  heroArtist: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body: { padding: 16, gap: 12 },

  chipRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const },
  detailChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  detailChipText: { fontSize: 11, fontWeight: '900' as const, letterSpacing: 0.2 },
  detailTier: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  detailTierText: { fontSize: 11, color: t.textMuted, fontWeight: '800' as const },

  statsList: { gap: 4, backgroundColor: t.card, borderRadius: 10, padding: 12 },
  statRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 4 },
  statLabel: { fontSize: 12, color: t.textMuted },
  statValue: { fontSize: 13, fontWeight: '900' as const, color: t.text, fontVariant: ['tabular-nums' as const] },
  statHighlight: { color: t.accent },
  statAmber: { color: '#fbbf24' },
  statSuccess: { color: '#34d399' },
  statMuted: { color: t.textDim, fontWeight: '600' as const },

  readBox: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  readBoxValue: { fontSize: 12, fontWeight: '900' as const },

  reasoningBox: { backgroundColor: t.surfaceMuted, borderRadius: 10, padding: 12 },
  reasoningText: { fontSize: 12, color: t.text, lineHeight: 18 },

  skillRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  skillTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: t.surfaceMuted },
  skillTagText: { fontSize: 10, color: t.textMuted, fontWeight: '700' as const },

  trackBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    margin: 14,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: t.accent,
  },
  trackBtnText: { color: t.bg, fontSize: 14, fontWeight: '900' as const, letterSpacing: 0.4 },
});

const makeTrackStyles = (t: ThemeColors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' as const },
  sheetWrap: { width: '100%' as const },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 4,
    maxHeight: '90%' as const,
  },
  handle: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 4 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  headerImg: { width: 50, height: 50, borderRadius: 8 },
  headerFallback: { color: t.textDim, fontSize: 18, fontWeight: '900' as const },
  headerTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  headerMeta: { fontSize: 10, color: t.textDim, marginTop: 2 },
  headerLevel: { fontSize: 10, fontWeight: '900' as const },
  headerSingle: { color: '#fb7185' },
  headerDouble: { color: '#34d399' },
  headerCtx: { color: t.textDim, fontSize: 10 },
  closeBtn: { padding: 6 },

  sectionLabel: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.4, color: t.textDim, textTransform: 'uppercase' as const, marginTop: 12 },
  sectionHint: { fontSize: 10, color: t.textDim, marginBottom: 6 },

  listRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  listRowSelected: { backgroundColor: t.accentTint, borderColor: t.accent },
  checkOn: { width: 18, height: 18, borderRadius: 9, backgroundColor: t.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
  checkOff: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: t.border },
  listName: { flex: 1, fontSize: 13, fontWeight: '700' as const, color: t.text },
  listMeta: { fontSize: 10, color: t.textDim },

  newListRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.border,
    borderStyle: 'dashed' as const,
    marginTop: 4,
  },
  newListText: { fontSize: 13, fontWeight: '800' as const, color: t.accent },

  createBox: { backgroundColor: t.card, borderRadius: 10, padding: 10, gap: 8, marginTop: 4 },
  createInput: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  createBtnRow: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: 8 },
  createSecondary: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  createSecondaryText: { fontSize: 12, color: t.textMuted, fontWeight: '700' as const },

  passRow: { flexDirection: 'row' as const, gap: 5 },
  passChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.2,
    alignItems: 'center' as const,
    gap: 1,
  },
  passChipNum: { fontSize: 14, fontWeight: '900' as const },
  passChipLabel: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.2 },

  noteInput: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top' as const,
  },
  noteHint: { fontSize: 9, color: t.textDim, marginTop: 4 },

  toast: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  toastOk: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.4)' },
  toastError: { backgroundColor: t.dangerBg, borderColor: t.dangerBorder },
  toastText: { fontSize: 12, fontWeight: '700' as const },
  toastTextOk: { color: '#34d399' },
  toastTextErr: { color: t.danger },

  footer: {
    flexDirection: 'row' as const,
    gap: 8,
    paddingTop: 12,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
    marginTop: 8,
  },
  clearBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: t.border },
  clearText: { fontSize: 13, color: t.textMuted, fontWeight: '700' as const },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: t.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveText: { fontSize: 14, fontWeight: '900' as const, color: t.bg, letterSpacing: 0.4 },
});
