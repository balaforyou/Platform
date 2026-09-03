import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminApi } from '../../lib/useAdminApi';

/**
 * F-220 §1b — Special Hours data layer. Same `useAdminApi()` verb wrapper and React Query
 * key/invalidate convention as `queries.ts`. Slot-engine routes carry the `/slot-engine`
 * prefix (→ `/api/slot-engine` vite proxy → :3001), the same way admin-web calls them.
 *
 * The screen presents "one entry per date" at the branch level, but `AvailabilityOverride`
 * is keyed `(resourcePool, date)` — so an entry is a date backed by one row per pool under
 * the branch. For JBC (one pool per branch) that collapses to 1:1; the fan-out is what keeps
 * it correct if a branch ever has more than one pool.
 */

export type OverrideType = 'CLOSED' | 'MODIFIED';

export interface BranchPool {
  id: string;
  branchId: string;
  name: string;
  capacity: number;
  minBookingDurationMinutes: number;
}

interface RawOverride {
  id: string;
  resourcePoolId: string;
  date: string; // ISO datetime, UTC midnight
  type: OverrideType;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

/** One merged calendar-date entry, backed by up to N per-pool rows. */
export interface SpecialHoursEntry {
  date: string; // YYYY-MM-DD
  type: OverrideType;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  /** poolId → that pool's override row id for this date. Missing pools have no row yet. */
  byPool: Record<string, string>;
}

export interface SpecialHoursInput {
  date: string; // YYYY-MM-DD
  type: OverrideType;
  reason: string;
  startTime?: string; // HH:MM, MODIFIED only
  endTime?: string;
}

const isoDay = (d: string) => d.slice(0, 10);

const poolsKey = (branchId?: string) => ['branch-settings', 'branch-pools', branchId] as const;
const specialHoursKey = (branchId?: string) => ['branch-settings', 'special-hours', branchId] as const;

export function useBranchPools(branchId?: string) {
  const api = useAdminApi();
  return useQuery({
    queryKey: poolsKey(branchId),
    enabled: !!branchId,
    queryFn: async () => {
      const rows = await api.get<any[]>(`/slot-engine/branches/${branchId}/resource-pools`);
      return rows.map<BranchPool>((p) => ({
        id: p.id,
        branchId: p.branchId,
        name: p.name,
        capacity: p.capacity,
        minBookingDurationMinutes: p.minBookingDurationMinutes,
      }));
    },
  });
}

export function useSpecialHours(branchId?: string) {
  const api = useAdminApi();
  const pools = useBranchPools(branchId);
  const poolIds = (pools.data ?? []).map((p) => p.id);

  const overrideQueries = useQueries({
    queries: poolIds.map((poolId) => ({
      queryKey: ['branch-settings', 'pool-overrides', poolId] as const,
      queryFn: () => api.get<RawOverride[]>(`/slot-engine/resource-pools/${poolId}/availability-overrides`),
    })),
  });

  const allLoaded = overrideQueries.every((q) => q.isSuccess);
  const anyError = overrideQueries.find((q) => q.isError)?.error ?? pools.error;

  const entries = useMemo<SpecialHoursEntry[]>(() => {
    if (!pools.data || !allLoaded) return [];
    const byDate = new Map<string, SpecialHoursEntry>();
    overrideQueries.forEach((q, i) => {
      const poolId = poolIds[i];
      for (const row of q.data ?? []) {
        const day = isoDay(row.date);
        // Display values come from the first pool's row for a date. Pools disagreeing on the
        // same date is only possible if a branch's pool set changed after overrides existed —
        // a known, unhandled edge; today's data is one pool per branch.
        let entry = byDate.get(day);
        if (!entry) {
          entry = {
            date: day,
            type: row.type,
            startTime: row.startTime,
            endTime: row.endTime,
            reason: row.reason ?? '',
            byPool: {},
          };
          byDate.set(day, entry);
        }
        entry.byPool[poolId] = row.id;
      }
    });
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [pools.data, allLoaded, overrideQueries, poolIds]);

  return {
    entries,
    pools: pools.data ?? [],
    isLoading: pools.isLoading || (poolIds.length > 0 && !allLoaded && !anyError),
    error: anyError,
  };
}

function bodyFor(pool: BranchPool, input: SpecialHoursInput) {
  if (input.type === 'CLOSED') {
    return { date: input.date, type: 'CLOSED' as const, reason: input.reason };
  }
  return {
    date: input.date,
    type: 'MODIFIED' as const,
    reason: input.reason,
    startTime: input.startTime,
    endTime: input.endTime,
    // F-220 §1b Finding 1: the real POST/PATCH require these for a MODIFIED override.
    // Auto-filled from the pool, never shown to the admin.
    slotDurationMinutes: pool.minBookingDurationMinutes,
    capacity: pool.capacity,
  };
}

export function useSaveSpecialHours(branchId?: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      pools,
      existing,
    }: {
      input: SpecialHoursInput;
      pools: BranchPool[];
      existing?: SpecialHoursEntry;
    }) => {
      await Promise.all(
        pools.map((pool) => {
          const overrideId = existing?.byPool[pool.id];
          const body = bodyFor(pool, input);
          return overrideId
            ? api.patch(`/slot-engine/resource-pools/${pool.id}/availability-overrides/${overrideId}`, body)
            : api.post(`/slot-engine/resource-pools/${pool.id}/availability-overrides`, body);
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-settings', 'pool-overrides'] });
      qc.invalidateQueries({ queryKey: specialHoursKey(branchId) });
    },
  });
}

export function useDeleteSpecialHours(branchId?: string) {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entry, pools }: { entry: SpecialHoursEntry; pools: BranchPool[] }) => {
      await Promise.all(
        pools
          .map((pool) => ({ poolId: pool.id, overrideId: entry.byPool[pool.id] }))
          .filter((x) => !!x.overrideId)
          .map((x) => api.delete(`/slot-engine/resource-pools/${x.poolId}/availability-overrides/${x.overrideId}`)),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-settings', 'pool-overrides'] });
      qc.invalidateQueries({ queryKey: specialHoursKey(branchId) });
    },
  });
}

/**
 * F-222 stopgap: how many existing bookings a prospective override would affect, summed across
 * the branch's pools. Read-only, non-blocking — the modal shows it, nothing acts on it.
 */
export function useBookingConflictCount(
  pools: BranchPool[],
  date: string,
  type: OverrideType,
  startTime?: string,
  endTime?: string,
) {
  const api = useAdminApi();
  const ready = !!date && (type === 'CLOSED' || (!!startTime && !!endTime));
  const qs =
    type === 'MODIFIED' && startTime && endTime
      ? `?date=${date}&startTime=${startTime}&endTime=${endTime}`
      : `?date=${date}`;

  const results = useQueries({
    queries: (ready ? pools : []).map((pool) => ({
      queryKey: ['branch-settings', 'booking-conflicts', pool.id, qs] as const,
      queryFn: () => api.get<{ count: number }>(`/slot-engine/resource-pools/${pool.id}/booking-conflicts${qs}`),
    })),
  });

  if (!ready || results.length === 0 || !results.every((r) => r.isSuccess)) return 0;
  return results.reduce((sum, r) => sum + (r.data?.count ?? 0), 0);
}
