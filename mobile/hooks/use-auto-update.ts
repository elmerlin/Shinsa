import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUTO_UPDATE_SUPPORTED,
  checkLatest,
  downloadApk,
  getCurrentVersion,
  installApk,
  type DownloadProgress,
  type UpdateAvailability,
} from '@/lib/auto-update';

type Stage = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'installing' | 'error';

interface State {
  stage: Stage;
  availability: UpdateAvailability | null;
  /** Local cache URI of the downloaded APK, populated once stage === 'ready'. */
  downloadedUri: string | null;
  progress: DownloadProgress | null;
  /** Last error message, surfaced to the UI as a short toast/inline. */
  error: string | null;
  /** Last check timestamp (epoch ms) — UI shows "Checked just now / Xm ago". */
  lastCheckedAt: number | null;
}

const INITIAL_STATE: State = {
  stage: 'idle',
  availability: null,
  downloadedUri: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
};

interface Options {
  /** Run a silent check once on mount. Default false — opt in per-screen. */
  checkOnMount?: boolean;
}

/**
 * React wrapper around `lib/auto-update`. Exposes a Stage state machine
 * so the banner / sheet / Account row can render off the same source of
 * truth. Skips all network work on iOS / web — `supported` is false and
 * consumers should hide the UI entirely.
 */
export function useAutoUpdate(options: Options = {}) {
  const { checkOnMount = false } = options;
  const [state, setState] = useState<State>(INITIAL_STATE);
  // Guard against unmounted setState if the user navigates away mid-download.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const currentVersion = useMemo(() => getCurrentVersion(), []);

  const check = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!AUTO_UPDATE_SUPPORTED) return;
    if (!opts.silent) setState((s) => ({ ...s, stage: 'checking', error: null }));
    try {
      const availability = await checkLatest();
      if (!aliveRef.current) return;
      setState((s) => ({
        ...s,
        availability,
        stage: availability.hasUpdate ? 'available' : 'up-to-date',
        lastCheckedAt: Date.now(),
        error: null,
      }));
    } catch (err) {
      if (!aliveRef.current) return;
      const message = err instanceof Error ? err.message : 'Update check failed';
      // On a silent check, keep the UI quiet — surfacing a banner for a
      // missed manifest fetch on launch would be noisy.
      setState((s) => ({
        ...s,
        stage: opts.silent ? s.stage : 'error',
        error: message,
        lastCheckedAt: Date.now(),
      }));
    }
  }, []);

  const download = useCallback(async () => {
    if (!AUTO_UPDATE_SUPPORTED) return;
    setState((s) => ({ ...s, stage: 'downloading', progress: null, error: null }));
    const apkUrl = state.availability?.latest.apkUrl;
    if (!apkUrl) {
      setState((s) => ({ ...s, stage: 'error', error: 'No APK URL in manifest' }));
      return;
    }
    try {
      const uri = await downloadApk(apkUrl, (progress) => {
        if (!aliveRef.current) return;
        setState((s) => ({ ...s, progress }));
      });
      if (!aliveRef.current) return;
      setState((s) => ({ ...s, stage: 'ready', downloadedUri: uri }));
    } catch (err) {
      if (!aliveRef.current) return;
      const message = err instanceof Error ? err.message : 'Download failed';
      setState((s) => ({ ...s, stage: 'error', error: message }));
    }
  }, [state.availability]);

  const install = useCallback(async () => {
    if (!AUTO_UPDATE_SUPPORTED || !state.downloadedUri) return;
    setState((s) => ({ ...s, stage: 'installing', error: null }));
    try {
      await installApk(state.downloadedUri);
      // Successful invocation hands off to Android's installer — the
      // sheet will be torn down when the app process is replaced. We
      // optimistically stay in 'installing' until then.
    } catch (err) {
      if (!aliveRef.current) return;
      const message = err instanceof Error ? err.message : 'Install handoff failed';
      setState((s) => ({ ...s, stage: 'error', error: message }));
    }
  }, [state.downloadedUri]);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, stage: s.availability?.hasUpdate ? 'available' : 'idle', error: null, progress: null }));
  }, []);

  // Optional silent check on mount — used by the Home banner.
  useEffect(() => {
    if (!checkOnMount || !AUTO_UPDATE_SUPPORTED) return;
    void check({ silent: true });
  }, [checkOnMount, check]);

  return {
    supported: AUTO_UPDATE_SUPPORTED,
    currentVersion,
    state,
    check,
    download,
    install,
    reset,
  };
}
