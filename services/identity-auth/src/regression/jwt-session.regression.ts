import { Section } from '@badminton/test-harness';
import { identityUrl, internalKey, IdentityContext, TENANT_ID } from './_fixtures';

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
];
