import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { UpdateSheet } from '@/components/update-sheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme, type ThemePreference } from '@/contexts/theme-context';
import { useAutoUpdate } from '@/hooks/use-auto-update';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebPush } from '@/hooks/use-web-push';
import { externalApi, healthApi, piugameApi, youtubeApi } from '@/lib/api';
import { syncHeartRateAfterPiugameSync } from '@/lib/heartRateSync';
import type { ThemeColors } from '@/constants/theme';
import type { ApiTokenRow } from '@shared/api';

const PREFERENCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'classic', label: 'Classic' },
];

type Styles = ReturnType<typeof useThemedStyles<ReturnType<typeof makeStyles>>>;

function formatDate(input?: string | null): string {
  if (!input) return 'Never';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return 'Never';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Two-state PIUGame card. When the user has stored credentials, shows the
 * sync controls; otherwise, surfaces a username + password form so they can
 * bootstrap their link without bouncing to the web app. Mirrors the web's
 * `MyAccountPage` "piugame" tab.
 */
function PiugameLinkSection({ s, userId }: { s: Styles; userId: string }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const credStatusQuery = useQuery({
    queryKey: ['piugame-credential-status'],
    queryFn: () => piugameApi.credentialStatus(),
  });

  const syncStatusQuery = useQuery({
    queryKey: ['piugame-sync-status', userId],
    queryFn: () => piugameApi.syncStatus(userId),
    enabled: !!userId,
    refetchInterval: (query) => (query.state.data?.sync_in_progress ? 2000 : false),
  });

  const linked = !!credStatusQuery.data?.linked;
  const status = syncStatusQuery.data;
  const inProgress = String(status?.sync_in_progress || '');
  const isBestRunning = inProgress === 'best-scores';
  const progress = Number(status?.sync_progress) || 0;
  const total = Number(status?.sync_total) || 0;
  const pct = total > 0 ? Math.min(1, progress / total) : 0;

  const linkMutation = useMutation({
    mutationFn: () => piugameApi.saveCredentials({ piugame_username: username, piugame_password: password }),
    onSuccess: () => {
      setUsername('');
      setPassword('');
      setFeedback({ tone: 'ok', text: 'PIUGame account linked. Run a sync to pull your scores.' });
      queryClient.invalidateQueries({ queryKey: ['piugame-credential-status'] });
      queryClient.invalidateQueries({ queryKey: ['piugame-sync-status', userId] });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to link PIUGame account' });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => piugameApi.deleteCredentials(),
    onSuccess: () => {
      setFeedback({ tone: 'ok', text: 'PIUGame account unlinked. Imported scores have been removed.' });
      queryClient.invalidateQueries({ queryKey: ['piugame-credential-status'] });
      queryClient.invalidateQueries({ queryKey: ['piugame-sync-status', userId] });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to unlink' });
    },
  });

  const bestMutation = useMutation({
    mutationFn: () => piugameApi.syncBestScores(),
    onSuccess: () => {
      syncStatusQuery.refetch();
      setFeedback({ tone: 'ok', text: 'Best-scores sync started. This can take a few minutes.' });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to start sync' });
    },
  });

  const recentMutation = useMutation({
    mutationFn: () => piugameApi.syncRecentlyPlayed(),
    onSuccess: (data) => {
      syncStatusQuery.refetch();
      const base = `Synced ${data.plays_count ?? 0} recent plays · ${data.scores_updated ?? 0} best scores updated`;
      setFeedback({ tone: 'ok', text: base });
      // Pull watch HR for the freshly-synced plays and attach it (HealthKit
      // on iOS, Health Connect on Android — Garmin/Fitbit/Samsung/etc), then
      // surface the outcome. 'unavailable' (web / no health store) stays
      // quiet; everything else is shown so capture failures aren't invisible.
      void syncHeartRateAfterPiugameSync(userId).then((hr) => {
        if (hr.state === 'uploaded' && hr.uploaded > 0) {
          setFeedback({ tone: 'ok', text: `${base} · ❤️ heart rate on ${hr.uploaded} plays` });
        } else if (hr.state === 'denied') {
          setFeedback({ tone: 'ok', text: `${base} · ❤️ Health access not granted` });
        } else if (hr.state === 'no-data') {
          setFeedback({ tone: 'ok', text: `${base} · ❤️ no heart-rate data for these plays` });
        } else if (hr.state === 'error') {
          setFeedback({ tone: 'ok', text: `${base} · ❤️ HR error: ${hr.message}` });
        } else if (hr.state === 'unavailable' && Platform.OS === 'ios') {
          setFeedback({ tone: 'ok', text: `${base} · ❤️ HealthKit unavailable on this device` });
        }
      });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to sync recently played' });
    },
  });

  const pumbilityMutation = useMutation({
    mutationFn: () => piugameApi.syncPumbility(),
    onSuccess: (data) => {
      syncStatusQuery.refetch();
      const val = typeof data.pumbility_value === 'number' ? data.pumbility_value.toLocaleString() : '—';
      setFeedback({
        tone: 'ok',
        text: `Pumbility synced: ${val} (${data.scores_count ?? 0} top scores)`,
      });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to sync Pumbility' });
    },
  });

  // Auto-stop polling once the sync clears.
  useEffect(() => {
    if (!isBestRunning && bestMutation.isSuccess) {
      const t = setTimeout(() => syncStatusQuery.refetch(), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isBestRunning, bestMutation.isSuccess, syncStatusQuery]);

  const onConfirmBest = () => {
    Alert.alert(
      'Run full best-scores sync?',
      'This walks through every page on PIUGame and can take several minutes. You usually only need to do it once.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Run sync', onPress: () => bestMutation.mutate() },
      ],
    );
  };

  const onConfirmUnlink = () => {
    Alert.alert(
      'Unlink PIUGame account?',
      'Your stored credentials AND every imported score (Pumbility, best scores, recently played) will be deleted. You can re-link any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlink', style: 'destructive', onPress: () => unlinkMutation.mutate() },
      ],
    );
  };

  if (credStatusQuery.isLoading) {
    return (
      <View style={s.section}>
        <Text style={s.eyebrow}>PIUGAME LINK</Text>
        <View style={s.card}>
          <ActivityIndicator color={theme.spinner} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>PIUGAME LINK</Text>

      {!linked ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Connect your PIUGame account</Text>
          <Text style={s.cardHint}>
            We pull your Pumbility, best scores, and recently played plays. Your credentials are
            encrypted at rest and only used to log in to phoenix.piugame.com.
          </Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            placeholder="PIUGame username"
            placeholderTextColor={theme.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!linkMutation.isPending}
          />
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="PIUGame password"
            placeholderTextColor={theme.textDim}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!linkMutation.isPending}
          />
          <Pressable
            onPress={() => linkMutation.mutate()}
            disabled={!username.trim() || !password.trim() || linkMutation.isPending}
            style={({ pressed }) => [
              s.primaryBtn,
              pressed && { opacity: 0.7 },
              (!username.trim() || !password.trim() || linkMutation.isPending) && { opacity: 0.5 },
            ]}>
            {linkMutation.isPending ? (
              <ActivityIndicator color={theme.textOnAccent} />
            ) : (
              <Text style={s.primaryBtnText}>Link PIUGame account</Text>
            )}
          </Pressable>
          {feedback ? (
            <Text style={[s.feedback, feedback.tone === 'err' ? s.feedbackErr : s.feedbackOk]}>
              {feedback.text}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Linked</Text>
            <View style={s.linkedPill}>
              <IconSymbol name="checkmark.circle.fill" size={11} color="#34d399" />
              <Text style={s.linkedPillText}>YES</Text>
            </View>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Last best-scores sync</Text>
            <Text style={s.rowValue}>{formatDate(status?.last_best_scores_sync)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Last recently-played sync</Text>
            <Text style={s.rowValue}>{formatDate(status?.last_recently_played_sync)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Last Pumbility sync</Text>
            <Text style={s.rowValue}>{formatDate(status?.last_pumbility_sync)}</Text>
          </View>

          {isBestRunning ? (
            <View style={s.progressWrap}>
              <Text style={s.progressLabel}>Importing best scores… {progress}/{total || '?'}</Text>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
              </View>
            </View>
          ) : (
            <View style={s.syncBtnGroup}>
              <Pressable
                onPress={onConfirmBest}
                disabled={bestMutation.isPending || isBestRunning}
                style={({ pressed }) => [
                  s.primaryBtn,
                  pressed && { opacity: 0.7 },
                  (bestMutation.isPending || isBestRunning) && { opacity: 0.5 },
                ]}>
                {bestMutation.isPending ? (
                  <ActivityIndicator color={theme.textOnAccent} />
                ) : (
                  <Text style={s.primaryBtnText}>Sync best scores (full)</Text>
                )}
              </Pressable>
              <View style={s.syncBtnRow}>
                <Pressable
                  onPress={() => recentMutation.mutate()}
                  disabled={recentMutation.isPending}
                  style={({ pressed }) => [
                    s.secondaryBtn,
                    pressed && { opacity: 0.7 },
                    recentMutation.isPending && { opacity: 0.5 },
                  ]}>
                  {recentMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Text style={s.secondaryBtnText}>Recently played</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => pumbilityMutation.mutate()}
                  disabled={pumbilityMutation.isPending}
                  style={({ pressed }) => [
                    s.secondaryBtn,
                    pressed && { opacity: 0.7 },
                    pumbilityMutation.isPending && { opacity: 0.5 },
                  ]}>
                  {pumbilityMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.text} />
                  ) : (
                    <Text style={s.secondaryBtnText}>Pumbility</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {feedback ? (
            <Text style={[s.feedback, feedback.tone === 'err' ? s.feedbackErr : s.feedbackOk]}>
              {feedback.text}
            </Text>
          ) : null}

          <Pressable
            onPress={onConfirmUnlink}
            disabled={unlinkMutation.isPending}
            style={({ pressed }) => [s.unlinkBtn, pressed && { opacity: 0.7 }, unlinkMutation.isPending && { opacity: 0.5 }]}>
            {unlinkMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Text style={s.unlinkText}>Unlink PIUGame account</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Two-state YouTube card. The connect flow opens the Google OAuth page in
 * a system-managed in-app browser (`WebBrowser.openAuthSessionAsync`) and
 * waits for the server to redirect back to the app's deep link
 * (`shinsa://youtube-callback`). When the redirect fires, the browser
 * auto-closes and we refetch the status to flip into the linked state.
 */
// Max heart rate for personalized HR zones. Auto = highest peak ever synced;
// the manual value overrides it (0 clears back to auto).
function HeartRateSection({ s }: { s: Styles }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const profileQuery = useQuery({
    queryKey: ['hr-profile'],
    queryFn: () => healthApi.hrProfile(),
  });
  const prof = profileQuery.data;

  const saveMutation = useMutation({
    mutationFn: (maxHr: number) => healthApi.setMaxHr(maxHr),
    onSuccess: (data) => {
      queryClient.setQueryData(['hr-profile'], {
        max_hr_manual: data.max_hr_manual,
        max_hr_observed: data.max_hr_observed,
        max_hr_effective: data.max_hr_effective,
      });
      setDraft('');
      setFeedback({
        tone: 'ok',
        text: data.max_hr_manual > 0
          ? `Max HR set to ${data.max_hr_manual} — zones updated.`
          : `Back to auto — using highest synced peak (${data.max_hr_effective}).`,
      });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to save max HR' });
    },
  });

  const handleSave = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 120 || n > 230) {
      setFeedback({ tone: 'err', text: 'Enter a max HR between 120 and 230.' });
      return;
    }
    saveMutation.mutate(n);
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Heart rate zones</Text>
      <Text style={s.cardHint}>
        Zones are percentages of your max heart rate (Easy 68–73% · Steady 73–80% · Mod. hard
        80–87% · Hard 87–93% · Very hard 93%+). By default your max is the highest BPM ever
        synced from your watch; set it manually if you know it.
      </Text>
      <View style={s.row}>
        <Text style={s.rowLabel}>Max HR in use</Text>
        <Text style={s.rowValue}>
          {prof ? `${prof.max_hr_effective} BPM ${prof.max_hr_manual > 0 ? '(manual)' : prof.max_hr_observed > 0 ? '(highest synced)' : '(default)'}` : '…'}
        </Text>
      </View>
      <View style={s.syncBtnRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={prof ? `e.g. ${prof.max_hr_effective}` : 'e.g. 190'}
          placeholderTextColor="#6b7689"
          keyboardType="number-pad"
          maxLength={3}
        />
        <Pressable
          onPress={handleSave}
          disabled={saveMutation.isPending}
          style={({ pressed }) => [s.primaryBtn, { paddingHorizontal: 16 }, (pressed || saveMutation.isPending) && { opacity: 0.7 }]}>
          <Text style={s.primaryBtnText}>Save</Text>
        </Pressable>
        {prof && prof.max_hr_manual > 0 ? (
          <Pressable
            onPress={() => saveMutation.mutate(0)}
            disabled={saveMutation.isPending}
            style={({ pressed }) => [s.secondaryBtn, { paddingHorizontal: 14 }, (pressed || saveMutation.isPending) && { opacity: 0.7 }]}>
            <Text style={s.secondaryBtnText}>Auto</Text>
          </Pressable>
        ) : null}
      </View>
      {feedback ? (
        <Text style={[s.cardHint, { color: feedback.tone === 'ok' ? '#34d399' : '#fda4af' }]}>{feedback.text}</Text>
      ) : null}
    </View>
  );
}

function YoutubeLinkSection({ s }: { s: Styles }) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['youtube-status'],
    queryFn: () => youtubeApi.status(),
  });

  const status = statusQuery.data;
  const linked = !!status?.linked;
  const configured = !!status?.configured;

  const handleConnect = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      // `Linking.createURL` picks `shinsa://youtube-callback` in production
      // and an Expo dev URL during local development. The server allowlist
      // accepts both schemes, so the same code path works in either context.
      const deepLink = Linking.createURL('youtube-callback');
      const { auth_url: authUrl } = await youtubeApi.connectStart({ next_path: deepLink });
      if (!authUrl) throw new Error('Server did not return an OAuth URL');

      const result = await WebBrowser.openAuthSessionAsync(authUrl, deepLink);

      if (result.type === 'success') {
        // The redirect URL carries `?youtube=connected|error&youtube_message=...`
        // — surface the friendly message to the user if present.
        const parsed = Linking.parse(result.url);
        const ytStatus = String(parsed.queryParams?.youtube ?? '');
        const ytMessage = String(parsed.queryParams?.youtube_message ?? '');
        if (ytStatus === 'connected') {
          setFeedback({ tone: 'ok', text: ytMessage || 'YouTube channel connected.' });
        } else if (ytStatus === 'error') {
          setFeedback({ tone: 'err', text: ytMessage || 'YouTube connection failed.' });
        }
        queryClient.invalidateQueries({ queryKey: ['youtube-status'] });
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User backed out of the OAuth screen — no-op, status stays the same.
      }
    } catch (err) {
      setFeedback({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Failed to start YouTube connection',
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: () => youtubeApi.disconnect(),
    onSuccess: () => {
      setFeedback({ tone: 'ok', text: 'YouTube channel disconnected.' });
      queryClient.invalidateQueries({ queryKey: ['youtube-status'] });
    },
    onError: (err) => {
      setFeedback({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Failed to disconnect',
      });
    },
  });

  const onConfirmDisconnect = () => {
    Alert.alert(
      'Disconnect YouTube channel?',
      'Shinsa will no longer be able to attach your replays or stream metadata. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => disconnectMutation.mutate() },
      ],
    );
  };

  if (statusQuery.isLoading) {
    return (
      <View style={s.section}>
        <Text style={s.eyebrow}>YOUTUBE</Text>
        <View style={s.card}><ActivityIndicator color={theme.spinner} /></View>
      </View>
    );
  }

  // If the server doesn't have OAuth configured, hide the section entirely —
  // there's nothing the user can do about it.
  if (!configured) return null;

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>YOUTUBE</Text>

      {!linked ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Connect your YouTube channel</Text>
          <Text style={s.cardHint}>
            Linking your channel lets Shinsa attach your replays to score posts and pull stream
            metadata for live sessions.
          </Text>
          <Pressable
            onPress={handleConnect}
            disabled={busy}
            style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.7 }, busy && { opacity: 0.5 }]}>
            {busy ? (
              <ActivityIndicator color={theme.textOnAccent} />
            ) : (
              <Text style={s.primaryBtnText}>Connect YouTube</Text>
            )}
          </Pressable>
          {feedback ? (
            <Text style={[s.feedback, feedback.tone === 'err' ? s.feedbackErr : s.feedbackOk]}>
              {feedback.text}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={s.card}>
          <View style={s.ytChannelRow}>
            {status?.channel_thumbnail_url ? (
              <Image source={{ uri: status.channel_thumbnail_url }} style={s.ytThumb} contentFit="cover" />
            ) : (
              <View style={[s.ytThumb, s.ytThumbFallback]}>
                <IconSymbol name="play.rectangle.fill" size={18} color="#ef4444" />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.ytChannelTitle} numberOfLines={1}>
                {status?.channel_title || 'Connected channel'}
              </Text>
              <View style={s.linkedPill}>
                <IconSymbol name="checkmark.circle.fill" size={11} color="#34d399" />
                <Text style={s.linkedPillText}>LINKED</Text>
              </View>
            </View>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Last updated</Text>
            <Text style={s.rowValue}>{formatDate(status?.updated_at)}</Text>
          </View>
          {status?.last_error ? (
            <Text style={s.feedbackErr}>{status.last_error}</Text>
          ) : null}

          {feedback ? (
            <Text style={[s.feedback, feedback.tone === 'err' ? s.feedbackErr : s.feedbackOk]}>
              {feedback.text}
            </Text>
          ) : null}

          <Pressable
            onPress={onConfirmDisconnect}
            disabled={disconnectMutation.isPending}
            style={({ pressed }) => [s.unlinkBtn, pressed && { opacity: 0.7 }, disconnectMutation.isPending && { opacity: 0.5 }]}>
            {disconnectMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Text style={s.unlinkText}>Disconnect YouTube</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Personal access tokens for cross-app integrations. Users generate a token
 * here, paste it into another app they own (e.g. liketu's health tracker),
 * and that app calls `/api/external/*` with it. Plaintext token is only
 * returned at creation time — we display it in a copy-once card.
 */
function ApiTokensSection({ s }: { s: Styles }) {
  const queryClient = useQueryClient();
  const tokensQuery = useQuery({
    queryKey: ['external-tokens'],
    queryFn: () => externalApi.listTokens(),
  });
  const [name, setName] = useState('');
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; scopes: string[] }) => externalApi.createToken(payload),
    onSuccess: (data) => {
      setJustCreatedToken(data.token);
      setName('');
      setFeedback(null);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['external-tokens'] });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to create token' });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => externalApi.revokeToken(id),
    onSuccess: () => {
      setConfirmRevokeId(null);
      queryClient.invalidateQueries({ queryKey: ['external-tokens'] });
    },
    onError: (err) => {
      setFeedback({ tone: 'err', text: err instanceof Error ? err.message : 'Failed to revoke token' });
    },
  });

  const handleCopy = async () => {
    if (!justCreatedToken) return;
    // expo-clipboard isn't installed yet; on web (new.pumpshinsa.com) this
    // works via navigator.clipboard. On native we fall through to a hint
    // telling the user to long-press the value instead.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(justCreatedToken);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        setFeedback({ tone: 'err', text: 'Copy blocked — select the token and copy it manually.' });
      }
    } else {
      setFeedback({ tone: 'err', text: 'Long-press the token to copy it.' });
    }
  };

  const handleCopySnippet = async (key: string, text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedSnippet(key);
        setTimeout(() => setCopiedSnippet((curr) => (curr === key ? null : curr)), 2500);
      } catch {
        setFeedback({ tone: 'err', text: 'Copy blocked — select the snippet and copy it manually.' });
      }
    } else {
      setFeedback({ tone: 'err', text: 'Long-press the snippet to copy it.' });
    }
  };

  const tokens: ApiTokenRow[] = tokensQuery.data?.tokens || [];

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>API ACCESS</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>Personal access tokens</Text>
        <Text style={s.cardHint}>
          Let another app you own pull your Pump Shinsa data over HTTPS.{'\n'}
          {'\n'}
          Auth header on every call:{'\n'}
          Authorization: Bearer &lt;token&gt;{'\n'}
          Required scope: steps:read{'\n'}
          {'\n'}
          Endpoints:{'\n'}
          • GET /api/external/steps — day totals + per-hour buckets with daily kcal. Best for calendar/heatmap views.{'\n'}
          • GET /api/external/plays — per-song detail: score, grade, plate, judgments, steps, kcal, duration, jacket image URL, deep links. The shape a workout-detail view wants.{'\n'}
          • GET /api/external/schemes — visual conventions catalog (grade colors + thresholds, mode chips, plate badges, kcal formula). Cacheable.{'\n'}
          {'\n'}
          Common params on /steps + /plays: from=YYYY-MM-DD, to=YYYY-MM-DD, and tz=Europe/London (IANA). Without tz, dates fall back to Asia/Seoul (PIUGame&rsquo;s native zone) — pass your local one.
        </Text>

        {feedback ? (
          <Text style={[s.feedback, feedback.tone === 'ok' ? s.feedbackOk : s.feedbackErr]}>
            {feedback.text}
          </Text>
        ) : null}

        {justCreatedToken ? (
          <View style={s.tokenJustCreated}>
            <Text style={s.tokenJustCreatedEyebrow}>
              COPY YOUR TOKEN NOW — THIS IS YOUR ONLY CHANCE
            </Text>
            <Text style={s.tokenJustCreatedHint}>
              We store only a hash. Lose it and you&rsquo;ll have to create a new one.
            </Text>
            <Text selectable style={s.tokenJustCreatedValue}>
              {justCreatedToken}
            </Text>
            <View style={s.tokenJustCreatedActions}>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [s.copyBtn, pressed && { opacity: 0.7 }]}>
                <Text style={s.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
              </Pressable>
              <Pressable
                onPress={() => { setJustCreatedToken(null); setCopied(false); }}
                style={({ pressed }) => [s.copyBtnSecondary, pressed && { opacity: 0.7 }]}>
                <Text style={s.copyBtnSecondaryText}>I&rsquo;ve saved it</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={s.rowLabel}>Token name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Liketu health tracker"
            placeholderTextColor={'#8a8a8a'}
            maxLength={80}
            editable={!createMutation.isPending}
            style={s.input}
          />
          <Pressable
            disabled={createMutation.isPending}
            onPress={() => createMutation.mutate({
              name: name.trim() || 'Untitled token',
              scopes: ['steps:read'],
            })}
            style={({ pressed }) => [
              s.primaryBtn,
              createMutation.isPending && { opacity: 0.6 },
              pressed && { opacity: 0.85 },
            ]}>
            {createMutation.isPending ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.primaryBtnText}>Create token</Text>
            )}
          </Pressable>
        </View>
      </View>

      {(() => {
        const tokenForSnippet = justCreatedToken || 'pump_pat_PASTE_YOUR_TOKEN_HERE';
        const isPlaceholder = !justCreatedToken;
        const curlSnippet = `# Day totals + hourly buckets (with daily kcal)
curl -H "Authorization: Bearer ${tokenForSnippet}" \\
  "https://pumpshinsa.com/api/external/steps?from=2026-05-01&to=2026-05-15&tz=Europe/London"

# Per-song detail — score, grade, plate, kcal, jacket URL, replay URL.
# Newest first. Pass tz so dates are interpreted in your local zone.
curl -H "Authorization: Bearer ${tokenForSnippet}" \\
  "https://pumpshinsa.com/api/external/plays?from=2026-05-01&to=2026-05-15&tz=Europe/London&limit=200"

# Visual conventions (grade colors, mode chips, plate badges). Cache it.
curl -H "Authorization: Bearer ${tokenForSnippet}" \\
  "https://pumpshinsa.com/api/external/schemes"`;
        const nodeSnippet = `const auth = { Authorization: \`Bearer \${process.env.PUMPSHINSA_TOKEN}\` };
const tz = 'Europe/London';
const today = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

// /steps — day totals + hourly buckets (in the requested tz).
const stepsRes = await fetch(
  \`https://pumpshinsa.com/api/external/steps?from=\${today}&to=\${today}&tz=\${tz}\`,
  { headers: auth }
);
const { days } = await stepsRes.json();
const totalSteps = days.reduce((s, d) => s + d.steps, 0);
const totalKcal  = days.reduce((s, d) => s + d.kcal,  0);

// /plays — per-song detail (newest first). Each row carries kcal +
// jacket_url + chart_url + play_url + og_image_url so a workout-detail
// view has everything to render without a second round-trip. kcal is
// always MET-derived: "estimated_duration" (preferred) uses the chart's
// real duration from the songs catalog; "estimated_baseline" falls
// back to 120 s when the chart isn't catalogued.
const playsRes = await fetch(
  \`https://pumpshinsa.com/api/external/plays?from=\${today}&to=\${today}&tz=\${tz}&limit=500\`,
  { headers: auth }
);
const { plays, total_kcal, total_steps, total_duration_seconds } = await playsRes.json();
const kcalBySong = plays.reduce((acc, p) => {
  acc[p.song_title] = (acc[p.song_title] || 0) + p.kcal;
  return acc;
}, {});

// /schemes — one-shot static catalog. Cache it (5 min server-side).
// Re-fetch when schemes_v bumps.
const schemes = await (await fetch(
  'https://pumpshinsa.com/api/external/schemes',
  { headers: auth }
)).json();
const gradeFor = (score) =>
  schemes.grades.find((g) => score >= g.min_score) ?? schemes.grades.at(-1);
const chipFor = (mode, level) => {
  const m = schemes.modes[mode] ?? schemes.modes.Single;
  return { label: mode === 'CoOp' ? \`C\${level}\` : \`\${m.short}\${level}\`, color: m.color };
};`;
        const agentSnippet = `You are integrating the Pump Shinsa external API into a website.

AUTH (all endpoints)
Header: Authorization: Bearer <token>
Token: ${tokenForSnippet}
Required scope: steps:read
Treat the token like a password — never ship it in browser code.

DATE / TIMEZONE
- /steps and /plays take from=YYYY-MM-DD&to=YYYY-MM-DD.
- ALSO pass tz=<IANA> (e.g. tz=Europe/London). Without it, dates fall back
  to Asia/Seoul (PIUGame's native zone) and a "today" query made from
  London will miss plays the user did this evening.

═══════════════════════════════════════════════════════════════════════
ENDPOINT 1 — /steps : day totals + hourly buckets (chart-friendly)
═══════════════════════════════════════════════════════════════════════
GET https://pumpshinsa.com/api/external/steps?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/London

RESPONSE 200
{
  "user_id": <string>,
  "from": "YYYY-MM-DD",
  "to":   "YYYY-MM-DD",
  "tz": "Europe/London" | null,
  "hour_basis": "Europe/London" | "utc",   // matches tz; "utc" when none
  "kcal_weight_kg": <number>,              // user's profile weight (or 70 default)
  "kcal_weight_source": "profile" | "default",
  "kcal_estimate_basis": "song_duration",
  "kcal_per_song_baseline_120s": <number>, // baseline at user's weight
  "days": [
    {
      "date": "YYYY-MM-DD",
      "steps": <int>,
      "plays": <int>,
      "kcal":  <number>,
      "hours": [
        { "hour": 0..23, "steps": <int>, "plays": <int>, "kcal": <number> }
      ]
    }
  ]
}

NOTES
- "steps" = perfect+great+good+bad (misses excluded).
- "days" omits dates with no plays — fill gaps with 0 if you need a continuous range.
- "hours" is sparse: missing buckets = 0.
- Older plays without a played_at_utc are excluded from hourly buckets;
  sum(hours[].steps) <= days[].steps. Day totals are source of truth.

═══════════════════════════════════════════════════════════════════════
ENDPOINT 2 — /plays : per-song detail (workout-view shape)
═══════════════════════════════════════════════════════════════════════
GET https://pumpshinsa.com/api/external/plays?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/London&limit=100

PARAMS
- from / to / tz — same as /steps.
- limit (optional, default 100, max 500).

RESPONSE 200
{
  "user_id": <string>,
  "from": "YYYY-MM-DD",
  "to":   "YYYY-MM-DD",
  "tz": "Europe/London" | null,
  "limit": <int>,
  "count": <int>,
  "total_kcal": <number>,            // sum(plays[].kcal)
  "total_steps": <int>,              // sum(plays[].steps)
  "total_duration_seconds": <int>,   // sum(plays[].duration_seconds || 0)
  "kcal_weight_kg": <number>,
  "kcal_weight_source": "profile" | "default",
  "kcal_estimate_basis": "song_duration",
  "kcal_per_song_baseline_120s": <number>,
  "plays": [
    {
      "play_id": <int>,
      "played_at_utc": "YYYY-MM-DD HH:MM:SS",
      "date_played": <string>,                 // PIUGame's raw KST timestamp
      "song_title": <string>,
      "mode": "Single" | "Double" | "CoOp" | "UCS",
      "level": <int>,
      "score": <int>,
      "grade": <string>,                       // "SSS+" / "A" / "F" / "" etc.
      "plate": <string>,                       // "PG" / "MG" / "FG" / ""  etc.
      "steps": <int>,                          // perfect+great+good+bad
      "duration_seconds": <int> | null,        // from songs catalog (~98% coverage)
      "kcal": <number>,
      "kcal_source": "estimated_duration" | "estimated_baseline",
      "judgments": { "perfect", "great", "good", "bad", "miss": <int> },
      "max_combo": <int>,
      "chart_id":     <int> | null,
      "chart_url":    "https://new.pumpshinsa.com/song/<id>" | null,
      "play_url":     "https://new.pumpshinsa.com/play/<id>" | null,
      "jacket_url":   "https://pumpshinsa.com/jackets/pump/<...>.jpg" | null,
      "og_image_url": "https://pumpshinsa.com/og/play/<id>.jpg" | null,
      "replay_embed_url": <string>,
      "replay_video_id":  <string>
    }
  ]
}

KCAL MODEL (no PIUGame OCR — that was unreliable and was removed)
- All kcal is MET-derived: (11.8 MET × 3.5 × weight_kg / 200) × minutes.
- "estimated_duration" — minutes = chart's real duration from the songs catalog.
- "estimated_baseline" — chart isn't catalogued; fall back to 120 s.
- weight_kg comes from the user's profile, default 70.
- sum(plays[].kcal) === total_kcal === /steps days[].kcal for the same window.

RENDER HINTS (paired with /schemes — endpoint 3)
- Difficulty chip: \`\${schemes.modes[play.mode].short}\${play.level}\` (Co-op uses C\${level}).
- Grade badge: descending-scan schemes.grades for first \`score >= min_score\`; use {color, tier}.
- Plate badge: lookup play.plate in schemes.plates; empty plate = stage-break.
- jacket_url is absolute — drop straight into <img src>.

ROW ORDER: newest first (played_at_utc DESC, id DESC). Tighten dates to paginate.

═══════════════════════════════════════════════════════════════════════
ENDPOINT 3 — /schemes : visual conventions catalog (cacheable)
═══════════════════════════════════════════════════════════════════════
GET https://pumpshinsa.com/api/external/schemes

NO PARAMS. Server sets Cache-Control: public, max-age=300.

RESPONSE 200
{
  "schemes_v": <int>,                        // bumps when shape changes — refetch on change
  "modes": {
    "Single": { "short": "S", "color": "#d93d62", "gradient": [...], "label": "Single" },
    "Double": { "short": "D", "color": "#16b77f", "gradient": [...], "label": "Double" },
    "CoOp":   { "short": "C", "color": "#2b88de", "gradient": [...], "label": "Co-op"  },
    "UCS":    { "short": "U", "color": "#7c3aed", "gradient": [...], "label": "User custom step" }
  },
  "grades": [                                // descending; linear-scan for first min_score
    { "key": "SSS+", "min_score": 995000, "tier": "sss", "color": "#7dd3fc", "label": "SSS+" },
    ... 16 total ...
    { "key": "F",    "min_score": 0,      "tier": "f",   "color": "#525252", "label": "F"    }
  ],
  "plates": [                                // 8 codes (PG..RG) with color + description
    { "key": "PG", "label": "PERFECT GAME", "color": "#7dd3fc", "description": "No bad / no miss" },
    ...
  ],
  "kcal": {
    "met": 11.8,
    "formula": "(MET × 3.5 × weight_kg / 200) × song_duration_minutes",
    "fallback_duration_seconds": 120,
    "sources": {
      "estimated_duration":  "MET × profile_weight_kg × chart_duration_seconds from songs catalog.",
      "estimated_baseline":  "MET × profile_weight_kg × 120 s fallback."
    }
  }
}

ERRORS (all endpoints)
400 — bad date format, from > to, unknown tz
401 — missing/invalid/revoked token
403 — token missing scope steps:read

INTEGRATION RULES
- Call from a server, not the browser. Read the token from an env var (PUMPSHINSA_TOKEN).
- CORS is open, so a browser call works — but inlining the token in JS exposes it; proxy through your backend.
- No documented rate limit. One poll per user per minute is plenty for sync flows.

EXAMPLE (Node) — workout-detail data + render helpers
const auth = { Authorization: \`Bearer \${process.env.PUMPSHINSA_TOKEN}\` };
const tz = 'Europe/London';
const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });

const [schemes, { plays, total_kcal, total_steps, total_duration_seconds }] = await Promise.all([
  fetch('https://pumpshinsa.com/api/external/schemes', { headers: auth }).then(r => r.json()),
  fetch(\`https://pumpshinsa.com/api/external/plays?from=\${today}&to=\${today}&tz=\${tz}&limit=500\`, { headers: auth }).then(r => r.json()),
]);

const chipFor  = (mode, level) => {
  const m = schemes.modes[mode] ?? schemes.modes.Single;
  return { label: mode === 'CoOp' ? \`C\${level}\` : \`\${m.short}\${level}\`, color: m.color };
};
const gradeFor = (score) => schemes.grades.find(g => score >= g.min_score) ?? schemes.grades.at(-1);
const plateFor = (code)  => schemes.plates.find(p => p.key === code) || null;`;
        const snippets: { key: string; label: string; hint: string; text: string }[] = [
          { key: 'agent', label: 'Agent prompt', hint: 'Paste into Claude Code, Cursor, etc. The agent will know what to build.', text: agentSnippet },
          { key: 'curl', label: 'curl', hint: 'Quick smoke test from the terminal.', text: curlSnippet },
          { key: 'node', label: 'Node / fetch', hint: 'Server-side. Set PUMPSHINSA_TOKEN in your env.', text: nodeSnippet },
        ];
        return (
          <View style={s.card}>
            <Text style={s.cardTitle}>Integration</Text>
            <Text style={s.cardHint}>
              {isPlaceholder
                ? 'Drop these into the app or agent that will be reading your steps. Replace pump_pat_PASTE_YOUR_TOKEN_HERE with the token from a fresh create.'
                : 'Drop these into the app or agent that will be reading your steps. Your just-created token is already inlined below.'}
            </Text>
            {snippets.map((sn) => (
              <View key={sn.key} style={{ gap: 6 }}>
                <View style={s.snippetHeader}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.snippetLabel}>{sn.label}</Text>
                    <Text style={s.snippetHint}>{sn.hint}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleCopySnippet(sn.key, sn.text)}
                    style={({ pressed }) => [s.snippetCopyBtn, pressed && { opacity: 0.7 }]}>
                    <Text style={s.snippetCopyBtnText}>
                      {copiedSnippet === sn.key ? 'Copied!' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal={Platform.OS !== 'web'}
                  style={s.snippetBlockScroll}
                  contentContainerStyle={{ flexGrow: 1 }}
                  showsHorizontalScrollIndicator={false}>
                  <Text selectable style={s.snippetBlock}>
                    {sn.text}
                  </Text>
                </ScrollView>
              </View>
            ))}
          </View>
        );
      })()}

      <View style={s.card}>
        <Text style={s.cardTitle}>Your tokens</Text>
        {tokensQuery.isLoading ? (
          <Text style={s.cardHint}>Loading…</Text>
        ) : tokens.length === 0 ? (
          <Text style={s.cardHint}>No tokens yet. Create one above to get started.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {tokens.map((t) => {
              const revoked = !!t.revoked_at;
              const isConfirming = confirmRevokeId === t.id;
              const isBusy = revokeMutation.isPending && revokeMutation.variables === t.id;
              return (
                <View
                  key={t.id}
                  style={[s.tokenRow, revoked && { opacity: 0.55 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.tokenRowName}>
                      {t.name || 'Untitled token'}
                      {revoked ? <Text style={s.tokenRevokedTag}>  REVOKED</Text> : null}
                    </Text>
                    <Text style={s.tokenRowMeta}>
                      Scopes: {(t.scopes || []).join(', ') || '—'}
                    </Text>
                    <Text style={s.tokenRowMeta}>
                      Created {formatDate(t.created_at)} · Last used {formatDate(t.last_used_at)}
                    </Text>
                  </View>
                  {!revoked ? (
                    isConfirming ? (
                      <View style={{ gap: 4 }}>
                        <Pressable
                          disabled={isBusy}
                          onPress={() => revokeMutation.mutate(t.id)}
                          style={({ pressed }) => [s.dangerBtn, pressed && { opacity: 0.7 }]}>
                          <Text style={s.dangerBtnText}>{isBusy ? '…' : 'Confirm'}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmRevokeId(null)}
                          style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]}>
                          <Text style={s.cancelBtnText}>Cancel</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setConfirmRevokeId(t.id)}
                        style={({ pressed }) => [s.dangerBtnOutline, pressed && { opacity: 0.7 }]}>
                        <Text style={s.dangerBtnOutlineText}>Revoke</Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * "Check for updates" row — manual entry point into the auto-updater.
 * Shown only on Android (web/iOS hide since they don't have a sideloaded
 * APK to swap). Owns its own UpdateSheet so the modal lifecycle is local.
 */
function AppUpdateSection({ s }: { s: Styles }) {
  const updater = useAutoUpdate();
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!updater.supported) return null;
  const { stage, lastCheckedAt, error } = updater.state;
  const latest = updater.state.availability?.latest;

  const statusLine = (() => {
    if (stage === 'checking') return 'Checking…';
    if (stage === 'available' && latest) return `Update available — v${latest.version}`;
    if (stage === 'up-to-date') return 'You’re on the latest version.';
    if (stage === 'error' && error) return error;
    if (lastCheckedAt) {
      const ago = Date.now() - lastCheckedAt;
      if (ago < 60_000) return 'Checked just now.';
      const m = Math.round(ago / 60_000);
      return `Checked ${m}m ago.`;
    }
    return 'Tap to check for new builds.';
  })();

  const handlePrimary = async () => {
    if (stage === 'available') {
      setSheetOpen(true);
      return;
    }
    await updater.check();
  };

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>APP UPDATES</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>Shinsa for Android</Text>
        <Text style={s.cardHint}>
          You have v{updater.currentVersion.version} (build {updater.currentVersion.versionCode}).{' '}
          New builds download and install in-app — Android still asks you to confirm.
        </Text>
        <Text style={[s.cardHint, stage === 'error' && { color: '#fca5a5' }]}>
          {statusLine}
        </Text>
        <Pressable
          onPress={handlePrimary}
          disabled={stage === 'checking' || stage === 'downloading' || stage === 'installing'}
          style={({ pressed }) => [
            s.primaryBtn,
            (stage === 'checking' || stage === 'downloading' || stage === 'installing') && { opacity: 0.6 },
            pressed && { opacity: 0.85 },
          ]}>
          {stage === 'checking' ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={s.primaryBtnText}>
              {stage === 'available' ? 'See update' : 'Check for updates'}
            </Text>
          )}
        </Pressable>
      </View>
      <UpdateSheet
        visible={sheetOpen}
        updater={updater}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

function PushNotificationsSection({ s }: { s: Styles }) {
  const { status, enable, disable } = useWebPush();

  // On native, the hook reports `supported: false` (we'll wire APNS/FCM
  // later). Hide the whole section until then so iOS users don't see a
  // dead toggle.
  if (!status.supported) return null;

  const isOn = status.active;
  const isDenied = status.permission === 'denied';

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>NOTIFICATIONS</Text>
      <View style={s.notifCard}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.notifTitle}>System notifications</Text>
          <Text style={s.notifBody}>
            {isDenied
              ? 'Notifications are blocked in your browser settings. Re-enable them, then come back to turn this on.'
              : isOn
                ? 'You\'ll get pushes even when this tab is closed. Tap a notification to jump back in.'
                : 'Get pushes for replies, weekly challenge results, and squad chats — even when the tab is closed.'}
          </Text>
          {status.error ? <Text style={s.notifError}>{status.error}</Text> : null}
        </View>
        <Pressable
          onPress={() => (isOn ? disable() : enable())}
          disabled={status.syncing || isDenied}
          style={({ pressed }) => [
            s.notifToggle,
            isOn && s.notifToggleOn,
            (status.syncing || isDenied) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}>
          <Text style={[s.notifToggleText, isOn && s.notifToggleTextOn]}>
            {status.syncing ? '…' : isOn ? 'On' : 'Enable'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Render the Appearance segment picker. Used by both mobile (inline in the
 * scroll) and the desktop right pane.
 */
function AppearanceSection({ s }: { s: Styles }) {
  const { preference, setPreference } = useTheme();
  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>APPEARANCE</Text>
      <View style={s.segments}>
        {PREFERENCE_OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && { opacity: 0.7 }]}>
              <Text style={[s.segmentText, active && s.segmentTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The desktop Account screen — Linear/Stripe-style settings shell. */
type AccountSectionKey = 'appearance' | 'integrations' | 'api' | 'notifications' | 'updates' | 'signout';

interface AccountNavItem {
  key: AccountSectionKey;
  label: string;
  hint: string;
}

const ACCOUNT_NAV: AccountNavItem[] = [
  { key: 'appearance', label: 'Appearance', hint: 'Theme' },
  { key: 'integrations', label: 'Integrations', hint: 'PIUGame, YouTube' },
  { key: 'api', label: 'API Access', hint: 'Personal tokens' },
  { key: 'notifications', label: 'Notifications', hint: 'Web push' },
  { key: 'updates', label: 'App updates', hint: 'Check for new builds' },
  { key: 'signout', label: 'Sign out', hint: '' },
];

function AccountDesktop({ s, userId }: { s: Styles; userId: string }) {
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const [active, setActive] = useState<AccountSectionKey>('appearance');

  const renderPane = () => {
    switch (active) {
      case 'appearance':
        return <AppearanceSection s={s} />;
      case 'integrations':
        return (
          <View style={s.deskGroup}>
            <PiugameLinkSection s={s} userId={userId} />
            <YoutubeLinkSection s={s} />
          </View>
        );
      case 'api':
        return <ApiTokensSection s={s} />;
      case 'notifications':
        return <PushNotificationsSection s={s} />;
      case 'updates':
        return <AppUpdateSection s={s} />;
      case 'signout':
        return (
          <View style={s.section}>
            <Text style={s.eyebrow}>SIGN OUT</Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>End this session</Text>
              <Text style={s.cardHint}>
                You'll need to sign in again to access your scores, posts, and conversations.
              </Text>
              <Pressable
                onPress={signOut}
                style={({ pressed }) => [s.logoutBtn, { marginTop: 0 }, pressed && { opacity: 0.6 }]}>
                <Text style={s.logoutText}>Log out</Text>
              </Pressable>
            </View>
          </View>
        );
    }
  };

  return (
    <View style={s.deskRoot}>
      <View style={s.deskTopBar}>
        <Text style={s.deskHeading}>Settings</Text>
        <TopBar />
      </View>
      <View style={s.deskBody}>
        <View style={s.deskNav}>
          {ACCOUNT_NAV.map((item) => {
            const isActive = active === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setActive(item.key)}
                onHoverIn={() => undefined}
                onHoverOut={() => undefined}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  s.deskNavRow,
                  hovered && !isActive && { backgroundColor: theme.surfaceMuted },
                  isActive && s.deskNavRowActive,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={[s.deskNavLabel, isActive && s.deskNavLabelActive]}>{item.label}</Text>
                {item.hint ? (
                  <Text style={[s.deskNavHint, isActive && { color: theme.accent }]}>{item.hint}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={s.deskPane} contentContainerStyle={s.deskPaneContent}>
          {renderPane()}
        </ScrollView>
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const s = useThemedStyles(makeStyles);
  const { isDesktop } = useBreakpoint();

  if (!user) return null;

  if (isDesktop) {
    return <AccountDesktop s={s} userId={user.id} />;
  }

  return (
    <View style={s.container}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
          <View style={s.topBar}>
            <TopBar />
          </View>

          <PiugameLinkSection s={s} userId={user.id} />
          <HeartRateSection s={s} />
          <YoutubeLinkSection s={s} />
          <ApiTokensSection s={s} />
          <AppearanceSection s={s} />
          <PushNotificationsSection s={s} />
          <AppUpdateSection s={s} />

          <Pressable onPress={signOut} style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.logoutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, paddingBottom: 80, gap: 18 },
  topBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingBottom: 8 },
  heading: { flex: 1, fontSize: 26, fontWeight: '800' as const, color: t.text, letterSpacing: 1.5 },

  section: { gap: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 2,
    color: t.accent,
    textTransform: 'uppercase' as const,
  },

  card: {
    backgroundColor: t.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' as const, color: t.text },
  cardHint: { fontSize: 12, color: t.textMuted, lineHeight: 17 },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  rowLabel: { fontSize: 12, color: t.textMuted },
  rowValue: { fontSize: 12, color: t.text, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },

  linkedPill: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    marginTop: 4,
  },
  linkedPillText: { fontSize: 10, fontWeight: '900' as const, color: '#34d399', letterSpacing: 0.8 },

  // YouTube channel row: thumbnail + channel title + linked pill.
  ytChannelRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  ytThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  ytThumbFallback: { alignItems: 'center' as const, justifyContent: 'center' as const },
  ytChannelTitle: { fontSize: 15, fontWeight: '800' as const, color: t.text },

  input: {
    backgroundColor: t.surfaceMuted,
    color: t.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },

  syncBtnGroup: { gap: 8 },
  syncBtnRow: { flexDirection: 'row' as const, gap: 8 },

  primaryBtn: {
    backgroundColor: t.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryBtnText: { color: t.textOnAccent, fontSize: 14, fontWeight: '800' as const, letterSpacing: 0.5 },

  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  secondaryBtnText: { color: t.text, fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.3 },

  progressWrap: { gap: 6 },
  progressLabel: { fontSize: 11, color: t.text, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  progressBar: { height: 8, borderRadius: 999, backgroundColor: t.surfaceMuted, overflow: 'hidden' as const },
  progressFill: { height: '100%' as const, backgroundColor: t.accent },

  feedback: { fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
  feedbackOk: { color: '#34d399' },
  feedbackErr: { color: t.danger },

  unlinkBtn: {
    marginTop: 4,
    paddingVertical: 8,
    alignItems: 'center' as const,
  },
  unlinkText: { color: t.danger, fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.3 },

  segments: { flexDirection: 'row' as const, backgroundColor: t.card, borderRadius: 10, borderWidth: 1, borderColor: t.border, padding: 3 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' as const },
  segmentActive: { backgroundColor: t.accent },
  segmentText: { fontSize: 13, fontWeight: '700' as const, color: t.textMuted },
  segmentTextActive: { color: t.textOnAccent },

  logoutBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.danger,
    alignItems: 'center' as const,
  },
  logoutText: { color: t.danger, fontWeight: '700' as const, fontSize: 15 },

  // Notifications card (web push)
  notifCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
  },
  notifTitle: { fontSize: 14, fontWeight: '900' as const, color: t.text },
  notifBody: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  notifError: { fontSize: 11, color: t.danger, marginTop: 2 },
  notifToggle: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: t.surfaceMuted,
    borderWidth: 1,
    borderColor: t.border,
  },
  notifToggleOn: { backgroundColor: t.accent, borderColor: t.accent },
  notifToggleText: { fontSize: 12, fontWeight: '900' as const, color: t.text, letterSpacing: 0.4 },
  notifToggleTextOn: { color: t.bg },

  // Desktop ("deskX") — settings-shell layout. Single-column scroll above
  // becomes a fixed left nav + scrollable right pane.
  deskRoot: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 24, paddingTop: 18 },
  deskTopBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  deskHeading: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: t.text,
    letterSpacing: 0.5,
  },
  // API tokens — "copy once" card + token rows. Amber accents to flag that
  // the plaintext value is sensitive and won't reappear.
  tokenJustCreated: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 158, 11, 0.55)',
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    padding: 12,
    gap: 8,
  },
  tokenJustCreatedEyebrow: {
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
    color: '#fbbf24',
  },
  tokenJustCreatedHint: { fontSize: 11, color: t.text, lineHeight: 16 },
  tokenJustCreatedValue: {
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
    color: t.text,
    backgroundColor: t.bg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tokenJustCreatedActions: { flexDirection: 'row' as const, gap: 8 },
  copyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fbbf24',
  },
  copyBtnText: { fontSize: 12, fontWeight: '900' as const, color: '#000', letterSpacing: 0.4 },
  copyBtnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  copyBtnSecondaryText: { fontSize: 12, fontWeight: '700' as const, color: t.text },

  snippetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
  },
  snippetLabel: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  snippetHint: { fontSize: 11, color: t.textMuted, lineHeight: 16 },
  snippetCopyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    backgroundColor: t.surfaceMuted,
  },
  snippetCopyBtnText: { fontSize: 11, fontWeight: '800' as const, color: t.text, letterSpacing: 0.4 },
  snippetBlockScroll: {
    maxHeight: 220,
    backgroundColor: t.bg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  snippetBlock: {
    fontSize: 11,
    lineHeight: 16,
    color: t.text,
    fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  tokenRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: t.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
  },
  tokenRowName: { fontSize: 13, fontWeight: '800' as const, color: t.text },
  tokenRevokedTag: { fontSize: 10, fontWeight: '900' as const, color: t.textDim, letterSpacing: 1 },
  tokenRowMeta: { fontSize: 11, color: t.textMuted },
  dangerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    alignItems: 'center' as const,
  },
  dangerBtnText: { fontSize: 12, fontWeight: '900' as const, color: '#fca5a5' },
  dangerBtnOutline: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    alignItems: 'center' as const,
  },
  dangerBtnOutlineText: { fontSize: 12, fontWeight: '800' as const, color: '#fca5a5' },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    alignItems: 'center' as const,
  },
  cancelBtnText: { fontSize: 11, fontWeight: '700' as const, color: t.textMuted },

  deskBody: { flex: 1, flexDirection: 'row' as const, gap: 24, paddingTop: 18 },
  deskNav: { width: 220, gap: 2 },
  deskNavRow: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 2,
  },
  deskNavRowActive: { backgroundColor: t.accentTint },
  deskNavLabel: { fontSize: 13.5, fontWeight: '700' as const, color: t.text },
  deskNavLabelActive: { color: t.accent, fontWeight: '800' as const },
  deskNavHint: { fontSize: 11, color: t.textDim },
  deskPane: { flex: 1 },
  deskPaneContent: { gap: 18, paddingBottom: 40, maxWidth: 720 },
  deskGroup: { gap: 18 },
});
