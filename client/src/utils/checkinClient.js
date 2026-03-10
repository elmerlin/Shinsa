const CHECKIN_CLIENT_STORAGE_KEY = 'shinsa_checkin_client_id';

function fallbackClientId() {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCheckinClientSessionId() {
  if (typeof window === 'undefined') return fallbackClientId();

  try {
    const existing = String(window.localStorage.getItem(CHECKIN_CLIENT_STORAGE_KEY) || '').trim();
    if (existing) return existing;

    const created = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID().replace(/-/g, '')
      : fallbackClientId();
    window.localStorage.setItem(CHECKIN_CLIENT_STORAGE_KEY, created);
    return created;
  } catch {
    return fallbackClientId();
  }
}
