import { Section, signJwt, inspect } from '@badminton/test-harness';
import { db, baseUrl, internalKey, SlotEngineContext } from './_fixtures';

/**
 * F-206 — module-entitlement gate (slot-engine enforcement side).
 *
 * requireModuleEntitlement runs right after getInternalOrAdminAuth on every admin config
 * endpoint that belongs to a sellable module. State is a pure function of
 * (now, startDate, endDate, disabledAt) — never stored:
 *   no row / now < startDate / now > endDate     -> read + write denied
 *   startDate <= now <= endDate, not disabled     -> read + write allowed
 *   disabledAt set, now <= endDate                -> read allowed, write denied
 *
 * The internal-key / platform caller bypasses unconditionally, so every pre-F-206 regression
 * section that creates pools via `Authorization: Bearer ${internalKey}` is unaffected.
 *
 * Each section builds its own tenant + branch + pool and its own ModuleEntitlement row, so
 * the states never interfere. GUEST_BOOKING is exercised via POST .../resources (write) and
 * GET .../availability-patterns (read).
 */

const DAY = 24 * 60 * 60 * 1000;

async function makeTenantBranchPool(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tenant = await db.tenant.create({
    data: { name: `F-206 ${label} ${suffix}`, subdomain: `f206-${label}-${suffix}`.toLowerCase().slice(0, 40) },
  });
  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: `F-206 ${label} branch`, status: 'ACTIVE', timezone: 'UTC' },
  });
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: tenant.id,
      branchId: branch.id,
      name: `F-206 ${label} pool`,
      allocationMode: 'POOLED',
      capacity: 2,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;
  return { tenant, branch, pool };
}

async function setEntitlement(
  tenantId: string,
  opts: { startOffsetDays: number; endOffsetDays: number; disabled?: boolean },
) {
  const now = Date.now();
  await db.moduleEntitlement.create({
    data: {
      tenantId,
      module: 'GUEST_BOOKING',
      startDate: new Date(now + opts.startOffsetDays * DAY),
      endDate: new Date(now + opts.endOffsetDays * DAY),
      disabledAt: opts.disabled ? new Date(now - DAY) : null,
    },
  });
}

