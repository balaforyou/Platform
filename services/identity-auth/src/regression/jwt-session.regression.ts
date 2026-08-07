import { Section } from '@badminton/test-harness';
import { db, identityUrl, internalKey, IdentityContext, TENANT_ID, PHONE } from './_fixtures';

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
    name: 'Google signup gating, guest-login 403, internal-key promotion, member happy path',
    async run(ctx) {
      if (!ctx.user) throw new Error('Registration section must run before Google gating.');

      // Brand-new Google signup must be gated into the phone-verification flow.
      const googleResNew = await fetch(`${identityUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleIdToken: 'mock-google-token-newuser@example.com',
          tenantId: TENANT_ID,
        }),
      });
      if (googleResNew.status !== 400) {
        throw new Error(`Expected new Google signup to request phone verification, got ${googleResNew.status}`);
      }
      const googleDataNew = (await googleResNew.json()) as any;
      if (googleDataNew.error?.code !== 'PHONE_VERIFICATION_REQUIRED') {
        throw new Error(`Expected PHONE_VERIFICATION_REQUIRED code, got ${googleDataNew.error?.code}`);
      }
      console.log('New Google OAuth signup properly gated to phone verification flow.');

      await fetch(`${identityUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleIdToken: `mock-google-token-${PHONE}@example.com`,
          tenantId: TENANT_ID,
        }),
      });

      // Link the guest to an email so the guest-login restriction can be exercised.
      await db.user.update({
        where: { id: ctx.user.id },
        data: {
          email: `email-${PHONE}@example.com`,
          googleId: `google-id-email-${PHONE}@example.com`,
        },
      });

      const googleResGuestLinked = await fetch(`${identityUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleIdToken: `mock-google-token-email-${PHONE}@example.com`,
          tenantId: TENANT_ID,
        }),
      });
      if (googleResGuestLinked.status !== 403) {
        throw new Error(`Expected guest Google login to return 403, got ${googleResGuestLinked.status}`);
      }
      console.log('Guest Google login blocked with 403 Forbidden correctly.');

      // Promotion to MEMBER is internal-key protected.
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

      const googleResMember = await fetch(`${identityUrl}/auth/google/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleIdToken: `mock-google-token-email-${PHONE}@example.com`,
          tenantId: TENANT_ID,
        }),
      });
      if (googleResMember.status !== 200) {
        throw new Error(`Expected member Google login to return 200, got ${googleResMember.status}`);
      }
      console.log('Member Google login authenticated successfully (Happy Path).');
    },
  },
];
