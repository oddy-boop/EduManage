import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { UserRole } from '../types';

interface AuthUser {
  uid: string;
  email: string | null;
  name: string;
  role: UserRole;
  avatar?: string;
  assignedClasses?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  localLogin: (usernameOrEmail: string, role: UserRole, password?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'edumanage.session';

function loadStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());
  const [loading] = useState(false);

  const handleSignOut = useCallback(async () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
  }, []);

  const localLogin = useCallback(async (usernameOrEmail: string, role: UserRole, password?: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier: usernameOrEmail, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Login failed. Please check your credentials.');
        return false;
      }

      const account = await res.json();
      const authUser: AuthUser = {
        uid: account.uid,
        email: account.email || null,
        name: account.name,
        role: account.role as UserRole,
        avatar: account.avatar || undefined,
        assignedClasses: account.assignedClasses || [],
      };

      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authUser));
      setUser(authUser);
      return true;
    } catch (err) {
      console.error('Login request failed:', err);
      alert('Could not reach the server. Please try again.');
      return false;
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
