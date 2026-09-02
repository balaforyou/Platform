import { Section, inspect } from '@badminton/test-harness';
import {
  db,
  baseUrl,
  internalKey,
  bookingHeaders,
  TENANT_ID,
  BRANCH_ID,
  SlotEngineContext,
} from './_fixtures';

/**
 * F-212 — slot-exhaustion UX at the date level.
 *
 * GET /resource-pools/:id/next-available-date?from=<YYYY-MM-DD> — when a guest lands on a
 * fully-exhausted date, this points them at the next date that has a bookable window, so the
 * PWA can auto-navigate instead of showing a dead-end "no slots" message. Forward-only,
 * server-side search. Mirrors F-187's period-level auto-advance, one level up (date, not
 * time-of-day period).
 *
 * Search ceiling is the guest's REAL browse horizon: min(from + 14, today + guestOpenWindowDays).
 * A date past `today + guestOpenWindowDays` is one GET /availability itself would reject with
 * BROWSE_AHEAD_LIMIT_EXCEEDED, so returning it would be actively misleading. 14 is only an outer
 * cap for a pool configured with a very large guestOpenWindowDays.
 *
 * Self-contained: every pool/rule/window is created fresh per section via the HTTP API, reusing
 * TENANT_ID/BRANCH_ID from _fixtures.ts. Every booking uses a distinct userId so F-184's daily
 * cap never interferes.
 */

async function createPool(capacity: number): Promise<any> {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-212 Pool ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      allocationMode: 'POOLED',
      capacity,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;

  // guestOpenWindowDays is left at the schema default (7) — the real JBC pool shape.
  await fetch(`${baseUrl}/booking-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      resourcePoolId: pool.id,
      cancellationPolicyJson: { type: 'tiered', tiers: [{ min_hours_before_slot: 0, refund_percent: 0 }] },
    }),
  });

  return pool;
}

/** A YYYY-MM-DD string and an aligned 1-hour window on `dayOffset` days from today, at 10:00 UTC. */
function dayAt(dayOffset: number): { dateStr: string; startISO: string; endISO: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(10, 0, 0, 0); // mid-day, always in the future for dayOffset >= 1
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  return { dateStr: d.toISOString().slice(0, 10), startISO: d.toISOString(), endISO: end.toISOString() };
}

function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function createWindowAt(poolId: string, startISO: string, endISO: string, capacity: number): Promise<any> {
  const res = await fetch(`${baseUrl}/resource-pools/${poolId}/availability-windows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({ startTime: startISO, endTime: endISO, capacity }),
  });
  const body = (await res.json()) as any;
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Expected 2xx creating window, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function bookToExhaustion(userId: string, key: string, poolId: string, windowId: string) {
  const res = await inspect(
    await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: bookingHeaders(userId, key),
      body: JSON.stringify({ branchId: BRANCH_ID, resourcePoolId: poolId, windowId }),
    }),
  );
  if (res.status !== 201) throw new Error(`Expected 201 booking window, got ${res.status}: ${res.raw}`);
  return res.json?.data ?? res.json;
}

