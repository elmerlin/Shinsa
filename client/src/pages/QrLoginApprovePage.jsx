import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { approveQrLoginChallenge, getQrLoginChallenge } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

function getSafeRedirectTarget(value) {
  const target = String(value || '').trim();
  if (!target.startsWith('/')) return '/';
  if (target.startsWith('//')) return '/';
  return target || '/';
}

export default function QrLoginApprovePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const challengeId = String(searchParams.get('challenge') || '').trim();
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [approving, setApproving] = useState(false);
  const redirectTarget = useMemo(
    () => getSafeRedirectTarget(`/login/approve?challenge=${encodeURIComponent(challengeId)}`),
    [challengeId]
  );

  useEffect(() => {
    if (!challengeId) {
      setLoading(false);
      setError('This QR login link is missing a challenge id.');
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    getQrLoginChallenge(challengeId)
      .then((payload) => {
        if (!active) return;
        setChallenge(payload);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Unable to load QR login request');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [challengeId]);

  const handleApprove = async () => {
    if (!challengeId) return;
    setApproving(true);
    setError('');
    try {
      const payload = await approveQrLoginChallenge(challengeId);
      setChallenge((current) => ({
        ...(current || {}),
        status: payload.status || 'approved',
        approvedUsername: payload.approvedUsername || user?.username || '',
      }));
      setSuccessMessage('Approved. The shared browser will sign in automatically.');
    } catch (err) {
      setError(err.message || 'Unable to approve QR login');
    } finally {
      setApproving(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="card text-center py-10">
          <p className="text-sm text-gray-400">Loading QR login request...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">
      <div className="card space-y-5">
        <div>
          <p className="text-xs font-display tracking-[0.35em] text-piu-accent/80 mb-2">PHONE APPROVAL</p>
          <h1 className="text-3xl font-display font-bold tracking-wider">Approve Browser Login</h1>
          <p className="text-sm text-gray-400 mt-2">
            Confirm this to log a shared browser into your Shinsa account without typing your password there.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-piu-dark/40 px-4 py-4 space-y-2">
          <p className="text-[11px] font-display tracking-[0.28em] text-gray-400">TARGET BROWSER</p>
          <p className="text-lg font-display font-bold text-white">{challenge?.browserLabel || 'Shared browser'}</p>
          <p className="text-sm text-gray-400">Site: pumpshinsa.com</p>
          {challenge?.approvedUsername && (
            <p className="text-sm text-emerald-300">Already approved by {challenge.approvedUsername}.</p>
          )}
        </div>

        {challenge?.status === 'approved' || challenge?.status === 'consumed' ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-200">
            This login request is already approved. You can return to the shared browser now.
          </div>
        ) : challenge?.status === 'expired' ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-200">
            This QR login request has expired. Please go back to the shared browser and generate a new code.
          </div>
        ) : !user ? (
          <div className="rounded-2xl border border-piu-accent/20 bg-piu-accent/10 px-4 py-4 space-y-3">
            <p className="text-sm text-gray-200">You need to be signed in on this phone before you can approve the login.</p>
            <Link
              to={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
              state={{ from: location.pathname + location.search }}
              className="btn-primary inline-flex"
            >
              Sign in on phone
            </Link>
          </div>
        ) : (
          <button type="button" className="btn-primary w-full" onClick={handleApprove} disabled={approving}>
            {approving ? 'Approving...' : `Approve as ${user.username}`}
          </button>
        )}

        <p className="text-xs text-gray-500">
          Tip: after you&apos;re done at the Dojo, log out on the shared browser so nobody else can access your account.
        </p>
      </div>
    </div>
  );
}
