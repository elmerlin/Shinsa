import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/top-bar';
import { MovementCameraView } from '@/components/movement/MovementCameraView';
import { MovementTimelineChart, MovementTimelineSelection } from '@/components/movement/MovementTimelineChart';
import { PadCalibrationOverlay } from '@/components/movement/PadCalibrationOverlay';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { mapPointToPanel, summarizeMovementSession } from '@/lib/movement/analytics';
import { buildMockMovementSession } from '@/lib/movement/mockMovementAnalyzer';
import {
  buildDemoFallbackMovementSession,
  buildMovementSessionFromFrames,
  getNativeMovementAnalyzerAvailability,
} from '@/lib/movement/nativeMovementAnalyzer';
import { createDefaultPadCalibration } from '@/lib/movement/padLayout';
import {
  loadRecentMovementSessions,
  saveMovementSession,
  savePadCalibration,
} from '@/lib/movement/storage';
import type { PoseAnalyzerStatus } from '@/lib/movement/nativeMovementAnalyzer';
import type {
  FootLandmarkFrame,
  MovementSession,
  MovementSummary,
  PadCalibration,
  PumpMode,
  ReactionSample,
} from '@/lib/movement/types';
import type { ThemeColors } from '@/constants/theme';

type Phase = 'landing' | 'permission' | 'calibration' | 'live' | 'results' | 'recent';

const MODE_LABEL: Record<PumpMode, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
};

