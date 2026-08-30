import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { UserRole } from '../types';

interface AuthUser {
  uid: string;
  email: string | null;
  name: string;
  role: UserRole;
  avatar?: string;
  assignedClasses?: string[];
  /** Subject codes, e.g. "MATH101". Read by TeacherReportEntry to build the
   *  teacher's subject list — was missing from this type despite the server
   *  returning it, so the read silently type-errored. */
  assignedCourses?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  localLogin: (
    usernameOrEmail: string,
    role: UserRole,
    password?: string,
    remember?: boolean,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'edumanage.session';

interface StoredSession {
  token: string;
  user: AuthUser;
}

/**
 * Sessions live in sessionStorage by default — they die with the tab, which is
 * the right default on a shared school computer. "Remember me" opts into
 * localStorage instead, so the session survives closing the browser.
 *
 * Note the ceiling: the server signs tokens with a 12h TTL, so remembering can
 * never keep anyone signed in for longer than that.
 */
function loadStoredSession(): StoredSession | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(SESSION_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* storage can throw in private mode — fall through */
    }
  }
  return null;
}

// Exported so the API client (lib/services.ts) can attach the session token
// to requests without needing to be a React component.
export function getSessionToken(): string | null {
  return loadStoredSession()?.token || null;
}

function sessionStore(): Storage | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      if (store.getItem(SESSION_STORAGE_KEY)) return store;
    } catch { /* ignore */ }
  }
  return null;
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredSession()?.user || null);
  const [loading] = useState(false);

  // Re-read the account on load. The stored session is a snapshot from sign-in;
  // without this an admin changing someone's classes or subjects had no effect
  // until that person signed out and back in.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored?.token) return;
    let cancelled = false;

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${stored.token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((account) => {
        if (cancelled || !account) return;
        const fresh: AuthUser = {
          uid: account.uid,
          email: account.email || null,
          name: account.name,
          role: account.role as UserRole,
          avatar: account.avatar || undefined,
          assignedClasses: account.assignedClasses || [],
          assignedCourses: account.assignedCourses || [],
        };
        setUser(fresh);
        try {
          (sessionStore() ?? sessionStorage).setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify({ token: stored.token, user: fresh }),
          );
        } catch { /* storage blocked — the in-memory user is still refreshed */ }
      })
      .catch(() => { /* offline: keep the cached session */ });

    return () => { cancelled = true; };
  }, []);

  const handleSignOut = useCallback(async () => {
    clearSession();
    setUser(null);
  }, []);

  const localLogin = useCallback(async (
    usernameOrEmail: string,
    role: UserRole,
    password?: string,
    remember = false,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier: usernameOrEmail, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        // Don't blame the credentials for every failure. A dev proxy with no
        // backend behind it, or a 500, returns no JSON error at all — saying
        // "check your credentials" there sends people hunting the wrong problem.
        if (body.error) return { ok: false, error: body.error };
        if (res.status === 429) return { ok: false, error: 'Too many attempts. Wait a few minutes and try again.' };
        if (res.status >= 500 || res.status === 502 || res.status === 504) {
          return { ok: false, error: `The school server returned an error (${res.status}). It may be down — this is not your password.` };
        }
        return { ok: false, error: 'Login failed. Check your credentials.' };
      }

      const { token, user: account } = await res.json();
      const authUser: AuthUser = {
        uid: account.uid,
        email: account.email || null,
        name: account.name,
        role: account.role as UserRole,
        avatar: account.avatar || undefined,
        assignedClasses: account.assignedClasses || [],
        // Was dropped here: the server sends assignedCourses, but it never reached
        // the client, so TeacherReportEntry saw an empty subject list for every
        // teacher and refused to open.
        assignedCourses: account.assignedCourses || [],
      };

      clearSession();
      const store = remember ? localStorage : sessionStorage;
      try {
        store.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, user: authUser }));
      } catch {
        /* storage full or blocked — the in-memory session below still works */
      }
      setUser(authUser);
      return { ok: true };
    } catch (err) {
      console.error('Login request failed:', err);
      return { ok: false, error: 'Could not reach the school server. Try again in a moment.' };
    }
  }, []);

  const authValue = useMemo(() => ({
    user,
    loading,
    signOut: handleSignOut,
    localLogin
  }), [user, loading, handleSignOut, localLogin]);

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