async function tryWrite(poolId: string, token: string) {
  return inspect(
    await fetch(`${baseUrl}/resource-pools/${poolId}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: `Court ${Math.random().toString(36).slice(2, 6)}` }),
    }),
  );
}

async function tryRead(poolId: string, token: string) {
  return inspect(
    await fetch(`${baseUrl}/resource-pools/${poolId}/availability-patterns`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

function expectStatus(res: any, want: number, ctx: string) {
  if (res.status !== want) throw new Error(`${ctx}: expected ${want}, got ${res.status}: ${res.raw}`);
}
function expectCode(res: any, code: string, ctx: string) {
  const got = res.json?.error?.code;
  if (got !== code) throw new Error(`${ctx}: expected error code ${code}, got ${got}: ${res.raw}`);
}

export const moduleEntitlementSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-206: no entitlement row → admin read AND write both denied (403 MODULE_NOT_ENTITLED)',
    async run() {
      const { tenant, pool } = await makeTenantBranchPool('norow');
      const owner = signJwt({ userId: 'f206-norow-owner', tenantId: tenant.id, roles: ['owner'] });
      // no setEntitlement call
      const w = await tryWrite(pool.id, owner);
      expectStatus(w, 403, 'no-row write');
      expectCode(w, 'MODULE_NOT_ENTITLED', 'no-row write');
      const r = await tryRead(pool.id, owner);
      expectStatus(r, 403, 'no-row read');
      expectCode(r, 'MODULE_NOT_ENTITLED', 'no-row read');
    },
  },

  {
    name: 'F-206: entitlement not yet started (now < startDate) → read and write denied',
    async run() {
      const { tenant, pool } = await makeTenantBranchPool('notstarted');
      const owner = signJwt({ userId: 'f206-ns-owner', tenantId: tenant.id, roles: ['owner'] });
      await setEntitlement(tenant.id, { startOffsetDays: 5, endOffsetDays: 30 });
      expectStatus(await tryWrite(pool.id, owner), 403, 'not-started write');
      expectStatus(await tryRead(pool.id, owner), 403, 'not-started read');
    },
  },

  {
    name: 'F-206: active entitlement (startDate ≤ now ≤ endDate, not disabled) → read and write allowed',
    async run() {
      const { tenant, pool } = await makeTenantBranchPool('active');
      const owner = signJwt({ userId: 'f206-active-owner', tenantId: tenant.id, roles: ['owner'] });
      await setEntitlement(tenant.id, { startOffsetDays: -5, endOffsetDays: 30 });
      const w = await tryWrite(pool.id, owner);
      expectStatus(w, 200, 'active write');
      const r = await tryRead(pool.id, owner);
      expectStatus(r, 200, 'active read');
    },
  },

  {
    name: 'F-206: read-only wind-down (disabledAt set, now ≤ endDate) → read allowed, write denied',
    async run() {
      const { tenant, pool } = await makeTenantBranchPool('readonly');
      const owner = signJwt({ userId: 'f206-ro-owner', tenantId: tenant.id, roles: ['owner'] });
      await setEntitlement(tenant.id, { startOffsetDays: -10, endOffsetDays: 20, disabled: true });
      const r = await tryRead(pool.id, owner);
      expectStatus(r, 200, 'read-only read');
      const w = await tryWrite(pool.id, owner);
      expectStatus(w, 403, 'read-only write');
      expectCode(w, 'MODULE_NOT_ENTITLED', 'read-only write');
    },
  },

  {
    name: 'F-206: hidden (now > endDate, both naturally and after a prior wind-down) → read and write denied',
    async run() {
      const lapsed = await makeTenantBranchPool('lapsed');
      const lapsedOwner = signJwt({ userId: 'f206-lapsed-owner', tenantId: lapsed.tenant.id, roles: ['owner'] });
      await setEntitlement(lapsed.tenant.id, { startOffsetDays: -30, endOffsetDays: -1 });
      expectStatus(await tryRead(lapsed.pool.id, lapsedOwner), 403, 'lapsed read');
      expectStatus(await tryWrite(lapsed.pool.id, lapsedOwner), 403, 'lapsed write');

      const woundDown = await makeTenantBranchPool('wounddown');
      const wdOwner = signJwt({ userId: 'f206-wd-owner', tenantId: woundDown.tenant.id, roles: ['owner'] });
      await setEntitlement(woundDown.tenant.id, { startOffsetDays: -30, endOffsetDays: -1, disabled: true });
      expectStatus(await tryRead(woundDown.pool.id, wdOwner), 403, 'wound-down-then-lapsed read');
      expectStatus(await tryWrite(woundDown.pool.id, wdOwner), 403, 'wound-down-then-lapsed write');
    },
  },

  {
    name: 'F-206: internal-key caller bypasses the gate entirely, even for a tenant with no entitlement row',
    async run() {
      const { pool } = await makeTenantBranchPool('internalbypass');
      // no entitlement row for this tenant at all
      const w = await inspect(
        await fetch(`${baseUrl}/resource-pools/${pool.id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ name: 'Internal Court' }),
        }),
      );
      expectStatus(w, 200, 'internal-key write with no entitlement');
    },
  },

  {
    name: 'F-206: GET /branches/:id/resource-pools is caller-aware — guest token always passes, admin token gated',
    async run() {
      const { tenant, branch } = await makeTenantBranchPool('calleraware');
      // No entitlement row.
      const guest = signJwt({ userId: 'f206-ca-guest', tenantId: tenant.id, userType: 'GUEST', roles: [] });
      const owner = signJwt({ userId: 'f206-ca-owner', tenantId: tenant.id, roles: ['owner'] });

      const asGuest = await inspect(
        await fetch(`${baseUrl}/branches/${branch.id}/resource-pools`, { headers: { Authorization: `Bearer ${guest}` } }),
      );
      expectStatus(asGuest, 200, 'guest lists pools with no entitlement');

      const asAdmin = await inspect(
        await fetch(`${baseUrl}/branches/${branch.id}/resource-pools`, { headers: { Authorization: `Bearer ${owner}` } }),
      );
      expectStatus(asAdmin, 403, 'admin blocked by missing entitlement');
      expectCode(asAdmin, 'MODULE_NOT_ENTITLED', 'admin blocked by missing entitlement');

      // Grant it, and the admin call now succeeds.
      await setEntitlement(tenant.id, { startOffsetDays: -1, endOffsetDays: 30 });
      const asAdminNow = await inspect(
        await fetch(`${baseUrl}/branches/${branch.id}/resource-pools`, { headers: { Authorization: `Bearer ${owner}` } }),
      );
      expectStatus(asAdminNow, 200, 'admin lists pools once entitled');
    },
  },

  {
    name: 'F-206: MEMBER_MANAGEMENT gates the member-group-assignment writes independently of GUEST_BOOKING',
    async run() {
      const { tenant, branch, pool } = await makeTenantBranchPool('member');
      const owner = signJwt({ userId: 'f206-mm-owner', tenantId: tenant.id, roles: ['owner'] });
      // GUEST_BOOKING active, MEMBER_MANAGEMENT absent.
      await setEntitlement(tenant.id, { startOffsetDays: -1, endOffsetDays: 30 });

      const listRes = await inspect(
        await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${pool.id}`, {
          headers: { Authorization: `Bearer ${owner}` },
        }),
      );
      expectStatus(listRes, 403, 'member list without MEMBER_MANAGEMENT');
      expectCode(listRes, 'MODULE_NOT_ENTITLED', 'member list without MEMBER_MANAGEMENT');

      await db.moduleEntitlement.create({
        data: {
          tenantId: tenant.id,
          module: 'MEMBER_MANAGEMENT',
          startDate: new Date(Date.now() - DAY),
          endDate: new Date(Date.now() + 30 * DAY),
        },
      });
      const listNow = await inspect(
        await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${pool.id}`, {
          headers: { Authorization: `Bearer ${owner}` },
        }),
      );
      expectStatus(listNow, 200, 'member list once MEMBER_MANAGEMENT granted');
      void branch;
    },
  },
];
