import { Section } from '@badminton/test-harness';
import {
  db,
  identityUrl,
  slotEngineUrl,
  internalKey,
  IdentityContext,
  TENANT_ID,
  PHONE,
  NORMALIZED_PHONE,
} from './_fixtures';

/**
 * OTP request/verify lifecycle and invite resolution.
 * Migrated verbatim from identity.test.ts Tests 1-3.
 */
export const otpFlowSections: Section<IdentityContext>[] = [
  {
    name: 'OTP rate-limiting & cooldown (429 COOLDOWN_ACTIVE, 429 RATE_LIMIT_EXCEEDED)',
    async run() {
      const otpRes1 = await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });
      if (otpRes1.status !== 200) {
        throw new Error(`Expected first OTP request to return 200, got ${otpRes1.status}`);
      }

      // Second request within 60s must trip the cooldown.
      const otpRes2 = await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });
      if (otpRes2.status !== 429) {
        throw new Error(`Expected second sequential OTP request to trigger 429 Cooldown, got ${otpRes2.status}`);
      }
      const otpData2 = (await otpRes2.json()) as any;
      if (otpData2.error?.code !== 'COOLDOWN_ACTIVE') {
        throw new Error(`Expected error code COOLDOWN_ACTIVE, got ${otpData2.error?.code}`);
      }
      console.log('Cooldown 429 triggered correctly.');

      // Shift timestamps back to clear the cooldown but stay inside the 10-min window.
      await db.otpRequest.updateMany({
        where: { phone: NORMALIZED_PHONE },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
      });

      await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });

      await db.otpRequest.updateMany({
        where: { phone: NORMALIZED_PHONE },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
      });

      await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });

      await db.otpRequest.updateMany({
        where: { phone: NORMALIZED_PHONE },
        data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
      });

      // Fourth request inside 10 minutes must trip the rate limit.
      const otpRes4 = await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });
      if (otpRes4.status !== 429) {
        throw new Error(`Expected 4th request to trigger 429 Rate Limit, got ${otpRes4.status}`);
      }
      const otpData4 = (await otpRes4.json()) as any;
      if (otpData4.error?.code !== 'RATE_LIMIT_EXCEEDED') {
        throw new Error(`Expected error code RATE_LIMIT_EXCEEDED, got ${otpData4.error?.code}`);
      }
      console.log('Rate limit 429 triggered correctly.');
    },
  },

  {
    name: 'OTP verification & registration (wrong code 400, JWT + httpOnly refresh cookie, GUEST default)',
    async run(ctx) {
      await db.otpRequest.deleteMany();
      await fetch(`${identityUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID }),
      });

      const verifyResWrong = await fetch(`${identityUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID, code: '000000' }),
      });
      if (verifyResWrong.status !== 400) {
        throw new Error(`Expected wrong code to return 400, got ${verifyResWrong.status}`);
      }

      const verifyRes = await fetch(`${identityUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, tenantId: TENANT_ID, code: '123456' }),
      });
      if (verifyRes.status !== 201) {
        throw new Error(`Expected OTP verification to return 201, got ${verifyRes.status}`);
      }

      const verifyBody = (await verifyRes.json()) as any;
      const accessToken = verifyBody.data.accessToken;
      const user = verifyBody.data.user;
      const cookieHeader = verifyRes.headers.get('set-cookie');

      if (!accessToken || !cookieHeader || !cookieHeader.includes('refresh_token')) {
        throw new Error('Missing JWT access token or refresh cookie in response.');
      }

      if (user.userType !== 'GUEST') {
        throw new Error(`Expected userType to default to GUEST, got ${user.userType}`);
      }

      // Hand the registered identity to the jwt-session sections.
      ctx.user = user;
      ctx.cookieHeader = cookieHeader;
      console.log('User registered successfully in GUEST mode with valid JWT & Cookies.');
    },
  },

  {
    name: 'Invite resolution & co-player booking linking (+ resolve-invites 401 auth gate)',
    async run(ctx) {
      if (!ctx.user) throw new Error('Registration section must run before invite resolution.');

      const invite = await db.pendingInvite.findUnique({
        where: { phone_tenantId: { phone: NORMALIZED_PHONE, tenantId: TENANT_ID } },
      });
      if (invite) {
        throw new Error('Expected PendingInvite to be deleted upon registration.');
      }

      const dbPlayer = await db.bookingPlayer.findFirst({
        where: { phone: NORMALIZED_PHONE, bookingId: ctx.bookingId },
      });
      if (dbPlayer?.userId !== ctx.user.id) {
        throw new Error(
          `Expected BookingPlayer.userId to be linked to ${ctx.user.id}, got ${dbPlayer?.userId}`,
        );
      }
      console.log('Co-player booking history resolved and linked successfully in Slot Engine.');

      const resolveUnauth = await fetch(`${slotEngineUrl}/bookings/resolve-invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, userId: ctx.user.id }),
      });
      if (resolveUnauth.status !== 401) {
        throw new Error(`Expected resolve-invites without key to return 401, got ${resolveUnauth.status}`);
      }
      console.log('Internal service endpoint resolve-invites rejected 401 unauthenticated requests correctly.');
    },
  },

  {
    // F-119. This route had no authentication at all, so an unauthenticated caller could write
    // PendingInvite rows for any phone/tenant pair. Asserting the status code alone is not enough:
    // a guard that returned 401 while still writing would pass that check, so every rejection here
    // is confirmed by a database read-back proving no row was created.
    name: 'F-119: /users/resolve-invite is internal-key-only (401 unauthenticated, no row written)',
    async run() {
      const PROBE = '+919000771199';
      const scope = { phone: PROBE, tenantId: TENANT_ID };
      const rows = () => db.pendingInvite.count({ where: scope });
      const call = (headers: Record<string, string>) =>
        fetch(`${identityUrl}/users/resolve-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ tenantId: TENANT_ID, phone: PROBE }),
        });

      await db.pendingInvite.deleteMany({ where: scope });

      // 1. No credentials at all — the exact request that succeeded before the fix.
      const unauth = await call({});
      if (unauth.status !== 401) {
        throw new Error(`Expected 401 without a key, got ${unauth.status}`);
      }
      if ((await rows()) !== 0) {
        throw new Error('F-119 regression: rejected with 401 but the PendingInvite row was still written.');
      }

      // 2. Wrong key — rejected, and again nothing written.
      const wrongKey = await call({ Authorization: 'Bearer not-the-internal-key' });
      if (wrongKey.status !== 401) {
        throw new Error(`Expected 401 with a wrong key, got ${wrongKey.status}`);
      }
      if ((await rows()) !== 0) {
        throw new Error('F-119 regression: wrong key rejected but the row was still written.');
      }
      console.log('resolve-invite rejected unauthenticated and wrong-key requests, with no row written.');

      // 3. The legitimate internal caller still works — this is the path the fixture uses.
      const keyed = await call({ Authorization: `Bearer ${internalKey}` });
      if (keyed.status !== 200) {
        throw new Error(`Expected the internal key to succeed, got ${keyed.status}`);
      }
      if ((await rows()) !== 1) {
        throw new Error('Expected exactly one PendingInvite row after the keyed request.');
      }
      console.log('resolve-invite still accepts the internal service key and writes exactly one row.');

      await db.pendingInvite.deleteMany({ where: scope });
    },
  },
];
