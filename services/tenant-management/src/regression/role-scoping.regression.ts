import { Section } from '@badminton/test-harness';
import { identityUrl, tenantUrl, internalHeaders, decodeJwtPayload, TenantContext } from './_fixtures';

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

      const checkARes = await fetch(`${tenantUrl}/users/manager-1/branches/${ctx.branchA.id}/check`);
      const checkA = ((await checkARes.json()) as any).data;
      if (checkA.hasAccess !== true) {
        throw new Error('Expected manager to have access to Branch A.');
      }

      const checkBRes = await fetch(`${tenantUrl}/users/manager-1/branches/${branchB.id}/check`);
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
      const checkOwnerRes = await fetch(`${tenantUrl}/users/owner-1/branches/${branchB.id}/check`);
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
];
