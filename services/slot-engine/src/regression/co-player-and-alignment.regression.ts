import { Section, signJwt } from '@badminton/test-harness';
import { baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID } from './_fixtures';

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
 * NOTE on the JWT below: F-045 has now landed, so POST /bookings verifies the
 * token and derives identity from it. The token below is therefore load-bearing,
 * not decorative — without it these requests would 401 before ever reaching the
 * co-player validation being tested here.
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
            branchId: BRANCH_ID,
            resourcePoolId: ctx.pooledPool.id,
            windowId: ctx.pooledWindow.id,
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
          // F-091: these routes now authenticate; the suite takes the internal-key path.
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
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
          // F-091: these routes now authenticate; the suite takes the internal-key path.
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ startTime, endTime, capacity: 1 }),
        });

      // 60-minute pool: unaligned startTime must suggest the two nearest hours.
      // F-066: the timestamps carry an explicit `Z`. They were previously timezone-naive,
      // which Node parses as SERVER-local — so this test silently asserted the runner's own
      // timezone and would have reported different boundaries on a differently-configured
      // machine. Boundaries are now judged on the branch's clock, so the input has to name
      // an unambiguous instant for the assertion to mean anything.
      const pool60 = await createPool('Pool 60min Test', 60);
      const res60 = await postWindow(pool60.id, '2026-07-31T22:16:00Z', '2026-07-31T23:00:00Z');
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
      const res30 = await postWindow(pool30.id, '2026-07-31T22:16:00Z', '2026-07-31T23:00:00Z');
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
      const res30End = await postWindow(pool30.id, '2026-07-31T22:00:00Z', '2026-07-31T23:15:00Z');
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

  {
    name: 'F-173/F-176: out-of-range calendar/clock components are rejected, not silently normalised to a different real day',
    async run() {
      const createPool = async (name: string) => {
        const res = await fetch(`${baseUrl}/resource-pools`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          method: 'POST',
          body: JSON.stringify({
            tenantId: TENANT_ID,
            branchId: BRANCH_ID,
            name,
            allocationMode: 'POOLED',
            minBookingDurationMinutes: 60,
          }),
        });
        if (!res.ok) throw new Error(`Failed to create ${name}: ${res.status}`);
        return ((await res.json()) as any).data;
      };

      const postWindow = async (poolId: string, startTime: string, endTime: string) =>
        fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ startTime, endTime, capacity: 1 }),
        });

      const postBlocked = async (resourcePoolId: string, startTime: string, endTime: string) =>
        fetch(`${baseUrl}/blocked-windows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
          body: JSON.stringify({ resourcePoolId, startTime, endTime, reason: 'F-173/F-176 regression probe' }),
        });

      const expectRejected = async (label: string, res: Response, expectedSubstring: string) => {
        if (res.status !== 400) {
          throw new Error(`${label}: expected 400, got ${res.status} — ${await res.text()}`);
        }
        const text = await res.text();
        if (!text.includes(expectedSubstring)) {
          throw new Error(`${label}: expected message containing "${expectedSubstring}", got: ${text}`);
        }
      };

      const pool = await createPool('Pool F173-F176 Regression Test');

      // Naive input: NAIVE_LOCAL matches, routes through branchLocalToUtc (F-173's function).
      await expectRejected(
        'availability-windows: naive hour 24:00',
        await postWindow(pool.id, '2026-08-25T24:00', '2026-08-25T23:00'),
        'hour 24 is out of range (0-23)',
      );
      await expectRejected(
        'availability-windows: naive month 13',
        await postWindow(pool.id, '2026-13-01T10:00', '2026-13-01T11:00'),
        'month 13 is out of range (1-12)',
      );
      await expectRejected(
        'availability-windows: naive Feb 30 (month-specific day overflow)',
        await postWindow(pool.id, '2026-02-30T10:00', '2026-02-30T11:00'),
        'day 30 is out of range for 2026-02',
      );

      // Offset-carrying input: OFFSET_LOCAL matches, validated before the native Date parse runs.
      await expectRejected(
        'availability-windows: offset-carrying hour 24:00',
        await postWindow(pool.id, '2026-08-25T24:00+05:30', '2026-08-25T23:00+05:30'),
        'hour 24 is out of range (0-23)',
      );
      await expectRejected(
        'availability-windows: offset-carrying Feb 30',
        await postWindow(pool.id, '2026-02-30T10:00+05:30', '2026-02-30T11:00+05:30'),
        'day 30 is out of range for 2026-02',
      );

      // blocked-windows shares parseBranchLocalDateTime — confirm it inherits the same check.
      await expectRejected(
        'blocked-windows: naive hour 24:00',
        await postBlocked(pool.id, '2026-08-25T24:00', '2026-08-25T23:00'),
        'hour 24 is out of range (0-23)',
      );
      await expectRejected(
        'blocked-windows: offset-carrying Feb 30',
        await postBlocked(pool.id, '2026-02-30T10:00+05:30', '2026-02-30T11:00+05:30'),
        'day 30 is out of range for 2026-02',
      );

      // Valid input on both endpoints must still succeed — this is a strict tightening, not a
      // behavior change for real data.
      const validWindow = await postWindow(pool.id, '2026-08-25T10:00', '2026-08-25T11:00');
      if (!validWindow.ok) {
        throw new Error(`Expected valid window to succeed, got ${validWindow.status} — ${await validWindow.text()}`);
      }
      const validBlocked = await postBlocked(pool.id, '2026-08-25T14:00', '2026-08-25T15:00');
      if (!validBlocked.ok) {
        throw new Error(`Expected valid blocked window to succeed, got ${validBlocked.status} — ${await validBlocked.text()}`);
      }

      console.log('F173_F176_CALENDAR_RANGE_VALIDATION', { poolId: pool.id, allChecksPassed: true });
    },
  },
];
