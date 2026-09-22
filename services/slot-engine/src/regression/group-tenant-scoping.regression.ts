import { Section, signJwt } from '@badminton/test-harness';
import { db, baseUrl, TENANT_ID, BRANCH_ID, SlotEngineContext } from './_fixtures';

/**
 * F-277 — GET /groups had no tenant scoping for an owner-role caller: scopedPoolIds stayed
 * undefined on that path, so the query fell through to an unfiltered prisma.group.findMany({}),
 * returning every tenant's batches to any tenant's owner. Live on main since PR #74 (F-133 Slice
 * C). Found live during F-133 Slice E's own dev-stack verification (a JBC-authenticated request
 * returned a courtowner1 batch) while building the structurally identical GET
 * /groups/expiring-renewals, which had the same gap and was fixed first, same shape reused here:
 * an owner caller is now filtered to auth.tenantId.
 *
 * Its own dedicated section/file per Chief's routing decision, not folded into
 * group-renewal.regression.ts's existing assertions -- same real cross-tenant repro Claude Code
 * ran live, reproduced here as a regression: a real JBC-authenticated call to GET /groups after
 * the fix returns only JBC's batches; a real courtowner1-authenticated call returns only its own.
 */

async function makePool(label: string, tenantId: string, branchId: string) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INTERNAL_SERVICE_KEY || 'test-service-key'}` },
    body: JSON.stringify({
      tenantId,
      branchId,
      name: `F-277 ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  return ((await poolRes.json()) as any).data;
}

export const groupTenantScopingSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-277: GET /groups scopes an owner caller to their OWN tenant -- a real cross-tenant request no longer sees another tenant\'s batches',
    async run() {
      // A second, real tenant + branch + MEMBER_MANAGEMENT entitlement -- setupBaseFixtures only
      // seeds TENANT_ID's own entitlement, and this section deliberately proves scoping ACROSS
      // two real, independent tenants rather than reusing TENANT_ID's own branch twice.
      const OTHER_TENANT_ID = 'f277-11111111-2222-3333-4444-555555555555';
      const OTHER_BRANCH_ID = 'f277-66666666-7777-8888-9999-000000000000';
      await db.tenant.upsert({
        where: { id: OTHER_TENANT_ID },
        update: {},
        create: { id: OTHER_TENANT_ID, name: 'F-277 Other Tenant', subdomain: 'f277-other-tenant' },
      });
      await db.branch.upsert({
        where: { id: OTHER_BRANCH_ID },
        update: {},
        create: { id: OTHER_BRANCH_ID, tenantId: OTHER_TENANT_ID, name: 'F-277 Other Branch', status: 'ACTIVE', timezone: 'UTC' },
      });
      await db.moduleEntitlement.upsert({
        where: { tenantId_module: { tenantId: OTHER_TENANT_ID, module: 'MEMBER_MANAGEMENT' } },
        update: { startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01'), disabledAt: null },
        create: { tenantId: OTHER_TENANT_ID, module: 'MEMBER_MANAGEMENT', startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01') },
      });

      const poolA = await makePool('tenant-a', TENANT_ID, BRANCH_ID);
      const poolB = await makePool('tenant-b', OTHER_TENANT_ID, OTHER_BRANCH_ID);

      const groupA = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-277 Tenant A batch', resourcePoolId: poolA.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 30 * 86400000), endDate: new Date(Date.now() + 365 * 86400000),
        },
      });
      const groupB = await db.group.create({
        data: {
          tenantId: OTHER_TENANT_ID, name: 'F-277 Tenant B batch', resourcePoolId: poolB.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 30 * 86400000), endDate: new Date(Date.now() + 365 * 86400000),
        },
      });

      const ownerAJwt = signJwt({ userId: 'f277-owner-a', tenantId: TENANT_ID, roles: ['owner'] });
      const resA = await fetch(`${baseUrl}/groups`, { headers: { Authorization: `Bearer ${ownerAJwt}` } });
      const dataA = ((await resA.json()) as any).data;
      if (resA.status !== 200) throw new Error(`Expected 200 for tenant A's owner, got ${resA.status}`);
      const idsA = dataA.map((g: any) => g.id);
      console.log('F277_EVIDENCE tenantA', JSON.stringify({ sawOwnGroup: idsA.includes(groupA.id), sawOtherTenantGroup: idsA.includes(groupB.id), count: idsA.length }));
      if (!idsA.includes(groupA.id)) {
        throw new Error(`Tenant A's owner must see their own real batch, got ${JSON.stringify(idsA)}`);
      }
      if (idsA.includes(groupB.id)) {
        throw new Error(`F-277 regression: tenant A's owner must NOT see tenant B's batch (cross-tenant leak), got ${JSON.stringify(idsA)}`);
      }

      const ownerBJwt = signJwt({ userId: 'f277-owner-b', tenantId: OTHER_TENANT_ID, roles: ['owner'] });
      const resB = await fetch(`${baseUrl}/groups`, { headers: { Authorization: `Bearer ${ownerBJwt}` } });
      const dataB = ((await resB.json()) as any).data;
      if (resB.status !== 200) throw new Error(`Expected 200 for tenant B's owner, got ${resB.status}`);
      const idsB = dataB.map((g: any) => g.id);
      console.log('F277_EVIDENCE tenantB', JSON.stringify({ sawOwnGroup: idsB.includes(groupB.id), sawOtherTenantGroup: idsB.includes(groupA.id), count: idsB.length }));
      if (!idsB.includes(groupB.id)) {
        throw new Error(`Tenant B's owner must see their own real batch, got ${JSON.stringify(idsB)}`);
      }
      if (idsB.includes(groupA.id)) {
        throw new Error(`F-277 regression: tenant B's owner must NOT see tenant A's batch (cross-tenant leak), got ${JSON.stringify(idsB)}`);
      }

      // The internal-key path is deliberately unaffected -- platform tooling still sees everything,
      // same as GET /groups/expiring-renewals' own internal path.
      const resInternal = await fetch(`${baseUrl}/groups`, { headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_KEY || 'test-service-key'}` } });
      const dataInternal = ((await resInternal.json()) as any).data;
      const idsInternal = dataInternal.map((g: any) => g.id);
      if (!idsInternal.includes(groupA.id) || !idsInternal.includes(groupB.id)) {
        throw new Error(`The internal-key path must still see every tenant's batches, got ${JSON.stringify({ sawA: idsInternal.includes(groupA.id), sawB: idsInternal.includes(groupB.id) })}`);
      }
    },
  },
];
