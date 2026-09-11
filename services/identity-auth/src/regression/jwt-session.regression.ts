import { Section, signJwt, inspect } from '@badminton/test-harness';
import { db, identityUrl, internalKey, IdentityContext, TENANT_ID } from './_fixtures';

/**
 * Refresh-token rotation/replay defense and Google signup gating.
 * Migrated verbatim from identity.test.ts Tests 4-5.
 *
 * Depends on the otp-flow registration section having populated ctx.user /
 * ctx.cookieHeader — run.ts enforces the order.
 */
export const jwtSessionSections: Section<IdentityContext>[] = [
  {
    name: 'JWT refresh cookie rotation + old-token replay rejected (401)',
    async run(ctx) {
      if (!ctx.cookieHeader) throw new Error('Registration section must run before refresh rotation.');

      const refreshToken = ctx.cookieHeader.split(';')[0].split('=')[1];

      const refreshRes = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      });
      if (refreshRes.status !== 200) {
        throw new Error(`Expected refresh to return 200, got ${refreshRes.status}`);
      }

      const refreshBody = (await refreshRes.json()) as any;
      const newAccessToken = refreshBody.data.accessToken;
      const newCookieHeader = refreshRes.headers.get('set-cookie');

      if (!newAccessToken || !newCookieHeader) {
        throw new Error('Missing new access token or cookie.');
      }

      const newRefreshToken = newCookieHeader.split(';')[0].split('=')[1];
      if (refreshToken === newRefreshToken) {
        throw new Error('Expected refresh token rotation to update token value.');
      }

      // Replay defense: the rotated-away token must no longer work.
      const refreshResOld = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      });
      if (refreshResOld.status !== 401) {
        throw new Error(`Expected old refresh token to return 401, got ${refreshResOld.status}`);
      }
      console.log('Refresh token rotation completed and old token invalidated successfully.');
    },
  },

  {
    name: 'Google token rejection (real verification), internal-key promotion',
    async run(ctx) {
      if (!ctx.user) throw new Error('Registration section must run before Google gating.');

      // F-228 Step 1: /auth/google/verify now does real JWKS verification with no mock
      // fallback in any environment. The old 'mock-google-token-<email>' format is just a
      // garbage string to the real verifier — confirm it fails as such, not silently accepted.
      const googleResBadToken = await fetch(`${identityUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleIdToken: 'mock-google-token-anything',
          tenantId: TENANT_ID,
        }),
      });
      if (googleResBadToken.status !== 401) {
        throw new Error(`Expected non-JWT Google token to be rejected 401, got ${googleResBadToken.status}`);
      }
      const googleDataBadToken = (await googleResBadToken.json()) as any;
      if (googleDataBadToken.error?.code !== 'INVALID_GOOGLE_TOKEN') {
        throw new Error(`Expected INVALID_GOOGLE_TOKEN code, got ${googleDataBadToken.error?.code}`);
      }
      console.log('Old mock-google-token- format correctly rejected by real verification.');

      // Promotion to MEMBER is internal-key protected. Unrelated to Google verification.
      const patchUnauth = await fetch(`${identityUrl}/users/${ctx.user.id}/type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType: 'MEMBER' }),
      });
      if (patchUnauth.status !== 401) {
        throw new Error(`Expected patch without internal key to return 401, got ${patchUnauth.status}`);
      }

      const patchRes = await fetch(`${identityUrl}/users/${ctx.user.id}/type`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${internalKey}`,
        },
        body: JSON.stringify({ userType: 'MEMBER' }),
      });
      if (patchRes.status !== 200) {
        throw new Error(`Expected userType promotion to return 200, got ${patchRes.status}`);
      }
      console.log('User promoted to MEMBER securely using INTERNAL_SERVICE_KEY.');
    },
  },

  {
    name: 'POST /auth/otp/attach-phone — F-228 Step 2: first attach, idempotent retry, change-number reject, phone-collision reject, cross-tenant isolation, no-auth 401',
    async run() {
      const TENANT2_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
      const ATTACH_PHONE = '9700000001';
      const ATTACH_PHONE_NORMALIZED = '+919700000001';
      const OTHER_PHONE = '9700000003';
      const CONFLICT_PHONE = '9700000002';
      const CONFLICT_PHONE_NORMALIZED = '+919700000002';
      const CROSS_TENANT_PHONE = '9700000004';

      async function requestOtp(phone: string, tenantId: string) {
        const res = await fetch(`${identityUrl}/auth/otp/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, tenantId }),
        });
        if (res.status !== 200) throw new Error(`Expected OTP request to return 200, got ${res.status}`);
      }

      function attachPhone(token: string | null, phone: string, code: string) {
        return fetch(`${identityUrl}/auth/otp/attach-phone`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ phone, code }),
        });
      }

      // --- No/invalid auth token -> 401 ---
      const noAuth = await inspect(await attachPhone(null, ATTACH_PHONE, '123456'));
      if (noAuth.status !== 401) throw new Error(`Expected no-auth attach to 401, got ${noAuth.status}: ${noAuth.raw}`);
      const badAuth = await inspect(await attachPhone('not-a-real-token', ATTACH_PHONE, '123456'));
      if (badAuth.status !== 401) throw new Error(`Expected bad-token attach to 401, got ${badAuth.status}: ${badAuth.raw}`);
      console.log('attach-phone rejects missing/invalid auth with 401.');

      // --- Fresh Google-created-style GUEST (phone:null) ---
      const guest = await db.user.create({
        data: { tenantId: TENANT_ID, userType: 'GUEST', email: 'attach-target@example.com', googleId: 'google-attach-target', isPhoneVerified: false },
      });
      const guestToken = signJwt({ userId: guest.id, tenantId: TENANT_ID, userType: 'GUEST', roles: [] });

      // --- Wrong code first, then correct code on the same OTP request ---
      await requestOtp(ATTACH_PHONE, TENANT_ID);
      const wrongCode = await inspect(await attachPhone(guestToken, ATTACH_PHONE, '000000'));
      if (wrongCode.status !== 400 || wrongCode.json?.error?.code !== 'INVALID_OTP_CODE') {
        throw new Error(`Expected wrong code to 400 INVALID_OTP_CODE, got ${wrongCode.status}: ${wrongCode.raw}`);
      }

      const firstAttach = await inspect(await attachPhone(guestToken, ATTACH_PHONE, '123456'));
      if (firstAttach.status !== 200) throw new Error(`Expected first attach to 200, got ${firstAttach.status}: ${firstAttach.raw}`);
      if (firstAttach.json?.data?.phone !== ATTACH_PHONE_NORMALIZED || firstAttach.json?.data?.isPhoneVerified !== true) {
        throw new Error(`Expected phone/isPhoneVerified set on first attach, got ${firstAttach.raw}`);
      }
      const afterFirst = await db.user.findUnique({ where: { id: guest.id } });
      if (afterFirst?.phone !== ATTACH_PHONE_NORMALIZED || afterFirst?.isPhoneVerified !== true) {
        throw new Error(`DB read-back mismatch after first attach: ${JSON.stringify(afterFirst)}`);
      }
      console.log('First attach: wrong-code rejected, correct code succeeded, DB read-back confirms phone + isPhoneVerified.');

      // --- Idempotent retry: same phone again, still requires a fresh valid OTP ---
      await requestOtp(ATTACH_PHONE, TENANT_ID);
      const idempotent = await inspect(await attachPhone(guestToken, ATTACH_PHONE, '123456'));
      if (idempotent.status !== 200) throw new Error(`Expected idempotent re-attach to 200, got ${idempotent.status}: ${idempotent.raw}`);
      const afterIdempotent = await db.user.findUnique({ where: { id: guest.id } });
      if (afterIdempotent?.phone !== ATTACH_PHONE_NORMALIZED) {
        throw new Error(`Idempotent retry changed the phone unexpectedly: ${JSON.stringify(afterIdempotent)}`);
      }
      console.log('Idempotent retry of the same already-attached phone returns 200, no change.');

      // --- Already verified, DIFFERENT phone -> 409 PHONE_ALREADY_ATTACHED (rejected before OTP check) ---
      const changeNumber = await inspect(await attachPhone(guestToken, OTHER_PHONE, 'irrelevant'));
      if (changeNumber.status !== 409 || changeNumber.json?.error?.code !== 'PHONE_ALREADY_ATTACHED') {
        throw new Error(`Expected change-number to 409 PHONE_ALREADY_ATTACHED, got ${changeNumber.status}: ${changeNumber.raw}`);
      }
      console.log('Already-verified caller submitting a different phone correctly rejected 409 PHONE_ALREADY_ATTACHED.');

      // --- Target phone already linked to a different, existing account -> 409 PHONE_ALREADY_LINKED ---
      await db.user.create({
        data: { tenantId: TENANT_ID, userType: 'MEMBER', phone: CONFLICT_PHONE_NORMALIZED, isPhoneVerified: true },
      });
      const guest2 = await db.user.create({
        data: { tenantId: TENANT_ID, userType: 'GUEST', email: 'attach-target-2@example.com', googleId: 'google-attach-target-2', isPhoneVerified: false },
      });
      const guest2Token = signJwt({ userId: guest2.id, tenantId: TENANT_ID, userType: 'GUEST', roles: [] });
      await requestOtp(CONFLICT_PHONE, TENANT_ID);
      const collision = await inspect(await attachPhone(guest2Token, CONFLICT_PHONE, '123456'));
      if (collision.status !== 409 || collision.json?.error?.code !== 'PHONE_ALREADY_LINKED') {
        throw new Error(`Expected phone collision to 409 PHONE_ALREADY_LINKED, got ${collision.status}: ${collision.raw}`);
      }
      const guest2AfterCollision = await db.user.findUnique({ where: { id: guest2.id } });
      if (guest2AfterCollision?.phone !== null) {
        throw new Error(`Rejected collision must not write the phone: ${JSON.stringify(guest2AfterCollision)}`);
      }
      console.log('Target phone already linked to a different account correctly rejected 409 PHONE_ALREADY_LINKED, no write.');

      // --- Cross-tenant isolation: OTP requested under TENANT_ID is invisible to a token from TENANT2_ID ---
      const guest3 = await db.user.create({
        data: { tenantId: TENANT2_ID, userType: 'GUEST', email: 'attach-target-3@example.com', googleId: 'google-attach-target-3', isPhoneVerified: false },
      });
      const guest3Token = signJwt({ userId: guest3.id, tenantId: TENANT2_ID, userType: 'GUEST', roles: [] });
      await requestOtp(CROSS_TENANT_PHONE, TENANT_ID);
      const crossTenant = await inspect(await attachPhone(guest3Token, CROSS_TENANT_PHONE, '123456'));
      if (crossTenant.status !== 400 || crossTenant.json?.error?.code !== 'OTP_EXPIRED_OR_INVALID') {
        throw new Error(`Expected cross-tenant OTP lookup to miss (400 OTP_EXPIRED_OR_INVALID), got ${crossTenant.status}: ${crossTenant.raw}`);
      }
      console.log('A token from a different tenant cannot see an OTP requested under another tenantId — isolation holds.');
    },
  },
];
