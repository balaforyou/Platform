import {
  Section,
  signJwt,
  inspect,
  expectForbidden,
  expectCrossTenantNoLeak,
} from '@badminton/test-harness';
import { db, identityUrl, IdentityContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * ADMIN PHONE LOOKUP — TRUST BOUNDARY SUITE
 * Migrated verbatim from identity.test.ts Test 6.
 *
 * This is the canonical shape for the cross-cutting checks described in
 * @badminton/test-harness's assertions.ts: an admin-only, tenant-scoped lookup
 * that must (a) succeed for in-tenant admins without leaking email, (b) 403 a
 * non-admin, (c) 403 a token from another tenant, and (d) 404 — never 403 — a
 * phone that exists only in another tenant, since a 403 would itself confirm
 * the record's existence.
 *
 * Each response is read exactly once via `inspect()`, then both logged and
 * asserted on from that single read.
 */
export const adminPhoneLookupSections: Section<IdentityContext>[] = [
  {
    name: 'Admin phone lookup trust boundary (scoped success, non-admin 403, tenant-mismatch 403, cross-tenant 404 no-leak, invalid phone 400)',
    async run() {
      const tenant2Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const localPhone = '+919888888888';
      const crossTenantPhone = '+919777777777';

      const localLookupUser = await db.user.create({
        data: {
          id: '44444444-4444-4444-4444-444444444444',
          phone: localPhone,
          tenantId: TENANT_ID,
          userType: 'MEMBER',
          isPhoneVerified: true,
        },
      });
      const crossTenantUser = await db.user.create({
        data: {
          id: '55555555-5555-5555-5555-555555555555',
          phone: crossTenantPhone,
          tenantId: tenant2Id,
          userType: 'MEMBER',
          isPhoneVerified: true,
        },
      });

      const ownerJwt = signJwt({ userId: 'owner-user', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' });
      const branchManagerJwt = signJwt({
        userId: 'manager-user',
        tenantId: TENANT_ID,
        roles: [`branch_manager:${BRANCH_ID}`],
        userType: 'MEMBER',
      });
      const memberJwt = signJwt({ userId: localLookupUser.id, tenantId: TENANT_ID, roles: [], userType: 'MEMBER' });
      const otherTenantJwt = signJwt({ userId: 'other-owner', tenantId: tenant2Id, roles: ['owner'], userType: 'MEMBER' });

      const lookup = (phone: string, jwt: string) =>
        fetch(`${identityUrl}/users/lookup?tenantId=${TENANT_ID}&phone=${phone}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });

      // (a) In-tenant owner succeeds — and the payload must not carry email.
      const lookupSuccess = await inspect(await lookup('9888888888', ownerJwt));
      console.log('LOOKUP_EVIDENCE authorized_success', JSON.stringify(lookupSuccess.json));
      if (
        lookupSuccess.status !== 200 ||
        lookupSuccess.json.data.id !== localLookupUser.id ||
        lookupSuccess.json.data.email
      ) {
        throw new Error(`Expected tenant-local safe lookup without email, got ${lookupSuccess.raw}`);
      }

      // A branch manager is also a valid admin for this lookup.
      const branchManagerLookup = await inspect(await lookup('9888888888', branchManagerJwt));
      if (branchManagerLookup.status !== 200) {
        throw new Error(`Expected branch manager lookup to return 200, got ${branchManagerLookup.status}`);
      }

      // (b) Non-admin member is refused.
      const nonAdmin = await inspect(await lookup('9888888888', memberJwt));
      console.log('LOOKUP_EVIDENCE non_admin_rejection', JSON.stringify(nonAdmin.json));
      await expectForbidden(nonAdmin, 'non-admin member phone lookup');
      if (nonAdmin.json.error?.code !== 'FORBIDDEN') {
        throw new Error(`Expected non-admin FORBIDDEN code, got ${nonAdmin.raw}`);
      }

      // (c) An owner token from a different tenant cannot query this tenant.
      const mismatch = await inspect(await lookup('9888888888', otherTenantJwt));
      console.log('LOOKUP_EVIDENCE tenant_mismatch', JSON.stringify(mismatch.json));
      await expectForbidden(mismatch, 'cross-tenant admin token phone lookup');
      if (mismatch.json.error?.code !== 'FORBIDDEN') {
        throw new Error(`Expected tenant mismatch FORBIDDEN code, got ${mismatch.raw}`);
      }

      // (d) A phone belonging to another tenant must 404, never 403, and must
      //     not echo back anything identifying about that other tenant's user.
      const crossTenant = await inspect(await lookup('9777777777', ownerJwt));
      console.log('LOOKUP_EVIDENCE cross_tenant_non_leak', JSON.stringify(crossTenant.json));
      await expectCrossTenantNoLeak(crossTenant, 'phone belonging to another tenant', [
        crossTenantUser.id,
        crossTenantPhone,
      ]);
      if (crossTenant.json.error?.code !== 'USER_NOT_FOUND') {
        throw new Error(`Expected cross-tenant lookup USER_NOT_FOUND, got ${crossTenant.raw}`);
      }

      const invalidPhone = await inspect(await lookup('12345', ownerJwt));
      console.log('LOOKUP_EVIDENCE invalid_phone', JSON.stringify(invalidPhone.json));
      if (invalidPhone.status !== 400 || invalidPhone.json.error?.code !== 'INVALID_PHONE') {
        throw new Error(`Expected invalid phone 400, got ${invalidPhone.raw}`);
      }
    },
  },
];
