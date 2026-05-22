import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert helpers.
 *
 * React Native's `Alert` is a NO-OP on react-native-web — the build
 * that serves new.pumpshinsa.com. Any `Alert.alert`-driven confirm or
 * notice therefore silently does nothing in the browser: the dialog
 * never appears, so a button wired to it looks dead.
 *
 * These wrappers fall back to the browser's native `window.confirm` /
 * `window.alert` on web and use RN's `Alert` on iOS/Android.
 */

/** One-button notice. Use for "done" / "failed" style feedback. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

/**
 * Two-button confirm. Runs `onConfirm` only if the user accepts.
 * `destructive` tints the confirm button red on native (ignored on web —
 * the browser confirm has no styling hook).
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  opts: { confirmLabel?: string; destructive?: boolean } = {},
): void {
  const { confirmLabel = 'OK', destructive = false } = opts;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      // No window.confirm available (rare embedded webview) — fail open
      // so the action isn't permanently unreachable.
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
