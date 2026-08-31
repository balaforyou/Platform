import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '@badminton/ui-shared';
import { useAdminAuth } from './AdminAuthContext';
import { applyAccentRampVars, clearAccentRampVars, computeAccentRampVars } from './applyAccentRamp';

/**
 * Sub-slice 0.1 — one shared place the signed-in admin's tenant is resolved, so the
 * accent ramp (Layer 1) is applied to `:root` BEFORE any post-auth screen paints, and
 * so 0.3's nav shell doesn't re-fetch the same record per screen.
 *
 * `GET /tenant/tenants/:id` is no-auth (its own code comment), so there's no
 * token-timing race — `user.tenantId` from the decoded JWT is enough.
 */

/** Only what admin-v2 consumes. The endpoint returns the full Prisma `Tenant` row. */
export interface AdminTenantBrief {
  id: string;
  name: string;
  appName?: string | null;
  logo?: string | null;
  themeColor?: string | null;
}

interface AdminTenantValue {
  tenant: AdminTenantBrief | null;
  loading: boolean;
  error: boolean;
}

const AdminTenantContext = createContext<AdminTenantValue | undefined>(undefined);

export function AdminTenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAdminAuth();
  const [tenant, setTenant] = useState<AdminTenantBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) {
      setTenant(null);
      setError(false);
      clearAccentRampVars();
      return;
    }

    let alive = true;
    setLoading(true);
    setError(false);

    apiRequest<AdminTenantBrief>(`/tenant/tenants/${user.tenantId}`)
      .then((t) => {
        if (!alive) return;
        setTenant(t);
        // Empty map (missing / neutral themeColor) => Layer-2 fixed fallbacks stay in effect.
        applyAccentRampVars(computeAccentRampVars(t.themeColor));
      })
      .catch(() => {
        if (!alive) return;
        setTenant(null);
        setError(true);
        clearAccentRampVars();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.tenantId]);

  return (
    <AdminTenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </AdminTenantContext.Provider>
  );
}

export function useAdminTenant(): AdminTenantValue {
  const ctx = useContext(AdminTenantContext);
  if (!ctx) throw new Error('useAdminTenant must be used within an AdminTenantProvider');
  return ctx;
}
