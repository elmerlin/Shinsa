import * as Application from 'expo-application';
// expo-file-system 19 moved cacheDirectory / createDownloadResumable /
// deleteAsync / getContentUriAsync to the /legacy entrypoint — the
// top-level export now throws a deprecation Error which was breaking
// the update flow with "Method createDownloadResumable ... is
// deprecated". Migrating to the new File/Directory API is a bigger
// rewrite; the legacy import keeps the existing call sites working.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

/**
 * In-app auto-update for the sideloaded Shinsa Android APK.
 *
 * Flow:
 *   1. `checkLatest()` GETs the static manifest at /download/latest.json.
 *   2. Compares manifest.versionCode against the running app's
 *      `Application.nativeBuildVersion` (Android `versionCode` as string).
 *   3. If newer, the consumer renders the update banner / sheet, calls
 *      `downloadApk()` with a progress callback, then `installApk()`
 *      which hands the file to Android's system installer.
 *
 * Only Android is supported. iOS gets updates via the App Store; web
 * always loads the freshest bundle. The hook returns `supported: false`
 * on those platforms so the UI can hide the row entirely.
 */

export const UPDATE_MANIFEST_URL = 'https://pumpshinsa.com/download/latest.json';
const APK_CACHE_PATH = `${FileSystem.cacheDirectory ?? ''}shinsa-update.apk`;

export interface UpdateManifest {
  version: string;
  versionCode: number;
  apkUrl: string;
  size?: number;
  sha256?: string;
  releasedAt?: string;
  notes?: string;
  mandatory?: boolean;
}

export interface CurrentVersion {
  version: string;
  versionCode: number;
}

export interface UpdateAvailability {
  current: CurrentVersion;
  latest: UpdateManifest;
  /** true when latest.versionCode > current.versionCode. */
  hasUpdate: boolean;
}

/** True when the auto-updater can actually do anything on this platform. */
export const AUTO_UPDATE_SUPPORTED = Platform.OS === 'android';

export function getCurrentVersion(): CurrentVersion {
  const version = String(Application.nativeApplicationVersion ?? '0.0.0');
  // `nativeBuildVersion` on Android is the versionCode as a string. On
  // iOS / web it's something else, but we only read it when supported.
  const codeRaw = String(Application.nativeBuildVersion ?? '0');
  const parsed = parseInt(codeRaw, 10);
  const versionCode = Number.isFinite(parsed) ? parsed : 0;
  return { version, versionCode };
}

export async function checkLatest(): Promise<UpdateAvailability> {
  const current = getCurrentVersion();
  // Bust caches: nginx puts no explicit cache header on latest.json today,
  // but a stale Cloudflare/browser cache would defeat the whole feature.
  const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Manifest fetch failed (${res.status})`);
  const raw = (await res.json()) as Partial<UpdateManifest>;
  const versionCode = Number(raw?.versionCode);
  const apkUrl = String(raw?.apkUrl || '');
  if (!Number.isFinite(versionCode) || versionCode <= 0 || !apkUrl) {
    throw new Error('Manifest is missing versionCode or apkUrl');
  }
  const latest: UpdateManifest = {
    version: String(raw?.version || ''),
    versionCode,
    apkUrl,
    size: typeof raw?.size === 'number' ? raw.size : undefined,
    sha256: typeof raw?.sha256 === 'string' ? raw.sha256 : undefined,
    releasedAt: typeof raw?.releasedAt === 'string' ? raw.releasedAt : undefined,
    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
    mandatory: !!raw?.mandatory,
  };
  return {
    current,
    latest,
    hasUpdate: AUTO_UPDATE_SUPPORTED && latest.versionCode > current.versionCode,
  };
}

export interface DownloadProgress {
  bytesWritten: number;
  totalBytes: number;
  /** 0..1 — undefined when totalBytes isn't known. */
  fraction?: number;
}

/**
 * Downloads the APK to the app's cache dir with progress callbacks.
 * Returns the local file URI suitable for `installApk()`. The cached
 * file is overwritten on each call so a half-downloaded file from a
 * previous attempt can't get installed by accident.
 */
export async function downloadApk(
  apkUrl: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  if (!AUTO_UPDATE_SUPPORTED) {
    throw new Error('Auto-update only available on Android');
  }
  // Best-effort: clear any stale cached APK so disk doesn't bloat.
  try {
    await FileSystem.deleteAsync(APK_CACHE_PATH, { idempotent: true });
  } catch {
    /* ignore */
  }

  const resumable = FileSystem.createDownloadResumable(
    apkUrl,
    APK_CACHE_PATH,
    {},
    (p) => {
      if (!onProgress) return;
      const total = p.totalBytesExpectedToWrite || 0;
      onProgress({
        bytesWritten: p.totalBytesWritten || 0,
        totalBytes: total,
        fraction: total > 0 ? p.totalBytesWritten / total : undefined,
      });
    },
  );
  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error('APK download failed');
  return result.uri;
}

/**
 * Hands the downloaded APK to Android's system installer via an ACTION_VIEW
 * intent with a content:// URI (Android 7+ blocks file:// for cross-app
 * data). The user sees the standard "Install update?" sheet — Android also
 * prompts them once to grant "install unknown apps" to Shinsa if they
 * haven't already.
 */
export async function installApk(localUri: string): Promise<void> {
  if (!AUTO_UPDATE_SUPPORTED) {
    throw new Error('Auto-update only available on Android');
  }
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (0x10000000)
    flags: 1 | 0x10000000,
  });
}
