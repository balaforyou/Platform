import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminApi } from '../../lib/useAdminApi';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import { branchScopes } from './helpers';
import type { AvailabilityOverride, AvailabilityPattern, AvailabilitySlot, Branch, ResourcePool } from './types';

/**
 * F-220: the config screen's read queries, adapted from admin-web's identically-named hooks.
 * The one substantive difference: the tenant id + roles come from admin-v2's own contexts
 * (`useAdminTenant` / `useAdminAuth`), not `ui-shared`'s hostname-bound `useTenant`/`useAuth`.
 *
 * Branch scoping is applied client-side after the fetch, exactly as admin-web does it: an
 * `owner` sees every branch; a `branch_manager:<id>` sees only the branches its roles name.
 */

export function useBranches() {
  const api = useAdminApi();
  const { tenant } = useAdminTenant();
  const { user } = useAdminAuth();
  const scopes = branchScopes(user?.roles || []);
  return useQuery({
    queryKey: ['court-groups', 'branches', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const branches = await api.get<Branch[]>(`/tenant/tenants/${tenant?.id}/branches?includeDraft=true`);
      return user?.roles?.includes('owner') ? branches : branches.filter((branch) => scopes.includes(branch.id));
    },
  });
}

export function usePools(branchId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['court-groups', 'pools', branchId],
    enabled: !!branchId,
    queryFn: () => api.get<ResourcePool[]>(`/slot-engine/branches/${branchId}/resource-pools`),
  });
}

export function usePatterns(poolId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['court-groups', 'patterns', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<AvailabilityPattern[]>(`/slot-engine/resource-pools/${poolId}/availability-patterns`),
  });
}

export function useOverrides(poolId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['court-groups', 'overrides', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<AvailabilityOverride[]>(`/slot-engine/resource-pools/${poolId}/availability-overrides`),
  });
}

export function useAvailability(poolId?: string, date?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['court-groups', 'availability', poolId, date],
    enabled: !!poolId && !!date,
    queryFn: () => api.get<AvailabilitySlot[]>(`/slot-engine/resource-pools/${poolId}/availability?date=${date}`),
  });
}

/**
 * F-220 §3.2 / F-224 — save branch-wide guest Standard/Peak pricing. Partial update: pass only
 * the fields a given Save button owns (the Peak Hours block and the Rates block save
 * independently). Owner-only + GUEST_BOOKING-gated server-side (`tenant-management`).
 */
export function useSaveGuestPricing(branchId?: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const { tenant } = useAdminTenant();
  return useMutation({
    mutationFn: (body: {
      guestStandardRate?: number;
      guestPeakRate?: number | null;
      guestPeakWindows?: { start: string; end: string }[];
    }) => api.patch<Branch>(`/tenant/branches/${branchId}/guest-pricing`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courtGroupsKeys.branches(tenant?.id) });
    },
  });
}

/** Query-key builders so mutations can invalidate exactly what they touched. */
export const courtGroupsKeys = {
  branches: (tenantId?: string) => ['court-groups', 'branches', tenantId] as const,
  pools: (branchId?: string) => ['court-groups', 'pools', branchId] as const,
  patterns: (poolId?: string) => ['court-groups', 'patterns', poolId] as const,
  overrides: (poolId?: string) => ['court-groups', 'overrides', poolId] as const,
  availability: (poolId?: string, date?: string) => ['court-groups', 'availability', poolId, date] as const,
};
