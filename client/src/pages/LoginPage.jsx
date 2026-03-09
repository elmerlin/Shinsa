import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createQrLoginChallenge, getQrLoginChallengeQrUrl, login, pollQrLoginChallenge } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

function getSafeRedirectTarget(value) {
  const target = String(value || '').trim();
  if (!target.startsWith('/')) return '/';
  if (target.startsWith('//')) return '/';
  return target || '/';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = useMemo(() => getSafeRedirectTarget(searchParams.get('redirect')), [searchParams]);
  const showQrLogin = useMemo(() => !redirectTarget.startsWith('/login/approve'), [redirectTarget]);
  const { loginUser, user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrRefreshKey, setQrRefreshKey] = useState(0);
  const [qrState, setQrState] = useState({
    loading: true,
    error: '',
    challengeId: '',
    claimToken: '',
    approveUrl: '',
    qrImageUrl: '',
    expiresAt: '',
  });

  useEffect(() => {
    if (authLoading || !user) return;
    navigate(redirectTarget, { replace: true });
  }, [authLoading, user, navigate, redirectTarget]);

  useEffect(() => {
    if (authLoading || user || !showQrLogin) {
      setQrState((current) => ({ ...current, loading: false }));
      return undefined;
    }
    let active = true;
    setQrState((current) => ({
      ...current,
      loading: true,
      error: '',
      challengeId: '',
      claimToken: '',
      approveUrl: '',
      qrImageUrl: '',
      expiresAt: '',
    }));

    createQrLoginChallenge()
      .then((payload) => {
        if (!active) return;
        setQrState({
          loading: false,
          error: '',
          challengeId: payload.challengeId || '',
          claimToken: payload.claimToken || '',
          approveUrl: payload.approveUrl || '',
          qrImageUrl: payload.challengeId ? getQrLoginChallengeQrUrl(payload.challengeId) : '',
          expiresAt: payload.expiresAt || '',
        });
      })
      .catch((err) => {
        if (!active) return;
        setQrState((current) => ({
          ...current,
          loading: false,
          error: err.message || 'Failed to create QR login',
        }));
      });

    return () => {
      active = false;
    };
  }, [authLoading, qrRefreshKey, showQrLogin, user]);

  useEffect(() => {
    if (
      authLoading
      || user
      || !qrState.challengeId
      || !qrState.claimToken
      || qrState.loading
      || qrState.error
      || !showQrLogin
    ) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    const scheduleNext = (delayMs = 2500) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(runPoll, delayMs);
    };

    const runPoll = async () => {
      try {
        const payload = await pollQrLoginChallenge(qrState.challengeId, qrState.claimToken);
        if (cancelled) return;
        if (payload.status === 'approved' && payload.token && payload.user) {
          loginUser(payload.user, payload.token);
          navigate(redirectTarget, { replace: true });
          return;
        }
        if (payload.status === 'expired') {
          setQrState((current) => ({
            ...current,
            error: 'This QR code expired. Generate a fresh one to continue.',
          }));
          return;
        }
        if (payload.status === 'consumed') {
          setQrState((current) => ({
            ...current,
            error: 'This QR code was already used. Generate a fresh one to continue.',
          }));
          return;
        }
        scheduleNext(payload.pollAfterMs || 2500);
      } catch (err) {
        if (cancelled) return;
        const message = String(err?.message || '');
        if (/expired/i.test(message)) {
          setQrState((current) => ({
            ...current,
            error: 'This QR code expired. Generate a fresh one to continue.',
          }));
          return;
        }
        if (/not found|invalid qr login claim token/i.test(message)) {
          setQrState((current) => ({
            ...current,
            error: 'This QR login request is no longer valid. Generate a fresh one to continue.',
          }));
          return;
        }
        scheduleNext(4000);
      }
    };

    scheduleNext(1200);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [
    authLoading,
    loginUser,
    navigate,
    qrState.challengeId,
    qrState.claimToken,
    qrState.error,
    qrState.loading,
    redirectTarget,
    showQrLogin,
    user,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user: authUser, token } = await login(form);
      loginUser(authUser, token);
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshQr = () => {
    setQrRefreshKey((value) => value + 1);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      <div className={`grid gap-6 ${showQrLogin ? 'lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]' : 'max-w-md mx-auto'}`}>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <p className="text-xs font-display tracking-[0.35em] text-piu-accent/80 mb-2">PASSWORD LOGIN</p>
            <h1 className="text-3xl font-display font-bold tracking-wider">LOGIN</h1>
            <p className="text-sm text-gray-400 mt-2">
              {showQrLogin
                ? 'Use your Pump Alias and password, or scan the QR code from a phone already signed into Shinsa.'
                : 'Sign in on this phone so you can approve the browser login request.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Pump Alias</label>
            <input
              type="text"
              className="input-field"
              placeholder="Your username"
              value={form.username}
              onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-piu-accent hover:underline">Register</Link>
          </p>
        </form>

        {showQrLogin ? (
          <section className="card border-piu-accent/30 bg-gradient-to-br from-piu-card to-[#061332]">
            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div className="w-full max-w-[320px] mx-auto md:mx-0 shrink-0">
                <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                  {qrState.loading ? (
                    <div className="aspect-square w-full rounded-xl bg-slate-100 animate-pulse" />
                  ) : qrState.qrImageUrl && !qrState.error ? (
                    <img
                      src={qrState.qrImageUrl}
                      alt="QR code to approve login from your phone"
                      className="block w-full rounded-xl"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-xl bg-slate-100 flex items-center justify-center text-center text-sm text-slate-500 px-6">
                      Unable to generate QR code
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-xs font-display tracking-[0.35em] text-piu-gold/80 mb-2">PASSWORDLESS LOGIN</p>
                  <h2 className="text-2xl font-display font-bold tracking-wide">Scan With Your Phone</h2>
                  <p className="text-sm text-gray-300 mt-2">
                    If you&apos;re already signed into Shinsa on mobile, scan this code, approve the login, and this browser
                    will sign in automatically.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-piu-dark/40 px-4 py-3">
                    <p className="text-[11px] font-display tracking-[0.28em] text-piu-accent/80">1</p>
                    <p className="text-sm text-white mt-1">Open your phone camera and scan the code.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-piu-dark/40 px-4 py-3">
                    <p className="text-[11px] font-display tracking-[0.28em] text-piu-accent/80">2</p>
                    <p className="text-sm text-white mt-1">Confirm the login on your phone.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-piu-dark/40 px-4 py-3">
                    <p className="text-[11px] font-display tracking-[0.28em] text-piu-accent/80">3</p>
                    <p className="text-sm text-white mt-1">This shared browser logs in automatically.</p>
                  </div>
                </div>

                {qrState.error ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {qrState.error}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    Waiting for approval from your phone.
                  </div>
                )}

                {qrState.approveUrl && (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-display tracking-[0.28em] text-gray-400">PHONE LINK</p>
                    <a
                      href={qrState.approveUrl}
                      className="mt-2 block break-all text-sm text-piu-accent hover:underline"
                    >
                      {qrState.approveUrl}
                    </a>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-secondary" onClick={handleRefreshQr}>
                    Refresh QR
                  </button>
                  {qrState.expiresAt && (
                    <span className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs text-gray-400">
                      Expires soon for shared-space safety
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
