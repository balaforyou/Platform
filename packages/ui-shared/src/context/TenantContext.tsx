import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { generateAccentRamp } from '../lib/colorRamp';

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

const fullScreenCenter: React.CSSProperties = {
  alignItems: 'center',
  background: '#f9fafb',
  display: 'flex',
  minHeight: '100vh',
  justifyContent: 'center',
  padding: '16px',
  width: '100vw',
};

const loadingStack: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const loadingSpinner: React.CSSProperties = {
  animation: 'tenant-spin 1s linear infinite',
  border: '4px solid #d1d5db',
  borderTopColor: '#e11d48',
  borderRadius: '9999px',
  height: '40px',
  width: '40px',
};

const errorCard: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #f3f4f6',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  maxWidth: '448px',
  padding: '32px',
  textAlign: 'center',
  width: '100%',
};

const errorIconWrap: React.CSSProperties = {
  alignItems: 'center',
  background: '#fff1f2',
  borderRadius: '9999px',
  color: '#e11d48',
  display: 'flex',
  height: '56px',
  justifyContent: 'center',
  margin: '0 auto 24px',
  width: '56px',
};

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

          // F-190 Slice 0: --color-accent-100..900 is the Organic design system's tenant-derived
          // tonal ramp. --color-accent-2 (sage) stays fixed/universal in static CSS -- only one
          // color is tenant-derived, matching the --brand-secondary convention just below.
          const accentRamp = generateAccentRamp(resolved.themeColor);
          for (const step of Object.keys(accentRamp) as unknown as Array<keyof typeof accentRamp>) {
            document.documentElement.style.setProperty(`--color-accent-${step}`, accentRamp[step]);
          }

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
      <div style={fullScreenCenter}>
        <style>{'@keyframes tenant-spin { to { transform: rotate(360deg); } }'}</style>
        <div style={loadingStack}>
          <div style={loadingSpinner}></div>
          <p style={{ color: '#4b5563', fontSize: '14px', fontWeight: 500, margin: 0 }}>Resolving court brand...</p>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div style={fullScreenCenter}>
        <div style={errorCard}>
          <div style={errorIconWrap}>
            <svg style={{ height: '32px', width: '32px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 style={{ color: '#111827', fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>Tenant Not Found</h1>
          <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.5, margin: '0 0 24px' }}>
            We couldn't resolve the whitelabel branding details for this subdomain. 
            If you are in development mode, verify that Tenant Management is running locally and try appending <code style={{ background: '#f3f4f6', borderRadius: '4px', color: '#e11d48', fontFamily: 'monospace', padding: '2px 4px' }}>?tenant=courtowner1</code> to the URL.
          </p>
          <a 
            href="?tenant=courtowner1" 
            style={{
              background: '#e11d48',
              borderRadius: '12px',
              boxShadow: '0 10px 15px -3px rgb(225 29 72 / 0.2)',
              color: '#ffffff',
              display: 'inline-block',
              fontWeight: 500,
              padding: '12px 16px',
              textDecoration: 'none',
              width: '100%',
            }}
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