export default function MovementLabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const [phase, setPhase] = useState<Phase>('landing');
  const [mode, setMode] = useState<PumpMode>('singles');
  const [confirmedZoneIds, setConfirmedZoneIds] = useState<string[]>([]);
  const [activeZoneIndex, setActiveZoneIndex] = useState(0);
  const [session, setSession] = useState<MovementSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<MovementSession[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [cameraGranted, setCameraGranted] = useState(false);
  const liveFramesRef = useRef<FootLandmarkFrame[]>([]);
  const liveStartedAtRef = useRef<string | null>(null);
  const lastLiveUiUpdateRef = useRef(0);
  const [liveFrameCount, setLiveFrameCount] = useState(0);
  const [latestFootFrame, setLatestFootFrame] = useState<FootLandmarkFrame | null>(null);
  const [poseStatus, setPoseStatus] = useState<PoseAnalyzerStatus>({
    state: 'disabled',
    label: 'Pose disabled',
    confidence: 0,
    frameCount: 0,
  });

  const calibration = useMemo(
    () => session?.calibration ?? createDefaultPadCalibration(mode),
    [mode, session],
  );
  const activeZone = calibration.zones[activeZoneIndex % Math.max(1, calibration.zones.length)];
  const availability = useMemo(() => getNativeMovementAnalyzerAvailability(), []);
  const summary: MovementSummary = useMemo(
    () => session ? summarizeMovementSession(session) : buildMockMovementSession(mode).summary,
    [mode, session],
  );
  const selectedSample = useMemo(
    () => session?.samples.find((sample) => sample.cueId === selectedCueId) ?? null,
    [selectedCueId, session],
  );

  useEffect(() => {
    loadRecentMovementSessions().then(setRecentSessions).catch(() => setRecentSessions([]));
  }, []);

  useEffect(() => {
    if (phase !== 'calibration') return;
    const id = setInterval(() => {
      setActiveZoneIndex((current) => (current + 1) % Math.max(1, calibration.zones.length));
    }, 900);
    return () => clearInterval(id);
  }, [calibration.zones.length, phase]);

  const resetLiveCapture = useCallback(() => {
    liveFramesRef.current = [];
    liveStartedAtRef.current = null;
    lastLiveUiUpdateRef.current = 0;
    setLiveFrameCount(0);
    setLatestFootFrame(null);
    setPoseStatus({
      state: 'disabled',
      label: 'Pose disabled',
      confidence: 0,
      frameCount: 0,
    });
  }, []);

  const startMode = (nextMode: PumpMode) => {
    setMode(nextMode);
    setConfirmedZoneIds([]);
    setSession(null);
    setSelectedCueId(null);
    resetLiveCapture();
    setPhase('permission');
  };

  const startLiveRun = () => {
    liveFramesRef.current = [];
    liveStartedAtRef.current = new Date().toISOString();
    lastLiveUiUpdateRef.current = 0;
    setLiveFrameCount(0);
    setLatestFootFrame(null);
    setPhase('live');
  };

  const handleLandmarkFrame = useCallback((frame: FootLandmarkFrame) => {
    liveFramesRef.current = [...liveFramesRef.current, frame].slice(-1_200);
    if (frame.timestampMs - lastLiveUiUpdateRef.current > 250) {
      lastLiveUiUpdateRef.current = frame.timestampMs;
      setLatestFootFrame(frame);
      setLiveFrameCount(liveFramesRef.current.length);
    }
  }, []);

  const finishRun = async () => {
    const frames = liveFramesRef.current;
    const endedAt = new Date().toISOString();
    const nextSession = frames.length > 0
      ? buildMovementSessionFromFrames({
        mode,
        calibration,
        frames,
        startedAt: liveStartedAtRef.current ?? endedAt,
        endedAt,
      })
      : buildDemoFallbackMovementSession(mode);
    setSession(nextSession);
    setSelectedCueId(nextSession.samples[0]?.cueId ?? null);
    if (nextSession.calibration) await savePadCalibration(nextSession.calibration);
    await saveMovementSession(nextSession);
    setRecentSessions(await loadRecentMovementSessions());
    setPhase('results');
  };

  if (Platform.OS === 'web') {
    return (
      <ScreenShell insetsTop={insets.top} s={s}>
        <View style={s.nativeOnlyPanel}>
          <Text style={s.eyebrow}>NATIVE ONLY</Text>
          <Text style={s.heroTitle}>Movement Lab needs your phone camera</Text>
          <Text style={s.heroBody}>
            Live foot tracking runs on iOS or Android using native camera hardware. Web stays out of the way.
          </Text>
          <Pressable
            onPress={() => router.push('/training' as never)}
            style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}>
            <Text style={s.secondaryButtonText}>Back to Training</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell insetsTop={insets.top} s={s}>
      {phase === 'landing' ? (
        <LandingView
          s={s}
          summary={summary}
          recentCount={recentSessions.length}
          onStartSingles={() => startMode('singles')}
          onStartDoubles={() => startMode('doubles')}
          onViewRecent={() => setPhase('recent')}
        />
      ) : null}

      {phase === 'permission' ? (
        <PermissionView
          s={s}
          mode={mode}
          onBack={() => setPhase('landing')}
          onContinue={() => setPhase('calibration')}
        />
      ) : null}

      {phase === 'calibration' ? (
        <CalibrationView
          s={s}
          mode={mode}
          cameraGranted={cameraGranted}
          calibration={calibration}
          activeZoneId={activeZone?.id}
          confirmedZoneIds={confirmedZoneIds}
          onPermissionChange={setCameraGranted}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setConfirmedZoneIds([]);
          }}
          onConfirmZone={(zoneId) => {
            setConfirmedZoneIds((current) => current.includes(zoneId) ? current : [...current, zoneId]);
          }}
          onBack={() => setPhase('permission')}
          onStartRun={startLiveRun}
        />
      ) : null}

      {phase === 'live' ? (
        <LiveView
          s={s}
          mode={mode}
          calibration={calibration}
          latestFrame={latestFootFrame}
          frameCount={liveFrameCount}
          poseStatus={poseStatus}
          availabilityReason={availability.reason}
          onLandmarkFrame={handleLandmarkFrame}
          onPoseStatusChange={setPoseStatus}
          onFinish={finishRun}
          onBack={() => setPhase('calibration')}
        />
      ) : null}

      {phase === 'results' && session ? (
        <ResultsView
          s={s}
          session={session}
          summary={summarizeMovementSession(session)}
          selectedCueId={selectedCueId}
          selectedSample={selectedSample}
          onSelectSample={(sample) => setSelectedCueId(sample.cueId)}
          onClearSelection={() => setSelectedCueId(null)}
          onRunAgain={() => startMode(mode)}
          onRecent={() => setPhase('recent')}
        />
      ) : null}

      {phase === 'recent' ? (
        <RecentView
          s={s}
          sessions={recentSessions}
          onBack={() => setPhase(session ? 'results' : 'landing')}
          onOpen={(nextSession) => {
            setSession(nextSession);
            setMode(nextSession.mode);
            setSelectedCueId(nextSession.samples[0]?.cueId ?? null);
            setPhase('results');
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function ScreenShell({
  children,
  insetsTop,
  s,
}: {
  children: React.ReactNode;
  insetsTop: number;
  s: Styles;
}) {
  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insetsTop + 8 }]}>
        <TopBar />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}

function LandingView({
  s,
  summary,
  recentCount,
  onStartSingles,
  onStartDoubles,
  onViewRecent,
}: {
  s: Styles;
  summary: MovementSummary;
  recentCount: number;
  onStartSingles: () => void;
  onStartDoubles: () => void;
  onViewRecent: () => void;
}) {
  return (
    <>
      <View style={s.hero}>
        <View style={s.badge}><Text style={s.badgeText}>NATIVE LIVE ANALYSIS</Text></View>
        <Text style={s.heroTitle}>Movement Lab</Text>
        <Text style={s.heroBody}>
          Track foot movement against Pump It Up step timing, then review speed, reaction consistency, and confidence.
        </Text>
      </View>
      <View style={s.actionRow}>
        <PrimaryButton label="Start Singles session" onPress={onStartSingles} s={s} />
        <PrimaryButton label="Start Doubles session" onPress={onStartDoubles} s={s} variant="secondary" />
      </View>
      <Pressable onPress={onViewRecent} style={({ pressed }) => [s.recentCard, pressed && s.pressed]}>
        <View>
          <Text style={s.eyebrow}>LOCAL SESSIONS</Text>
          <Text style={s.cardTitle}>{recentCount ? `${recentCount} saved on this device` : 'No saved sessions yet'}</Text>
          <Text style={s.muted}>Derived movement events only. No video is uploaded or stored.</Text>
        </View>
        <Text style={s.cardCta}>View</Text>
      </Pressable>
      <SummaryGrid summary={summary} s={s} demo />
    </>
  );
}

function PermissionView({
  s,
  mode,
  onBack,
  onContinue,
}: {
  s: Styles;
  mode: PumpMode;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <View style={s.panel}>
      <Text style={s.eyebrow}>CAMERA PERMISSION</Text>
      <Text style={s.sectionHeadline}>{MODE_LABEL[mode]} camera setup</Text>
      <Text style={s.bodyText}>
        Processing runs on-device through the native camera and pose bridge. If no pose frames are received on this device, the result is labelled as demo fallback data.
      </Text>
      <View style={s.buttonRow}>
        <PrimaryButton label="Continue to camera" onPress={onContinue} s={s} />
        <PrimaryButton label="Back" onPress={onBack} s={s} variant="ghost" />
      </View>
    </View>
  );
}

function CalibrationView({
  s,
  mode,
  cameraGranted,
  calibration,
  activeZoneId,
  confirmedZoneIds,
  onPermissionChange,
  onModeChange,
  onConfirmZone,
  onBack,
  onStartRun,
}: {
  s: Styles;
  mode: PumpMode;
  cameraGranted: boolean;
  calibration: ReturnType<typeof createDefaultPadCalibration>;
  activeZoneId?: string;
  confirmedZoneIds: string[];
  onPermissionChange: (granted: boolean) => void;
  onModeChange: (mode: PumpMode) => void;
  onConfirmZone: (zoneId: string) => void;
  onBack: () => void;
  onStartRun: () => void;
}) {
  return (
    <>
      <View style={s.phaseHeader}>
        <View>
          <Text style={s.eyebrow}>CALIBRATION</Text>
          <Text style={s.sectionHeadline}>Frame the lower body and pad</Text>
        </View>
        <Text style={[s.confidencePill, cameraGranted ? s.goodPill : s.warnPill]}>
          {cameraGranted ? 'Camera ready' : 'Permission pending'}
        </Text>
      </View>
      <ModeSwitch mode={mode} onChange={onModeChange} s={s} />
      <MovementCameraView isActive onPermissionChange={onPermissionChange}>
        <PadCalibrationOverlay
          calibration={calibration}
          activeZoneId={activeZoneId}
          confirmedZoneIds={confirmedZoneIds}
          onConfirmZone={onConfirmZone}
        />
      </MovementCameraView>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Test movement</Text>
        <Text style={s.bodyText}>
          Step lightly on each panel. The highlighted zone shows the inferred target from the calibrated pad map.
        </Text>
        <Text style={s.muted}>
          Confirmed zones: {confirmedZoneIds.length}/{calibration.zones.length}
        </Text>
        <View style={s.buttonRow}>
          <PrimaryButton label="Start run" onPress={onStartRun} s={s} />
          <PrimaryButton label="Back" onPress={onBack} s={s} variant="ghost" />
        </View>
      </View>
    </>
  );
}

function LiveView({
  s,
  mode,
  calibration,
  latestFrame,
  frameCount,
  poseStatus,
  availabilityReason,
  onLandmarkFrame,
  onPoseStatusChange,
  onFinish,
  onBack,
}: {
  s: Styles;
  mode: PumpMode;
  calibration: ReturnType<typeof createDefaultPadCalibration>;
  latestFrame: FootLandmarkFrame | null;
  frameCount: number;
  poseStatus: PoseAnalyzerStatus;
  availabilityReason: string;
  onLandmarkFrame: (frame: FootLandmarkFrame) => void;
  onPoseStatusChange: (status: PoseAnalyzerStatus) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const currentPanel = useMemo(
    () => formatLatestPanel(latestFrame, calibration) ?? 'none',
    [calibration, latestFrame],
  );
  const poseActive = poseStatus.state === 'tracking';
  const poseWarn = poseStatus.state === 'error' || poseStatus.state === 'waiting';

  return (
    <>
      <View style={s.phaseHeader}>
        <View>
          <Text style={s.eyebrow}>LIVE SESSION</Text>
          <Text style={s.sectionHeadline}>{MODE_LABEL[mode]} movement stream</Text>
        </View>
        <Text style={[s.confidencePill, poseActive ? s.goodPill : poseWarn ? s.warnPill : s.neutralPill]}>
          {poseStatus.label}
        </Text>
      </View>
      <MovementCameraView
        isActive
        enablePoseInference
        onLandmarkFrame={onLandmarkFrame}
        onPoseStatusChange={onPoseStatusChange}>
        <PadCalibrationOverlay calibration={calibration} activeZoneId={currentPanel} />
        <View style={s.liveHud}>
          <MetricTile label="Mode" value={MODE_LABEL[mode]} s={s} compact />
          <MetricTile label="Confidence" value={poseStatus.confidence > 0 ? `${Math.round(poseStatus.confidence * 100)}%` : 'Seeking'} s={s} compact />
          <MetricTile label="Frames" value={`${frameCount}`} s={s} compact />
          <MetricTile label="Current panel" value={currentPanel} s={s} compact />
        </View>
      </MovementCameraView>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Analyzer status</Text>
        <Text style={s.bodyText}>{availabilityReason}</Text>
        <Text style={s.bodyText}>{poseStatus.message ?? 'Live landmarks are converted to derived movement events on this device. No video is stored or uploaded.'}</Text>
        <Text style={s.muted}>
          {frameCount > 0
            ? 'Finishing this run uses captured pose landmarks and the sample step timeline until chart timing import is connected.'
            : 'No pose frames captured yet. Finishing now will save clearly labelled demo fallback data.'}
        </Text>
        <View style={s.buttonRow}>
          <PrimaryButton label="Finish analysis" onPress={onFinish} s={s} />
          <PrimaryButton label="Recalibrate" onPress={onBack} s={s} variant="ghost" />
        </View>
      </View>
    </>
  );
}

function ResultsView({
  s,
  session,
  summary,
  selectedCueId,
  selectedSample,
  onSelectSample,
  onClearSelection,
  onRunAgain,
  onRecent,
}: {
  s: Styles;
  session: MovementSession;
  summary: MovementSummary;
  selectedCueId: string | null;
  selectedSample: ReactionSample | null;
  onSelectSample: (sample: ReactionSample) => void;
  onClearSelection: () => void;
  onRunAgain: () => void;
  onRecent: () => void;
}) {
  return (
    <>
      <View style={s.phaseHeader}>
        <View>
          <Text style={s.eyebrow}>MOVEMENT RESULT</Text>
          <Text style={s.sectionHeadline}>{session.songTitle ?? 'Movement session'}</Text>
          {session.isDemo ? <Text style={s.demoText}>Demo data. Not a production camera result.</Text> : null}
        </View>
        <Text style={[s.confidencePill, summary.detectionConfidence >= 0.7 ? s.goodPill : s.warnPill]}>
          {Math.round(summary.detectionConfidence * 100)}%
        </Text>
      </View>
      <SummaryGrid summary={summary} s={s} />
      <MovementTimelineChart
        samples={session.samples}
        selectedCueId={selectedCueId}
        onSelectSample={onSelectSample}
      />
      <MovementTimelineSelection sample={selectedSample} onClear={onClearSelection} />
      <View style={s.panel}>
        <Text style={s.cardTitle}>What this means</Text>
        <Text style={s.bodyText}>
          The center line is your mean reaction time. Higher dots are slower than your mean; lower dots are faster. Confidence reflects tracking, panel mapping, and timing quality.
        </Text>
        <Text style={s.muted}>
          Speed is normalized pad-space velocity until a physical distance calibration is added.
        </Text>
        <View style={s.buttonRow}>
          <PrimaryButton label="Run again" onPress={onRunAgain} s={s} />
          <PrimaryButton label="Recent" onPress={onRecent} s={s} variant="ghost" />
        </View>
      </View>
    </>
  );
}

function RecentView({
  s,
  sessions,
  onBack,
  onOpen,
}: {
  s: Styles;
  sessions: MovementSession[];
  onBack: () => void;
  onOpen: (session: MovementSession) => void;
}) {
  return (
    <>
      <View style={s.phaseHeader}>
        <View>
          <Text style={s.eyebrow}>RECENT LOCAL SESSIONS</Text>
          <Text style={s.sectionHeadline}>Saved on this device</Text>
        </View>
        <PrimaryButton label="Back" onPress={onBack} s={s} variant="ghost" />
      </View>
      {sessions.length === 0 ? (
        <View style={s.panel}>
          <Text style={s.cardTitle}>No local movement sessions</Text>
          <Text style={s.bodyText}>Run a Movement Lab session to save derived movement events and summaries here.</Text>
        </View>
      ) : sessions.map((item) => {
        const summary = summarizeMovementSession(item);
        return (
          <Pressable key={item.id} onPress={() => onOpen(item)} style={({ pressed }) => [s.recentCard, pressed && s.pressed]}>
            <View style={s.recentMain}>
              <Text style={s.cardTitle}>{item.songTitle ?? MODE_LABEL[item.mode]}</Text>
              <Text style={s.muted}>{new Date(item.startedAt).toLocaleString()}</Text>
            </View>
            <Text style={s.cardCta}>{formatMs(summary.meanReactionMs)}</Text>
          </Pressable>
        );
      })}
    </>
  );
}

function ModeSwitch({
  mode,
  onChange,
  s,
}: {
  mode: PumpMode;
  onChange: (mode: PumpMode) => void;
  s: Styles;
}) {
  return (
    <View style={s.modeSwitch}>
      {(['singles', 'doubles'] as PumpMode[]).map((item) => {
        const active = item === mode;
        return (
          <Pressable key={item} onPress={() => onChange(item)} style={({ pressed }) => [s.modeButton, active && s.modeButtonActive, pressed && s.pressed]}>
            <Text style={[s.modeButtonText, active && s.modeButtonTextActive]}>{MODE_LABEL[item]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SummaryGrid({ summary, s, demo }: { summary: MovementSummary; s: Styles; demo?: boolean }) {
  return (
    <View style={s.summaryGrid}>
      <MetricTile label="Mean" value={formatMs(summary.meanReactionMs)} s={s} />
      <MetricTile label="Median" value={formatMs(summary.medianReactionMs)} s={s} />
      <MetricTile label="Std dev" value={formatMs(summary.standardDeviationMs)} s={s} />
      <MetricTile label="Fastest" value={formatMs(summary.fastestReactionMs)} s={s} />
      <MetricTile label="Slowest" value={formatMs(summary.slowestReactionMs)} s={s} />
      <MetricTile label="Avg speed" value={formatSpeed(summary.averageFootSpeed)} s={s} />
      <MetricTile label="Peak speed" value={formatSpeed(summary.peakFootSpeed)} s={s} />
      <MetricTile label={demo ? 'Demo confidence' : 'Confidence'} value={`${Math.round(summary.detectionConfidence * 100)}%`} s={s} />
    </View>
  );
}

function MetricTile({
  label,
  value,
  s,
  compact,
}: {
  label: string;
  value: string;
  s: Styles;
  compact?: boolean;
}) {
  return (
    <View style={[s.metricTile, compact && s.metricTileCompact]}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue} numberOfLines={compact ? 1 : 2}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  s,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  s: Styles;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const buttonStyle = variant === 'primary' ? s.primaryButton : variant === 'secondary' ? s.secondaryButton : s.ghostButton;
  const textStyle = variant === 'primary' ? s.primaryButtonText : variant === 'secondary' ? s.secondaryButtonText : s.ghostButtonText;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [buttonStyle, pressed && s.pressed]}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

function formatMs(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} ms` : 'No data';
}

function formatSpeed(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} u/s` : 'No data';
}

function formatLatestPanel(frame: FootLandmarkFrame | null, calibration: PadCalibration): string | null {
  const point = frame?.left?.footIndex?.point
    ?? frame?.right?.footIndex?.point
    ?? frame?.left?.heel?.point
    ?? frame?.right?.heel?.point
    ?? frame?.left?.ankle?.point
    ?? frame?.right?.ankle?.point;
  if (!point) return null;
  return mapPointToPanel(point, calibration, { includeNearest: true })?.zoneId ?? null;
}

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

const makeStyles = (t: ThemeColors) => ({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  topBar: {
    paddingHorizontal: 16,
    backgroundColor: t.bg,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 14,
  },
  hero: {
    paddingTop: 8,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start' as const,
    borderColor: t.accent,
    backgroundColor: t.accentTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    color: t.accent,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: t.text,
    fontSize: 32,
    fontWeight: '900' as const,
    letterSpacing: 0,
  },
  heroBody: {
    color: t.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  nativeOnlyPanel: {
    minHeight: 420,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
    gap: 12,
  },
  phaseHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  eyebrow: {
    color: t.textDim,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
  },
  sectionHeadline: {
    color: t.text,
    fontSize: 24,
    fontWeight: '900' as const,
    marginTop: 3,
    letterSpacing: 0,
  },
  panel: {
    backgroundColor: t.card,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 9,
  },
  cardTitle: {
    color: t.text,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  bodyText: {
    color: t.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  muted: {
    color: t.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  demoText: {
    color: t.textDim,
    fontSize: 12,
    marginTop: 3,
  },
  actionRow: {
    gap: 10,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.accent,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.card,
    borderColor: t.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ghostButton: {
    minHeight: 46,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: t.textOnAccent,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  secondaryButtonText: {
    color: t.text,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  ghostButtonText: {
    color: t.textMuted,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  pressed: {
    opacity: 0.82,
  },
  recentCard: {
    minHeight: 86,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    backgroundColor: t.card,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
  },
  recentMain: {
    flex: 1,
    minWidth: 0,
  },
  cardCta: {
    color: t.accent,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  summaryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: '47%' as const,
    minHeight: 76,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 8,
    padding: 11,
    justifyContent: 'space-between' as const,
  },
  metricTileCompact: {
    flexBasis: '30%' as const,
    minHeight: 58,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metricLabel: {
    color: t.textDim,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  metricValue: {
    color: t.text,
    fontSize: 18,
    fontWeight: '900' as const,
    fontVariant: ['tabular-nums' as const],
  },
  confidencePill: {
    overflow: 'hidden' as const,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 0.6,
  },
  goodPill: {
    color: '#4ade80',
    backgroundColor: 'rgba(74,222,128,0.13)',
  },
  warnPill: {
    color: '#facc15',
    backgroundColor: 'rgba(250,204,21,0.13)',
  },
  neutralPill: {
    color: t.textMuted,
    backgroundColor: t.surfaceMuted,
  },
  modeSwitch: {
    flexDirection: 'row' as const,
    backgroundColor: t.surfaceMuted,
    borderRadius: 8,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modeButtonActive: {
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.accent,
  },
  modeButtonText: {
    color: t.textMuted,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  modeButtonTextActive: {
    color: t.accent,
  },
  liveHud: {
    position: 'absolute' as const,
    left: 10,
    right: 10,
    top: 10,
    flexDirection: 'row' as const,
    gap: 8,
  },
});
