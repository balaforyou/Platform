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

      // Replay defense: F-287 introduced a 20s grace window on the just-rotated-away token, so
      // an immediate replay (well within the window) now converges onto the winning refresh
      // token and returns 200 rather than 401 — that convergence is the entire point of the
      // fix (two tabs racing the same rotation must both stay logged in). Real replay defense
      // *past* the grace window is proven by the dedicated grace-window-expiry section below,
      // not by this immediate-replay check anymore.
      const refreshResOld = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${refreshToken}` },
      });
      if (refreshResOld.status !== 200) {
        throw new Error(`Expected old refresh token within the grace window to return 200, got ${refreshResOld.status}`);
      }
      const oldCookieHeader = refreshResOld.headers.get('set-cookie');
      const convergedRefreshToken = oldCookieHeader?.split(';')[0].split('=')[1];
      if (convergedRefreshToken !== newRefreshToken) {
        throw new Error(`Expected grace-window replay to converge onto the winning refresh token ${newRefreshToken}, got ${convergedRefreshToken}`);
      }
      console.log('Refresh token rotation completed; immediate replay within the F-287 grace window converged onto the winning token instead of 401ing.');
    },
  },

  {
    name: 'F-287: concurrent two-tab refresh race converges on one refresh token, grace window genuinely expires, revoked session hard-fails both lookup paths',
    async run(ctx) {
      if (!ctx.cookieHeader) throw new Error('Registration section must run before the F-287 race section.');

      // Establish a fresh, known-good refresh token to race from (the previous section already
      // rotated/converged ctx's original cookie, so re-derive a clean starting point via one
      // more real refresh call rather than reusing a token whose state this section can't be
      // sure of).
      const baseline = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: ctx.cookieHeader },
      });
      if (baseline.status !== 200) throw new Error(`Expected baseline refresh to return 200, got ${baseline.status}`);
      const baselineCookie = baseline.headers.get('set-cookie');
      const baselineRefreshToken = baselineCookie?.split(';')[0].split('=')[1];
      if (!baselineRefreshToken) throw new Error('Missing baseline refresh token cookie.');

      // --- Real two-tab race: two concurrent /auth/refresh calls with the identical cookie. ---
      function callRefresh() {
        return fetch(`${identityUrl}/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: `refresh_token=${baselineRefreshToken}` },
        });
      }
      const [raceResA, raceResB] = await Promise.all([callRefresh(), callRefresh()]);
      if (raceResA.status !== 200 || raceResB.status !== 200) {
        throw new Error(`Expected both racing refresh calls to return 200, got ${raceResA.status} and ${raceResB.status}`);
      }
      const raceCookieA = raceResA.headers.get('set-cookie')?.split(';')[0].split('=')[1];
      const raceCookieB = raceResB.headers.get('set-cookie')?.split(';')[0].split('=')[1];
      if (!raceCookieA || !raceCookieB) throw new Error('Missing racing refresh cookies.');
      // "Both got 200" alone is not sufficient evidence — access tokens are self-contained JWTs
      // that stay valid for their own 15-minute life regardless of refresh-token state, so that
      // assertion alone would pass even with the orphaned-cookie gap the CAS fix exists to
      // close. The real proof is convergence: both callers must land on the exact same winning
      // refresh token, not two independently-issued values where the loser's could be orphaned.
      if (raceCookieA !== raceCookieB) {
        throw new Error(`Expected both racing callers to converge on one refresh token, got ${raceCookieA} vs ${raceCookieB}`);
      }
      const convergedToken = raceCookieA;

      // Real DB read-back BEFORE the third call: exactly one real rotation happened out of the
      // race — previousRefreshToken holds the pre-race baseline value, refreshToken holds the
      // converged value. Must run before the third (sequential) call below, since that call
      // performs its own real rotation and would overwrite previousRefreshToken again.
      const raceSession = await db.authSession.findFirst({ where: { previousRefreshToken: baselineRefreshToken } });
      if (!raceSession) {
        throw new Error('Expected a DB row with previousRefreshToken equal to the pre-race baseline value.');
      }
      if (raceSession.refreshToken !== convergedToken) {
        throw new Error(`Expected the raced row's refreshToken to still be the converged value ${convergedToken} at the moment of the race, got ${raceSession.refreshToken}`);
      }
      console.log('Concurrent two-tab refresh race: both calls returned 200 and converged on one refresh token; DB read-back confirms exactly one real rotation.');

      // A third, real, sequential call using the converged value must also succeed — proving it
      // is genuinely persisted and live, not merely echoed back by the loser's response.
      const thirdCall = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${convergedToken}` },
      });
      if (thirdCall.status !== 200) {
        throw new Error(`Expected the converged refresh token to be genuinely live on a real third call, got ${thirdCall.status}`);
      }
      const thirdCookie = thirdCall.headers.get('set-cookie')?.split(';')[0].split('=')[1];
      console.log('A real third sequential call using the converged refresh token also succeeded.');

      // --- Grace window genuinely expires (tested deterministically, not via a real 20s sleep,
      //     matching the F-065 time-fast-forward technique already used elsewhere in this repo). ---
      const preExpiryRotate = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${thirdCookie}` },
      });
      if (preExpiryRotate.status !== 200) throw new Error(`Expected setup rotation to return 200, got ${preExpiryRotate.status}`);
      const rotatedAwayToken = thirdCookie;
      await db.authSession.updateMany({
        where: { previousRefreshToken: rotatedAwayToken },
        data: { previousTokenExpiresAt: new Date(Date.now() - 1000) },
      });
      const expiredReplay = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${rotatedAwayToken}` },
      });
      if (expiredReplay.status !== 401) {
        throw new Error(`Expected replay past an expired grace window to return 401, got ${expiredReplay.status}`);
      }
      console.log('Grace window genuinely expires: a token whose previousTokenExpiresAt was moved into the past correctly 401s on replay.');

      // --- Revoked session hard-fails on both lookup paths (current-token and previous-token). ---
      const revokeCookie = preExpiryRotate.headers.get('set-cookie')?.split(';')[0].split('=')[1];
      if (!revokeCookie) throw new Error('Missing cookie to set up the revoked-session check.');
      const beforeRevokeSession = await db.authSession.findUnique({ where: { refreshToken: revokeCookie } });
      if (!beforeRevokeSession) throw new Error('Expected a real session row for the revoked-session setup token.');
      // Rotate once more so there is both a live refreshToken and a still-graced previousRefreshToken
      // on the same row, then revoke it — a logged-out session must not be resurrectable via
      // either lookup path.
      const preRevokeRotate = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${revokeCookie}` },
      });
      if (preRevokeRotate.status !== 200) throw new Error(`Expected pre-revoke rotation to return 200, got ${preRevokeRotate.status}`);
      const liveTokenBeforeRevoke = preRevokeRotate.headers.get('set-cookie')?.split(';')[0].split('=')[1];
      if (!liveTokenBeforeRevoke) throw new Error('Missing live token before revoke.');
      await db.authSession.updateMany({ where: { refreshToken: liveTokenBeforeRevoke }, data: { revoked: true } });

      const revokedCurrentReplay = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${liveTokenBeforeRevoke}` },
      });
      if (revokedCurrentReplay.status !== 401) {
        throw new Error(`Expected revoked session's current refresh token to 401, got ${revokedCurrentReplay.status}`);
      }
      const revokedPreviousReplay = await fetch(`${identityUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `refresh_token=${revokeCookie}` },
      });
      if (revokedPreviousReplay.status !== 401) {
        throw new Error(`Expected revoked session's previous (grace-window) refresh token to 401, got ${revokedPreviousReplay.status}`);
      }
      console.log('Revoked session hard-fails on both the current-refreshToken and previousRefreshToken (grace-window) lookup paths.');
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

  {
    name: 'PATCH /users/:id/type — F-228 Step 5: admin JWT dual-path (correct-tenant 200, cross-tenant 403 no-write, non-admin 403, no-auth 401, nonexistent-id 404), internal-key path unchanged',
    async run() {
      const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';

      const target = await db.user.create({
        data: { tenantId: TENANT_ID, userType: 'GUEST', phone: '+919700000005', isPhoneVerified: true },
      });

      function patchType(token: string | null, id: string, userType: string) {
        return fetch(`${identityUrl}/users/${id}/type`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ userType }),
        });
      }

      // --- No auth at all -> 401 ---
      const noAuth = await inspect(await patchType(null, target.id, 'MEMBER'));
      if (noAuth.status !== 401) throw new Error(`Expected no-auth patch to 401, got ${noAuth.status}: ${noAuth.raw}`);

      // --- Non-admin JWT (no owner/branch_manager role) -> 403 ---
      const nonAdminToken = signJwt({ userId: 'non-admin-user', tenantId: TENANT_ID, roles: [], userType: 'MEMBER' });
      const nonAdmin = await inspect(await patchType(nonAdminToken, target.id, 'MEMBER'));
      if (nonAdmin.status !== 403) throw new Error(`Expected non-admin patch to 403, got ${nonAdmin.status}: ${nonAdmin.raw}`);
      console.log('No-auth 401 and non-admin-role 403 both correctly rejected.');

      // --- Admin JWT, correct tenant -> 200, DB read-back confirms the new userType ---
      const ownerToken = signJwt({ userId: 'owner-user', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' });
      const correctTenant = await inspect(await patchType(ownerToken, target.id, 'MEMBER'));
      if (correctTenant.status !== 200) throw new Error(`Expected correct-tenant admin patch to 200, got ${correctTenant.status}: ${correctTenant.raw}`);
      const afterCorrect = await db.user.findUnique({ where: { id: target.id } });
      if (afterCorrect?.userType !== 'MEMBER') {
        throw new Error(`Expected DB read-back userType MEMBER, got ${JSON.stringify(afterCorrect)}`);
      }
      console.log('Admin JWT for the correct tenant promoted the user; DB read-back confirms MEMBER.');

      // --- Admin JWT, different tenant targeting a real user in TENANT_ID -> 403, no write ---
      const otherTenantOwnerToken = signJwt({ userId: 'other-owner', tenantId: OTHER_TENANT_ID, roles: ['owner'], userType: 'MEMBER' });
      const crossTenant = await inspect(await patchType(otherTenantOwnerToken, target.id, 'STAFF'));
      if (crossTenant.status !== 403 || crossTenant.json?.error?.code !== 'FORBIDDEN') {
        throw new Error(`Expected cross-tenant admin patch to 403 FORBIDDEN, got ${crossTenant.status}: ${crossTenant.raw}`);
      }
      const afterCrossTenant = await db.user.findUnique({ where: { id: target.id } });
      if (afterCrossTenant?.userType !== 'MEMBER') {
        throw new Error(`Cross-tenant admin patch must not write: ${JSON.stringify(afterCrossTenant)}`);
      }
      console.log('Admin JWT from a different tenant correctly rejected 403 FORBIDDEN, no write.');

      // --- Admin JWT targeting a nonexistent :id -> 404 ---
      const nonexistent = await inspect(await patchType(ownerToken, '00000000-0000-0000-0000-000000000000', 'MEMBER'));
      if (nonexistent.status !== 404) throw new Error(`Expected nonexistent-id admin patch to 404, got ${nonexistent.status}: ${nonexistent.raw}`);
      console.log('Admin JWT targeting a nonexistent user correctly rejected 404.');

      // --- Internal-key path unchanged: no key -> 401, with key -> 200 (mirrors the existing
      // "internal-key promotion" section above; re-asserted here alongside the new admin path so
      // both paths' evidence lives in one place for this route). ---
      const internalNoKey = await inspect(await patchType(null, target.id, 'STAFF'));
      if (internalNoKey.status !== 401) throw new Error(`Expected internal-key-less patch to 401, got ${internalNoKey.status}: ${internalNoKey.raw}`);
      const internalWithKey = await inspect(await patchType(internalKey, target.id, 'STAFF'));
      if (internalWithKey.status !== 200) throw new Error(`Expected internal-key patch to 200, got ${internalWithKey.status}: ${internalWithKey.raw}`);
      console.log('Internal-key path unchanged: 401 without key, 200 with key.');
    },
  },
];
