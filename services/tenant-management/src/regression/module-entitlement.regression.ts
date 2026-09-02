import { Section, ownerToken, branchManagerToken } from '@badminton/test-harness';
import { db, tenantUrl, internalHeaders, TenantContext } from './_fixtures';

/**
 * F-206 — module entitlement management routes (tenant-management side).
 *
 *   POST /tenants/:id/entitlements               — grant / renew, INTERNAL_SERVICE_KEY only
 *   GET  /tenants/:id/entitlements               — any authenticated admin (owner | branch_manager:*)
 *   POST /tenants/:id/entitlements/:module/disable — Owner-only early wind-down
 *
 * Renewal extends endDate on the one row per (tenant, module) — never a new row per term.
 * State (ACTIVE / READ_ONLY / HIDDEN / NOT_STARTED / NO_ROW) is computed per row on read.
 */

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

async function grant(tenantId: string, body: Record<string, unknown>, headers = internalHeaders) {
  return fetch(`${tenantUrl}/tenants/${tenantId}/entitlements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export const moduleEntitlementSections: Section<TenantContext>[] = [
  {
    name: 'F-206: grant is internal-key only; validates module and date range',
    async run(ctx) {
      const tid = ctx.tenant.id;

      // Non-internal caller (owner JWT) cannot grant.
      const asOwner = await grant(
        tid,
        { module: 'GUEST_BOOKING', startDate: iso(-1), endDate: iso(365) },
        { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken('owner-1', tid)}` },
      );
      if (asOwner.status !== 401 && asOwner.status !== 403) {
        throw new Error(`grant as owner JWT: expected 401/403, got ${asOwner.status}`);
      }

      const badModule = await grant(tid, { module: 'NONSENSE', startDate: iso(-1), endDate: iso(365) });
      if (badModule.status !== 400) throw new Error(`bad module: expected 400, got ${badModule.status}`);

      const badRange = await grant(tid, { module: 'GUEST_BOOKING', startDate: iso(10), endDate: iso(5) });
      if (badRange.status !== 400) throw new Error(`endDate <= startDate: expected 400, got ${badRange.status}`);

      const ok = await grant(tid, { module: 'GUEST_BOOKING', startDate: iso(-1), endDate: iso(365) });
      if (ok.status !== 200) throw new Error(`valid grant: expected 200, got ${ok.status}`);
      const row = ((await ok.json()) as any).data;
      if (row.state !== 'ACTIVE') throw new Error(`granted row state: expected ACTIVE, got ${row.state}`);
    },
  },

  {
    name: 'F-206: renew extends endDate on the same row — no new row per term, clears a prior wind-down',
    async run(ctx) {
      const tid = ctx.tenant.id;
      await grant(tid, { module: 'MEMBER_MANAGEMENT', startDate: iso(-1), endDate: iso(30) });
      const first = await db.moduleEntitlement.findUnique({
        where: { tenantId_module: { tenantId: tid, module: 'MEMBER_MANAGEMENT' } },
      });

      // Wind it down, then renew. (Bodyless POST — send `{}`, the codebase convention for
      // action endpoints, so Fastify's JSON parser doesn't 400 on an empty body.)
      const disabled = await fetch(`${tenantUrl}/tenants/${tid}/entitlements/MEMBER_MANAGEMENT/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken('owner-1', tid)}` },
        body: '{}',
      });
      if (disabled.status !== 200) throw new Error(`disable before renew: expected 200, got ${disabled.status}`);
      const disabledRow = ((await disabled.json()) as any).data;
      if (disabledRow.state !== 'READ_ONLY') throw new Error(`disabled state: expected READ_ONLY, got ${disabledRow.state}`);

      const renew = await grant(tid, { module: 'MEMBER_MANAGEMENT', startDate: iso(-1), endDate: iso(400) });
      if (renew.status !== 200) throw new Error(`renew: expected 200, got ${renew.status}`);

      const rows = await db.moduleEntitlement.findMany({ where: { tenantId: tid, module: 'MEMBER_MANAGEMENT' } });
      if (rows.length !== 1) throw new Error(`renew created a new row — expected 1, found ${rows.length}`);
      if (rows[0].id !== first!.id) throw new Error('renew replaced the row id instead of extending it');
      if (rows[0].disabledAt !== null) throw new Error('renew did not clear the prior wind-down');
      if (new Date(rows[0].endDate).getTime() <= new Date(first!.endDate).getTime()) {
        throw new Error('renew did not push endDate forward');
      }
    },
  },

  {
    name: 'F-206: GET entitlements — owner and branch_manager allowed, unauthenticated 401, states computed',
    async run(ctx) {
      const tid = ctx.tenant.id;
      await grant(tid, { module: 'GUEST_BOOKING', startDate: iso(-1), endDate: iso(365) });

      const unauth = await fetch(`${tenantUrl}/tenants/${tid}/entitlements`);
      if (unauth.status !== 401) throw new Error(`GET unauth: expected 401, got ${unauth.status}`);

      for (const [label, token] of [
        ['owner', ownerToken('owner-1', tid)],
        ['branch_manager', branchManagerToken('manager-1', ctx.branchA?.id ?? 'b', tid)],
      ] as const) {
        const res = await fetch(`${tenantUrl}/tenants/${tid}/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status !== 200) throw new Error(`GET as ${label}: expected 200, got ${res.status}`);
        const rows = ((await res.json()) as any).data as any[];
        const gb = rows.find((r) => r.module === 'GUEST_BOOKING');
        if (!gb || gb.state !== 'ACTIVE') throw new Error(`GET as ${label}: GUEST_BOOKING not ACTIVE (${gb?.state})`);
      }
    },
  },

  {
    name: 'F-206: disable is Owner-only, sets READ_ONLY, is idempotent, 404s an ungranted module',
    async run(ctx) {
      const tid = ctx.tenant.id;
      await grant(tid, { module: 'GUEST_BOOKING', startDate: iso(-1), endDate: iso(365) });

      const url = `${tenantUrl}/tenants/${tid}/entitlements/GUEST_BOOKING/disable`;

      // Branch manager may not disable.
      const asManager = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${branchManagerToken('manager-1', ctx.branchA?.id ?? 'b', tid)}` },
      });
      if (asManager.status !== 403) throw new Error(`disable as branch_manager: expected 403, got ${asManager.status}`);

      // Owner may.
      const asOwner = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken('owner-1', tid)}` },
      });
      if (asOwner.status !== 200) throw new Error(`disable as owner: expected 200, got ${asOwner.status}`);
      const row = ((await asOwner.json()) as any).data;
      if (row.state !== 'READ_ONLY') throw new Error(`after disable: expected READ_ONLY, got ${row.state}`);
      if (!row.disabledAt) throw new Error('after disable: disabledAt not set');
      if (row.disabledBy !== 'owner-1') throw new Error(`after disable: disabledBy expected owner-1, got ${row.disabledBy}`);

      // Idempotent — a second disable returns the already-disabled row, no error.
      const again = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken('owner-1', tid)}` },
      });
      if (again.status !== 200) throw new Error(`disable again: expected 200, got ${again.status}`);

      // Ungranted module -> 404.
      const missing = await fetch(`${tenantUrl}/tenants/${tid}/entitlements/TOURNAMENT/disable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken('owner-1', tid)}` },
      });
      if (missing.status !== 404) throw new Error(`disable ungranted module: expected 404, got ${missing.status}`);
    },
  },
];
