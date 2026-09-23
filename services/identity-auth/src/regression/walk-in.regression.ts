import { Section, signJwt, inspect } from '@badminton/test-harness';
import { db, identityUrl, internalKey, IdentityContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * WALK-IN GUEST IDENTITY — F-229 Step 2
 *
 * `POST /users/walk-in` creates or resolves a lightweight GUEST account for a guest an admin is
 * booking for in person or over the phone. No OTP, no session. Dual-path auth (internal key OR
 * owner/branch_manager JWT), STRICTER than requirePaymentLinkAdmin — the JWT path also enforces
 * decoded.tenantId === body.tenantId.
 *
 * Also covers the F-229 §4 change: GET /users/lookup now returns `name` (and still never `email`).
 */

const OWNER_TENANT = TENANT_ID;
const OTHER_TENANT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Full `Authorization` header values (Bearer-prefixed) — @fastify/jwt's jwtVerify() requires it.
const ownerJwt = `Bearer ${signJwt({ userId: 'walkin-owner', tenantId: OWNER_TENANT, roles: ['owner'], userType: 'MEMBER' })}`;
const branchManagerJwt = `Bearer ${signJwt({
  userId: 'walkin-manager',
  tenantId: OWNER_TENANT,
  roles: [`branch_manager:${BRANCH_ID}`],
  userType: 'MEMBER',
})}`;
const nonAdminJwt = `Bearer ${signJwt({ userId: 'walkin-member', tenantId: OWNER_TENANT, roles: [], userType: 'MEMBER' })}`;
const otherTenantOwnerJwt = `Bearer ${signJwt({ userId: 'other-owner', tenantId: OTHER_TENANT, roles: ['owner'], userType: 'MEMBER' })}`;

const walkIn = (body: unknown, auth?: string) =>
  fetch(`${identityUrl}/users/walk-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

export const walkInSections: Section<IdentityContext>[] = [
  {
    name: 'POST /users/walk-in — internal key: new phone creates GUEST (isPhoneVerified:false, name set), re-run returns existing without overwriting name',
    async run() {
      const phone = '9800000001';
      const normalized = '+919800000001';

      const first = await inspect(await walkIn({ phone, name: '  Ravi Kumar  ', tenantId: OWNER_TENANT }, `Bearer ${internalKey}`));
      console.log('WALKIN_EVIDENCE internal_new', JSON.stringify(first.json));
      if (first.status !== 200 || first.json.data.created !== true) {
        throw new Error(`Expected 200 created:true, got ${first.raw}`);
      }
      const row = await db.user.findUnique({ where: { phone_tenantId: { phone: normalized, tenantId: OWNER_TENANT } } });
      if (!row || row.userType !== 'GUEST' || row.isPhoneVerified !== false || row.name !== 'Ravi Kumar') {
        throw new Error(`DB read-back wrong: ${JSON.stringify(row)}`);
      }
      if (first.json.data.id !== row.id || first.json.data.name !== 'Ravi Kumar') {
        throw new Error(`Response/DB mismatch: ${first.raw}`);
      }

      // Re-run with a DIFFERENT name — must return the existing row unchanged.
      const second = await inspect(await walkIn({ phone, name: 'Someone Else', tenantId: OWNER_TENANT }, `Bearer ${internalKey}`));
      console.log('WALKIN_EVIDENCE internal_existing', JSON.stringify(second.json));
      if (second.status !== 200 || second.json.data.created !== false || second.json.data.id !== row.id) {
        throw new Error(`Expected 200 created:false same id, got ${second.raw}`);
      }
      const after = await db.user.findUnique({ where: { id: row.id } });
      if (after?.name !== 'Ravi Kumar') {
        throw new Error(`name was overwritten on an existing row: ${JSON.stringify(after)}`);
      }
    },
  },
  {
    name: 'POST /users/walk-in — owner and branch_manager JWTs (own tenant) both create',
    async run() {
      const a = await inspect(await walkIn({ phone: '9800000002', name: 'Owner Made', tenantId: OWNER_TENANT }, ownerJwt));
      if (a.status !== 200 || a.json.data.created !== true) throw new Error(`owner path: ${a.raw}`);

      const b = await inspect(await walkIn({ phone: '9800000003', name: 'Manager Made', tenantId: OWNER_TENANT }, branchManagerJwt));
      if (b.status !== 200 || b.json.data.created !== true) throw new Error(`branch_manager path: ${b.raw}`);
    },
  },
  {
    name: 'POST /users/walk-in — auth failures: wrong-tenant JWT 403, non-admin 403, no auth 401 (and no row written)',
    async run() {
      const mismatch = await inspect(await walkIn({ phone: '9800000004', name: 'X', tenantId: OWNER_TENANT }, otherTenantOwnerJwt));
      console.log('WALKIN_EVIDENCE tenant_mismatch', JSON.stringify(mismatch.json));
      if (mismatch.status !== 403 || mismatch.json.error?.code !== 'FORBIDDEN') throw new Error(`tenant mismatch: ${mismatch.raw}`);

      const nonAdmin = await inspect(await walkIn({ phone: '9800000004', name: 'X', tenantId: OWNER_TENANT }, nonAdminJwt));
      if (nonAdmin.status !== 403 || nonAdmin.json.error?.code !== 'FORBIDDEN') throw new Error(`non-admin: ${nonAdmin.raw}`);

      const noAuth = await inspect(await walkIn({ phone: '9800000004', name: 'X', tenantId: OWNER_TENANT }));
      if (noAuth.status !== 401) throw new Error(`no auth: ${noAuth.raw}`);

      const leaked = await db.user.findUnique({ where: { phone_tenantId: { phone: '+919800000004', tenantId: OWNER_TENANT } } });
      if (leaked) throw new Error('a rejected walk-in still wrote a User row');
    },
  },
  {
    name: 'POST /users/walk-in — input validation: bad phone 400 INVALID_PHONE, empty name 400 INVALID_NAME, missing field 400 BAD_REQUEST',
    async run() {
      const badPhone = await inspect(await walkIn({ phone: '12345', name: 'X', tenantId: OWNER_TENANT }, `Bearer ${internalKey}`));
      if (badPhone.status !== 400 || badPhone.json.error?.code !== 'INVALID_PHONE') throw new Error(`bad phone: ${badPhone.raw}`);

      const emptyName = await inspect(await walkIn({ phone: '9800000005', name: '   ', tenantId: OWNER_TENANT }, `Bearer ${internalKey}`));
      if (emptyName.status !== 400 || emptyName.json.error?.code !== 'INVALID_NAME') throw new Error(`empty name: ${emptyName.raw}`);

      const missing = await inspect(await walkIn({ phone: '9800000005', tenantId: OWNER_TENANT }, `Bearer ${internalKey}`));
      if (missing.status !== 400 || missing.json.error?.code !== 'BAD_REQUEST') throw new Error(`missing name: ${missing.raw}`);
    },
  },
  {
    name: 'GET /users/lookup — F-229 §4: returns `name` for a walk-in-created guest, still never `email`',
    async run() {
      // seed a guest that has both name and email set
      await db.user.create({
        data: {
          phone: '+919800000009',
          tenantId: OWNER_TENANT,
          name: 'Lookup Target',
          email: 'lookup-target@example.com',
          userType: 'GUEST',
          isPhoneVerified: false,
        },
      });

      const res = await inspect(
        await fetch(`${identityUrl}/users/lookup?tenantId=${OWNER_TENANT}&phone=9800000009`, {
          headers: { Authorization: ownerJwt },
        }),
      );
      console.log('WALKIN_EVIDENCE lookup_name', JSON.stringify(res.json));
      if (res.status !== 200 || res.json.data.name !== 'Lookup Target') {
        throw new Error(`Expected lookup to return name, got ${res.raw}`);
      }
      if (res.json.data.email) {
        throw new Error(`lookup leaked email: ${res.raw}`);
      }
    },
  },

  {
    name: 'F-291: GET /users/:id now requires the internal service key (401 unauthenticated, 401 wrong key, 200 correct key, real user row)',
    async run() {
      const user = await db.user.create({
        data: {
          id: 'f291-detail-user',
          phone: '+919888800291',
          name: 'F291 Detail Target',
          tenantId: OWNER_TENANT,
          userType: 'GUEST',
          isPhoneVerified: true,
        },
      });

      const noAuthRes = await inspect(await fetch(`${identityUrl}/users/${user.id}`));
      console.log('F291_EVIDENCE no_auth', JSON.stringify({ status: noAuthRes.status }));
      if (noAuthRes.status !== 401) {
        throw new Error(`Expected 401 with no auth header, got ${noAuthRes.status}: ${noAuthRes.raw}`);
      }

      const wrongKeyRes = await inspect(
        await fetch(`${identityUrl}/users/${user.id}`, { headers: { Authorization: 'Bearer not-the-real-key' } }),
      );
      console.log('F291_EVIDENCE wrong_key', JSON.stringify({ status: wrongKeyRes.status }));
      if (wrongKeyRes.status !== 401) {
        throw new Error(`Expected 401 with a wrong key, got ${wrongKeyRes.status}: ${wrongKeyRes.raw}`);
      }

      const realRes = await inspect(
        await fetch(`${identityUrl}/users/${user.id}`, { headers: { Authorization: `Bearer ${internalKey}` } }),
      );
      console.log('F291_EVIDENCE real_key', JSON.stringify({ status: realRes.status, id: realRes.json?.data?.id }));
      if (realRes.status !== 200) {
        throw new Error(`Expected 200 with the real internal key, got ${realRes.status}: ${realRes.raw}`);
      }
      if (realRes.json.data.id !== user.id || realRes.json.data.phone !== user.phone) {
        throw new Error(`Expected the real user row back, got ${realRes.raw}`);
      }
    },
  },
];
