import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, registerRefreshHandler } from '../lib/api';

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

  // 26 Sep 2026 feedback round, real bug fix: now returns the new access token (or null) so
  // apiRequest's own refresh-and-retry (registerRefreshHandler below) can use it immediately --
  // reading `accessToken` state right after calling this would still see the stale pre-refresh
  // value, since setState hasn't committed yet.
  const refreshSession = async (): Promise<string | null> => {
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
          return res.accessToken;
        } else {
          setAccessToken(null);
          setUser(null);
          return null;
        }
      } catch {
        // Token expired or invalid, clear state quietly on silent refresh
        setAccessToken(null);
        setUser(null);
        return null;
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

  // 2. Setup periodic refresh timer (every 14 minutes, since token expires in 15 minutes).
  // Real, known gap this alone doesn't cover: mobile browsers throttle or fully suspend
  // setInterval timers in a backgrounded tab (screen off, app-switched-away), so this can be
  // skipped entirely across a real idle period -- see the visibility listener (3) and
  // apiRequest's own retry-on-401 (registered below) for the two real fixes for that gap.
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(() => {
      console.log('Auto-refreshing JWT token...');
      refreshSession();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [accessToken]);

  // 3. Real fix: refresh immediately when the tab/app becomes visible again, rather than only
  // relying on the interval above -- catches exactly the case a real device idled through (screen
  // off or app-switched-away long enough that the interval was suspended and never fired).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 4. Real fix: registers with apiRequest so a genuine 401 (the token having gone stale for any
  // reason -- backgrounding, clock drift, or anything else) gets one silent refresh-and-retry
  // instead of surfacing "Couldn't load booking details / Unauthorized" straight to the guest.
  useEffect(() => {
    registerRefreshHandler(refreshSession);
  }, []);

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
