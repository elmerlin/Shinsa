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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useTheme, type ThemePreference } from '@/contexts/theme-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useWebPush } from '@/hooks/use-web-push';
import { externalApi, piugameApi, youtubeApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';
import type { ApiTokenRow } from '@shared/api';

const PREFERENCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
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
      setFeedback({
        tone: 'ok',
        text: `Synced ${data.plays_count ?? 0} recent plays · ${data.scores_updated ?? 0} best scores updated`,
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
            encrypted at rest and only used to log in to piugame.com.
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

  const tokens: ApiTokenRow[] = tokensQuery.data?.tokens || [];

  return (
    <View style={s.section}>
      <Text style={s.eyebrow}>API ACCESS</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>Personal access tokens</Text>
        <Text style={s.cardHint}>
          Let another app you own pull your data from pumpshinsa. Today this exposes daily step counts
          (every judgement that isn&rsquo;t a miss) at{'\n'}
          GET /api/external/steps?from=YYYY-MM-DD&amp;to=YYYY-MM-DD{'\n'}
          Send the token as Authorization: Bearer &lt;token&gt;.
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
type AccountSectionKey = 'appearance' | 'integrations' | 'api' | 'notifications' | 'signout';

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
          <View style={s.topBar}>
            <TopBar />
          </View>

          <PiugameLinkSection s={s} userId={user.id} />
          <YoutubeLinkSection s={s} />
          <ApiTokensSection s={s} />
          <AppearanceSection s={s} />
          <PushNotificationsSection s={s} />

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
