import { Section } from '@badminton/test-harness';
import {
  db,
  identityUrl,
  slotEngineUrl,
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
];
