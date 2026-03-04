const MIN_HAPTIC_GAP_MS = 60;
let lastHapticAt = 0;

function isStandalonePwaMode() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  if (typeof document !== 'undefined' && String(document.referrer || '').startsWith('android-app://')) {
    return true;
  }
  if (typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
  );
}

function isTouchCapable() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window);
}

function canVibrateNow() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (!isTouchCapable()) return false;
  if (!isStandalonePwaMode()) return false;
  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_GAP_MS) return false;
  lastHapticAt = now;
  return true;
}

export function triggerPumpReactionHaptic(payload = null) {
  if (!canVibrateNow()) return false;
  const action = String(payload?.action || '').toLowerCase();
  const hasPumpedFlag = Object.prototype.hasOwnProperty.call(payload || {}, 'pumped');
  const pumped = hasPumpedFlag ? !!payload?.pumped : null;
  const isPumpOn = pumped === true || action === 'pumped';
  const isPumpOff = pumped === false || action === 'unpumped';

  const pattern = isPumpOn ? [14, 18, 16] : (isPumpOff ? [10] : [12]);
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

