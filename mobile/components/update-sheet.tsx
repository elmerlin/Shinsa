import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { useAutoUpdate } from '@/hooks/use-auto-update';
import type { ThemeColors } from '@/constants/theme';

interface Props {
  visible: boolean;
  /** Pass the full hook return — the sheet owns the flow transitions. */
  updater: ReturnType<typeof useAutoUpdate>;
  onClose: () => void;
}

function formatBytes(n?: number): string {
  if (!n || n < 1024) return n ? `${n} B` : '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatReleased(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Modal that walks the user through download → install. The user can
 * dismiss while waiting, but during 'downloading' tapping the backdrop
 * doesn't cancel the in-flight download (it just hides the UI; the
 * promise continues and the sheet can be reopened from the banner).
 */
export function UpdateSheet({ visible, updater, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(makeStyles);
  const { currentVersion, state, download, install } = updater;
  const latest = state.availability?.latest;
  const stage = state.stage;
  const mandatory = !!latest?.mandatory;

  const downloadable = stage === 'available' || stage === 'error';
  const installable = stage === 'ready';
  const busy = stage === 'downloading' || stage === 'installing';

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={mandatory ? () => undefined : onClose}>
      <View style={s.backdrop}>
        {/* Backdrop dismisses unless mandatory — accidental tap during
            a long download shouldn't cancel; just hide the sheet. */}
        {!mandatory ? <Pressable style={StyleSheet.absoluteFill} onPress={onClose} /> : null}

        <View style={[s.sheet, { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}>
          <View style={s.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.eyebrow}>SHINSA UPDATE</Text>
              <Text style={s.title} numberOfLines={1}>
                {latest ? `v${latest.version}` : 'Check for updates'}
              </Text>
              {latest?.releasedAt ? (
                <Text style={s.meta}>Released {formatReleased(latest.releasedAt)}</Text>
              ) : null}
            </View>
            {!mandatory ? (
              <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.7 }]}>
                <IconSymbol name="xmark" size={14} color="#fff" />
              </Pressable>
            ) : null}
          </View>

          <View style={s.versionRow}>
            <View style={s.versionPill}>
              <Text style={s.versionPillLabel}>YOU HAVE</Text>
              <Text style={s.versionPillValue}>v{currentVersion.version}</Text>
              <Text style={s.versionPillBuild}>build {currentVersion.versionCode}</Text>
            </View>
            <View style={[s.versionPill, latest && s.versionPillNext]}>
              <Text style={s.versionPillLabel}>LATEST</Text>
              <Text style={s.versionPillValue}>{latest ? `v${latest.version}` : '—'}</Text>
              <Text style={s.versionPillBuild}>{latest ? `build ${latest.versionCode}` : ''}</Text>
            </View>
          </View>

          {latest?.notes ? (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>WHAT&rsquo;S NEW</Text>
              <Text style={s.notesText}>{latest.notes}</Text>
            </View>
          ) : null}

          {stage === 'downloading' ? (
            <View style={s.progressBox}>
              <View style={s.progressBarTrack}>
                <View
                  style={[
                    s.progressBarFill,
                    {
                      width: `${Math.round((state.progress?.fraction ?? 0) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.progressLabel}>
                {state.progress
                  ? `${formatBytes(state.progress.bytesWritten)} / ${formatBytes(state.progress.totalBytes || latest?.size)}`
                  : 'Starting…'}
              </Text>
            </View>
          ) : null}

          {stage === 'installing' ? (
            <View style={s.progressBox}>
              <ActivityIndicator color="#fbbf24" />
              <Text style={s.progressLabel}>Opening Android installer…</Text>
              <Text style={s.installerHint}>
                You may be asked to allow Shinsa to install apps — that prompt comes from Android.
              </Text>
            </View>
          ) : null}

          {state.error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{state.error}</Text>
            </View>
          ) : null}

          <View style={s.actionsRow}>
            {downloadable ? (
              <Pressable
                onPress={download}
                style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}>
                <Text style={s.primaryBtnText}>{stage === 'error' ? 'Try again' : 'Download update'}</Text>
              </Pressable>
            ) : null}
            {installable ? (
              <Pressable
                onPress={install}
                style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.85 }]}>
                <Text style={s.primaryBtnText}>Install now</Text>
              </Pressable>
            ) : null}
            {busy ? (
              <View style={[s.primaryBtn, s.primaryBtnBusy]}>
                <Text style={s.primaryBtnText}>{stage === 'downloading' ? 'Downloading…' : 'Installing…'}</Text>
              </View>
            ) : null}
            {!mandatory && !busy ? (
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.secondaryBtnText}>Later</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 12,
  },
  sheet: {
    width: '100%' as const,
    maxWidth: 560,
    borderRadius: 16,
    overflow: 'hidden' as const,
    backgroundColor: '#07111f',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 16,
    gap: 14,
  },

  header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, color: '#fbbf24' },
  title: { fontSize: 22, fontWeight: '900' as const, color: '#fff', marginTop: 2 },
  meta: { fontSize: 11, color: t.textDim, marginTop: 2 },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  versionRow: { flexDirection: 'row' as const, gap: 8 },
  versionPill: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    gap: 2,
    alignItems: 'flex-start' as const,
  },
  // Highlight the right-hand "LATEST" pill in amber when an update exists.
  versionPillNext: {
    borderColor: 'rgba(251,191,36,0.55)',
    backgroundColor: 'rgba(251,191,36,0.1)',
  },
  versionPillLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  versionPillValue: { fontSize: 18, fontWeight: '900' as const, color: '#fff', fontVariant: ['tabular-nums' as const] },
  versionPillBuild: { fontSize: 10, color: t.textDim, fontVariant: ['tabular-nums' as const] },

  notesBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    gap: 4,
  },
  notesLabel: { fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2, color: t.textDim },
  notesText: { fontSize: 12, lineHeight: 18, color: '#fff' },

  progressBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    gap: 8,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden' as const,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBarFill: { height: '100%' as const, backgroundColor: '#fbbf24' },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: t.textMuted,
    fontVariant: ['tabular-nums' as const],
  },
  installerHint: { fontSize: 11, color: t.textDim, lineHeight: 16 },

  errorBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    padding: 10,
  },
  errorText: { fontSize: 12, color: '#fca5a5' },

  actionsRow: { flexDirection: 'row' as const, gap: 8 },
  primaryBtn: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center' as const,
    backgroundColor: '#fbbf24',
  },
  primaryBtnBusy: { backgroundColor: 'rgba(251,191,36,0.55)' },
  primaryBtnText: { fontSize: 13, fontWeight: '900' as const, color: '#0a0f1c', letterSpacing: 0.3 },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' as const, color: t.text },
});