async function nextAvailableDate(poolId: string, from: string) {
  const res = await inspect(
    await fetch(`${baseUrl}/resource-pools/${poolId}/next-available-date?from=${from}`, {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  // The response envelope wraps `{ date }` as `{ data: { date } }`. Read `.data.date`
  // directly — a `?? res.json.date` fallback is a trap here because `date` is legitimately
  // `null` (no date found) and `null ?? x` returns `x`.
  const body = res.json?.data ?? res.json;
  return { status: res.status, raw: res.raw, date: body?.date as string | null | undefined };
}

export const nextAvailableDateSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-212: search skips dates with no bookable window and returns the first date that has one',
    async run() {
      const pool = await createPool(2);
      const target = dayAt(3); // today+3, within the 7-day horizon
      await createWindowAt(pool.id, target.startISO, target.endISO, 2); // free

      // No windows exist on today+1 or today+2 — they must be skipped, not returned.
      const fromToday = await nextAvailableDate(pool.id, todayUtcDateStr());
      if (fromToday.status !== 200) throw new Error(`Expected 200, got ${fromToday.status}: ${fromToday.raw}`);
      if (fromToday.date !== target.dateStr) {
        throw new Error(`Expected next date ${target.dateStr}, got ${JSON.stringify(fromToday.date)}`);
      }

      // Same answer when starting the search one day later — still skips today+2.
      const fromT1 = await nextAvailableDate(pool.id, dayAt(1).dateStr);
      if (fromT1.date !== target.dateStr) {
        throw new Error(`Expected ${target.dateStr} from today+1, got ${JSON.stringify(fromT1.date)}`);
      }
    },
  },

  {
    name: 'F-212: a pool exhausted through its whole guestOpenWindowDays horizon returns { date: null }',
    async run() {
      const pool = await createPool(1);
      const only = dayAt(1);
      const w = await createWindowAt(pool.id, only.startISO, only.endISO, 1);
      await bookToExhaustion('f212-null-user', 'f212-null-key', pool.id, w.id); // the one window, now full

      // Candidates today+2 .. today+7 (min(from+14, today+7)) — none carry a window.
      const res = await nextAvailableDate(pool.id, only.dateStr);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.raw}`);
      if (res.date !== null) throw new Error(`Expected { date: null }, got ${JSON.stringify(res.date)}`);
    },
  },

  {
    name: 'F-212: the search never points past today + guestOpenWindowDays, even when a free date exists further out',
    async run() {
      const pool = await createPool(1);
      const beyond = dayAt(10); // free, but outside the 7-day horizon
      await createWindowAt(pool.id, beyond.startISO, beyond.endISO, 1);

      // from = today+3 -> searchEnd = min(today+17, today+7) = today+7. today+10 is past it.
      const res = await nextAvailableDate(pool.id, dayAt(3).dateStr);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.raw}`);
      if (res.date !== null) {
        throw new Error(`Expected { date: null } (today+10 is beyond the browse horizon), got ${JSON.stringify(res.date)}`);
      }

      // from at the horizon edge -> the first candidate is already past it -> immediate null.
      const atEdge = await nextAvailableDate(pool.id, dayAt(7).dateStr);
      if (atEdge.date !== null) throw new Error(`Expected { date: null } at the horizon edge, got ${JSON.stringify(atEdge.date)}`);
    },
  },

  {
    name: 'F-212: a date whose earliest window is full still counts — the per-window scan continues to a later free window',
    async run() {
      const pool = await createPool(1);
      const day = dayAt(2);
      const early = await createWindowAt(pool.id, day.startISO, day.endISO, 1);
      const laterStart = new Date(new Date(day.startISO).getTime() + 2 * 60 * 60 * 1000);
      const laterEnd = new Date(laterStart.getTime() + 60 * 60 * 1000);
      await createWindowAt(pool.id, laterStart.toISOString(), laterEnd.toISOString(), 1); // free

      await bookToExhaustion('f212-scan-user', 'f212-scan-key', pool.id, early.id); // earliest window full

      const res = await nextAvailableDate(pool.id, todayUtcDateStr());
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${res.raw}`);
      if (res.date !== day.dateStr) {
        throw new Error(`Expected ${day.dateStr} (later window is free), got ${JSON.stringify(res.date)}`);
      }

      // Sanity: the DB really does have a free window on that date.
      const windows = await db.availabilityWindow.findMany({ where: { resourcePoolId: pool.id } });
      if (windows.length !== 2) throw new Error(`Expected 2 windows on the pool, found ${windows.length}`);
    },
  },

  {
    name: 'F-212: a malformed `from` is rejected 400; a missing `from` is rejected 400',
    async run() {
      const pool = await createPool(1);
      const bad = await nextAvailableDate(pool.id, '2026-13-40');
      if (bad.status !== 400) throw new Error(`Expected 400 for a bad calendar date, got ${bad.status}: ${bad.raw}`);

      const missing = await inspect(
        await fetch(`${baseUrl}/resource-pools/${pool.id}/next-available-date`, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      if (missing.status !== 400) throw new Error(`Expected 400 for a missing from, got ${missing.status}: ${missing.raw}`);
    },
  },
];
