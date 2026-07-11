import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase-auth';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const lastProcessedUid = useRef<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser?.uid === lastProcessedUid.current && lastProcessedUid.current !== null) {
        setLoading(false);
        return;
      }

      if (fbUser) {
        const isAdminEmail = fbUser.email === "survivor.net.corrections@gmail.com";
        const normalizedEmail = fbUser.email ? fbUser.email.toLowerCase() : '';
        
        let userData: any = null;
        try {
          const userRes = await fetch(`/api/users/${encodeURIComponent(fbUser.uid)}`);
          if (userRes.ok) {
            userData = await userRes.json();
            // If the profile is just a GUEST but we have a teacher/user record with this email, upgrade it
            if (userData.role === UserRole.GUEST || !userData.role) {
              const queryRes = await fetch(`/api/users?email=${encodeURIComponent(normalizedEmail)}`);
              if (queryRes.ok) {
                const matchedUsers = await queryRes.json();
                const orphan = matchedUsers.find((u: any) => u.uid !== fbUser.uid && ['Teacher', 'Parent', 'Admin'].includes(u.role));
                if (orphan) {
                  userData = { ...userData, ...orphan, linkedAt: new Date().toISOString() };
                  
                  // Save updated user profile
                  await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                  });
                  
                  // Delete orphan profile
                  await fetch(`/api/users/${encodeURIComponent(orphan.uid)}`, { method: 'DELETE' });
                }
              }
            }
          } else if (userRes.status === 404) {
            // Check if there's an orphan profile with this email
            const queryRes = await fetch(`/api/users?email=${encodeURIComponent(normalizedEmail)}`);
            let orphan: any = null;
            if (queryRes.ok) {
              const matchedUsers = await queryRes.json();
              // Find pre-registered profiles
              orphan = matchedUsers.find((u: any) => u.uid !== fbUser.uid);
            }

            if (orphan) {
              userData = {
                ...orphan,
                uid: fbUser.uid,
                email: normalizedEmail,
                linkedAt: new Date().toISOString()
              };
              
              // Link this profile to the real UID
              await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
              });

              // Cleanup orphan if it had a different ID (and wasn't already the same)
              if (orphan.uid !== fbUser.uid) {
                await fetch(`/api/users/${encodeURIComponent(orphan.uid)}`, { method: 'DELETE' });
              }
            } else {
              // Auto-create basic profile
              userData = {
                uid: fbUser.uid,
                name: fbUser.displayName || 'New User',
                email: normalizedEmail,
                role: isAdminEmail ? UserRole.ADMIN : UserRole.GUEST,
                createdAt: new Date().toISOString(),
              };
              await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
              });
            }
          }
        } catch (err) {
          console.error("Auth profile retrieval/sync error:", err);
        }

        lastProcessedUid.current = fbUser.uid;
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          name: (userData && userData.name) || fbUser.displayName || 'User',
          role: isAdminEmail ? UserRole.ADMIN : ((userData && (userData.role as UserRole)) || UserRole.GUEST),
          avatar: (userData && userData.avatar) || fbUser.photoURL || undefined,
          assignedClasses: (userData && userData.assignedClasses) || [],
        });
      } else {
        lastProcessedUid.current = null;
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = useCallback(async () => {
    if (auth) {
      await auth.signOut();
    }
    setUser(null);
    lastProcessedUid.current = null;
  }, []);

  const localLogin = useCallback(async (usernameOrEmail: string, role: UserRole, password?: string) => {
    setLoading(true);
    try {
      let url = '';
      if (role === UserRole.ADMIN) {
        url = `/api/users?email=${encodeURIComponent(usernameOrEmail)}`;
      } else {
        url = `/api/users?loginId=${encodeURIComponent(usernameOrEmail)}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const matchedUsers = await res.json();
        const found = matchedUsers.find((u: any) => u.role.toLowerCase() === role.toLowerCase());
        if (found) {
          if (role === UserRole.ADMIN) {
            if (found.password && password !== found.password) {
              alert("Incorrect admin password. Please try again.");
              setLoading(false);
              return false;
            }
          }
          setUser({
            uid: found.uid,
            email: found.email,
            name: found.name,
            role: found.role as UserRole,
            avatar: found.avatar || undefined,
            assignedClasses: found.assignedClasses || []
          });
          setLoading(false);
          return true;
        }
      }
    } catch (e) {
      console.warn("Could not load user from PostgreSQL, falling back to mock user profile", e);
    }

    // Fallback Mock profile
    setUser({
      uid: `mock-${role.toLowerCase()}`,
      email: role === UserRole.ADMIN ? usernameOrEmail : `${usernameOrEmail}@school.edu`,
      name: `${role} Profile`,
      role: role,
      avatar: `https://picsum.photos/seed/mock-${role.toLowerCase()}/100`,
      assignedClasses: role === UserRole.TEACHER ? ['Grade 10-A', 'Grade 10-B'] : []
    });
    setLoading(false);
    return true;
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
