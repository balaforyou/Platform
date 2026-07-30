import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { useTenant } from './TenantContext';

interface AuthContextType {
  accessToken: string | null;
  isAuthenticated: boolean;
  user: any | null;
  requestOtp: (phone: string) => Promise<boolean>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  verifyGoogleMock: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { tenant } = useTenant();

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
    }
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

  const requestOtp = async (phone: string): Promise<boolean> => {
    if (!tenant) throw new Error('Tenant context is required to request OTP');
    
    // Calls Identity Auth service to trigger SMS verification
    await apiRequest('/identity/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, tenantId: tenant.id }),
    });
    return true;
  };

  const verifyOtp = async (phone: string, code: string): Promise<void> => {
    if (!tenant) throw new Error('Tenant context is required to verify OTP');

    const res = await apiRequest<{ accessToken: string }>('/identity/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code, tenantId: tenant.id }),
    });

    if (res && res.accessToken) {
      setAccessToken(res.accessToken);
      const decoded = parseJwt(res.accessToken);
      setUser(decoded);
      console.log('OTP verified successfully.');
    }
  };

  const verifyGoogleMock = async (email: string): Promise<void> => {
    if (!tenant) throw new Error('Tenant context is required to verify Google login');

    // Calls Identity Auth service with the mock Google token prefix required by the backend
    const mockToken = `mock-google-token-${email}`;
    const res = await apiRequest<{ accessToken: string }>('/identity/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({ googleIdToken: mockToken, tenantId: tenant.id }),
    });

    if (res && res.accessToken) {
      setAccessToken(res.accessToken);
      const decoded = parseJwt(res.accessToken);
      setUser(decoded);
      console.log('Mock Google OAuth login successful.');
    }
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
        requestOtp,
        verifyOtp,
        verifyGoogleMock,
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
