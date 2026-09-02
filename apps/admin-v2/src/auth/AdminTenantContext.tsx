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

/**
 * F-206: module entitlement. Values mirror the backend's `TenantModule` enum and
 * `EntitlementState` (shared-types `resolveEntitlementState`). The nav shell reads this to
 * hide destinations for modules that are NO_ROW / NOT_STARTED / HIDDEN.
 */
export type TenantModuleName =
  | 'GUEST_BOOKING'
  | 'MEMBER_MANAGEMENT'
  | 'STUDENT_MANAGEMENT'
  | 'TOURNAMENT';

export type EntitlementState = 'NO_ROW' | 'NOT_STARTED' | 'ACTIVE' | 'READ_ONLY' | 'HIDDEN';

/** A module destination shows in the nav only when its state is one of these. */
export function moduleVisible(state: EntitlementState | undefined): boolean {
  return state === 'ACTIVE' || state === 'READ_ONLY';
}

type EntitlementMap = Partial<Record<TenantModuleName, EntitlementState>>;

interface AdminTenantValue {
  tenant: AdminTenantBrief | null;
  /**
   * Per-module state for the signed-in tenant. `null` while the (authenticated) fetch is
   * still in flight or has failed — the nav shell treats `null` as "don't hide anything yet"
   * so a transient failure never strands an admin without navigation.
   */
  entitlements: EntitlementMap | null;
  loading: boolean;
  error: boolean;
}

const AdminTenantContext = createContext<AdminTenantValue | undefined>(undefined);

export function AdminTenantProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAdminAuth();
  const [tenant, setTenant] = useState<AdminTenantBrief | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementMap | null>(null);
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

  // F-206: entitlements, in a parallel authenticated fetch (unlike the no-auth tenant fetch
  // above, GET /tenant/tenants/:id/entitlements requires an admin token). Keyed on the token
  // too, so it runs once the session is established and re-runs on rotation.
  useEffect(() => {
    if (!user?.tenantId || !accessToken) {
      setEntitlements(null);
      return;
    }
    let alive = true;
    apiRequest<Array<{ module: TenantModuleName; state: EntitlementState }>>(
      `/tenant/tenants/${user.tenantId}/entitlements`,
      { token: accessToken },
    )
      .then((rows) => {
        if (!alive) return;
        const map: EntitlementMap = {};
        for (const r of rows) map[r.module] = r.state;
        setEntitlements(map);
      })
      .catch(() => {
        if (alive) setEntitlements(null); // treated as "hide nothing" downstream
      });
    return () => {
      alive = false;
    };
  }, [user?.tenantId, accessToken]);

  return (
    <AdminTenantContext.Provider value={{ tenant, entitlements, loading, error }}>
      {children}
    </AdminTenantContext.Provider>
  );
}

export function useAdminTenant(): AdminTenantValue {
  const ctx = useContext(AdminTenantContext);
  if (!ctx) throw new Error('useAdminTenant must be used within an AdminTenantProvider');
  return ctx;
}
