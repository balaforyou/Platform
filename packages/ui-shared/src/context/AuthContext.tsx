import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  user: any | null;
  setSession: (accessToken: string) => void;
  mergeUser: (patch: Record<string, any>) => void;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Module-scoped tracker to deduplicate concurrent refresh requests (e.g. from React 18 StrictMode double-mounting)
let activeRefreshPromise: Promise<any> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper function to decode JWT claims to read user details in-memory
  const parseJwt = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  const refreshSession = async () => {
    if (activeRefreshPromise) {
      console.log('Authentication refresh already in progress. Reusing in-flight promise.');
      return activeRefreshPromise;
    }

    activeRefreshPromise = (async () => {
      try {
        // POST /auth/refresh exchanges the httpOnly cookie for a new access token
        const res = await apiRequest<{ accessToken: string }>('/identity/auth/refresh', {
          method: 'POST',
        });
        if (res && res.accessToken) {
          setAccessToken(res.accessToken);
          const decoded = parseJwt(res.accessToken);
          setUser(decoded);
          console.log('Authentication session silently refreshed.');
        } else {
          setAccessToken(null);
          setUser(null);
        }
      } catch {
        // Token expired or invalid, clear state quietly on silent refresh
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
        activeRefreshPromise = null;
      }
    })();

    return activeRefreshPromise;
  };

  // 1. Silent refresh on boot
  useEffect(() => {
    refreshSession();
  }, []);

  // 2. Setup periodic refresh timer (every 14 minutes, since token expires in 15 minutes)
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(() => {
      console.log('Auto-refreshing JWT token...');
      refreshSession();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [accessToken]);

  // Direct extraction of what every login method used to do inline (setAccessToken + decode +
  // setUser) — behavior unchanged, only the app-local login functions (guest-pwa's/admin-web's
  // own lib/auth.ts) call this now instead of the login logic itself living here.
  const setSession = (newAccessToken: string) => {
    setAccessToken(newAccessToken);
    const decoded = parseJwt(newAccessToken);
    setUser(decoded);
  };

  // Direct extraction of what attachPhone used to do inline — shallow-merges a patch into the
  // in-memory user object without touching accessToken, for attach-phone-style partial updates.
  const mergeUser = (patch: Record<string, any>) => {
    setUser((prev: any) => (prev ? { ...prev, ...patch } : prev));
  };

  const logout = async () => {
    try {
      await apiRequest('/identity/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Logout endpoint call error:', e);
    } finally {
      setAccessToken(null);
      setUser(null);
      console.log('User logged out.');
    }
  };

  const isAuthenticated = !!accessToken;

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated,
        user,
        setSession,
        mergeUser,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
