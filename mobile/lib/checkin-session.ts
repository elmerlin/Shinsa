import * as SecureStore from 'expo-secure-store';

/**
 * Persistent per-install client_session_id sent to /api/checkins/proximity
 * so the server can prove proximity pings come from the *same* device that
 * started the active checkin. Without this, anyone could ping the venue
 * coordinates and prevent another user's auto-checkout.
 *
 * Mirrors `client/src/utils/checkinClient.js` on the desktop, but persists
 * via expo-secure-store (RN doesn't have localStorage) and falls back to
 * window.localStorage on the mobile web build where SecureStore is a
 * no-op shim.
 */
const STORAGE_KEY = 'shinsa_checkin_client_id';

function generate(): string {
  // crypto.randomUUID isn't always available on RN's Hermes — fall back
  // to a timestamp+random combo that's still unique-enough for the
  // server's session matching.
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (typeof c?.randomUUID === 'function') {
      return c.randomUUID().replace(/-/g, '');
    }
  } catch {
    /* fall through */
  }
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

let cached: string | null = null;

export async function getCheckinClientSessionId(): Promise<string> {
  if (cached) return cached;

  // Web path: SecureStore.getItemAsync is a no-op on web that always
  // resolves to null. Use localStorage there so the session id survives
  // refreshes — same behavior the desktop client relies on.
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) {
        cached = existing;
        return existing;
      }
      const created = generate();
      window.localStorage.setItem(STORAGE_KEY, created);
      cached = created;
      return created;
    } catch {
      // localStorage can throw in private modes; fall through to generate.
    }
  }

  try {
    const existing = await SecureStore.getItemAsync(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const created = generate();
    await SecureStore.setItemAsync(STORAGE_KEY, created);
    cached = created;
    return created;
  } catch {
    // SecureStore can fail (e.g. emulator with no keystore). Last resort:
    // an in-memory id that resets on app restart. The server will treat
    // this as a fresh client, which is the correct fallback.
    if (!cached) cached = generate();
    return cached;
  }
}
