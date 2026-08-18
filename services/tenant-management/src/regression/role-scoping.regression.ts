import { Section } from '@badminton/test-harness';
import { db, identityUrl, tenantUrl, internalHeaders, decodeJwtPayload, TenantContext } from './_fixtures';

/**
 * Role scoping enforcement and end-to-end JWT role embedding.
 * Migrated verbatim from tenant.test.ts Tests 2 and 3.
 *
 * These sections depend on Branch A existing — run.ts orders branch-lifecycle first.
 */
export const roleScopingSections: Section<TenantContext>[] = [
  {
    name: 'Role scoping (BRANCH_MANAGER limited to its branch, OWNER null-branchId access-all)',
    async run(ctx) {
      if (!ctx.branchA) throw new Error('Branch lifecycle section must run before role scoping.');

      const branchRes2 = await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/branches`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ name: 'Branch B' }),
      });
      const branchB = ((await branchRes2.json()) as any).data;
      ctx.branchB = branchB;

      await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/roles`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ userId: 'manager-1', role: 'BRANCH_MANAGER', branchId: ctx.branchA.id }),
      });

      const checkARes = await fetch(`${tenantUrl}/users/manager-1/branches/${ctx.branchA.id}/check`, { headers: internalHeaders });
      const checkA = ((await checkARes.json()) as any).data;
      if (checkA.hasAccess !== true) {
        throw new Error('Expected manager to have access to Branch A.');
      }

      const checkBRes = await fetch(`${tenantUrl}/users/manager-1/branches/${branchB.id}/check`, { headers: internalHeaders });
      const checkB = ((await checkBRes.json()) as any).data;
      if (checkB.hasAccess !== false) {
        throw new Error('Scoping bypass! Scoped manager was granted access to Branch B.');
      }
      console.log('Role scoping restrictions successfully enforced (Access A: allowed, Access B: denied).');

      await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/roles`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ userId: 'owner-1', role: 'OWNER', branchId: null }),
      });

      // A null branchId on an OWNER row is the documented access-all bypass.
      const checkOwnerRes = await fetch(`${tenantUrl}/users/owner-1/branches/${branchB.id}/check`, { headers: internalHeaders });
      const checkOwner = ((await checkOwnerRes.json()) as any).data;
      if (checkOwner.hasAccess !== true) {
        throw new Error('Expected OWNER (null branchId) to access Branch B.');
      }
      console.log('Owner null-branchId bypass successfully verified (Access granted to all branches).');
    },
  },

  {
    name: 'E2E JWT role embedding (login → promote → assign role → re-login → roles claim present)',
    async run(ctx) {
      if (!ctx.branchA) throw new Error('Branch lifecycle section must run before JWT role embedding.');

      const userPhone = '8888888888';

      await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userPhone, tenantId: ctx.tenant.id }),
      });

      const verifyRes = await fetch(`${identityUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userPhone, tenantId: ctx.tenant.id, code: '123456' }),
      });
      const verifyBody = ((await verifyRes.json()) as any).data;
      const user = verifyBody.user;

      await fetch(`${identityUrl}/users/${user.id}/type`, {
        method: 'PATCH',
        headers: internalHeaders,
        body: JSON.stringify({ userType: 'MEMBER' }),
      });

      const roleRes = await fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/roles`, {
        method: 'POST',
        headers: internalHeaders,
        body: JSON.stringify({ userId: user.id, role: 'BRANCH_MANAGER', branchId: ctx.branchA.id }),
      });
      if (roleRes.status !== 200) {
        throw new Error(`Expected role assignment to succeed, got status ${roleRes.status}`);
      }

      // Re-login so the freshly assigned role is baked into a new access token.
      await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userPhone, tenantId: ctx.tenant.id }),
      });
      const loginRes = await fetch(`${identityUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userPhone, tenantId: ctx.tenant.id, code: '123456' }),
      });
      const loginBody = ((await loginRes.json()) as any).data;
      const token = loginBody.accessToken;

      const decoded = decodeJwtPayload(token);
      console.log('Decoded JWT payload claims:', decoded);

      if (!decoded.roles || !decoded.roles.includes(`branch_manager:${ctx.branchA.id}`)) {
        throw new Error(
          `Expected JWT roles claim to carry branch_manager:${ctx.branchA.id}, got: ${JSON.stringify(decoded.roles)}`,
        );
      }
      console.log('End-to-End verification successful! JWT token successfully embedded the Tenant-assigned roles.');
    },
  },

  {
    // F-115 / F-117. These two invariants pull in opposite directions and only a test
    // distinguishes the correct index from a plausible-looking wrong one: a plain
    // UNIQUE(userId, tenantId, branchId) passes review but does NOT dedupe owners,
    // because OWNER rows carry branchId = null and Postgres treats nulls as distinct.
    // If someone regenerates the index from schema.prisma alone it comes back plain,
    // and the first assertion below is what fails.
    name: 'Role assignment is idempotent per scope (F-115) without blocking multiple owners (F-117)',
    async run(ctx) {
      const assign = (userId: string, role: string, branchId: string | null) =>
        fetch(`${tenantUrl}/tenants/${ctx.tenant.id}/roles`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({ userId, role, branchId }),
        });

      const countFor = (userId: string, branchId: string | null) =>
        db.roleAssignment.count({ where: { userId, tenantId: ctx.tenant.id, branchId } });

      // 1. F-115: re-assigning the same user at the same scope must not add a row.
      // owner-1 was already assigned OWNER by the role-scoping section above.
      const repeatRes = await assign('owner-1', 'OWNER', null);
      if (repeatRes.status !== 200) {
        throw new Error(`Expected repeat owner assignment to return 200, got ${repeatRes.status}`);
      }
      const ownerRows = await countFor('owner-1', null);
      if (ownerRows !== 1) {
        throw new Error(
          `F-115 regression: re-assigning owner-1 left ${ownerRows} rows, expected exactly 1. ` +
            'A plain unique index (NULLS DISTINCT) would produce 2 here.',
        );
      }
      console.log('F-115 verified: repeat owner assignment updated in place, still exactly 1 row.');

      // 2. F-117: a different user must still be able to hold OWNER on the same tenant.
      const secondOwnerRes = await assign('owner-2', 'OWNER', null);
      if (secondOwnerRes.status !== 200) {
        throw new Error(`Expected a second distinct owner to be allowed, got ${secondOwnerRes.status}`);
      }
      const tenantOwners = await db.roleAssignment.count({
        where: { tenantId: ctx.tenant.id, role: 'OWNER' },
      });
      if (tenantOwners !== 2) {
        throw new Error(
          `F-117 regression: expected 2 owners on the tenant, found ${tenantOwners}. ` +
            'The unique key must include userId so multi-owner stays possible.',
        );
      }
      console.log('F-117 verified: two distinct owners coexist on one tenant.');

      // 3. The upsert replaces the role at that scope rather than stacking a second row.
      // Uses a throwaway user so no other section's expectations are disturbed.
      if (!ctx.branchA) throw new Error('Branch lifecycle section must run before this section.');
      await assign('f115-rotating-user', 'BRANCH_MANAGER', ctx.branchA.id);
      await assign('f115-rotating-user', 'FRONT_DESK', ctx.branchA.id);
      const rotated = await db.roleAssignment.findMany({
        where: { userId: 'f115-rotating-user', tenantId: ctx.tenant.id, branchId: ctx.branchA.id },
      });
      if (rotated.length !== 1 || rotated[0].role !== 'FRONT_DESK') {
        throw new Error(
          `Expected one row updated to FRONT_DESK, got ${rotated.length} row(s): ` +
            JSON.stringify(rotated.map((r) => r.role)),
        );
      }
      console.log('Role rotation verified: re-assignment updates the existing row in place.');
    },
  },
];
