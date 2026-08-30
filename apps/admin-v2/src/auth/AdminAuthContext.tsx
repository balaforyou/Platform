import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@badminton/ui-shared';
import { enrollPasskey as ceremonyEnroll, loginWithPasskey as ceremonyLogin } from '../lib/webauthn';
import { parseAdminClaims, type AdminUser } from '../lib/claims';

export type { AdminUser };

/**
 * admin-v2 auth. The refresh-on-boot / parseJwt / 14-minute-timer / in-flight-dedupe
 * shape is lifted from ui-shared's AuthContext (a proven pattern), but this is a local
 * copy, not the shared provider: ui-shared's AuthProvider hard-depends on
 * TenantProvider (useTenant()), which admin-v2 deliberately does not use — its tenant
 * comes from the signed-in admin's JWT, not the hostname. See the Slice 1 plan §1.
 */

interface AdminAuthValue {
  accessToken: string | null;
  user: AdminUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: (googleIdToken: string) => Promise<void>;
  loginWithDevToken: (email: string) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  enrollPasskey: (deviceLabel?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | undefined>(undefined);

let inFlightRefresh: Promise<string | null> | null = null;

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback((token: string | null) => {
    setAccessToken(token);
    setUser(token ? parseAdminClaims(token) : null);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (inFlightRefresh) return inFlightRefresh;
    inFlightRefresh = (async () => {
      try {
        const res = await apiRequest<{ accessToken: string }>('/identity/auth/refresh', {
          method: 'POST',
        });
        return res?.accessToken ?? null;
      } catch {
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();
    return inFlightRefresh;
  }, []);

  // Silent refresh on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await refresh();
      if (!cancelled) {
        applyToken(token);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, applyToken]);

  // Rotate before the 15-minute token expires.
  useEffect(() => {
    if (!accessToken) return;
    const id = setInterval(async () => {
      applyToken(await refresh());
    }, 14 * 60 * 1000);
    return () => clearInterval(id);
  }, [accessToken, refresh, applyToken]);

  const loginWithGoogle = useCallback(
    async (googleIdToken: string) => {
      const res = await apiRequest<{ accessToken: string }>('/identity/auth/admin/google/verify', {
        method: 'POST',
        body: JSON.stringify({ googleIdToken }),
      });
      applyToken(res.accessToken);
    },
    [applyToken],
  );

  const loginWithDevToken = useCallback(
    (email: string) => loginWithGoogle(`dev-admin-token-${email}`),
    [loginWithGoogle],
  );

  const loginWithPasskey = useCallback(async () => {
    const res = await ceremonyLogin();
    applyToken(res.accessToken);
  }, [applyToken]);

  const enrollPasskey = useCallback(
    async (deviceLabel?: string) => {
      if (!accessToken) throw new Error('Must be signed in to enrol a passkey');
      await ceremonyEnroll(accessToken, deviceLabel);
    },
    [accessToken],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/identity/auth/logout', { method: 'POST' });
    } catch {
      /* best effort */
    }
    applyToken(null);
  }, [applyToken]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      accessToken,
      user,
      loading,
      isAuthenticated: !!accessToken && !!user,
      loginWithGoogle,
      loginWithDevToken,
      loginWithPasskey,
      enrollPasskey,
      logout,
    }),
    [accessToken, user, loading, loginWithGoogle, loginWithDevToken, loginWithPasskey, enrollPasskey, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
}
