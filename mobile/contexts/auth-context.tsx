import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api';
import { clearToken, getToken, setToken } from '@/lib/storage';
import type { User } from '@shared/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BOOTSTRAP_ME_TIMEOUT_MS = 9000;
const BOOTSTRAP_MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reject if `promise` doesn't settle within `ms`. The API client already
// aborts fetches at 8s, but that timer only covers the fetch itself — not the
// SecureStore/localStorage token read, and it can be throttled when the app is
// resuming from the background. This independent ceiling guarantees the splash
// never hangs forever waiting on a stalled request.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

function isAuthRejection(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Bound the token read — SecureStore shouldn't hang, but if it does we
      // must not freeze on the splash.
      let token: string | null = null;
      try {
        token = await withTimeout(Promise.resolve(getToken()), 4000);
      } catch {
        token = null;
      }
      if (cancelled) return;
      if (!token) {
        setLoading(false);
        return;
      }

      // Validate the session. A stalled /me on a cold or resumed launch is the
      // usual cause of "stuck on loading" — so each attempt is time-boxed and
      // we retry a couple times. Only a real auth rejection (401/403) clears
      // the token; a network/timeout failure keeps it (a transient blip must
      // not silently log the user out) and never blocks the splash forever.
      for (let attempt = 1; attempt <= BOOTSTRAP_MAX_ATTEMPTS && !cancelled; attempt++) {
        try {
          const me = await withTimeout(authApi.me(), BOOTSTRAP_ME_TIMEOUT_MS);
          if (!cancelled) setUser(me);
          break;
        } catch (err) {
          if (isAuthRejection(err)) {
            await clearToken();
            if (!cancelled) setUser(null);
            break;
          }
          if (attempt < BOOTSTRAP_MAX_ATTEMPTS) await delay(700 * attempt);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const { user: u, token } = await authApi.login({ username: username.trim(), password });
    await setToken(token);
    setUser(u);
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    const { user: u, token } = await authApi.register({ username: username.trim(), password });
    await setToken(token);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      // Token may be invalid — caller can decide whether to sign out.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut, refreshUser }),
    [user, loading, signIn, signUp, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
