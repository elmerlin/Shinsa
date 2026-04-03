function toInt(value) {
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toSqliteDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseSqliteDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLoginLockoutStatus(user, now = new Date()) {
  const lockedUntil = parseSqliteDateTime(user?.login_locked_until);
  if (!lockedUntil || lockedUntil <= now) {
    return {
      locked: false,
      lockedUntil: null,
      retryAfterMs: 0,
    };
  }

  return {
    locked: true,
    lockedUntil,
    retryAfterMs: Math.max(0, lockedUntil.getTime() - now.getTime()),
  };
}

function buildFailedLoginState(user, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const threshold = Math.max(1, toInt(options.threshold) || 5);
  const lockoutMs = Math.max(1000, toInt(options.lockoutMs) || (15 * 60 * 1000));
  const existingAttempts = Math.max(0, toInt(user?.failed_login_attempts));
  const nextAttempts = existingAttempts + 1;
  const shouldLock = nextAttempts >= threshold;
  const lockedUntil = shouldLock ? new Date(now.getTime() + lockoutMs) : null;

  return {
    failedAttempts: nextAttempts,
    loginLockedUntil: lockedUntil ? toSqliteDateTime(lockedUntil) : '',
    shouldLock,
    lockedUntil,
  };
}

function createLoginRateLimiter(options = {}) {
  const windowMs = Math.max(1000, toInt(options.windowMs) || (10 * 60 * 1000));
  const maxAttempts = Math.max(1, toInt(options.maxAttempts) || 10);
  const attemptsByKey = new Map();

  function prune(nowMs) {
    for (const [key, attempts] of attemptsByKey.entries()) {
      const freshAttempts = attempts.filter((value) => (nowMs - value) < windowMs);
      if (freshAttempts.length === 0) {
        attemptsByKey.delete(key);
      } else {
        attemptsByKey.set(key, freshAttempts);
      }
    }
  }

  return {
    consume(rawKey, now = Date.now()) {
      const key = String(rawKey || '').trim() || '__anonymous__';
      const nowMs = now instanceof Date ? now.getTime() : Number(now);
      prune(nowMs);
      const attempts = attemptsByKey.get(key) || [];
      const freshAttempts = attempts.filter((value) => (nowMs - value) < windowMs);
      if (freshAttempts.length >= maxAttempts) {
        const retryAfterMs = Math.max(0, windowMs - (nowMs - freshAttempts[0]));
        attemptsByKey.set(key, freshAttempts);
        return {
          allowed: false,
          retryAfterMs,
          remaining: 0,
        };
      }

      freshAttempts.push(nowMs);
      attemptsByKey.set(key, freshAttempts);
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.max(0, maxAttempts - freshAttempts.length),
      };
    },
    reset(rawKey) {
      const key = String(rawKey || '').trim() || '__anonymous__';
      attemptsByKey.delete(key);
    },
  };
}

module.exports = {
  buildFailedLoginState,
  createLoginRateLimiter,
  getLoginLockoutStatus,
  parseSqliteDateTime,
  toSqliteDateTime,
};
