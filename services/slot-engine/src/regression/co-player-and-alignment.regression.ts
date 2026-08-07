import { Section, signJwt } from '@badminton/test-harness';
import { baseUrl, SlotEngineContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * MIGRATED FROM PLAYWRIGHT (findings-verification.spec.ts).
 *
 * F-009 (backend half) and F-010 were both pure `request.post` API checks
 * sitting inside a browser suite — they drove no UI and asserted nothing
 * visual, so they cost a full browser run for no benefit. They now live here.
 *
 * What stayed in Playwright: F-009's client-side half only (the red error box
 * rendering and the successful-reserve redirect), which genuinely needs a browser.
 *
 * NOTE on the JWT below: POST /bookings does not currently call jwtVerify() —
 * it reads userId straight from the body (see F-045 in docs/findings_register.md,
 * out of scope here). The token is sent anyway to keep parity with how the
 * original Playwright test called this endpoint. These sections deliberately
 * encode CURRENT behavior; they must not be rewritten to assert F-045's fix
 * until that fix actually lands.
 */
export const coPlayerAndAlignmentSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-009: co-player phone validation rejects malformed numbers server-side (400)',
    async run(ctx) {
      const token = signJwt({
        userId: 'f009-regression-user',
        tenantId: TENANT_ID,
        userType: 'GUEST',
        roles: [],
      });

      const postBooking = async (idempotencyKey: string, coPlayers: string[]) =>
        fetch(`${baseUrl}/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            resourcePoolId: ctx.pooledPool.id,
            windowId: ctx.pooledWindow.id,
            userId: 'f009-regression-user',
            coPlayers,
          }),
        });

      // Too short to be an Indian mobile number.
      const badPhoneResponse1 = await postBooking('bad-phone-test-1', ['12345']);
      if (badPhoneResponse1.status !== 400) {
        throw new Error(`Expected 400 for short co-player phone, got ${badPhoneResponse1.status}`);
      }
      const text1 = await badPhoneResponse1.text();
      if (!text1.includes('Invalid co-player phone number format')) {
        throw new Error(`Expected co-player format error message, got: ${text1}`);
      }

      // 10 digits but does not start with 6-9.
      const badPhoneResponse2 = await postBooking('bad-phone-test-2', ['1234567890']);
      if (badPhoneResponse2.status !== 400) {
        throw new Error(`Expected 400 for invalid-prefix co-player phone, got ${badPhoneResponse2.status}`);
      }
      const text2 = await badPhoneResponse2.text();
      if (!text2.includes('Invalid co-player phone number format')) {
        throw new Error(`Expected co-player format error message, got: ${text2}`);
      }

      console.log('F009_BACKEND_VALIDATION', {
        shortPhoneStatus: badPhoneResponse1.status,
        invalidPrefixStatus: badPhoneResponse2.status,
      });
    },
  },

  {
    name: 'F-010: unaligned availability-window times rejected with computed boundary suggestion (60- and 30-minute pools)',
    async run() {
      const createPool = async (name: string, minBookingDurationMinutes: number) => {
        const res = await fetch(`${baseUrl}/resource-pools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            name,
            allocationMode: 'POOLED',
            minBookingDurationMinutes,
          }),
        });
        if (!res.ok) throw new Error(`Failed to create ${name}: ${res.status}`);
        return ((await res.json()) as any).data;
      };

      const postWindow = async (poolId: string, startTime: string, endTime: string) =>
        fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime, endTime, capacity: 1 }),
        });

      // 60-minute pool: unaligned startTime must suggest the two nearest hours.
      const pool60 = await createPool('Pool 60min Test', 60);
      const res60 = await postWindow(pool60.id, '2026-07-31T22:16:00', '2026-07-31T23:00:00');
      if (res60.status !== 400) {
        throw new Error(`Expected 400 for unaligned 60-minute start, got ${res60.status}`);
      }
      const text60 = await res60.text();
      if (!text60.includes('Start time must align to 60-minute slots')) {
        throw new Error(`Expected 60-minute alignment message, got: ${text60}`);
      }
      if (!text60.includes('You entered 22:16 — did you mean 22:00 or 23:00?')) {
        throw new Error(`Expected 60-minute boundary suggestion, got: ${text60}`);
      }

      // 30-minute pool: same input suggests different boundaries.
      const pool30 = await createPool('Pool 30min Test', 30);
      const res30 = await postWindow(pool30.id, '2026-07-31T22:16:00', '2026-07-31T23:00:00');
      if (res30.status !== 400) {
        throw new Error(`Expected 400 for unaligned 30-minute start, got ${res30.status}`);
      }
      const text30 = await res30.text();
      if (!text30.includes('Start time must align to 30-minute slots')) {
        throw new Error(`Expected 30-minute alignment message, got: ${text30}`);
      }
      if (!text30.includes('You entered 22:16 — did you mean 22:00 or 22:30?')) {
        throw new Error(`Expected 30-minute boundary suggestion, got: ${text30}`);
      }

      // endTime is validated independently of startTime.
      const res30End = await postWindow(pool30.id, '2026-07-31T22:00:00', '2026-07-31T23:15:00');
      if (res30End.status !== 400) {
        throw new Error(`Expected 400 for unaligned 30-minute end, got ${res30End.status}`);
      }
      const text30End = await res30End.text();
      if (!text30End.includes('End time must align to 30-minute slots')) {
        throw new Error(`Expected end-time alignment message, got: ${text30End}`);
      }
      if (!text30End.includes('You entered 23:15 — did you mean 23:00 or 23:30?')) {
        throw new Error(`Expected end-time boundary suggestion, got: ${text30End}`);
      }

      console.log('F010_ALIGNMENT_SUGGESTIONS', {
        pool60Status: res60.status,
        pool30StartStatus: res30.status,
        pool30EndStatus: res30End.status,
      });
    },
  },
];
