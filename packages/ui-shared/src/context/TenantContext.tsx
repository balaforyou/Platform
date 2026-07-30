import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export interface TenantBranding {
  id: string;
  name: string;
  subdomain: string;
  appName: string;
  logo: string | null;
  themeColor: string;
}

interface TenantContextType {
  tenant: TenantBranding | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function resolveTenant() {
      try {
        setLoading(true);
        setError(null);

        // 1. Resolve subdomain from hostname
        const hostname = window.location.hostname;
        let subdomain = '';

        // If hostname is e.g. tenant1.localhost or tenant1.trycloudflare.com
        const parts = hostname.split('.');
        if (parts.length > 1 && !['localhost', '127', '0'].includes(parts[parts.length - 1])) {
          // Check if there is a subdomain
          if (parts.length >= 3 || (parts.length === 2 && parts[1] === 'localhost')) {
            subdomain = parts[0];
          }
        }

        // 2. Query param fallback (e.g. ?tenant=courtowner1)
        const params = new URLSearchParams(window.location.search);
        const queryTenant = params.get('tenant');
        if (queryTenant) {
          subdomain = queryTenant;
        }

        // 3. Dev default env fallback
        if (!subdomain) {
          subdomain = (import.meta.env.VITE_DEFAULT_TENANT_SUBDOMAIN as string) || 'courtowner1';
        }

        console.log(`Resolving tenant subdomain: "${subdomain}"`);

        // Fetch tenant details from Tenant Management service
        const resolved = await apiRequest<TenantBranding>(`/tenant/tenants/by-subdomain/${subdomain}`);
        setTenant(resolved);

        // 4. Apply dynamic branding
        if (resolved) {
          // Apply themeColor as CSS Variable
          document.documentElement.style.setProperty('--brand-primary', resolved.themeColor);
          
          // Generate hover and light variations if desired (standard hex manipulation or fallback)
          // We can set a fallback for secondary brand color too
          document.documentElement.style.setProperty('--brand-secondary', '#f3f4f6');

          // Dynamically set tab page title
          document.title = resolved.appName || resolved.name || 'Badminton Booking';

          // Inject/update dynamic PWA manifest link
          let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
          if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            document.head.appendChild(manifestLink);
          }
          manifestLink.href = `/api/tenant/tenants/${resolved.id}/manifest.json`;
          console.log(`Dynamic manifest loaded: ${manifestLink.href}`);
        }
      } catch (err: any) {
        console.error('Failed to resolve tenant branding:', err);
        setError(err.message || 'Tenant not found');
      } finally {
        setLoading(false);
      }
    }

    resolveTenant();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-rose-600"></div>
          <p className="text-sm font-medium text-gray-600 animate-pulse">Resolving court brand...</p>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-gray-100 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tenant Not Found</h1>
          <p className="text-gray-600 mb-6 text-sm">
            We couldn't resolve the whitelabel branding details for this subdomain. 
            If you are in development mode, please verify your tunnel setup or try appending <code className="bg-gray-100 px-1 py-0.5 rounded text-rose-600 font-mono">?tenant=courtowner1</code> to the URL.
          </p>
          <a 
            href="?tenant=courtowner1" 
            className="inline-block w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors shadow-lg shadow-rose-600/20"
          >
            Load Courtowner1 (Default)
          </a>
        </div>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
