import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIError } from '@badminton/ui-shared';
import { useAdminApi } from '../../lib/useAdminApi';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import { branchScopes } from './helpers';
import { newIdempotencyKey } from './reservationHelpers';
import type {
  AvailabilityOverride,
  AvailabilityPattern,
  AvailabilitySlot,
  Branch,
  GuestLedgerRow,
  GuestLookupResult,
  ManualBookingResult,
  ManualPaymentMethod,
  ResourcePool,
  WalkInResult,
} from './types';

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

// ---------------------------------------------------------------------------
// F-229 Step 5 — walk-in reservation flow
// ---------------------------------------------------------------------------

/** `not-found` is a real UI state (enter a name → walk-in create), not an error. */
export type GuestLookupOutcome =
  | { status: 'found'; user: GuestLookupResult }
  | { status: 'not-found' };

/**
 * F-229: look up a guest by phone. `GET /identity/users/lookup` — owner/branch_manager JWT +
 * tenant-matched (Step 2 added `name` to its select). A 404 (`USER_NOT_FOUND`) resolves to a
 * `not-found` outcome; every other failure rejects.
 */
export function useGuestLookup() {
  const api = useAdminApi();
  const { tenant } = useAdminTenant();
  return useMutation<GuestLookupOutcome, Error, string>({
    mutationFn: async (phone: string) => {
      try {
        const user = await api.get<GuestLookupResult>(
          `/identity/users/lookup?tenantId=${tenant?.id}&phone=${encodeURIComponent(phone)}`,
        );
        return { status: 'found', user };
      } catch (err) {
        if (err instanceof APIError && err.statusCode === 404) return { status: 'not-found' };
        throw err;
      }
    },
  });
}

/** F-229: find-or-create the lightweight GUEST account for a walk-in (Step 2, no OTP). */
export function useCreateWalkIn() {
  const api = useAdminApi();
  const { tenant } = useAdminTenant();
  return useMutation<WalkInResult, Error, { phone: string; name: string }>({
    mutationFn: ({ phone, name }) =>
      api.post<WalkInResult>('/identity/users/walk-in', { phone, name, tenantId: tenant?.id }),
  });
}

/**
 * F-229 Step 6: the pool's guest ledger — every guest booking with its payment status joined
 * and the Cash/UPI/Link method already derived server-side (`GET /resource-pools/:id/guest-ledger`,
 * Step 4). Owner / branch_manager, pool-scoped.
 */
export function useGuestLedger(poolId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ['guest-ledger', poolId],
    enabled: !!poolId,
    queryFn: () => api.get<GuestLedgerRow[]>(`/slot-engine/resource-pools/${poolId}/guest-ledger`),
  });
}

/** F-229: record a manual / walk-in booking (Step 3 — cash / razorpay_link / upi_qr). */
export function useCreateManualBooking() {
  const api = useAdminApi();
  const { tenant } = useAdminTenant();
  return useMutation<
    ManualBookingResult,
    Error,
    {
      branchId: string;
      resourcePoolId: string;
      resourceId?: string;
      windowId: string;
      userId: string;
      negotiatedPrice: number;
      paymentMethod: ManualPaymentMethod;
      upiTransactionId?: string;
    }
  >({
    mutationFn: (body) =>
      api.post<ManualBookingResult>(
        '/payment/bookings/manual',
        { ...body, tenantId: tenant?.id },
        { 'Idempotency-Key': newIdempotencyKey() },
      ),
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

/**
 * F-220 §3.1 / F-225 — save which courts guests may book, per pool. `authorizedByPool` maps a
 * pool id to its authorised resource ids; each entry is a whole-pool replace on the server
 * (`PATCH /slot-engine/resource-pools/:id/guest-court-eligibility`). Owner-only + GUEST_BOOKING-
 * gated server-side. Fanned out per pool (JBC = one pool per branch → one call), the same shape
 * as Special Hours.
 */
export function useSaveGuestCourts(branchId?: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (authorizedByPool: Record<string, string[]>) =>
      Promise.all(
        Object.entries(authorizedByPool).map(([poolId, authorizedResourceIds]) =>
          api.patch(`/slot-engine/resource-pools/${poolId}/guest-court-eligibility`, { authorizedResourceIds }),
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courtGroupsKeys.pools(branchId) });
    },
  });
}

/**
 * F-220 §3.3 — save the tiered guest cancellation/refund policy. Writes
 * `PUT /slot-engine/resource-pools/:id/booking-rule` (upsert keyed on the pool) with a
 * `cancellationPolicyJson` of exactly three tiers. Fanned out per pool, same shape as
 * Authorized Guest Courts / Special Hours.
 *
 * `applyGlobally: false` → the current branch's pools only (passed in from the section's
 * already-loaded `usePools(branchId)`, no extra fetch). `applyGlobally: true` → tenant-wide:
 * every branch, every pool (the mockup's own handler loops every branch key).
 *
 * The route is owner-gated in the UI (this screen's convention) but NOT yet server-side — see
 * `pending-findings.md` "booking-rule-route-missing-owner-and-entitlement-gate".
 */
export function useSaveCancellationPolicy(branchId?: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const { tenant } = useAdminTenant();
  return useMutation({
    mutationFn: async (args: {
      tiers: { hours: number; percent: number }[]; // exactly 3, already validated
      applyGlobally: boolean;
      branchPools: ResourcePool[]; // current branch's pools, already loaded
    }) => {
      const cancellationPolicyJson = {
        type: 'tiered' as const,
        tiers: args.tiers.map((t) => ({ min_hours_before_slot: t.hours, refund_percent: t.percent })),
      };
      let pools = args.branchPools;
      if (args.applyGlobally) {
        const branches = await api.get<Branch[]>(`/tenant/tenants/${tenant?.id}/branches?includeDraft=true`);
        const perBranch = await Promise.all(
          branches.map((b) => api.get<ResourcePool[]>(`/slot-engine/branches/${b.id}/resource-pools`)),
        );
        pools = perBranch.flat();
      }
      // Dedupe by pool id before the fan-out: `includeDraft=true` can return a draft + published
      // row for the same branch, which would otherwise PUT the same pool twice (idempotent, but
      // wasteful). Also guards the current branch's pool appearing in more than one list.
      const uniquePoolIds = [...new Set(pools.map((p) => p.id))];
      await Promise.all(
        uniquePoolIds.map((id) => api.put(`/slot-engine/resource-pools/${id}/booking-rule`, { cancellationPolicyJson })),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courtGroupsKeys.pools(branchId) });
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
