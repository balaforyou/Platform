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

  {
    name: 'GET /users/lookup — F-228 Step 6: optional ?email= (found, no phone-required, no email leak, invalid email 400, neither/both identifiers 400)',
    async run() {
      const ownerJwt = signJwt({ userId: 'owner-user-2', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' });

      // A Google-first guest with no phone attached yet (F-228 Step 1's exact shape) — the whole
      // point of adding ?email= is to find accounts precisely like this one, which ?phone=
      // structurally cannot reach.
      const emailOnlyUser = await db.user.create({
        data: {
          tenantId: TENANT_ID,
          userType: 'GUEST',
          email: 'provisioning-target@example.com',
          googleId: 'google-provisioning-target',
          isPhoneVerified: false,
        },
      });

      const lookupByEmail = (email: string, jwt: string) =>
        fetch(`${identityUrl}/users/lookup?tenantId=${TENANT_ID}&email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });

      // Found by email; phone is genuinely null (not just absent-from-payload); email itself is
      // not echoed back, same convention as the phone-lookup path above.
      const found = await inspect(await lookupByEmail('provisioning-target@example.com', ownerJwt));
      if (
        found.status !== 200 ||
        found.json?.data?.id !== emailOnlyUser.id ||
        found.json?.data?.phone !== null ||
        found.json?.data?.email
      ) {
        throw new Error(`Expected email lookup to find the user with phone:null and no email leak, got ${found.raw}`);
      }
      console.log('LOOKUP_EVIDENCE email_found_no_phone', JSON.stringify(found.json));

      // Case-insensitive: Google always lowercases before storing (adminGoogleAuth.ts), so the
      // lookup must too, or a real admin typing the address as shown in their own inbox would
      // never match it.
      const foundMixedCase = await inspect(await lookupByEmail('Provisioning-Target@Example.com', ownerJwt));
      if (foundMixedCase.status !== 200 || foundMixedCase.json?.data?.id !== emailOnlyUser.id) {
        throw new Error(`Expected case-insensitive email lookup to match, got ${foundMixedCase.raw}`);
      }
      console.log('Case-insensitive email lookup matches the lowercased stored value.');

      const invalidEmail = await inspect(await lookupByEmail('not-an-email', ownerJwt));
      if (invalidEmail.status !== 400 || invalidEmail.json?.error?.code !== 'INVALID_EMAIL') {
        throw new Error(`Expected invalid email 400 INVALID_EMAIL, got ${invalidEmail.raw}`);
      }

      // Neither identifier -> 400. Both identifiers -> 400 (never silently pick one).
      const neither = await inspect(
        await fetch(`${identityUrl}/users/lookup?tenantId=${TENANT_ID}`, { headers: { Authorization: `Bearer ${ownerJwt}` } }),
      );
      if (neither.status !== 400 || neither.json?.error?.code !== 'BAD_REQUEST') {
        throw new Error(`Expected neither-identifier 400 BAD_REQUEST, got ${neither.raw}`);
      }
      const both = await inspect(
        await fetch(
          `${identityUrl}/users/lookup?tenantId=${TENANT_ID}&phone=9888888888&email=provisioning-target@example.com`,
          { headers: { Authorization: `Bearer ${ownerJwt}` } },
        ),
      );
      if (both.status !== 400 || both.json?.error?.code !== 'BAD_REQUEST') {
        throw new Error(`Expected both-identifiers 400 BAD_REQUEST, got ${both.raw}`);
      }
      console.log('Neither identifier and both identifiers both correctly rejected 400 BAD_REQUEST.');
    },
  },
];
