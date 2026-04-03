const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFailedLoginState,
  createLoginRateLimiter,
  getLoginLockoutStatus,
  parseSqliteDateTime,
} = require('./loginSecurity');

describe('login lockout state', () => {
  it('locks the account on the fifth failed attempt', () => {
    const now = new Date('2026-04-03T15:10:00.000Z');
    const state = buildFailedLoginState(
      { failed_login_attempts: 4, login_locked_until: '' },
      { now, threshold: 5, lockoutMs: 15 * 60 * 1000 }
    );

    assert.equal(state.failedAttempts, 5);
    assert.equal(state.shouldLock, true);
    assert.equal(state.loginLockedUntil, '2026-04-03 15:25:00');
    assert.equal(state.lockedUntil?.toISOString(), '2026-04-03T15:25:00.000Z');
  });

  it('reports an active lockout with retry timing', () => {
    const now = new Date('2026-04-03T15:10:00.000Z');
    const status = getLoginLockoutStatus(
      { login_locked_until: '2026-04-03 15:25:00' },
      now
    );

    assert.equal(status.locked, true);
    assert.equal(status.lockedUntil?.toISOString(), '2026-04-03T15:25:00.000Z');
    assert.equal(status.retryAfterMs, 15 * 60 * 1000);
  });

  it('treats expired lockouts as inactive', () => {
    const now = new Date('2026-04-03T15:26:00.000Z');
    const status = getLoginLockoutStatus(
      { login_locked_until: '2026-04-03 15:25:00' },
      now
    );

    assert.equal(status.locked, false);
    assert.equal(status.retryAfterMs, 0);
    assert.equal(status.lockedUntil, null);
  });
});

describe('login rate limiter', () => {
  it('blocks requests after the configured attempt budget within the window', () => {
    const limiter = createLoginRateLimiter({ windowMs: 60_000, maxAttempts: 3 });
    const base = Date.parse('2026-04-03T15:00:00.000Z');

    assert.equal(limiter.consume('127.0.0.1', base).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', base + 1_000).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', base + 2_000).allowed, true);

    const blocked = limiter.consume('127.0.0.1', base + 3_000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it('allows attempts again after the window elapses', () => {
    const limiter = createLoginRateLimiter({ windowMs: 60_000, maxAttempts: 2 });
    const base = Date.parse('2026-04-03T15:00:00.000Z');

    assert.equal(limiter.consume('127.0.0.1', base).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', base + 1_000).allowed, true);
    assert.equal(limiter.consume('127.0.0.1', base + 2_000).allowed, false);
    assert.equal(limiter.consume('127.0.0.1', base + 61_000).allowed, true);
  });
});

describe('parseSqliteDateTime', () => {
  it('parses sqlite timestamps as UTC', () => {
    const parsed = parseSqliteDateTime('2026-04-03 15:25:00');
    assert.equal(parsed?.toISOString(), '2026-04-03T15:25:00.000Z');
  });
});
